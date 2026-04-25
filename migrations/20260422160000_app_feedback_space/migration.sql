-- App-wide feedback space (public URL slug `reshkolo` → shortCode RESHKOLO; display name "reShkolo").
-- `APP_FEEDBACK_SPACE_SHORT_CODE` in `src/spaces/appFeedbackSpace.ts` must stay in sync.

INSERT INTO "Space" ("id", "shortCode", "name", "createdAt")
VALUES (
  'a1b2c3d4-0000-4000-8000-000000000001',
  'RESHKOLO',
  'reShkolo',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("shortCode") DO NOTHING;

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
WHERE s."shortCode" = 'RESHKOLO'
  AND NOT EXISTS (
    SELECT 1 FROM "SpaceSummary" ss WHERE ss."spaceId" = s."id"
  );
