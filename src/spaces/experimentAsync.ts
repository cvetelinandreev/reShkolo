import { devServerLog } from "../server/devLog";
import { callLlmText } from "../server/llm/anthropic";
import {
  ANTHROPIC_SONNET_46_MODEL,
  GEMINI_25_FLASH_LITE_MODEL,
  GROQ_LLAMA_4_SCOUT_MODEL,
  OPENAI_GPT_55_MINI_MODEL,
} from "../server/llm/modelIds";
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
  SpaceModel: {
    findMany: (args: {
      where: { spaceId: string };
      orderBy: { slug: "asc" };
    }) => Promise<Array<{ id: string; slug: string; displayName: string; modelApiId: string }>>;
    update: (args: {
      where: { id: string };
      data: { modelApiId: string; displayName?: string };
    }) => Promise<unknown>;
    createMany: (args: {
      data: Array<{
        spaceId: string;
        slug: string;
        displayName: string;
        modelApiId: string;
      }>;
    }) => Promise<unknown>;
    deleteMany: (args: { where: { spaceId: string } }) => Promise<unknown>;
  };
  SpaceSummary: {
    deleteMany: (args: { where: { spaceId: string } }) => Promise<unknown>;
    updateMany: (args: {
      where: { spaceId: string; language?: string; promptId?: string; spaceModelId?: string };
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
        spaceModelId: string;
        language: string;
        jobStatus: string;
      }>;
    }) => Promise<unknown>;
    findMany: (args: {
      where: { spaceId: string };
      include: {
        prompt: true;
        spaceModel: true;
      };
    }) => Promise<
      Array<{
        id: string;
        spaceId: string;
        promptId: string;
        spaceModelId: string;
        language: string;
        summaryText: string | null;
        jobStatus: string;
        prompt: { slug: string; summaryPromptOutput: string };
        spaceModel: { slug: string; displayName: string; modelApiId: string };
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

export function resolveDefaultSummaryModelId(): string {
  const hasAn = !!process.env.ANTHROPIC_API_KEY?.trim();
  const hasGroq = !!process.env.GROQ_API_KEY?.trim();
  const hasGemini = !!process.env.GEMINI_API_KEY?.trim();
  const hasOpenAI = !!process.env.OPENAI_API_KEY?.trim();
  if (hasAn) return process.env.ANTHROPIC_MODEL_SUMMARY?.trim() || ANTHROPIC_SONNET_46_MODEL;
  // Groq before OpenAI/Gemini: generous free-tier throughput vs tight Gemini caps.
  if (hasGroq) return process.env.GROQ_MODEL_SUMMARY?.trim() || GROQ_LLAMA_4_SCOUT_MODEL;
  if (hasOpenAI) return process.env.OPENAI_MODEL_SUMMARY?.trim() || OPENAI_GPT_55_MINI_MODEL;
  if (hasGemini) return process.env.GEMINI_MODEL_SUMMARY?.trim() || GEMINI_25_FLASH_LITE_MODEL;
  return ANTHROPIC_SONNET_46_MODEL;
}

function defaultExperimentModels(): Array<{ slug: string; displayName: string; modelApiId: string }> {
  return [
    {
      slug: "anthropic",
      displayName: "Anthropic Sonnet",
      modelApiId: process.env.ANTHROPIC_MODEL_SUMMARY?.trim() || ANTHROPIC_SONNET_46_MODEL,
    },
    {
      slug: "groq",
      displayName: "Groq Llama 4 Scout",
      modelApiId: process.env.GROQ_MODEL_SUMMARY?.trim() || GROQ_LLAMA_4_SCOUT_MODEL,
    },
    {
      slug: "gemini",
      displayName: "Gemini 2.5 Flash Lite",
      modelApiId: process.env.GEMINI_MODEL_SUMMARY?.trim() || GEMINI_25_FLASH_LITE_MODEL,
    },
    {
      slug: "openai",
      displayName: "OpenAI GPT-5.5 mini",
      modelApiId: process.env.OPENAI_MODEL_SUMMARY?.trim() || OPENAI_GPT_55_MINI_MODEL,
    },
  ];
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
  const models = await entities.SpaceModel.findMany({
    where: { spaceId },
    orderBy: { slug: "asc" },
  });
  if (prompts.length === 0 || models.length === 0) {
    return;
  }
  const rows: Array<{
    spaceId: string;
    promptId: string;
    spaceModelId: string;
    language: string;
    jobStatus: string;
  }> = [];
  for (const p of prompts) {
    for (const m of models) {
      rows.push({
        spaceId,
        promptId: p.id,
        spaceModelId: m.id,
        language: "en",
        jobStatus: JOB.pending,
      });
      rows.push({
        spaceId,
        promptId: p.id,
        spaceModelId: m.id,
        language: "bg",
        jobStatus: JOB.pending,
      });
    }
  }
  await entities.SpaceSummary.createMany({ data: rows });
}

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

  await entities.SpaceModel.createMany({
    data: defaultExperimentModels().map((m) => ({
      spaceId,
      slug: m.slug,
      displayName: m.displayName,
      modelApiId: m.modelApiId,
    })),
  });

  await syncExperimentAggregationRows(spaceId, entities);
}

