import { devServerLog } from "../server/devLog";
import { callLlmText } from "../server/llm/anthropic";
import {
  ANTHROPIC_SONNET_46_MODEL,
  GEMINI_25_FLASH_LITE_MODEL,
  OPENAI_GPT_55_MODEL,
} from "../server/llm/modelIds";
import {
  buildAggregationUserMessage,
  emptyAggregationUserMessage,
  noLlmKeyAggregationMessage,
  statsOnlySummaryMessage,
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
  SpaceSummary: {
    update: (args: {
      where: { spaceId: string };
      data: {
        summaryText?: string | null;
        summaryTextBg?: string | null;
        jobStatus: string;
        updatedAt: Date | null;
      };
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
  SpaceSummaryAggregation: {
    deleteMany: (args: { where: { spaceId: string } }) => Promise<unknown>;
    updateMany: (args: {
      where: { spaceId: string };
      data: {
        jobStatus: string;
        jobError?: string | null;
        langStatusEn?: string;
        langStatusBg?: string;
        updatedAt: Date | null;
      };
    }) => Promise<{ count: number }>;
    createMany: (args: {
      data: Array<{
        spaceId: string;
        promptId: string;
        spaceModelId: string;
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
        promptId: string;
        spaceModelId: string;
        summaryText: string | null;
        summaryTextBg: string | null;
        langStatusEn: string;
        langStatusBg: string;
        jobError: string | null;
        jobStatus: string;
        prompt: { slug: string; summaryPromptOutput: string };
        spaceModel: { slug: string; displayName: string; modelApiId: string };
      }>
    >;
    update: (args: {
      where: { id: string };
      data: {
        summaryText?: string | null;
        summaryTextBg?: string | null;
        langStatusEn?: string;
        langStatusBg?: string;
        jobError?: string | null;
        jobStatus?: string;
        updatedAt: Date | null;
      };
    }) => Promise<unknown>;
  };
};

export function resolveDefaultSummaryModelId(): string {
  const hasAn = !!process.env.ANTHROPIC_API_KEY?.trim();
  const hasGemini = !!process.env.GEMINI_API_KEY?.trim();
  const hasOpenAI = !!process.env.OPENAI_API_KEY?.trim();
  if (hasAn) return process.env.ANTHROPIC_MODEL_SUMMARY?.trim() || ANTHROPIC_SONNET_46_MODEL;
  if (hasGemini) return process.env.GEMINI_MODEL_SUMMARY?.trim() || GEMINI_25_FLASH_LITE_MODEL;
  if (hasOpenAI) return process.env.OPENAI_MODEL_SUMMARY?.trim() || OPENAI_GPT_55_MODEL;
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
      slug: "gemini",
      displayName: "Gemini 2.5 Flash Lite",
      modelApiId: process.env.GEMINI_MODEL_SUMMARY?.trim() || GEMINI_25_FLASH_LITE_MODEL,
    },
    {
      slug: "openai",
      displayName: "OpenAI GPT-5.5",
      modelApiId: process.env.OPENAI_MODEL_SUMMARY?.trim() || OPENAI_GPT_55_MODEL,
    },
  ];
}

export async function syncExperimentAggregationRows(
  spaceId: string,
  entities: ExperimentEntities,
): Promise<void> {
  await entities.SpaceSummaryAggregation.deleteMany({ where: { spaceId } });
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
    jobStatus: string;
  }> = [];
  for (const p of prompts) {
    for (const m of models) {
      rows.push({
        spaceId,
        promptId: p.id,
        spaceModelId: m.id,
        jobStatus: JOB.pending,
      });
    }
  }
  await entities.SpaceSummaryAggregation.createMany({ data: rows });
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
 * experiment model rows with the current 3-provider default deck.
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

/**
 * Runs every prompt × model aggregation for the space and mirrors the first
 * card (lexicographic prompt slug, then model slug) onto SpaceSummary.summaryText
 * (English) and summaryTextBg (Bulgarian).
 */
export async function regenerateExperimentAggregations(
  spaceId: string,
  entities: ExperimentEntities,
): Promise<void> {
  const entries = await entities.FeedbackEntry.findMany({
    where: { spaceId },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  const praise = entries.filter((e) => e.tone === "praise").length;
  const critique = entries.filter((e) => e.tone === "constructive_criticism").length;
  const total = entries.length;

  const hasKeys = !!(
    process.env.ANTHROPIC_API_KEY?.trim() ||
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim()
  );

  const space = await entities.Space.findUnique({
    where: { id: spaceId },
    select: { name: true, shortCode: true },
  });
  const spaceDisplayName =
    space?.name?.trim() || space?.shortCode?.trim() || "this space";

  const aggs = await entities.SpaceSummaryAggregation.findMany({
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

  if (aggs.length === 0) {
    await entities.SpaceSummary.update({
      where: { spaceId },
      data: {
        summaryText: statsOnlySummaryMessage({
          total,
          praise,
          critique,
          lang: "en",
          includeNoKeyHint: !hasKeys,
        }),
        summaryTextBg: statsOnlySummaryMessage({
          total,
          praise,
          critique,
          lang: "bg",
          includeNoKeyHint: !hasKeys,
        }),
        jobStatus: JOB.ready,
        updatedAt: new Date(),
      },
    });
    return;
  }

  if (hasKeys && aggs.length > 0) {
    await entities.SpaceSummaryAggregation.updateMany({
      where: { spaceId },
      data: {
        jobStatus: JOB.pending,
        jobError: null,
        langStatusEn: JOB.pending,
        langStatusBg: JOB.pending,
        updatedAt: new Date(),
      },
    });
  }

  if (!hasKeys) {
    const noKeyEn = noLlmKeyAggregationMessage("en");
    const noKeyBg = noLlmKeyAggregationMessage("bg");
    for (const a of aggs) {
      await entities.SpaceSummaryAggregation.update({
        where: { id: a.id },
        data: {
          summaryText: noKeyEn,
          summaryTextBg: noKeyBg,
          jobError: null,
          jobStatus: JOB.ready,
          langStatusEn: JOB.ready,
          langStatusBg: JOB.ready,
          updatedAt: new Date(),
        },
      });
    }
    await entities.SpaceSummary.update({
      where: { spaceId },
      data: {
        summaryText: statsOnlySummaryMessage({
          total,
          praise,
          critique,
          lang: "en",
          includeNoKeyHint: true,
        }),
        summaryTextBg: statsOnlySummaryMessage({
          total,
          praise,
          critique,
          lang: "bg",
          includeNoKeyHint: true,
        }),
        jobStatus: JOB.ready,
        updatedAt: new Date(),
      },
    });
    return;
  }

  const sorted = [...aggs].sort((a, b) => {
    const ps = a.prompt.slug.localeCompare(b.prompt.slug);
    if (ps !== 0) return ps;
    return a.spaceModel.slug.localeCompare(b.spaceModel.slug);
  });

  const sharedInput = await getSummaryPromptInputFromDb(entities.AppSetting);

  const statsEn = statsOnlySummaryMessage({
    total,
    praise,
    critique,
    lang: "en",
    includeNoKeyHint: false,
  });
  const statsBg = statsOnlySummaryMessage({
    total,
    praise,
    critique,
    lang: "bg",
    includeNoKeyHint: false,
  });

  type AggRow = (typeof sorted)[number];

  async function runOneCard(a: AggRow): Promise<{
    id: string;
    summaryText: string | null;
    summaryTextBg: string | null;
    langStatusEn: string;
    langStatusBg: string;
  }> {
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
      a.prompt.summaryPromptOutput.trim(),
    );

    let summaryText: string | null = null;
    let summaryTextBg: string | null = null;
    let langEn: string = JOB.pending;
    let langBg: string = JOB.pending;

    const runEn = async () => {
      try {
        const t = await callLlmText({
          model: a.spaceModel.modelApiId,
          maxTokens: 700,
          debugLabel: "summary-en",
          system,
          messages: [{ role: "user", content: bodyEn }],
        });
        summaryText = t;
        langEn = JOB.ready;
        await entities.SpaceSummaryAggregation.update({
          where: { id: a.id },
          data: {
            summaryText: t,
            langStatusEn: JOB.ready,
            updatedAt: new Date(),
          },
        });
      } catch (err) {
        console.error("experiment aggregation EN failed", a.id, err);
        const m = aggregationFailureMessage(err);
        summaryText = m;
        langEn = JOB.failed;
        await entities.SpaceSummaryAggregation.update({
          where: { id: a.id },
          data: {
            summaryText: m,
            langStatusEn: JOB.failed,
            jobError: m,
            updatedAt: new Date(),
          },
        });
      }
    };

    const runBg = async () => {
      try {
        const t = await callLlmText({
          model: a.spaceModel.modelApiId,
          maxTokens: 700,
          debugLabel: "summary-bg",
          system,
          messages: [{ role: "user", content: bodyBg }],
        });
        summaryTextBg = t;
        langBg = JOB.ready;
        await entities.SpaceSummaryAggregation.update({
          where: { id: a.id },
          data: {
            summaryTextBg: t,
            langStatusBg: JOB.ready,
            updatedAt: new Date(),
          },
        });
      } catch (err) {
        console.error("experiment aggregation BG failed", a.id, err);
        const m = aggregationFailureMessage(err);
        summaryTextBg = m;
        langBg = JOB.failed;
        await entities.SpaceSummaryAggregation.update({
          where: { id: a.id },
          data: {
            summaryTextBg: m,
            langStatusBg: JOB.failed,
            jobError: m,
            updatedAt: new Date(),
          },
        });
      }
    };

    await Promise.all([runEn(), runBg()]);

    const bothFailed = langEn === JOB.failed && langBg === JOB.failed;
    const overall = bothFailed ? JOB.failed : JOB.ready;
    await entities.SpaceSummaryAggregation.update({
      where: { id: a.id },
      data: {
        jobStatus: overall,
        jobError: bothFailed ? (summaryText ?? summaryTextBg) : null,
        updatedAt: new Date(),
      },
    });

    return {
      id: a.id,
      summaryText,
      summaryTextBg,
      langStatusEn: langEn,
      langStatusBg: langBg,
    };
  }

  const results = await Promise.all(sorted.map((a) => runOneCard(a)));

  const primaryId = sorted[0]!.id;
  const primary = results.find((r) => r.id === primaryId);
  let firstTextEn = statsEn;
  let firstTextBg = statsBg;
  if (primary?.langStatusEn === JOB.ready && primary.summaryText?.trim()) {
    firstTextEn = primary.summaryText;
  }
  if (primary?.langStatusBg === JOB.ready && primary.summaryTextBg?.trim()) {
    firstTextBg = primary.summaryTextBg;
  }

  await entities.SpaceSummary.update({
    where: { spaceId },
    data: {
      summaryText: firstTextEn,
      summaryTextBg: firstTextBg,
      jobStatus: JOB.ready,
      updatedAt: new Date(),
    },
  });
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
