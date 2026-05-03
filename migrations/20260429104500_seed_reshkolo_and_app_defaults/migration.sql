-- Seed global AppSetting defaults (summary prompt input + default output template) and the
-- canonical app feedback space (`shortCode` reshkolo, id fixed in `appFeedbackSpace.ts`).
-- SpacePrompt / SpaceSummary rows are seeded at runtime by `ensureExperimentDefaultsForSpace`,
-- which sources model identifiers from `.env` via `src/server/llm/modelProviders.ts`.

INSERT INTO "AppSetting" ("key", "value", "updatedAt")
VALUES (
  'summary_prompt_input',
  $prompt$You write a short aggregated summary of feedback entries about a named Subject, in the language specified by the Language field (en or bg). Infer context (teaching, product, etc.) only from the text and Subject.

Output rules$prompt$,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO UPDATE
SET
  "value" = EXCLUDED."value",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "AppSetting" ("key", "value", "updatedAt")
VALUES (
  'default_summary_prompt_output',
  $prompt$- Style: casual, simple words and sentences, no slang.
- Length: ~40 words (±10).
- Structure:
  1. Opening — one polite sentence on the overall tone, mentioning the Subject by name. If entries are too few or thin to analyze, say so briefly and add a short follow-up.
  2. Thesis — positives first, then concerns. Call out interesting patterns (dates, repetition).
- Weighting: treat each sender as one voice regardless of how many entries they left; weight recent entries more.
- Conflicts: acknowledge both sides with counts, e.g. "3 agree, 1 disagree".$prompt$,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO UPDATE
SET
  "value" = EXCLUDED."value",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "Space" ("id", "shortCode", "name", "createdAt")
VALUES (
  'a1b2c3d4-0000-4000-8000-000000000001',
  'reshkolo',
  'reShkolo',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO UPDATE SET
  "shortCode" = EXCLUDED."shortCode",
  "name" = EXCLUDED."name";