/**
 * Removes the legacy `brief` prompt so only `default` remains, and aligns
 * experiment model rows with the current default provider deck.
 */
export async function reconcileExperimentDeckWithSingleDefaultPrompt(
  spaceId: string,
  entities: ExperimentEntities,
): Promise<boolean> {
  let changed = false;

  const briefDel = await entities.SpacePrompt.deleteMany({
    where: { spaceId, slug: "brief" },
  });
  if (briefDel.count > 0) {
    changed = true;
  }

  const existingModels = await entities.SpaceModel.findMany({
    where: { spaceId },
    orderBy: { slug: "asc" },
  });
  const hasLegacyModelSlugs = existingModels.some(
    (m) => m.slug === "primary" || m.slug === "secondary",
  );
  if (hasLegacyModelSlugs) {
    await entities.SpaceModel.deleteMany({ where: { spaceId } });
    await entities.SpaceModel.createMany({
      data: defaultExperimentModels().map((m) => ({
        spaceId,
        slug: m.slug,
        displayName: m.displayName,
        modelApiId: m.modelApiId,
      })),
    });
    changed = true;
  }
  const modelsAfterLegacyFix = hasLegacyModelSlugs
    ? await entities.SpaceModel.findMany({
        where: { spaceId },
        orderBy: { slug: "asc" },
      })
    : existingModels;
  const existingBySlug = new Map(modelsAfterLegacyFix.map((m) => [m.slug, m] as const));
  const defaults = defaultExperimentModels();

  for (const row of defaults) {
    const current = existingBySlug.get(row.slug);
    if (!current) {
      await entities.SpaceModel.createMany({
        data: [
          {
            spaceId,
            slug: row.slug,
            displayName: row.displayName,
            modelApiId: row.modelApiId,
          },
        ],
      });
      changed = true;
      continue;
    }
    const needsUpdate =
      current.displayName.trim() !== row.displayName || current.modelApiId.trim() !== row.modelApiId;
    if (needsUpdate) {
      await entities.SpaceModel.update({
        where: { id: current.id },
        data: {
          displayName: row.displayName,
          modelApiId: row.modelApiId,
        },
      });
      changed = true;
    }
  }

  if (changed) {
    await syncExperimentAggregationRows(spaceId, entities);
  }

  return changed;
}

type AggregationRowIncluded = {
  id: string;
  spaceId: string;
  promptId: string;
  spaceModelId: string;
  language: string;
  prompt: { slug: string; summaryPromptOutput: string };
  spaceModel: { slug: string; displayName: string; modelApiId: string };
};

type AggregationPair = {
  promptId: string;
  spaceModelId: string;
  prompt: { slug: string; summaryPromptOutput: string };
  spaceModel: { slug: string; displayName: string; modelApiId: string };
  en: AggregationRowIncluded | null;
  bg: AggregationRowIncluded | null;
};

export function pairAggregationRows(rows: AggregationRowIncluded[]): AggregationPair[] {
  const map = new Map<string, AggregationPair>();
  for (const row of rows) {
    const key = `${row.promptId}::${row.spaceModelId}`;
    const cur =
      map.get(key) ??
      ({
        promptId: row.promptId,
        spaceModelId: row.spaceModelId,
        prompt: row.prompt,
        spaceModel: row.spaceModel,
        en: null,
        bg: null,
      } satisfies AggregationPair);
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
        model: pair.spaceModel.modelApiId,
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
        model: pair.spaceModel.modelApiId,
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
    include: { prompt: true, spaceModel: true },
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

  const hasKeys = !!(
    process.env.ANTHROPIC_API_KEY?.trim() ||
    process.env.GROQ_API_KEY?.trim() ||
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim()
  );

  const space = await entities.Space.findUnique({
    where: { id: spaceId },
    select: { name: true, shortCode: true },
  });
  const spaceDisplayName =
    space?.name?.trim() || space?.shortCode?.trim() || "this space";

  const aggs = await entities.SpaceSummary.findMany({
    where: { spaceId },
    include: { prompt: true, spaceModel: true },
  });
  const sorted = [...pairAggregationRows(aggs)].sort((x, y) => {
    const ps = x.prompt.slug.localeCompare(y.prompt.slug);
    if (ps !== 0) return ps;
    return x.spaceModel.slug.localeCompare(y.spaceModel.slug);
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

  const total = entries.length;

  const hasKeys = !!(
    process.env.ANTHROPIC_API_KEY?.trim() ||
    process.env.GROQ_API_KEY?.trim() ||
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim()
  );

  const space = await entities.Space.findUnique({
    where: { id: spaceId },
    select: { name: true, shortCode: true },
  });
  const spaceDisplayName =
    space?.name?.trim() || space?.shortCode?.trim() || "this space";

  const aggs = await entities.SpaceSummary.findMany({
    where: { spaceId },
    include: { prompt: true, spaceModel: true },
  });

  devServerLog("regenerateExperimentAggregations", {
    spaceId,
    shortCode: space?.shortCode ?? null,
    feedbackEntries: total,
    aggregationRows: aggs.length,
    hasLlmKeys: hasKeys,
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
    return a.spaceModel.slug.localeCompare(b.spaceModel.slug);
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
            model: pair.spaceModel.modelApiId,
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
