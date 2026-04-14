import { callAnthropicText } from "../server/llm/anthropic";

const JOB = {
  pending: "pending",
  ready: "ready",
  failed: "failed",
} as const;

type Entities = {
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
        summaryText: string | null;
        jobStatus: string;
        updatedAt: Date | null;
      };
    }) => Promise<unknown>;
  };
};

function statsOnlySummary(params: {
  total: number;
  praise: number;
  critique: number;
}): string {
  return [
    `This space has ${params.total} feedback entr${params.total === 1 ? "y" : "ies"} so far.`,
    `Overall tone mix: ${params.praise} praise-oriented, ${params.critique} constructive remarks.`,
    "Set ANTHROPIC_API_KEY to generate a short narrative aggregate summary (themes only, no quotes).",
  ].join(" ");
}

function buildAggregationPrompt(entries: Array<{ tone: string; rawText: string }>): string {
  const lines = entries.map((e, i) => `${i + 1}. [${e.tone}] ${e.rawText}`);
  return [
    "Anonymous feedback lines for one school space (server-side only; do not treat as public quotes):",
    "",
    ...lines,
  ].join("\n");
}

/**
 * Async summary step: Claude Opus-class model recommended via env.
 * Must not paste raw lines into the user-visible summary — only thematic synthesis.
 */
export async function regenerateSpaceSummary(
  spaceId: string,
  entities: Entities,
): Promise<void> {
  const entries = await entities.FeedbackEntry.findMany({
    where: { spaceId },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  const praise = entries.filter((e) => e.tone === "praise").length;
  const critique = entries.filter((e) => e.tone === "constructive_criticism").length;
  const total = entries.length;

  if (!process.env.ANTHROPIC_API_KEY) {
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

  const model =
    process.env.ANTHROPIC_MODEL_SUMMARY ?? "claude-opus-4-20250514";

  const system = `You write the public aggregate summary for a school feedback space.
Rules:
- English only.
- About 80 words for the narrative body (±10). Optional one short status line before it with counts is allowed and should not count toward 80 words.
- Sandwich structure: positive themes, then concerns, then positive / forward-looking close.
- Do NOT quote or reproduce feedback verbatim. No names. No profanity.
- If views conflict, acknowledge both briefly and blend dominant themes.
- If there is no substantive content yet, say so briefly.`;

  try {
    const user =
      entries.length === 0
        ? "There is no feedback yet. Write a 1-2 sentence placeholder for participants."
        : buildAggregationPrompt(entries);

    const summaryText = await callAnthropicText({
      model,
      maxTokens: 600,
      system,
      messages: [{ role: "user", content: user }],
    });

    await entities.SpaceSummary.update({
      where: { spaceId },
      data: {
        summaryText,
        jobStatus: JOB.ready,
        updatedAt: new Date(),
      },
    });
  } catch (err) {
    console.error("regenerateSpaceSummary failed", err);
    await entities.SpaceSummary.update({
      where: { spaceId },
      data: {
        summaryText: statsOnlySummary({ total, praise, critique }),
        jobStatus: JOB.failed,
        updatedAt: new Date(),
      },
    });
  }
}
