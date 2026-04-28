-- Ensure canonical app-feedback space has Bulgarian SpaceSummary rows
-- (one row per prompt x model x language).
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
),
en_rows AS (
  SELECT ss.*
  FROM "SpaceSummary" ss
  JOIN target_space ts ON ts."id" = ss."spaceId"
  WHERE ss."language" = 'en'
)
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
  en."id" || '-bg',
  en."spaceId",
  en."promptId",
  en."spaceModelId",
  'bg',
  'Още никой не е изпратил нито похвала, нито забележка за ' || subject."displaySubject" || '. Можеш да бъдеш първият.',
  'ready',
  CURRENT_TIMESTAMP,
  en."createdAt"
FROM en_rows en
JOIN subject ON subject."id" = en."spaceId"
ON CONFLICT ("promptId", "spaceModelId", "language") DO NOTHING;
