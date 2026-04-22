export function buildAggregationUserMessage(
  entries: Array<{ tone: string; rawText: string }>,
): string {
  const lines = entries.map((e, i) => `${i + 1}. [${e.tone}] ${e.rawText}`);
  return [
    "Anonymous feedback lines for one school space (server-side only; do not treat as public quotes):",
    "",
    ...lines,
  ].join("\n");
}

/** Default narrative instructions (system prompt) for summary experiments. */
export const DEFAULT_SUMMARY_SYSTEM_PROMPT = `You write the public aggregate summary for a school feedback space.
Rules:
- English only.
- About 80 words for the narrative body (±10). Optional one short status line before it with counts is allowed and should not count toward 80 words.
- Sandwich structure: positive themes, then concerns, then positive / forward-looking close.
- Do NOT quote or reproduce feedback verbatim. No names. No profanity.
- If views conflict, acknowledge both briefly and blend dominant themes.
- If there is no substantive content yet, say so briefly.`;

export const BRIEF_SUMMARY_SYSTEM_PROMPT = `You write a very short public aggregate summary for a school feedback space.
Rules:
- English only.
- At most 40 words for the narrative body.
- No verbatim quotes from feedback. No names. No profanity.
- If there is no substantive content yet, say so in one sentence.`;
