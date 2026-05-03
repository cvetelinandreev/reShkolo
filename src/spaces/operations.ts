import crypto from "node:crypto";
import { devServerLog } from "../server/devLog";
import { HttpError } from "wasp/server";
import type { SummaryDisplayLang } from "./aggregationShared";
import { pickSummaryForDisplay } from "./aggregationShared";
import type {
  CreateSpace,
  GetSpaceSummary,
  JoinSpace,
  SaveSpaceSummaryPrompt,
  SubmitFeedback,
} from "wasp/server/operations";
import {
  ALL_PROVIDER_SLUGS,
  getProviderInfo,
  isModelProviderSlug,
} from "../server/llm/modelProviders";
import { classifyFeedbackText } from "./classify";
import {
  ensureExperimentDefaultsForSpace,
  regenerateExperimentAggregations,
} from "./experimentAsync";
import { bootstrapSummaryRecovery } from "./summaryRecovery";
import { getSummaryPromptInputFromDb } from "./defaultPromptStore";
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
  placesCount: number;
  firstFeedbackAt: Date | null;
  lastFeedbackAt: Date | null;
}) {
  return {
    totalCount: summary.totalCount,
    positiveCount: summary.positiveCount,
    negativeCount: summary.negativeCount,
    placesCount: summary.placesCount,
    firstFeedbackAt: summary.firstFeedbackAt
      ? summary.firstFeedbackAt.toISOString()
      : null,
    lastFeedbackAt: summary.lastFeedbackAt
      ? summary.lastFeedbackAt.toISOString()
      : null,
  };
}

async function getClassificationMetaFromFeedback(
  spaceId: string,
  feedbackEntry: any,
): Promise<ReturnType<typeof mapClassificationMeta>> {
  const [totals, placeRows, dateRange] = await Promise.all([
    feedbackEntry.groupBy({
      by: ["tone"],
      where: { spaceId },
      _count: { _all: true },
    }) as Promise<Array<{ tone: string; _count: { _all: number } }>>,
    feedbackEntry.groupBy({
      by: ["contributorHandleId"],
      where: { spaceId },
    }) as Promise<Array<{ contributorHandleId: string }>>,
    feedbackEntry.aggregate({
      where: { spaceId },
      _min: { createdAt: true },
      _max: { createdAt: true },
    }) as Promise<{
      _min: { createdAt: Date | null };
      _max: { createdAt: Date | null };
    }>,
  ]);

  let positiveCount = 0;
  let negativeCount = 0;
  for (const row of totals) {
    if (row.tone === TONE.praise) positiveCount = row._count._all;
    if (row.tone === TONE.constructive_criticism) negativeCount = row._count._all;
  }
  const totalCount = positiveCount + negativeCount;
  return mapClassificationMeta({
    totalCount,
    positiveCount,
    negativeCount,
    placesCount: placeRows.length,
    firstFeedbackAt: dateRange._min.createdAt ?? null,
    lastFeedbackAt: dateRange._max.createdAt ?? null,
  });
}

function pickPrimaryAggregation<T extends {
  prompt: { slug: string };
  modelSlug: string;
}>(rows: T[]): T | null {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => {
    const p = a.prompt.slug.localeCompare(b.prompt.slug);
    if (p !== 0) return p;
    return a.modelSlug.localeCompare(b.modelSlug);
  });
  return sorted[0] ?? null;
}

