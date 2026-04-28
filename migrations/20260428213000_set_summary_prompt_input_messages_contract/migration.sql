-- Update summary_prompt_input to explicitly document the `messages` payload contract.

INSERT INTO "AppSetting" ("key", "value", "updatedAt")
VALUES (
  'summary_prompt_input',
  $prompt$
You write a short aggregated summary of multiple anonymous feedback entries regarding a named subject, in the exact language specified in the input.

Input structure (JSON):
messages: [
{
role: 'user',
content: '{
  "Subject": "{name}",
  "Language": "{language_code}",
  "Entries": [
    {
      "timestamp": "{timestamp_iso}",
      "sender_id": "{sender_id}",
      "feedback_text": "{feedback_text}"
    },
    ...
  ]
}'
}]

Notes:
- The `Language` field is an ISO code (`en` or `bg`).
- `Entries` may be an empty array.
- Each entry includes timestamp, sender_id, and feedback_text fields.
- The actual payload is passed as raw JSON in the content of the user message.
  $prompt$,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO UPDATE
SET
  "value" = EXCLUDED."value",
  "updatedAt" = CURRENT_TIMESTAMP;
