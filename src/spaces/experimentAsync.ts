import { callAnthropicText } from "../server/llm/anthropic";
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
  getDefaultSummaryPromptFromDb,
  seedDefaultSummaryPromptIfMissing,
} from "./defaultPromptStore";

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
  SpaceExperimentPrompt: {
    count: (args: { where: { spaceId: string } }) => Promise<number>;
    findMany: (args: {
      where: { spaceId: string; slug?: string };
      orderBy: { slug: "asc" };
    }) => Promise<Array<{ id: string; slug: string; body: string }>>;
    create: (args: {
      data: { spaceId: string; slug: string; body: string };
    }) => Promise<{ id: string }>;
    delete: (args: { where: { id: string } }) => Promise<unknown>;
    deleteMany: (args: {
      where: { spaceId: string; slug?: string };
    }) => Promise<{ count: number }>;
    updateMany: (args: {
      where: { slug: string };
      data: { body: string };
    }) => Promise<{ count: number }>;
    createMany: (args: {
      data: Array<{ spaceId: string; slug: string; body: string }>;
    }) => Promise<unknown>;
  };
  SpaceExperimentModel: {
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
      data: { jobStatus: string; jobError?: string | null; updatedAt: Date | null };
    }) => Promise<{ count: number }>;
    createMany: (args: {
      data: Array<{
        spaceId: string;
        promptId: string;
        experimentModelId: string;
        jobStatus: string;
      }>;
    }) => Promise<unknown>;
    findMany: (args: {
      where: { spaceId: string };
      include: {
        prompt: true;
        expModel: true;
      };
    }) => Promise<
      Array<{
        id: string;
        promptId: string;
        experimentModelId: string;
        summaryText: string | null;
        summaryTextBg: string | null;
        jobError: string | null;
        jobStatus: string;
        prompt: { slug: string; body: string };
        expModel: { slug: string; displayName: string; modelApiId: string };
      }>
    >;
    update: (args: {
      where: { id: string };
      data: {
        summaryText: string | null;
        summaryTextBg?: string | null;
        jobError?: string | null;
        jobStatus: string;
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
  const prompts = await entities.SpaceExperimentPrompt.findMany({
    where: { spaceId },
    orderBy: { slug: "asc" },
  });
  const models = await entities.SpaceExperimentModel.findMany({
    where: { spaceId },
    orderBy: { slug: "asc" },
  });
  if (prompts.length === 0 || models.length === 0) {
    return;
  }
  const rows: Array<{
    spaceId: string;
    promptId: string;
    experimentModelId: string;
    jobStatus: string;
  }> = [];
  for (const p of prompts) {
    for (const m of models) {
      rows.push({
        spaceId,
        promptId: p.id,
        experimentModelId: m.id,
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
  const n = await entities.SpaceExperimentPrompt.count({ where: { spaceId } });
  if (n > 0) return;
  await seedDefaultSummaryPromptIfMissing(entities.AppSetting);
  const defaultPrompt = await getDefaultSummaryPromptFromDb(entities.AppSetting);

  await entities.SpaceExperimentPrompt.create({
    data: {
      spaceId,
      slug: "default",
      body: defaultPrompt,
    },
  });

  await entities.SpaceExperimentModel.createMany({
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

  const briefDel = await entities.SpaceExperimentPrompt.deleteMany({
    where: { spaceId, slug: "brief" },
  });
  if (briefDel.count > 0) {
    changed = true;
  }

  const existingModels = await entities.SpaceExperimentModel.findMany({
    where: { spaceId },
    orderBy: { slug: "asc" },
  });
  const hasLegacyModelSlugs = existingModels.some(
    (m) => m.slug === "primary" || m.slug === "secondary",
  );
  if (hasLegacyModelSlugs) {
    await entities.SpaceExperimentModel.deleteMany({ where: { spaceId } });
    await entities.SpaceExperimentModel.createMany({
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
    ? await entities.SpaceExperimentModel.findMany({
        where: { spaceId },
        orderBy: { slug: "asc" },
      })
    : existingModels;
  const existingBySlug = new Map(modelsAfterLegacyFix.map((m) => [m.slug, m] as const));
  const defaults = defaultExperimentModels();

  for (const row of defaults) {
    const current = existingBySlug.get(row.slug);
    if (!current) {
      await entities.SpaceExperimentModel.createMany({
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
      await entities.SpaceExperimentModel.update({
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
    include: { prompt: true, expModel: true },
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
      data: { jobStatus: JOB.pending, jobError: null, updatedAt: new Date() },
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
    return a.expModel.slug.localeCompare(b.expModel.slug);
  });

  let firstTextEn: string | null = null;
  let firstTextBg: string | null = null;

  for (const a of sorted) {
    const bodyEn =
      entries.length === 0
        ? emptyAggregationUserMessage(spaceDisplayName, "English")
        : buildAggregationUserMessage(entries, spaceDisplayName, "English");
    const bodyBg =
      entries.length === 0
        ? emptyAggregationUserMessage(spaceDisplayName, "Bulgarian")
        : buildAggregationUserMessage(entries, spaceDisplayName, "Bulgarian");
    const msgEn = bodyEn;
    const msgBg = bodyBg;

    try {
      const system = a.prompt.body.trim();
      const summaryText = await callAnthropicText({
        model: a.expModel.modelApiId,
        maxTokens: 700,
        system,
        messages: [{ role: "user", content: msgEn }],
      });
      const summaryTextBg = await callAnthropicText({
        model: a.expModel.modelApiId,
        maxTokens: 700,
        system,
        messages: [{ role: "user", content: msgBg }],
      });
      await entities.SpaceSummaryAggregation.update({
        where: { id: a.id },
        data: {
          summaryText,
          summaryTextBg,
          jobError: null,
          jobStatus: JOB.ready,
          updatedAt: new Date(),
        },
      });
      if (firstTextEn == null) {
        firstTextEn = summaryText;
        firstTextBg = summaryTextBg;
      }
    } catch (err) {
      console.error("experiment aggregation failed", a.id, err);
      const failEn = statsOnlySummaryMessage({
        total,
        praise,
        critique,
        lang: "en",
        includeNoKeyHint: false,
      });
      const failBg = statsOnlySummaryMessage({
        total,
        praise,
        critique,
        lang: "bg",
        includeNoKeyHint: false,
      });
      const errMsg = aggregationFailureMessage(err);
      await entities.SpaceSummaryAggregation.update({
        where: { id: a.id },
        data: {
          summaryText: errMsg,
          summaryTextBg: errMsg,
          jobError: errMsg,
          jobStatus: JOB.failed,
          updatedAt: new Date(),
        },
      });
      if (firstTextEn == null) {
        firstTextEn = failEn;
        firstTextBg = failBg;
      }
    }
    await new Promise((r) => setTimeout(r, 350));
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
 * Sets every space’s `default` experiment prompt body to the current
 * `AppSetting` default summary system prompt (seeding the setting if missing),
 * so bulk regeneration uses the app-wide prompt text.
 */
export async function copyAppSettingDefaultPromptToAllSpaces(
  entities: ExperimentEntities,
): Promise<{ updatedPromptRows: number }> {
  await seedDefaultSummaryPromptIfMissing(entities.AppSetting);
  const body = await getDefaultSummaryPromptFromDb(entities.AppSetting);
  const { count } = await entities.SpaceExperimentPrompt.updateMany({
    where: { slug: "default" },
    data: { body },
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
