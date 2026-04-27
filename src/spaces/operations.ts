import crypto from "node:crypto";
import { devServerLog } from "../server/devLog";
import { HttpError } from "wasp/server";
import type { SummaryDisplayLang } from "./aggregationShared";
import { pickSummaryForDisplay } from "./aggregationShared";
import type {
  CreateSpace,
  GetSpaceSummary,
  JoinSpace,
  SaveExperimentDeck,
  SubmitFeedback,
} from "wasp/server/operations";
import { classifyFeedbackText } from "./classify";
import {
  ensureExperimentDefaultsForSpace,
  reconcileExperimentDeckWithSingleDefaultPrompt,
  regenerateExperimentAggregations,
  syncExperimentAggregationRows,
} from "./experimentAsync";
import {
  getSummaryPromptInputFromDb,
  seedSummaryPromptAppSettingsIfMissing,
  SUMMARY_PROMPT_INPUT_KEY,
} from "./defaultPromptStore";
import { regenerateSpaceSummary } from "./summaryAsync";

export const TONE = {
  praise: "praise",
  constructive_criticism: "constructive_criticism",
} as const;

export const SOURCE = {
  text: "text",
  voice: "voice",
} as const;

export const JOB = {
  pending: "pending",
  ready: "ready",
  failed: "failed",
} as const;

const SHORT_CODE_CHARS = "23456789abcdefghjkmnpqrstuvwxyz";

const SLUG_RE = /^[a-z0-9-]{1,48}$/;
const MAX_PROMPTS = 12;
const MAX_MODELS = 12;
const MAX_COMBOS = 48;

function normalizeSummaryDisplayLang(raw: string | undefined): SummaryDisplayLang {
  return raw === "bg" ? "bg" : "en";
}

function makeShortCode(): string {
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += SHORT_CODE_CHARS[crypto.randomInt(SHORT_CODE_CHARS.length)]!;
  }
  return out;
}

function mapClassificationMeta(summary: {
  totalCount: number;
  positiveCount: number;
  negativeCount: number;
}) {
  return {
    totalCount: summary.totalCount,
    positiveCount: summary.positiveCount,
    negativeCount: summary.negativeCount,
  };
}

export const createSpace: CreateSpace<
  { name?: string | null },
  {
    spaceId: string;
    shortCode: string;
    contributorHandleId: string;
  }
> = async ({ name }, context) => {
  let shortCode = "";
  for (let i = 0; i < 24; i++) {
    const candidate = makeShortCode();
    const existing = await context.entities.Space.findUnique({
      where: { shortCode: candidate },
    });
    if (!existing) {
      shortCode = candidate;
      break;
    }
  }
  if (!shortCode) {
    throw new HttpError(500, "Could not allocate a space code");
  }

  const space = await context.entities.Space.create({
    data: {
      shortCode,
      name: name?.trim() || null,
    },
  });

  const handle = await context.entities.ContributorHandle.create({
    data: {
      spaceId: space.id,
    },
  });

  await context.entities.SpaceSummary.create({
    data: {
      spaceId: space.id,
      totalCount: 0,
      positiveCount: 0,
      negativeCount: 0,
      jobStatus: JOB.ready,
      summaryText: null,
      updatedAt: null,
    },
  });

  await ensureExperimentDefaultsForSpace(space.id, context.entities);

  await context.entities.SpaceSummary.update({
    where: { spaceId: space.id },
    data: { jobStatus: JOB.pending },
  });
  void regenerateSpaceSummary(space.id, context.entities).catch((err) => {
    console.error("createSpace regenerateSpaceSummary failed", err);
    void context.entities.SpaceSummary.update({
      where: { spaceId: space.id },
      data: { jobStatus: JOB.failed },
    });
  });

  devServerLog("createSpace", {
    spaceId: space.id,
    shortCode: space.shortCode,
    nameChars: (space.name ?? "").length,
    contributorHandleId: handle.id,
  });

  return {
    spaceId: space.id,
    shortCode: space.shortCode,
    contributorHandleId: handle.id,
  };
};

export const joinSpace: JoinSpace<
  { shortCode: string; displayLang?: SummaryDisplayLang },
  {
    spaceId: string;
    shortCode: string;
    spaceName: string | null;
    summary: string | null;
    classificationMeta: ReturnType<typeof mapClassificationMeta>;
    updatedAt: string | null;
    contributorHandleId: string;
  }
