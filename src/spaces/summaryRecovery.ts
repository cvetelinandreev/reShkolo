import { PrismaClient } from "@prisma/client";
import { devServerLog } from "../server/devLog";
import type { ExperimentEntities } from "./experimentAsync";
import { generateExperimentAggregationRow } from "./experimentAsync";

const prisma = new PrismaClient();
let bootstrapped = false;
const entities: ExperimentEntities = {
  Space: prisma.space,
  FeedbackEntry: prisma.feedbackEntry,
  AppSetting: prisma.appSetting,
  SpacePrompt: prisma.spacePrompt,
  SpaceSummary: prisma.spaceSummary,
};

async function recoverPendingOrFailedSummaries(): Promise<void> {
  const rows = await prisma.spaceSummary.findMany({
    where: {
      OR: [
        { jobStatus: "failed" },
        {
          jobStatus: "pending",
          // Treat only pending rows with a timestamp as interrupted work.
          // Fresh placeholder rows (pending + updatedAt null) should not trigger
          // startup recovery generation.
          updatedAt: { not: null },
        },
      ],
    },
    select: {
      spaceId: true,
      promptId: true,
      modelSlug: true,
      id: true,
    },
  });
  if (rows.length === 0) return;

  const cardByKey = new Map<string, { spaceId: string; aggregationId: string }>();
  for (const row of rows) {
    const key = `${row.spaceId}::${row.promptId}::${row.modelSlug}`;
    if (!cardByKey.has(key)) {
      cardByKey.set(key, { spaceId: row.spaceId, aggregationId: row.id });
    }
  }
  const cards = [...cardByKey.values()];
  devServerLog("summaryRecovery.start", {
    affectedRows: rows.length,
    uniqueCards: cards.length,
    spaceCount: new Set(cards.map((c) => c.spaceId)).size,
  });

  for (const { spaceId, aggregationId } of cards) {
    try {
      await generateExperimentAggregationRow(spaceId, aggregationId, entities);
      devServerLog("summaryRecovery.card.done", { spaceId, aggregationId });
    } catch (err) {
      console.error("[summaryRecovery] card regeneration failed", {
        spaceId,
        aggregationId,
        err,
      });
    }
  }
}

export function bootstrapSummaryRecovery(): void {
  if (bootstrapped) return;
  bootstrapped = true;
  // Defer recovery to avoid blocking initial server startup path.
  setTimeout(() => {
    void recoverPendingOrFailedSummaries().catch((err) => {
      console.error("[summaryRecovery] bootstrap run failed", err);
    });
  }, 5000);
}
