-- Split SpaceSummary into one row per language.
-- Keep only per-row language, summary text, and job status.

ALTER TABLE "SpaceSummary"
  ADD COLUMN "language" TEXT;

UPDATE "SpaceSummary"
SET "language" = 'en'
WHERE "language" IS NULL;

INSERT INTO "SpaceSummary" (
  "id",
  "spaceId",
  "promptId",
  "spaceModelId",
  "language",
  "summaryText",
  "jobStatus",
  "updatedAt",
  "createdAt"
)
SELECT
  ss."id" || '-bg',
  ss."spaceId",
  ss."promptId",
  ss."spaceModelId",
  'bg',
  ss."summaryTextBg",
  COALESCE(NULLIF(TRIM(ss."langStatusBg"), ''), ss."jobStatus"),
  ss."updatedAt",
  ss."createdAt"
FROM "SpaceSummary" ss
WHERE ss."language" = 'en'
ON CONFLICT DO NOTHING;

UPDATE "SpaceSummary"
SET "jobStatus" = COALESCE(NULLIF(TRIM("langStatusEn"), ''), "jobStatus")
WHERE "language" = 'en';

ALTER TABLE "SpaceSummary"
  ALTER COLUMN "language" SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'SpaceSummary_promptId_spaceModelId_key'
  ) THEN
    DROP INDEX "SpaceSummary_promptId_spaceModelId_key";
  END IF;
END $$;

ALTER TABLE "SpaceSummary" DROP COLUMN "summaryTextBg";
ALTER TABLE "SpaceSummary" DROP COLUMN "langStatusEn";
ALTER TABLE "SpaceSummary" DROP COLUMN "langStatusBg";
ALTER TABLE "SpaceSummary" DROP COLUMN "jobError";

CREATE UNIQUE INDEX "SpaceSummary_promptId_spaceModelId_language_key"
  ON "SpaceSummary"("promptId", "spaceModelId", "language");
