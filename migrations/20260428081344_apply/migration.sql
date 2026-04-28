DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'SpaceSummaryAggregation_pkey'
      AND conrelid = '"SpaceSummary"'::regclass
  ) THEN
    ALTER TABLE "SpaceSummary" RENAME CONSTRAINT "SpaceSummaryAggregation_pkey" TO "SpaceSummary_pkey";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'SpaceSummaryAggregation_promptId_fkey'
      AND conrelid = '"SpaceSummary"'::regclass
  ) THEN
    ALTER TABLE "SpaceSummary" RENAME CONSTRAINT "SpaceSummaryAggregation_promptId_fkey" TO "SpaceSummary_promptId_fkey";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'SpaceSummaryAggregation_spaceId_fkey'
      AND conrelid = '"SpaceSummary"'::regclass
  ) THEN
    ALTER TABLE "SpaceSummary" RENAME CONSTRAINT "SpaceSummaryAggregation_spaceId_fkey" TO "SpaceSummary_spaceId_fkey";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'SpaceSummaryAggregation_spaceModelId_fkey'
      AND conrelid = '"SpaceSummary"'::regclass
  ) THEN
    ALTER TABLE "SpaceSummary" RENAME CONSTRAINT "SpaceSummaryAggregation_spaceModelId_fkey" TO "SpaceSummary_spaceModelId_fkey";
  END IF;
END $$;
