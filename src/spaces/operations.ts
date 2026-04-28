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
  regenerateExperimentAggregations,
  syncExperimentAggregationRows,
} from "./experimentAsync";
import { bootstrapSummaryRecovery } from "./summaryRecovery";
import {
  getSummaryPromptInputFromDb,
  SUMMARY_PROMPT_INPUT_KEY,
} from "./defaultPromptStore";
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
const DEFAULT_EMPTY_SUMMARY_BG =
  "Още никой не е изпратил нито похвала, нито забележка за {subject}. Можеш да бъдеш първият.";
const DEFAULT_EMPTY_SUMMARY_EN =
  "No one has submitted any praise or feedback about {subject} yet — you can be the first.";

bootstrapSummaryRecovery();

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

async function getClassificationMetaFromFeedback(
  spaceId: string,
  feedbackEntry: any,
): Promise<ReturnType<typeof mapClassificationMeta>> {
  const totals = (await feedbackEntry.groupBy({
    by: ["tone"],
    where: { spaceId },
    _count: { _all: true },
  })) as Array<{ tone: string; _count: { _all: number } }>;

  let positiveCount = 0;
  let negativeCount = 0;
  for (const row of totals) {
    if (row.tone === TONE.praise) positiveCount = row._count._all;
    if (row.tone === TONE.constructive_criticism) negativeCount = row._count._all;
  }
  const totalCount = positiveCount + negativeCount;
  return mapClassificationMeta({ totalCount, positiveCount, negativeCount });
}

function pickPrimaryAggregation<T extends {
  prompt: { slug: string };
  spaceModel: { slug: string };
}>(rows: T[]): T | null {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => {
    const p = a.prompt.slug.localeCompare(b.prompt.slug);
    if (p !== 0) return p;
    return a.spaceModel.slug.localeCompare(b.spaceModel.slug);
  });
  return sorted[0] ?? null;
}

function combineLanguageRows<T extends {
  id: string;
  language: string;
  summaryText: string | null;
  jobStatus: string;
  updatedAt: Date | null;
  prompt: { slug: string; summaryPromptOutput: string };
  spaceModel: { slug: string; displayName: string; modelApiId: string };
}>(rows: T[]) {
  const byKey = new Map<
    string,
    {
      id: string;
      prompt: T["prompt"];
      spaceModel: T["spaceModel"];
      summaryTextEn: string | null;
      summaryTextBg: string | null;
      langStatusEn: string;
      langStatusBg: string;
      jobStatus: string;
      updatedAt: Date | null;
    }
  >();
  for (const row of rows) {
    const key = `${row.prompt.slug}::${row.spaceModel.slug}`;
    const cur = byKey.get(key) ?? {
      id: row.id,
      prompt: row.prompt,
      spaceModel: row.spaceModel,
      summaryTextEn: null,
      summaryTextBg: null,
      langStatusEn: JOB.pending,
      langStatusBg: JOB.pending,
      jobStatus: JOB.pending,
      updatedAt: null as Date | null,
    };
    if (row.language === "bg") {
      cur.summaryTextBg = row.summaryText;
      cur.langStatusBg = row.jobStatus;
    } else {
      cur.summaryTextEn = row.summaryText;
      cur.langStatusEn = row.jobStatus;
      cur.id = row.id;
    }
    cur.jobStatus =
      cur.langStatusEn === JOB.failed && cur.langStatusBg === JOB.failed
        ? JOB.failed
        : cur.langStatusEn === JOB.pending || cur.langStatusBg === JOB.pending
          ? JOB.pending
          : JOB.ready;
    const ts = row.updatedAt?.getTime() ?? 0;
    const curTs = cur.updatedAt?.getTime() ?? 0;
    if (ts > curTs) cur.updatedAt = row.updatedAt;
    byKey.set(key, cur);
  }
  return [...byKey.values()];
}

export const createSpace: CreateSpace<
  { name?: string | null; displayLang?: SummaryDisplayLang },
  {
    spaceId: string;
    shortCode: string;
    contributorHandleId: string;
  }
