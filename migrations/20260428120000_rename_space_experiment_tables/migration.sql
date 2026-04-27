-- Drop "Experiment" from table names; rename FK column on aggregations.
ALTER TABLE "SpaceExperimentPrompt" RENAME TO "SpacePrompt";
ALTER TABLE "SpaceExperimentModel" RENAME TO "SpaceModel";

ALTER TABLE "SpacePrompt" RENAME CONSTRAINT "SpaceExperimentPrompt_pkey" TO "SpacePrompt_pkey";
ALTER TABLE "SpacePrompt" RENAME CONSTRAINT "SpaceExperimentPrompt_spaceId_fkey" TO "SpacePrompt_spaceId_fkey";
ALTER INDEX "SpaceExperimentPrompt_spaceId_slug_key" RENAME TO "SpacePrompt_spaceId_slug_key";

ALTER TABLE "SpaceModel" RENAME CONSTRAINT "SpaceExperimentModel_pkey" TO "SpaceModel_pkey";
ALTER TABLE "SpaceModel" RENAME CONSTRAINT "SpaceExperimentModel_spaceId_fkey" TO "SpaceModel_spaceId_fkey";
ALTER INDEX "SpaceExperimentModel_spaceId_slug_key" RENAME TO "SpaceModel_spaceId_slug_key";

ALTER TABLE "SpaceSummaryAggregation" RENAME COLUMN "experimentModelId" TO "spaceModelId";

ALTER TABLE "SpaceSummaryAggregation" RENAME CONSTRAINT "SpaceSummaryAggregation_experimentModelId_fkey" TO "SpaceSummaryAggregation_spaceModelId_fkey";
ALTER INDEX "SpaceSummaryAggregation_promptId_experimentModelId_key" RENAME TO "SpaceSummaryAggregation_promptId_spaceModelId_key";