> = async ({ shortCode, displayLang }, context) => {
  const code = shortCode.trim().toLowerCase();
  const space = await context.entities.Space.findUnique({
    where: { shortCode: code },
  });
  if (!space) {
    devServerLog("joinSpace.not_found", { shortCode: code });
    throw new HttpError(404, "Space not found");
  }

  const handle = await context.entities.ContributorHandle.create({
    data: { spaceId: space.id },
  });

  const agg = await context.entities.SpaceSummary.findUnique({
    where: { spaceId: space.id },
  });
  if (!agg) {
    throw new HttpError(500, "Space summary missing");
  }

  const lang = normalizeSummaryDisplayLang(displayLang);
  devServerLog("joinSpace", {
    spaceId: space.id,
    shortCode: space.shortCode,
    displayLang: lang,
    contributorHandleId: handle.id,
  });

  return {
    spaceId: space.id,
    shortCode: space.shortCode,
    spaceName: space.name,
    summary: pickSummaryForDisplay(agg, lang),
    classificationMeta: mapClassificationMeta(agg),
    updatedAt: agg.updatedAt ? agg.updatedAt.toISOString() : null,
    contributorHandleId: handle.id,
  };
};

export const submitFeedback: SubmitFeedback<
  {
    spaceId: string;
    contributorHandleId: string;
    text: string;
    sourceType: "text" | "voice";
  },
  {
    accepted: boolean;
    classificationMeta: ReturnType<typeof mapClassificationMeta>;
  }
> = async ({ spaceId, contributorHandleId, text, sourceType }, context) => {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new HttpError(400, "Feedback text is required");
  }

  const handle = await context.entities.ContributorHandle.findFirst({
    where: { id: contributorHandleId, spaceId },
  });
  if (!handle) {
    devServerLog("submitFeedback.invalid_handle", { spaceId, contributorHandleId });
    throw new HttpError(403, "Invalid contributor handle for this space");
  }

  const classification = await classifyFeedbackText(trimmed);
  const tone =
    classification === "praise" ? TONE.praise : TONE.constructive_criticism;

  await context.entities.FeedbackEntry.create({
    data: {
      spaceId,
      contributorHandleId,
      rawText: trimmed,
      tone,
      sourceType: sourceType === "voice" ? SOURCE.voice : SOURCE.text,
    },
  });

  const totals = await context.entities.FeedbackEntry.groupBy({
    by: ["tone"],
    where: { spaceId },
    _count: { _all: true },
  });

  let positiveCount = 0;
  let negativeCount = 0;
  for (const row of totals) {
    if (row.tone === TONE.praise) positiveCount = row._count._all;
    if (row.tone === TONE.constructive_criticism) negativeCount = row._count._all;
  }
  const totalCount = positiveCount + negativeCount;

  await context.entities.SpaceSummary.update({
    where: { spaceId },
    data: {
      totalCount,
      positiveCount,
      negativeCount,
      jobStatus: JOB.pending,
    },
  });

  void regenerateSpaceSummary(spaceId, context.entities).catch((err) => {
    console.error("regenerateSpaceSummary failed", err);
    void context.entities.SpaceSummary.update({
      where: { spaceId },
      data: { jobStatus: JOB.failed },
    });
  });

  devServerLog("submitFeedback", {
    spaceId,
    sourceType,
    textChars: trimmed.length,
    tone,
    totalCount,
  });

  return {
    accepted: true,
    classificationMeta: mapClassificationMeta({
      totalCount,
      positiveCount,
      negativeCount,
    }),
  };
};

export const getSpaceSummary: GetSpaceSummary<
  { spaceId: string; displayLang?: SummaryDisplayLang },
  {
    summary: string | null;
    classificationMeta: ReturnType<typeof mapClassificationMeta>;
    updatedAt: string | null;
    jobStatus: string;
    spaceName: string | null;
    shortCode: string;
    experimentAggregations: Array<{
      id: string;
      promptSlug: string;
      summaryPromptOutput: string;
      modelSlug: string;
      modelDisplayName: string;
      modelApiId: string;
      summaryTextEn: string | null;
      summaryTextBg: string | null;
      langStatusEn: string;
      langStatusBg: string;
      jobError: string | null;
      jobStatus: string;
      updatedAt: string | null;
    }>;
    summaryPromptInput: string;
    summaryPrompts: Array<{ slug: string; summaryPromptOutput: string }>;
    experimentModels: Array<{
      slug: string;
      displayName: string;
      modelApiId: string;
    }>;
  }
