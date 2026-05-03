import { callLlmText } from "../server/llm/anthropic";
import {
  ALL_PROVIDER_SLUGS,
  getProviderInfo,
  hasAnyProviderKey,
  isModelProviderSlug,
  type ModelProviderInfo,
  type ModelProviderSlug,
} from "../server/llm/modelProviders";
import {
  buildAggregationUserMessage,
  emptyAggregationUserMessage,
  noLlmKeyAggregationMessage,
} from "./aggregationShared";
import {
  getDefaultSummaryPromptOutputFromDb,
  getSummaryPromptInputFromDb,
  seedSummaryPromptAppSettingsIfMissing,
} from "./defaultPromptStore";
import { composeExperimentSystemPrompt } from "./experimentPromptParts";

const JOB = {
  pending: "pending",
  ready: "ready",
  failed: "failed",
} as const;

function aggregationFailureMessage(err: unknown): string {
  const parts: string[] = [];
  const seen = new Set<unknown>();

  function pushFrom(e: unknown, depth: number) {
    if (depth > 6 || e === undefined || seen.has(e)) return;
    seen.add(e);

    if (typeof AggregateError !== "undefined" && e instanceof AggregateError) {
      const m = e.message.trim();
      if (m) parts.push(m);
      for (const sub of e.errors) pushFrom(sub, depth + 1);
      return;
    }
    if (e instanceof Error) {
      const m = e.message.trim();
      if (m) parts.push(m);
      if (e.cause !== undefined && e.cause !== e) {
        pushFrom(e.cause, depth + 1);
      }
      return;
    }
    if (e != null && typeof e === "object") {
      const o = e as Record<string, unknown>;
      const msg = typeof o.message === "string" ? o.message.trim() : "";
      if (msg) parts.push(msg);
      const detail = typeof o.detail === "string" ? o.detail.trim() : "";
      if (detail) parts.push(detail);
      return;
    }
    const s = String(e).trim();
    if (s && s !== "[object Object]") parts.push(s);
  }

  pushFrom(err, 0);
  const joined = parts.join(" — ").trim();
  if (joined) return joined.slice(0, 8000);
  const s = String(err).trim();
  return s && s !== "[object Object]" ? s.slice(0, 8000) : "Unknown error";
}

export type ExperimentEntities = {
  Space: {
    findUnique: (args: {
      where: { id: string };
      select: { name: true; shortCode: true };
    }) => Promise<{ name: string | null; shortCode: string } | null>;
    findMany: (args: {
      select: { id: true };
    }) => Promise<Array<{ id: string }>>;
  };
  FeedbackEntry: {
    findMany: (args: {
      where: { spaceId: string };
      orderBy: { createdAt: "asc" };
      take: number;
    }) => Promise<
      Array<{
        tone: string;
        rawText: string;
        contributorHandleId: string;
        createdAt: Date;
      }>
    >;
  };
  AppSetting?: {
    findUnique: (args: {
      where: { key: string };
      select: { value: true };
    }) => Promise<{ value: string } | null>;
    upsert: (args: {
      where: { key: string };
      create: { key: string; value: string };
      update: { value?: string };
    }) => Promise<unknown>;
  };
  SpacePrompt: {
    count: (args: { where: { spaceId: string } }) => Promise<number>;
    findMany: (args: {
      where: { spaceId: string; slug?: string };
      orderBy: { slug: "asc" };
    }) => Promise<Array<{ id: string; slug: string; summaryPromptOutput: string }>>;
    create: (args: {
      data: { spaceId: string; slug: string; summaryPromptOutput: string };
    }) => Promise<{ id: string }>;
    delete: (args: { where: { id: string } }) => Promise<unknown>;
    deleteMany: (args: {
      where: { spaceId: string; slug?: string };
    }) => Promise<{ count: number }>;
    updateMany: (args: {
      where: { slug: string };
      data: { summaryPromptOutput: string };
    }) => Promise<{ count: number }>;
    createMany: (args: {
      data: Array<{ spaceId: string; slug: string; summaryPromptOutput: string }>;
    }) => Promise<unknown>;
  };
  SpaceSummary: {
    deleteMany: (args: { where: { spaceId: string } }) => Promise<unknown>;
    updateMany: (args: {
      where: { spaceId: string; language?: string; promptId?: string; modelSlug?: string };
      data: {
        jobStatus: string;
        summaryText?: string | null;
        updatedAt: Date | null;
      };
    }) => Promise<{ count: number }>;
    createMany: (args: {
      data: Array<{
        spaceId: string;
        promptId: string;
        modelSlug: string;
        language: string;
        jobStatus: string;
      }>;
    }) => Promise<unknown>;
    findMany: (args: {
      where: { spaceId: string };
      include: {
        prompt: true;
      };
    }) => Promise<
      Array<{
        id: string;
        spaceId: string;
        promptId: string;
        modelSlug: string;
        language: string;
        summaryText: string | null;
        jobStatus: string;
        prompt: { slug: string; summaryPromptOutput: string };
      }>
    >;
    update: (args: {
      where: { id: string };
      data: {
        summaryText?: string | null;
        jobStatus?: string;
        updatedAt: Date | null;
      };
    }) => Promise<unknown>;
  };
};