> = async ({ name, displayLang }, context) => {
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

  await ensureExperimentDefaultsForSpace(space.id, context.entities);
  const subject = space.name?.trim() || space.shortCode;
  const emptyBg = DEFAULT_EMPTY_SUMMARY_BG.replace("{subject}", subject);
  const emptyEn = DEFAULT_EMPTY_SUMMARY_EN.replace("{subject}", subject);
  await context.entities.SpaceSummary.updateMany({
    where: { spaceId: space.id },
    data: {
      summaryText: emptyEn,
      jobStatus: JOB.ready,
      updatedAt: new Date(),
    },
  });
  await context.entities.SpaceSummary.updateMany({
    where: { spaceId: space.id, language: "bg" },
    data: {
      summaryText: emptyBg,
      jobStatus: JOB.ready,
      updatedAt: new Date(),
    },
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

  const [rows, classificationMeta] = await Promise.all([
    context.entities.SpaceSummary.findMany({
      where: { spaceId: space.id },
      include: { prompt: true, spaceModel: true },
    }),
    getClassificationMetaFromFeedback(space.id, context.entities.FeedbackEntry),
  ]);
  const combined = combineLanguageRows(rows);
  const primary = pickPrimaryAggregation(combined);
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
    summary: primary ? pickSummaryForDisplay(primary, lang) : null,
    classificationMeta,
    updatedAt: primary?.updatedAt ? primary.updatedAt.toISOString() : null,
    contributorHandleId: handle.id,
  };
};

export const submitFeedback: SubmitFeedback<
  {
    spaceId: string;
    contributorHandleId: string;
    text: string;
    sourceType: "text" | "voice";
    displayLang?: SummaryDisplayLang;
  },
  {
    accepted: boolean;
    classificationMeta: ReturnType<typeof mapClassificationMeta>;
  }
> = async ({ spaceId, contributorHandleId, text, sourceType, displayLang }, context) => {
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

  const classificationMeta = await getClassificationMetaFromFeedback(
    spaceId,
    context.entities.FeedbackEntry,
  );
  await context.entities.SpaceSummary.updateMany({
    where: { spaceId },
    data: {
      jobStatus: JOB.pending,
      updatedAt: new Date(),
    },
  });
  void regenerateExperimentAggregations(
    spaceId,
    context.entities,
    normalizeSummaryDisplayLang(displayLang),
  ).catch((err) => {
    console.error("[submitFeedback] async summary regeneration failed", {
      spaceId,
      err,
    });
  });

  devServerLog("submitFeedback", {
    spaceId,
    sourceType,
    textChars: trimmed.length,
    tone,
    totalCount: classificationMeta.totalCount,
  });

  return {
    accepted: true,
    classificationMeta,
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

  const [promptRows, modelRows, rawAggs, summaryPromptInput, classificationMeta] = await Promise.all([
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
    context.entities.SpaceSummary.findMany({
      where: { spaceId },
      include: { prompt: true, spaceModel: true },
    }),
    getSummaryPromptInputFromDb(context.entities.AppSetting),
    getClassificationMetaFromFeedback(spaceId, context.entities.FeedbackEntry),
  ]);
  const combined = combineLanguageRows(rawAggs);
  const primary = pickPrimaryAggregation(combined);

  const experimentAggregations = [...combined]
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
      summaryTextEn: row.summaryTextEn,
      summaryTextBg: row.summaryTextBg,
      langStatusEn: row.langStatusEn,
      langStatusBg: row.langStatusBg,
      jobStatus: row.jobStatus,
      updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
    }));

  return {
    summary: primary ? pickSummaryForDisplay(primary, lang) : null,
    classificationMeta,
    updatedAt: primary?.updatedAt ? primary.updatedAt.toISOString() : null,
    jobStatus: primary?.jobStatus ?? JOB.pending,
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

  await context.entities.SpaceSummary.deleteMany({
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

  devServerLog("saveExperimentDeck", {
    spaceId,
    shortCode: space.shortCode,
    promptCount: prompts.length,
    modelCount: models.length,
  });

  return { ok: true as const };
};