> = async ({ spaceId, displayLang }, context) => {
  const lang = normalizeSummaryDisplayLang(displayLang);
  try {
  const space = await context.entities.Space.findUnique({
    where: { id: spaceId },
  });
  if (!space) {
    throw new HttpError(404, "Space not found");
  }

  await seedSummaryPromptAppSettingsIfMissing(context.entities.AppSetting);

  await ensureExperimentDefaultsForSpace(spaceId, context.entities);
  const reconciled = await reconcileExperimentDeckWithSingleDefaultPrompt(
    spaceId,
    context.entities,
  );
  if (reconciled) {
    await context.entities.SpaceSummary.update({
      where: { spaceId },
      data: { jobStatus: JOB.pending },
    });
    void regenerateExperimentAggregations(spaceId, context.entities).catch(
      (err) => {
        console.error("reconcileExperimentDeck regenerate failed", err);
        void context.entities.SpaceSummary.update({
          where: { spaceId },
          data: { jobStatus: JOB.failed },
        });
      },
    );
  }

  const agg = await context.entities.SpaceSummary.findUnique({
    where: { spaceId },
  });
  if (!agg) {
    throw new HttpError(500, "Space summary missing");
  }

  const [promptRows, modelRows, rawAggs, summaryPromptInput] = await Promise.all([
    context.entities.SpacePrompt.findMany({
      where: { spaceId },
      orderBy: { slug: "asc" },
      select: { slug: true, summaryPromptOutput: true },
    }),
    context.entities.SpaceModel.findMany({
      where: { spaceId },
      orderBy: { slug: "asc" },
      select: { slug: true, displayName: true, modelApiId: true },
    }),
    context.entities.SpaceSummaryAggregation.findMany({
      where: { spaceId },
      include: { prompt: true, spaceModel: true },
    }),
    getSummaryPromptInputFromDb(context.entities.AppSetting),
  ]);

  const hasLlmKeys = !!(
    process.env.ANTHROPIC_API_KEY?.trim() ||
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim()
  );
  // Legacy rows only: EN narrative exists but BG column was never filled.
  // Do not use langStatusBg here — during generation EN can be ready while BG is
  // still pending, and polling getSpaceSummary would otherwise restart regeneration
  // every few seconds (BG UI + jobStatus ready).
  const needsBulgarianBackfill =
    lang === "bg" &&
    hasLlmKeys &&
    rawAggs.length > 0 &&
    rawAggs.some((r) => !!r.summaryText?.trim() && !r.summaryTextBg?.trim());

  /** Rows were seeded as pending but generation never ran (e.g. legacy spaces). */
  const experimentDeckStuckPending =
    rawAggs.length > 0 &&
    agg.jobStatus === JOB.ready &&
    rawAggs.every(
      (r) =>
        r.jobStatus === JOB.pending &&
        r.langStatusEn === JOB.pending &&
        r.langStatusBg === JOB.pending &&
        !r.summaryText?.trim() &&
        !r.summaryTextBg?.trim(),
    );

  let summaryJobStatus = agg.jobStatus;

  if (experimentDeckStuckPending) {
    await context.entities.SpaceSummary.update({
      where: { spaceId },
      data: { jobStatus: JOB.pending },
    });
    summaryJobStatus = JOB.pending;
    void regenerateExperimentAggregations(spaceId, context.entities).catch((err) => {
      console.error("getSpaceSummary stuck experiment deck regenerate failed", err);
      void context.entities.SpaceSummary.update({
        where: { spaceId },
        data: { jobStatus: JOB.failed },
      });
    });
  } else if (needsBulgarianBackfill && summaryJobStatus !== JOB.pending) {
    await context.entities.SpaceSummary.update({
      where: { spaceId },
      data: { jobStatus: JOB.pending },
    });
    summaryJobStatus = JOB.pending;
    void regenerateExperimentAggregations(spaceId, context.entities).catch((err) => {
      console.error("Bulgarian summary backfill regenerate failed", err);
      void context.entities.SpaceSummary.update({
        where: { spaceId },
        data: { jobStatus: JOB.failed },
      });
    });
  }

  const experimentAggregations = [...rawAggs]
    .sort((a, b) => {
      const p = a.prompt.slug.localeCompare(b.prompt.slug);
      if (p !== 0) return p;
      return a.spaceModel.slug.localeCompare(b.spaceModel.slug);
    })
    .map((row) => ({
      id: row.id,
      promptSlug: row.prompt.slug,
      summaryPromptOutput: row.prompt.summaryPromptOutput,
      modelSlug: row.spaceModel.slug,
      modelDisplayName: row.spaceModel.displayName,
      modelApiId: row.spaceModel.modelApiId,
      summaryTextEn: row.summaryText,
      summaryTextBg: row.summaryTextBg,
      langStatusEn: row.langStatusEn,
      langStatusBg: row.langStatusBg,
      jobError: row.jobError ?? null,
      jobStatus: row.jobStatus,
      updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
    }));

  return {
    summary: pickSummaryForDisplay(agg, lang),
    classificationMeta: mapClassificationMeta(agg),
    updatedAt: agg.updatedAt ? agg.updatedAt.toISOString() : null,
    jobStatus: summaryJobStatus,
    spaceName: space.name,
    shortCode: space.shortCode,
    experimentAggregations,
    summaryPromptInput,
    summaryPrompts: promptRows.map((p) => ({
      slug: p.slug,
      summaryPromptOutput: p.summaryPromptOutput,
    })),
    experimentModels: modelRows.map((m) => ({
      slug: m.slug,
      displayName: m.displayName,
      modelApiId: m.modelApiId,
    })),
  };
  } catch (err) {
    console.error("[getSpaceSummary]", { spaceId, displayLang: lang, err });
    throw err;
  }
};

