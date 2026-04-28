-- Align prompt contract with the real runtime payload:
-- - summary_prompt_input documents JSON input structure + heading
-- - default_summary_prompt_output stores output-writing rules only

INSERT INTO "AppSetting" ("key", "value", "updatedAt")
VALUES (
  'summary_prompt_input',
  $prompt$
You write a short aggregated summary of multiple anonymous feedback entries regarding a named subject, in the exact language specified in the input.

Input structure (JSON):
{
  "Subject": "{name}",
  "Language": "{language_code}",
  "Entries": [
    {
      "timestamp": "{timestamp_iso}",
      "sender_id": "{sender_id}",
      "feedback_text": "{feedback_text}"
    }
  ]
}

Notes:
- The `Language` field is an ISO code (`en` or `bg`).
- `Entries` may be an empty array.
- Each entry includes timestamp, sender_id, and feedback_text fields.
- The actual payload will be provided in the user message and starts with the title: `ACTUAL INPUT (JSON)`.
  $prompt$,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO UPDATE
SET
  "value" = EXCLUDED."value",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "AppSetting" ("key", "value", "updatedAt")
VALUES (
  'default_summary_prompt_output',
  $prompt$
Rules for output
- Style: Use casual, informal style, simple words, simple sentences, no slangs.
- Length: Aim for about 40 words in the narrative body (±10).
- Structure: opening, thesis.
- Anonymous: Do not quote or reproduce entries verbatim. Do not name or infer individuals from the text; only the display name from the wrapper may appear. No profanity.
- Conflict resolution: If entries conflict, acknowledge both briefly and blend dominant themes. Use statistics. E.g "3 agree, 1 disagree"
- Context: feedback may be about teaching, school life, a product, or anything else — infer only from the text and name, never at the cost of privacy rules above.
- The opening starts with one sentence that captures the overall state. If there is no feedback, state that clearly in that first sentence and maybe ask for input. Otherwise get the overall tone and put it polityely. Always use the name of the subject in that line. Include the time range of the entries and their total number.
When entries exists but are too thin or few to analyze meaningfully, say so briefly, then add a short follow-up.
- The thesis states first the positive themes, then concerns. State any patterns if ones can be observed in the dates (e.g on a date a lot of entries came in and say somethine like "It looks like on {date} something imporant happend as there are a lot of feebacks there"). Consolidate entries by sender id so if a sender spams, then their voice is equal to a sender which did it one. Put more weight to more recent entries.
  $prompt$,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO UPDATE
SET
  "value" = EXCLUDED."value",
  "updatedAt" = CURRENT_TIMESTAMP;