export function defaultExperimentModels(): ModelProviderInfo[] {
  return ALL_PROVIDER_SLUGS.map((slug) => getProviderInfo(slug));
}

export async function syncExperimentAggregationRows(
  spaceId: string,
  entities: ExperimentEntities,
): Promise<void> {
  await entities.SpaceSummary.deleteMany({ where: { spaceId } });
  const prompts = await entities.SpacePrompt.findMany({
    where: { spaceId },
    orderBy: { slug: "asc" },
  });
  if (prompts.length === 0) return;
  const rows: Array<{
    spaceId: string;
    promptId: string;
    modelSlug: string;
    language: string;
    jobStatus: string;
  }> = [];
  for (const p of prompts) {
    for (const slug of ALL_PROVIDER_SLUGS) {
      rows.push({ spaceId, promptId: p.id, modelSlug: slug, language: "en", jobStatus: JOB.pending });
      rows.push({ spaceId, promptId: p.id, modelSlug: slug, language: "bg", jobStatus: JOB.pending });
    }
  }
  await entities.SpaceSummary.createMany({ data: rows });
}

const DEFAULT_EMPTY_SUMMARY_BG =
  "Още никой не е изпратил нито похвала, нито забележка за {subject}. Можеш да бъдеш първият.";
const DEFAULT_EMPTY_SUMMARY_EN =
  "No one has submitted any praise or feedback about {subject} yet — you can be the first.";

export async function ensureExperimentDefaultsForSpace(
  spaceId: string,
  entities: ExperimentEntities,
): Promise<void> {
  const n = await entities.SpacePrompt.count({ where: { spaceId } });
  if (n > 0) return;
  await seedSummaryPromptAppSettingsIfMissing(entities.AppSetting);
  const defaultOutput = await getDefaultSummaryPromptOutputFromDb(entities.AppSetting);

  await entities.SpacePrompt.create({
    data: {
      spaceId,
      slug: "default",
      summaryPromptOutput: defaultOutput,
    },
  });

  await syncExperimentAggregationRows(spaceId, entities);

  const space = await entities.Space.findUnique({
    where: { id: spaceId },
    select: { name: true, shortCode: true },
  });
  const subject = space?.name?.trim() || space?.shortCode?.trim() || "this space";
  const emptyEn = DEFAULT_EMPTY_SUMMARY_EN.replace("{subject}", subject);
  const emptyBg = DEFAULT_EMPTY_SUMMARY_BG.replace("{subject}", subject);
  const now = new Date();
  await entities.SpaceSummary.updateMany({
    where: { spaceId },
    data: { summaryText: emptyEn, jobStatus: JOB.ready, updatedAt: now },
  });
  await entities.SpaceSummary.updateMany({
    where: { spaceId, language: "bg" },
    data: { summaryText: emptyBg, jobStatus: JOB.ready, updatedAt: now },
  });
}

