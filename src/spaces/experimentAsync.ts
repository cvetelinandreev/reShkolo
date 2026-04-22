import { callAnthropicText } from "../server/llm/anthropic";
import {
  BRIEF_SUMMARY_SYSTEM_PROMPT,
  buildAggregationUserMessage,
  DEFAULT_SUMMARY_SYSTEM_PROMPT,
} from "./aggregationShared";

const JOB = {
  pending: "pending",
  ready: "ready",
  failed: "failed",
} as const;

export type ExperimentEntities = {
  FeedbackEntry: {
    findMany: (args: {
      where: { spaceId: string };
      orderBy: { createdAt: "asc" };
      take: number;
    }) => Promise<Array<{ tone: string; rawText: string }>>;
  };
  SpaceSummary: {
    update: (args: {
      where: { spaceId: string };
      data: {
        summaryText?: string | null;
        jobStatus: string;
        updatedAt: Date | null;
      };
    }) => Promise<unknown>;
  };
  SpaceExperimentPrompt: {
    count: (args: { where: { spaceId: string } }) => Promise<number>;
    findMany: (args: {
      where: { spaceId: string };
      orderBy: { slug: "asc" };
    }) => Promise<Array<{ id: string; slug: string; body: string }>>;
    create: (args: {
      data: { spaceId: string; slug: string; body: string };
    }) => Promise<{ id: string }>;
    deleteMany: (args: { where: { spaceId: string } }) => Promise<unknown>;
    createMany: (args: {
      data: Array<{ spaceId: string; slug: string; body: string }>;
    }) => Promise<unknown>;
  };
  SpaceExperimentModel: {
    findMany: (args: {
      where: { spaceId: string };
      orderBy: { slug: "asc" };
    }) => Promise<Array<{ id: string; slug: string; displayName: string; modelApiId: string }>>;
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
      data: { jobStatus: string; updatedAt: Date | null };
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
        jobStatus: string;
        prompt: { slug: string; body: string };
        expModel: { slug: string; displayName: string; modelApiId: string };
      }>
    >;
    update: (args: {
      where: { id: string };
      data: {
        summaryText: string | null;
        jobStatus: string;
        updatedAt: Date | null;
      };
    }) => Promise<unknown>;
  };
};

export function resolveDefaultSummaryModelId(): string {
  return (
    process.env.OPENROUTER_MODEL_SUMMARY ??
    process.env.ANTHROPIC_MODEL_SUMMARY ??
    (process.env.OPENROUTER_API_KEY ? "openrouter/free" : "claude-opus-4-20250514")
  );
}

function secondaryExperimentModelId(): string {
  if (process.env.OPENROUTER_API_KEY) {
    return (
      process.env.OPENROUTER_MODEL_SUMMARY_SECOND ??
      "openrouter/free"
    );
  }
  return (
    process.env.ANTHROPIC_MODEL_SUMMARY_SECOND ??
    "claude-3-5-haiku-20241022"
  );
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

  await entities.SpaceExperimentPrompt.create({
    data: {
      spaceId,
      slug: "default",
      body: DEFAULT_SUMMARY_SYSTEM_PROMPT,
    },
  });
  await entities.SpaceExperimentPrompt.create({
    data: {
      spaceId,
      slug: "brief",
      body: BRIEF_SUMMARY_SYSTEM_PROMPT,
    },
  });

  await entities.SpaceExperimentModel.createMany({
    data: [
      {
        spaceId,
        slug: "primary",
        displayName: "Primary (env)",
        modelApiId: resolveDefaultSummaryModelId(),
      },
      {
        spaceId,
        slug: "secondary",
        displayName: "Secondary",
        modelApiId: secondaryExperimentModelId(),
      },
    ],
  });

  await syncExperimentAggregationRows(spaceId, entities);
}

function statsOnlySummary(params: {
  total: number;
  praise: number;
  critique: number;
}): string {
  return [
    `This space has ${params.total} feedback entr${params.total === 1 ? "y" : "ies"} so far.`,
    `Overall tone mix: ${params.praise} praise-oriented, ${params.critique} constructive remarks.`,
    "Narrative summary is disabled because no LLM key is configured. Set OPENROUTER_API_KEY (free option) or ANTHROPIC_API_KEY in .env.server, then restart `wasp start`.",
  ].join(" ");
}

const NO_KEY_AGG_TEXT =
  "No LLM key configured. Set OPENROUTER_API_KEY or ANTHROPIC_API_KEY in .env.server.";

/**
 * Runs every prompt × model aggregation for the space and mirrors the first
 * card (lexicographic prompt slug, then model slug) onto SpaceSummary.summaryText.
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
    process.env.OPENROUTER_API_KEY?.trim() || process.env.ANTHROPIC_API_KEY?.trim()
  );

  const userMessage =
    entries.length === 0
      ? "There is no feedback yet. Write a 1-2 sentence placeholder for participants."
      : buildAggregationUserMessage(entries);

  const aggs = await entities.SpaceSummaryAggregation.findMany({
    where: { spaceId },
    include: { prompt: true, expModel: true },
  });

  if (aggs.length === 0) {
    await entities.SpaceSummary.update({
      where: { spaceId },
      data: {
        summaryText: statsOnlySummary({ total, praise, critique }),
        jobStatus: JOB.ready,
        updatedAt: new Date(),
      },
    });
    return;
  }

  if (hasKeys && aggs.length > 0) {
    await entities.SpaceSummaryAggregation.updateMany({
      where: { spaceId },
      data: { jobStatus: JOB.pending, updatedAt: new Date() },
    });
  }

  if (!hasKeys) {
    for (const a of aggs) {
      await entities.SpaceSummaryAggregation.update({
        where: { id: a.id },
        data: {
          summaryText: NO_KEY_AGG_TEXT,
          jobStatus: JOB.ready,
          updatedAt: new Date(),
        },
      });
    }
    await entities.SpaceSummary.update({
      where: { spaceId },
      data: {
        summaryText: statsOnlySummary({ total, praise, critique }),
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

  let firstText: string | null = null;

  for (const a of sorted) {
    try {
      const summaryText = await callAnthropicText({
        model: a.expModel.modelApiId,
        maxTokens: 700,
        system: a.prompt.body,
        messages: [{ role: "user", content: userMessage }],
      });
      await entities.SpaceSummaryAggregation.update({
        where: { id: a.id },
        data: {
          summaryText,
          jobStatus: JOB.ready,
          updatedAt: new Date(),
        },
      });
      if (firstText == null) {
        firstText = summaryText;
      }
    } catch (err) {
      console.error("experiment aggregation failed", a.id, err);
      await entities.SpaceSummaryAggregation.update({
        where: { id: a.id },
        data: {
          summaryText: statsOnlySummary({ total, praise, critique }),
          jobStatus: JOB.failed,
          updatedAt: new Date(),
        },
      });
      if (firstText == null) {
        firstText = statsOnlySummary({ total, praise, critique });
      }
    }
    await new Promise((r) => setTimeout(r, 350));
  }

  await entities.SpaceSummary.update({
    where: { spaceId },
    data: {
      summaryText: firstText,
      jobStatus: JOB.ready,
      updatedAt: new Date(),
    },
  });
}
