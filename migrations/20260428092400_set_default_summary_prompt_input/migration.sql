INSERT INTO "AppSetting" ("key", "value", "updatedAt")
VALUES (
  'summary_prompt_input',
  $prompt$
Rules:
- Style: Use casual, informal style, simple words, simple sentences, no slangs.
- Length: Aim for about 40 words in the narrative body (±10).
- Structure: opening, thesis, closing.
- Anonymous: Do not quote or reproduce entries verbatim. Do not name or infer individuals from the text; only the display name from the wrapper may appear. No profanity.
- Conflict resolution: If entries conflict, acknowledge both briefly and blend dominant themes. Use statistics. E.g "3 agree, 1 disagree" 
- Context: feedback may be about teaching, school life, a product, or anything else — infer only from the text and name, never at the cost of privacy rules above.

Opening:
The summary starts with one sentence that captures the overall state. If there is no feedback, state that clearly in that first sentence and maybe ask for input. Otherwise get the overall tone and put it polityely. Always use the name of the subject in that line. Include the time range of the entries and their total number.
When entries exists but are too thin or few to analyze meaningfully, say so briefly, then add a short follow-up.

Thesis:
The thesis states first the positive themes, then concerns. State any patterns if ones can be observed in the dates (e.g on a date a lot of entries came in and say somethine like "It looks like on {date} something imporant happend as there are a lot of feebacks there"). Consolidate entries by sender id so if a sender spams, then their voice is equal to a sender which did it one. Put more weight to more recent entries. 

Closing:
A positive or forward-looking close. Be optimistic.
  $prompt$,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO UPDATE
SET
  "value" = EXCLUDED."value",
  "updatedAt" = CURRENT_TIMESTAMP;
