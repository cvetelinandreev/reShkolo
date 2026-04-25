-- Space invite URLs use lowercase shortCode; joinSpace normalizes input with toLowerCase().
UPDATE "Space" SET "shortCode" = LOWER(TRIM("shortCode"));

-- Canonical app-wide feedback space at /reshkolo (id matches seed in 20260422160000).
INSERT INTO "Space" ("id", "shortCode", "name", "createdAt")
VALUES (
  'a1b2c3d4-0000-4000-8000-000000000001',
  'reshkolo',
  'reShkolo',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO UPDATE SET
  "shortCode" = EXCLUDED."shortCode";

INSERT INTO "SpaceSummary" (
  "spaceId",
  "summaryText",
  "summaryTextBg",
  "jobStatus",
  "totalCount",
  "positiveCount",
  "negativeCount",
  "updatedAt"
)
SELECT
  s."id",
  NULL,
  NULL,
  'ready',
  0,
  0,
  0,
  NULL
FROM "Space" s
WHERE s."id" = 'a1b2c3d4-0000-4000-8000-000000000001'
  AND NOT EXISTS (
    SELECT 1 FROM "SpaceSummary" ss WHERE ss."spaceId" = s."id"
  );
