-- Per-language aggregation status for progressive UI.
ALTER TABLE "SpaceSummaryAggregation" ADD COLUMN "langStatusEn" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "SpaceSummaryAggregation" ADD COLUMN "langStatusBg" TEXT NOT NULL DEFAULT 'pending';

UPDATE "SpaceSummaryAggregation"
SET
  "langStatusEn" = CASE
    WHEN "jobStatus" = 'failed' THEN 'failed'
    WHEN COALESCE(TRIM("summaryText"), '') <> '' THEN 'ready'
    ELSE 'pending'
  END,
  "langStatusBg" = CASE
    WHEN "jobStatus" = 'failed' THEN 'failed'
    WHEN COALESCE(TRIM("summaryTextBg"), '') <> '' THEN 'ready'
    ELSE 'pending'
  END;
