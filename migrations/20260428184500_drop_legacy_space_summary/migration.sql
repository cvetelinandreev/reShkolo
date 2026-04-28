-- Replace legacy per-space summary table with the experiment summary matrix table.
ALTER TABLE "SpaceSummary" RENAME TO "SpaceSummaryLegacy";
ALTER TABLE "SpaceSummaryAggregation" RENAME TO "SpaceSummary";

ALTER INDEX "SpaceSummaryAggregation_promptId_spaceModelId_key"
  RENAME TO "SpaceSummary_promptId_spaceModelId_key";

DROP TABLE "SpaceSummaryLegacy";
