-- Ensure the canonical app feedback space (`/reshkolo`) has the same
-- prompt/model/summary defaults as a newly created space.
WITH target_space AS (
  SELECT s."id", s."name", s."shortCode"
  FROM "Space" s
  WHERE s."id" = 'a1b2c3d4-0000-4000-8000-000000000001'
     OR LOWER(TRIM(s."shortCode")) = 'reshkolo'
  ORDER BY CASE WHEN s."id" = 'a1b2c3d4-0000-4000-8000-000000000001' THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO "SpacePrompt" ("id", "spaceId", "slug", "summary_prompt_output", "createdAt")
SELECT
  'spaceprompt-default-' || ts."id",
  ts."id",
  'default',
  COALESCE(
    (
      SELECT a."value"
      FROM "AppSetting" a
      WHERE a."key" = 'default_summary_prompt_output'
      LIMIT 1
    ),
    ''
  ),
  CURRENT_TIMESTAMP
FROM target_space ts
ON CONFLICT ("spaceId", "slug") DO NOTHING;

WITH target_space AS (
  SELECT s."id"
  FROM "Space" s
  WHERE s."id" = 'a1b2c3d4-0000-4000-8000-000000000001'
     OR LOWER(TRIM(s."shortCode")) = 'reshkolo'
  ORDER BY CASE WHEN s."id" = 'a1b2c3d4-0000-4000-8000-000000000001' THEN 0 ELSE 1 END
  LIMIT 1
),
default_models AS (
  SELECT *
  FROM (
    VALUES
      ('anthropic', 'Anthropic Sonnet', 'claude-sonnet-4-6'),
      ('groq', 'Groq Llama 4 Scout', 'meta-llama/llama-4-scout-17b-16e-instruct'),
      ('gemini', 'Gemini 2.5 Flash Lite', 'gemini-2.5-flash-lite'),
      ('openai', 'OpenAI GPT-5.5 mini', 'gpt-5.5-mini')
  ) AS v("slug", "displayName", "modelApiId")
)
INSERT INTO "SpaceModel" ("id", "spaceId", "slug", "displayName", "modelApiId", "createdAt")
SELECT
  'spacemodel-' || dm."slug" || '-' || ts."id",
  ts."id",
  dm."slug",
  dm."displayName",
  dm."modelApiId",
  CURRENT_TIMESTAMP
FROM target_space ts
CROSS JOIN default_models dm
ON CONFLICT ("spaceId", "slug") DO UPDATE
SET
  "displayName" = EXCLUDED."displayName",
  "modelApiId" = EXCLUDED."modelApiId";

WITH target_space AS (
  SELECT s."id"
  FROM "Space" s
  WHERE s."id" = 'a1b2c3d4-0000-4000-8000-000000000001'
     OR LOWER(TRIM(s."shortCode")) = 'reshkolo'
  ORDER BY CASE WHEN s."id" = 'a1b2c3d4-0000-4000-8000-000000000001' THEN 0 ELSE 1 END
  LIMIT 1
),
default_prompt AS (
  SELECT p."id" AS "promptId", p."spaceId"
  FROM "SpacePrompt" p
  JOIN target_space ts ON ts."id" = p."spaceId"
  WHERE p."slug" = 'default'
),
default_models AS (
  SELECT m."id" AS "spaceModelId", m."spaceId"
  FROM "SpaceModel" m
  JOIN target_space ts ON ts."id" = m."spaceId"
  WHERE m."slug" IN ('anthropic', 'groq', 'gemini', 'openai')
)
INSERT INTO "SpaceSummary" (
  "id",
  "spaceId",
  "promptId",
  "spaceModelId",
  "summaryText",
  "summaryTextBg",
  "langStatusEn",
  "langStatusBg",
  "jobError",
  "jobStatus",
  "updatedAt",
  "createdAt"
)
SELECT
  'spacesummary-' || dp."promptId" || '-' || dm."spaceModelId",
  ts."id",
  dp."promptId",
  dm."spaceModelId",
  NULL,
  NULL,
  'pending',
  'pending',
  NULL,
  'pending',
  NULL,
  CURRENT_TIMESTAMP
FROM target_space ts
JOIN default_prompt dp ON dp."spaceId" = ts."id"
JOIN default_models dm ON dm."spaceId" = ts."id"
ON CONFLICT ("promptId", "spaceModelId") DO NOTHING;

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
