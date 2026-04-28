/**
 * After updating `AppSetting` key `default_summary_prompt_output` in the DB
 * (e.g. Prisma Studio), run this to copy that value onto every space’s `default`
 * prompt row and regenerate all summaries (same as POST /admin/regenerate-all-summaries).
 *
 * Usage (from repo root, requires `.env.server` with DATABASE_URL + LLM keys):
 *   npm run prompt:push-and-regenerate-all
 */
import { PrismaClient } from "@prisma/client";
import type { ExperimentEntities } from "../src/spaces/experimentAsync";
import { regenerateAllExperimentAggregations } from "../src/spaces/experimentAsync";

function entitiesFromPrisma(prisma: PrismaClient): ExperimentEntities {
  return {
    Space: prisma.space,
    FeedbackEntry: prisma.feedbackEntry,
    AppSetting: prisma.appSetting,
    SpaceSummary: prisma.spaceSummary,
    SpacePrompt: prisma.spacePrompt,
    SpaceModel: prisma.spaceModel,
  };
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error(
      "DATABASE_URL is missing. Run via: npm run prompt:push-and-regenerate-all (loads .env.server).",
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const out = await regenerateAllExperimentAggregations(entitiesFromPrisma(prisma));
    console.log(JSON.stringify({ ok: true, ...out }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
