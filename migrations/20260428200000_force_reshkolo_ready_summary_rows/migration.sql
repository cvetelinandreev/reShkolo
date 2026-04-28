-- Ensure canonical app-feedback space summaries are always initialized as
-- non-empty and ready after migrations.
WITH target_space AS (
  SELECT s."id", s."name", s."shortCode"
  FROM "Space" s
  WHERE s."id" = 'a1b2c3d4-0000-4000-8000-000000000001'
     OR LOWER(TRIM(s."shortCode")) = 'reshkolo'
  ORDER BY CASE WHEN s."id" = 'a1b2c3d4-0000-4000-8000-000000000001' THEN 0 ELSE 1 END
  LIMIT 1
),
subject AS (
  SELECT
    ts."id",
    COALESCE(NULLIF(TRIM(ts."name"), ''), ts."shortCode") AS "displaySubject"
  FROM target_space ts
)
UPDATE "SpaceSummary" ss
SET
  "summaryText" = 'No one has submitted any praise or feedback about ' || subject."displaySubject" || ' yet — you can be the first.',
  "summaryTextBg" = 'Още никой не е изпратил нито похвала, нито забележка за ' || subject."displaySubject" || '. Можеш да бъдеш първият.',
  "jobStatus" = 'ready',
  "langStatusEn" = 'ready',
  "langStatusBg" = 'ready',
  "jobError" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
FROM subject
WHERE ss."spaceId" = subject."id";
