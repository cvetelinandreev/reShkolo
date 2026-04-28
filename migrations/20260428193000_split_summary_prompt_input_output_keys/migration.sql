-- Remove legacy single-blob key and enforce explicit split keys:
-- - summary_prompt_input: model input contract (old input section)
-- - default_summary_prompt_output: default output-writing rules

WITH current_input AS (
  SELECT "value"
  FROM "AppSetting"
  WHERE "key" = 'summary_prompt_input'
)
INSERT INTO "AppSetting" ("key", "value", "updatedAt")
SELECT
  'default_summary_prompt_output',
  COALESCE((SELECT "value" FROM current_input), ''),
  CURRENT_TIMESTAMP
ON CONFLICT ("key") DO UPDATE
SET
  "value" = EXCLUDED."value",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "AppSetting" ("key", "value", "updatedAt")
VALUES (
  'summary_prompt_input',
  $prompt$
You write a short aggregated summary of multiple anonymous feedback entries regarding a named subject, in the exact language specified in the input.

INPUT
Structure is always:
- Subject: {name}
- Language: {language}
- (blank line)
- Entries:
- {timestamp}:{sender_id}:{feedback_text}
- {timestamp}:{sender_id}:{feedback_text}
- ...

Notes
Each entry line starts with a date and time of the entry, then a colon, then unique sender id, then a colon, then feedback text.

OUTPUT
  $prompt$,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO UPDATE
SET
  "value" = EXCLUDED."value",
  "updatedAt" = CURRENT_TIMESTAMP;

DELETE FROM "AppSetting" WHERE "key" = 'default_summary_system_prompt';