type AggregationRowIncluded = {
  id: string;
  spaceId: string;
  promptId: string;
  modelSlug: string;
  language: string;
  prompt: { slug: string; summaryPromptOutput: string };
};

type AggregationPair = {
  promptId: string;
  modelSlug: ModelProviderSlug;
  prompt: { slug: string; summaryPromptOutput: string };
  model: ModelProviderInfo;
  en: AggregationRowIncluded | null;
  bg: AggregationRowIncluded | null;
};

export function pairAggregationRows(rows: AggregationRowIncluded[]): AggregationPair[] {
  const map = new Map<string, AggregationPair>();
  for (const row of rows) {
    const slug = row.modelSlug;
    if (!isModelProviderSlug(slug)) continue;
    const key = `${row.promptId}::${slug}`;
    const cur: AggregationPair =
      map.get(key) ??
      {
        promptId: row.promptId,
        modelSlug: slug,
        prompt: row.prompt,
        model: getProviderInfo(slug),
        en: null,
        bg: null,
      };
    if (row.language === "bg") cur.bg = row;
    else cur.en = row;
    map.set(key, cur);
  }
  return [...map.values()];
}

type FeedbackRowLite = {
  tone: string;
  rawText: string;
  contributorHandleId: string;
  createdAt: Date;
};

/**
 * LLM generation for a single prompt × model row (EN then BG). Updates the
 * aggregation row in the database. Used by bulk regeneration and per-card actions.
 */
async function runAggregationCardGeneration(
  entities: ExperimentEntities,
  pair: AggregationPair,
  deps: {
    entries: FeedbackRowLite[];
    spaceDisplayName: string;
    sharedInput: string;
  },
): Promise<{
  summaryTextEn: string | null;
  summaryTextBg: string | null;
  statusEn: string;
  statusBg: string;
}> {
  const { entries, spaceDisplayName, sharedInput } = deps;

  const bodyEn =
    entries.length === 0
      ? emptyAggregationUserMessage(spaceDisplayName, "English")
      : buildAggregationUserMessage(entries, spaceDisplayName, "English");
  const bodyBg =
    entries.length === 0
      ? emptyAggregationUserMessage(spaceDisplayName, "Bulgarian")
      : buildAggregationUserMessage(entries, spaceDisplayName, "Bulgarian");

  const system = composeExperimentSystemPrompt(
    sharedInput,
    pair.prompt.summaryPromptOutput.trim(),
  );

  let summaryTextEn: string | null = null;
  let summaryTextBg: string | null = null;
  let statusEn: string = JOB.pending;
  let statusBg: string = JOB.pending;

  const runEn = async () => {
    if (!pair.en) return;
    try {
      const t = await callLlmText({
        model: pair.model.modelApiId,
        maxTokens: 700,
        debugLabel: "summary-en",
        system,
        messages: [{ role: "user", content: bodyEn }],
      });
      summaryTextEn = t;
      statusEn = JOB.ready;
      await entities.SpaceSummary.update({
        where: { id: pair.en.id },
        data: {
          summaryText: t,
          jobStatus: JOB.ready,
          updatedAt: new Date(),
        },
      });
    } catch (err) {
      console.error("experiment aggregation EN failed", pair.en.id, err);
      const m = aggregationFailureMessage(err);
      summaryTextEn = m;
      statusEn = JOB.failed;
      await entities.SpaceSummary.update({
        where: { id: pair.en.id },
        data: {
          summaryText: m,
          jobStatus: JOB.failed,
          updatedAt: new Date(),
        },
      });
    }
  };

  const runBg = async () => {
    if (!pair.bg) return;
    try {
      const t = await callLlmText({
        model: pair.model.modelApiId,
        maxTokens: 700,
        debugLabel: "summary-bg",
        system,
        messages: [{ role: "user", content: bodyBg }],
      });
      summaryTextBg = t;
      statusBg = JOB.ready;
      await entities.SpaceSummary.update({
        where: { id: pair.bg.id },
        data: {
          summaryText: t,
          jobStatus: JOB.ready,
          updatedAt: new Date(),
        },
      });
    } catch (err) {
      console.error("experiment aggregation BG failed", pair.bg.id, err);
      const m = aggregationFailureMessage(err);
      summaryTextBg = m;
      statusBg = JOB.failed;
      await entities.SpaceSummary.update({
        where: { id: pair.bg.id },
        data: {
          summaryText: m,
          jobStatus: JOB.failed,
          updatedAt: new Date(),
        },
      });
    }
  };

  await runEn();
  await runBg();

  return {
    summaryTextEn,
    summaryTextBg,
    statusEn,
    statusBg,
  };
}

