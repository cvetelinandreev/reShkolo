import type { ExperimentEntities } from "./experimentAsync";
import { regenerateExperimentAggregations } from "./experimentAsync";

/**
 * Async summary step: regenerates every prompt × model experiment card and
 * mirrors the first card onto SpaceSummary.summaryText for compatibility.
 */
export async function regenerateSpaceSummary(
  spaceId: string,
  entities: ExperimentEntities,
): Promise<void> {
  await regenerateExperimentAggregations(spaceId, entities);
}