function combineLanguageRows<T extends {
  id: string;
  language: string;
  summaryText: string | null;
  jobStatus: string;
  updatedAt: Date | null;
  modelSlug: string;
  prompt: { slug: string; summaryPromptOutput: string };
}>(rows: T[]) {
  const byKey = new Map<
    string,
    {
      id: string;
      prompt: T["prompt"];
      modelSlug: string;
      summaryTextEn: string | null;
      summaryTextBg: string | null;
      langStatusEn: string;
      langStatusBg: string;
      jobStatus: string;
      updatedAt: Date | null;
    }
  >();
  for (const row of rows) {
    const key = `${row.prompt.slug}::${row.modelSlug}`;
    const cur = byKey.get(key) ?? {
      id: row.id,
      prompt: row.prompt,
      modelSlug: row.modelSlug,
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
    ownerContributorHandleId: string;
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

  await context.entities.Space.update({
    where: { id: space.id },
    data: { ownerContributorHandleId: handle.id },
  });

  await ensureExperimentDefaultsForSpace(space.id, context.entities);

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
    ownerContributorHandleId: handle.id,
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
    ownerContributorHandleId: string | null;
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

  await ensureExperimentDefaultsForSpace(space.id, context.entities);

  const handle = await context.entities.ContributorHandle.create({
    data: { spaceId: space.id },
  });

  const [rows, classificationMeta] = await Promise.all([
    context.entities.SpaceSummary.findMany({
      where: { spaceId: space.id },
      include: { prompt: true },
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
    ownerContributorHandleId: space.ownerContributorHandleId,
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
    contributorHandleId: string;
  }
> = async ({ spaceId, contributorHandleId, text, sourceType, displayLang }, context) => {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new HttpError(400, "Feedback text is required");
  }

  const space = await context.entities.Space.findUnique({
    where: { id: spaceId },
    select: { id: true },
  });
  if (!space) {
    throw new HttpError(404, "Space not found");
  }

  let handle = await context.entities.ContributorHandle.findFirst({
    where: { id: contributorHandleId, spaceId },
  });
  if (!handle) {
    handle = await context.entities.ContributorHandle.create({
      data: { spaceId },
    });
  }

  const classification = await classifyFeedbackText(trimmed);
  const tone =
    classification === "praise" ? TONE.praise : TONE.constructive_criticism;

  await context.entities.FeedbackEntry.create({
    data: {
      spaceId,
      contributorHandleId: handle.id,
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

  return {
    accepted: true,
    classificationMeta,
    contributorHandleId: handle.id,
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
    ownerContributorHandleId: string | null;
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

  const [promptRows, rawAggs, summaryPromptInput, classificationMeta] = await Promise.all([
    context.entities.SpacePrompt.findMany({
      where: { spaceId },
      orderBy: { slug: "asc" },
      select: { slug: true, summaryPromptOutput: true },
    }),
    context.entities.SpaceSummary.findMany({
      where: { spaceId },
      include: { prompt: true },
    }),
    getSummaryPromptInputFromDb(context.entities.AppSetting),
    getClassificationMetaFromFeedback(spaceId, context.entities.FeedbackEntry),
  ]);
  const combined = combineLanguageRows(rawAggs);
  const primary = pickPrimaryAggregation(combined);

  const knownSlugs = new Set<string>(ALL_PROVIDER_SLUGS);
  const experimentAggregations = [...combined]
    .filter((row) => knownSlugs.has(row.modelSlug))
    .sort((a, b) => {
      const p = a.prompt.slug.localeCompare(b.prompt.slug);
      if (p !== 0) return p;
      return a.modelSlug.localeCompare(b.modelSlug);
    })
    .map((row) => {
      const info = isModelProviderSlug(row.modelSlug)
        ? getProviderInfo(row.modelSlug)
        : { slug: row.modelSlug, displayName: row.modelSlug, modelApiId: row.modelSlug };
      return {
        id: row.id,
        promptSlug: row.prompt.slug,
        summaryPromptOutput: row.prompt.summaryPromptOutput,
        modelSlug: info.slug,
        modelDisplayName: info.displayName,
        modelApiId: info.modelApiId,
        summaryTextEn: row.summaryTextEn,
        summaryTextBg: row.summaryTextBg,
        langStatusEn: row.langStatusEn,
        langStatusBg: row.langStatusBg,
        jobStatus: row.jobStatus,
        updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
      };
    });

  return {
    summary: primary ? pickSummaryForDisplay(primary, lang) : null,
    classificationMeta,
    updatedAt: primary?.updatedAt ? primary.updatedAt.toISOString() : null,
    jobStatus: primary?.jobStatus ?? JOB.pending,
    spaceName: space.name,
    shortCode: space.shortCode,
    ownerContributorHandleId: space.ownerContributorHandleId,
    experimentAggregations,
    summaryPromptInput,
    summaryPrompts: promptRows.map((p) => ({
      slug: p.slug,
      summaryPromptOutput: p.summaryPromptOutput,
    })),
  };
  } catch (err) {
    console.error("[getSpaceSummary]", { spaceId, displayLang: lang, err });
    throw err;
  }
};

export const saveSpaceSummaryPrompt: SaveSpaceSummaryPrompt<
  {
    spaceId: string;
    contributorHandleId: string;
    promptSlug: string;
    summaryPromptOutput: string;
    displayLang?: SummaryDisplayLang;
  },
  { ok: true }
> = async (
  { spaceId, contributorHandleId, promptSlug, summaryPromptOutput, displayLang },
  context,
) => {
  const space = await context.entities.Space.findUnique({
    where: { id: spaceId },
    select: { ownerContributorHandleId: true, shortCode: true },
  });
  if (!space) {
    throw new HttpError(404, "Space not found");
  }
  if (!space.ownerContributorHandleId || space.ownerContributorHandleId !== contributorHandleId) {
    throw new HttpError(403, "Only the space owner can edit the summary prompt.");
  }

  const handle = await context.entities.ContributorHandle.findFirst({
    where: { id: contributorHandleId, spaceId },
  });
  if (!handle) {
    throw new HttpError(403, "Invalid contributor handle for this space.");
  }

  const slug = promptSlug.trim().toLowerCase();
  if (!SLUG_RE.test(slug)) {
    throw new HttpError(400, "Invalid prompt slug.");
  }

  const out = summaryPromptOutput.trim();
  if (out.length < 8) {
    throw new HttpError(400, "Prompt output rules are too short.");
  }
  if (out.length > 32000) {
    throw new HttpError(400, "Prompt output section is too long.");
  }

  const promptRow = await context.entities.SpacePrompt.findFirst({
    where: { spaceId, slug },
  });
  if (!promptRow) {
    throw new HttpError(404, "Prompt not found for this space.");
  }

  await context.entities.SpacePrompt.update({
    where: { id: promptRow.id },
    data: { summaryPromptOutput: out },
  });

  await context.entities.SpaceSummary.updateMany({
    where: { spaceId, promptId: promptRow.id },
    data: { jobStatus: JOB.pending, updatedAt: new Date() },
  });

  void regenerateExperimentAggregations(
    spaceId,
    context.entities,
    normalizeSummaryDisplayLang(displayLang),
  ).catch((err) => {
    console.error("[saveSpaceSummaryPrompt] async summary regeneration failed", {
      spaceId,
      err,
    });
  });

  return { ok: true as const };
};