/**
 * Synchronously (one HTTP request) generates EN+BG for one aggregation row
 * and updates that row in the DB.
 */
export async function generateExperimentAggregationRow(
  spaceId: string,
  aggregationId: string,
  entities: ExperimentEntities,
): Promise<{
  summaryTextEn: string | null;
  summaryTextBg: string | null;
  error: string | null;
  mirroredPrimary: boolean;
} | null> {
  const aggsForRow = await entities.SpaceSummary.findMany({
    where: { spaceId },
    include: { prompt: true },
  });
  const pair = pairAggregationRows(aggsForRow).find(
    (p) => p.en?.id === aggregationId || p.bg?.id === aggregationId,
  );
  const row = pair?.en ?? pair?.bg ?? null;
  if (!row) {
    return null;
  }

  const entries = await entities.FeedbackEntry.findMany({
    where: { spaceId },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  const hasKeys = hasAnyProviderKey();

  const space = await entities.Space.findUnique({
    where: { id: spaceId },
    select: { name: true, shortCode: true },
  });
  const spaceDisplayName =
    space?.name?.trim() || space?.shortCode?.trim() || "this space";

  const aggs = await entities.SpaceSummary.findMany({
    where: { spaceId },
    include: { prompt: true },
  });
  const sorted = [...pairAggregationRows(aggs)].sort((x, y) => {
    const ps = x.prompt.slug.localeCompare(y.prompt.slug);
    if (ps !== 0) return ps;
    return x.modelSlug.localeCompare(y.modelSlug);
  });
  const primaryId = sorted[0]?.en?.id ?? sorted[0]?.bg?.id ?? null;

  const sharedInput = await getSummaryPromptInputFromDb(entities.AppSetting);

  if (!hasKeys) {
    const noKeyEn = noLlmKeyAggregationMessage("en");
    const noKeyBg = noLlmKeyAggregationMessage("bg");
    if (pair?.en) {
      await entities.SpaceSummary.update({
        where: { id: pair.en.id },
        data: { summaryText: noKeyEn, jobStatus: JOB.ready, updatedAt: new Date() },
      });
    }
    if (pair?.bg) {
      await entities.SpaceSummary.update({
        where: { id: pair.bg.id },
        data: { summaryText: noKeyBg, jobStatus: JOB.ready, updatedAt: new Date() },
      });
    }
    return {
      summaryTextEn: noKeyEn,
      summaryTextBg: noKeyBg,
      error: null,
      mirroredPrimary: primaryId === row.id,
    };
  }

  const r = await runAggregationCardGeneration(entities, pair!, {
    entries,
    spaceDisplayName,
    sharedInput,
  });

  return {
    summaryTextEn: r.summaryTextEn,
    summaryTextBg: r.summaryTextBg,
    error: r.statusEn === JOB.failed && r.statusBg === JOB.failed ? "Both languages failed" : null,
    mirroredPrimary: primaryId === row.id,
  };
}

/**
 * Runs every prompt × model aggregation for the space.
 */
export async function regenerateExperimentAggregations(
  spaceId: string,
  entities: ExperimentEntities,
  preferredLang: "en" | "bg" = "en",
): Promise<void> {
  const entries = await entities.FeedbackEntry.findMany({
    where: { spaceId },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  const hasKeys = hasAnyProviderKey();

  const space = await entities.Space.findUnique({
    where: { id: spaceId },
    select: { name: true, shortCode: true },
  });
  const spaceDisplayName =
    space?.name?.trim() || space?.shortCode?.trim() || "this space";

  const aggs = await entities.SpaceSummary.findMany({
    where: { spaceId },
    include: { prompt: true },
  });

  if (aggs.length === 0) return;

  if (hasKeys && aggs.length > 0) {
    await entities.SpaceSummary.updateMany({
      where: { spaceId },
      data: {
        jobStatus: JOB.pending,
        updatedAt: new Date(),
      },
    });
  }

  if (!hasKeys) {
    const noKeyEn = noLlmKeyAggregationMessage("en");
    const noKeyBg = noLlmKeyAggregationMessage("bg");
    for (const a of aggs) {
      await entities.SpaceSummary.update({
        where: { id: a.id },
        data: {
          summaryText: a.language === "bg" ? noKeyBg : noKeyEn,
          jobStatus: JOB.ready,
          updatedAt: new Date(),
        },
      });
    }
    return;
  }

  const sorted = [...pairAggregationRows(aggs)].sort((a, b) => {
    const ps = a.prompt.slug.localeCompare(b.prompt.slug);
    if (ps !== 0) return ps;
    return a.modelSlug.localeCompare(b.modelSlug);
  });

  const sharedInput = await getSummaryPromptInputFromDb(entities.AppSetting);

  const runPhase = async (lang: "en" | "bg") => {
    await Promise.all(
      sorted.map(async (pair) => {
        const target = lang === "bg" ? pair.bg : pair.en;
        if (!target) return;
        const body =
          entries.length === 0
            ? emptyAggregationUserMessage(
                spaceDisplayName,
                lang === "bg" ? "Bulgarian" : "English",
              )
            : buildAggregationUserMessage(
                entries,
                spaceDisplayName,
                lang === "bg" ? "Bulgarian" : "English",
              );
        const system = composeExperimentSystemPrompt(
          sharedInput,
          pair.prompt.summaryPromptOutput.trim(),
        );
        try {
          const text = await callLlmText({
            model: pair.model.modelApiId,
            maxTokens: 700,
            debugLabel: lang === "bg" ? "summary-bg" : "summary-en",
            system,
            messages: [{ role: "user", content: body }],
          });
          await entities.SpaceSummary.update({
            where: { id: target.id },
            data: {
              summaryText: text,
              jobStatus: JOB.ready,
              updatedAt: new Date(),
            },
          });
        } catch (err) {
          console.error(
            lang === "bg"
              ? "experiment aggregation BG failed"
              : "experiment aggregation EN failed",
            target.id,
            err,
          );
          const m = aggregationFailureMessage(err);
          await entities.SpaceSummary.update({
            where: { id: target.id },
            data: {
              summaryText: m,
              jobStatus: JOB.failed,
              updatedAt: new Date(),
            },
          });
        }
      }),
    );
  };

  if (preferredLang === "bg") {
    await runPhase("bg");
    await runPhase("en");
  } else {
    await runPhase("en");
    await runPhase("bg");
  }
}

/**
 * Sets every space’s `default` experiment prompt OUTPUT to the current
 * `AppSetting` default output template (seeding settings if missing),
 * so bulk regeneration uses the app-wide output rules.
 */
export async function copyAppSettingDefaultPromptToAllSpaces(
  entities: ExperimentEntities,
): Promise<{ updatedPromptRows: number }> {
  await seedSummaryPromptAppSettingsIfMissing(entities.AppSetting);
  const summaryPromptOutput = await getDefaultSummaryPromptOutputFromDb(entities.AppSetting);
  const { count } = await entities.SpacePrompt.updateMany({
    where: { slug: "default" },
    data: { summaryPromptOutput },
  });
  return { updatedPromptRows: count };
}

/** Runs {@link regenerateExperimentAggregations} for every space (sequential). */
export async function regenerateAllExperimentAggregations(
  entities: ExperimentEntities,
): Promise<{ spaceCount: number; updatedPromptRows: number }> {
  const { updatedPromptRows } = await copyAppSettingDefaultPromptToAllSpaces(
    entities,
  );
  const spaces = await entities.Space.findMany({
    select: { id: true },
  });
  for (const { id } of spaces) {
    await regenerateExperimentAggregations(id, entities);
  }
  return { spaceCount: spaces.length, updatedPromptRows };
}