export const saveExperimentDeck: SaveExperimentDeck<
  {
    spaceId: string;
    summaryPromptInput: string;
    prompts: Array<{ slug: string; summaryPromptOutput: string }>;
    models: Array<{ slug: string; displayName: string; modelApiId: string }>;
  },
  { ok: true }
> = async ({ spaceId, summaryPromptInput, prompts, models }, context) => {
  const space = await context.entities.Space.findUnique({
    where: { id: spaceId },
  });
  if (!space) {
    throw new HttpError(404, "Space not found");
  }

  if (prompts.length < 1 || models.length < 1) {
    throw new HttpError(400, "At least one prompt and one model are required.");
  }

  if (prompts.length > MAX_PROMPTS || models.length > MAX_MODELS) {
    throw new HttpError(400, "Too many prompts or models");
  }
  if (prompts.length * models.length > MAX_COMBOS) {
    throw new HttpError(400, "Too many prompt × model combinations");
  }

  const inputTrimmed = summaryPromptInput.trim();
  if (inputTrimmed.length < 40) {
    throw new HttpError(400, "Shared input template is too short.");
  }
  if (inputTrimmed.length > 32000) {
    throw new HttpError(400, "Shared input template is too long.");
  }

  for (const p of prompts) {
    const slug = p.slug.trim().toLowerCase();
    if (!SLUG_RE.test(slug)) {
      throw new HttpError(400, "Invalid prompt slug (use lowercase letters, digits, hyphen).");
    }
    const out = p.summaryPromptOutput.trim();
    if (out.length < 8) {
      throw new HttpError(400, "Each prompt needs substantive output rules.");
    }
    if (out.length > 32000) {
      throw new HttpError(400, "Prompt output section is too long.");
    }
  }

  for (const m of models) {
    const slug = m.slug.trim().toLowerCase();
    if (!SLUG_RE.test(slug)) {
      throw new HttpError(400, "Invalid model slug (use lowercase letters, digits, hyphen).");
    }
    const displayName = m.displayName.trim();
    if (displayName.length < 1 || displayName.length > 120) {
      throw new HttpError(400, "Model display name length invalid.");
    }
    const modelApiId = m.modelApiId.trim();
    if (modelApiId.length < 2 || modelApiId.length > 200) {
      throw new HttpError(400, "Model API id length invalid.");
    }
  }

  const seenP = new Set<string>();
  for (const p of prompts) {
    const s = p.slug.trim().toLowerCase();
    if (seenP.has(s)) throw new HttpError(400, "Duplicate prompt slug.");
    seenP.add(s);
  }
  const seenM = new Set<string>();
  for (const m of models) {
    const s = m.slug.trim().toLowerCase();
    if (seenM.has(s)) throw new HttpError(400, "Duplicate model slug.");
    seenM.add(s);
  }

  await context.entities.SpaceSummaryAggregation.deleteMany({
    where: { spaceId },
  });
  await context.entities.SpacePrompt.deleteMany({
    where: { spaceId },
  });
  await context.entities.SpaceModel.deleteMany({
    where: { spaceId },
  });

  await context.entities.AppSetting.upsert({
    where: { key: SUMMARY_PROMPT_INPUT_KEY },
    create: { key: SUMMARY_PROMPT_INPUT_KEY, value: inputTrimmed },
    update: { value: inputTrimmed },
  });

  await context.entities.SpacePrompt.createMany({
    data: prompts.map((p) => ({
      spaceId,
      slug: p.slug.trim().toLowerCase(),
      summaryPromptOutput: p.summaryPromptOutput.trim(),
    })),
  });
  await context.entities.SpaceModel.createMany({
    data: models.map((m) => ({
      spaceId,
      slug: m.slug.trim().toLowerCase(),
      displayName: m.displayName.trim(),
      modelApiId: m.modelApiId.trim(),
    })),
  });
  await syncExperimentAggregationRows(spaceId, context.entities);

  await context.entities.SpaceSummary.update({
    where: { spaceId },
    data: { jobStatus: JOB.pending },
  });

  void regenerateExperimentAggregations(spaceId, context.entities).catch((err) => {
    console.error("saveExperimentDeck regenerate failed", err);
    void context.entities.SpaceSummary.update({
      where: { spaceId },
      data: { jobStatus: JOB.failed },
    });
  });

  devServerLog("saveExperimentDeck", {
    spaceId,
    shortCode: space.shortCode,
    promptCount: prompts.length,
    modelCount: models.length,
  });

  return { ok: true as const };
};
