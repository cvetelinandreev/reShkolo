-- Backfill default summary text for the canonical app feedback space (`/reshkolo`).
-- Keep id/slug aligned with `src/spaces/appFeedbackSpace.ts`.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'SpaceSummary'
      AND column_name = 'jobError'
  ) THEN
    UPDATE "SpaceSummary" AS ss
    SET
      "summaryText" = 'No one has submitted any praise or feedback about ' || COALESCE(NULLIF(TRIM(s."name"), ''), s."shortCode") || ' yet — you can be the first.',
      "summaryTextBg" = 'Още никой не е изпратил нито похвала, нито забележка за ' || COALESCE(NULLIF(TRIM(s."name"), ''), s."shortCode") || '. Можеш да бъдеш първият.',
      "jobStatus" = 'ready',
      "jobError" = NULL,
      "updatedAt" = CURRENT_TIMESTAMP
    FROM "Space" AS s
    WHERE ss."spaceId" = s."id"
      AND (
        s."id" = 'a1b2c3d4-0000-4000-8000-000000000001'
        OR LOWER(TRIM(s."shortCode")) = 'reshkolo'
      );
  ELSE
    UPDATE "SpaceSummary" AS ss
    SET
      "summaryText" = 'No one has submitted any praise or feedback about ' || COALESCE(NULLIF(TRIM(s."name"), ''), s."shortCode") || ' yet — you can be the first.',
      "summaryTextBg" = 'Още никой не е изпратил нито похвала, нито забележка за ' || COALESCE(NULLIF(TRIM(s."name"), ''), s."shortCode") || '. Можеш да бъдеш първият.',
      "jobStatus" = 'ready',
      "updatedAt" = CURRENT_TIMESTAMP
    FROM "Space" AS s
    WHERE ss."spaceId" = s."id"
      AND (
        s."id" = 'a1b2c3d4-0000-4000-8000-000000000001'
        OR LOWER(TRIM(s."shortCode")) = 'reshkolo'
      );
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'SpaceSummary'
      AND column_name = 'langStatusEn'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'SpaceSummary'
      AND column_name = 'langStatusBg'
  ) THEN
    UPDATE "SpaceSummary" AS ss
    SET
      "langStatusEn" = 'ready',
      "langStatusBg" = 'ready'
    FROM "Space" AS s
    WHERE ss."spaceId" = s."id"
      AND (
        s."id" = 'a1b2c3d4-0000-4000-8000-000000000001'
        OR LOWER(TRIM(s."shortCode")) = 'reshkolo'
      );
  END IF;
END $$;
