export type SummaryDisplayLang = "en" | "bg";

export function pickSummaryForDisplay(
  row: { summaryText: string | null; summaryTextBg: string | null },
  lang: SummaryDisplayLang,
): string | null {
  if (lang === "bg") {
    const bg = row.summaryTextBg?.trim();
    if (bg) return row.summaryTextBg;
    return row.summaryText;
  }
  return row.summaryText;
}

export function buildAggregationUserMessage(
  entries: Array<{
    contributorHandleId: string;
    rawText: string;
    createdAt: Date | string;
  }>,
  subject: string,
  language: "English" | "Bulgarian",
): string {
  const lines = entries.map((e) => {
    const timestamp =
      typeof e.createdAt === "string" ? e.createdAt : e.createdAt.toISOString();
    const text = e.rawText.replace(/\r?\n/g, " ").trim();
    return `${timestamp}:${e.contributorHandleId}:${text}`;
  });
  return [
    `Subject: ${subject}`,
    `Language: ${language}`,
    "",
    "Entries:",
    ...lines,
  ].join("\n");
}

export function emptyAggregationUserMessage(
  subject: string,
  language: "English" | "Bulgarian",
): string {
  return [
    `Subject: ${subject}`,
    `Language: ${language}`,
    "",
    "Entries:",
    "(none)",
  ].join("\n");
}

export function noLlmKeyAggregationMessage(lang: SummaryDisplayLang): string {
  return lang === "bg"
    ? "Няма настроен ключ за LLM. Задайте ANTHROPIC_API_KEY, GEMINI_API_KEY или OPENAI_API_KEY във .env.server."
    : "No LLM key configured. Set ANTHROPIC_API_KEY, GEMINI_API_KEY, or OPENAI_API_KEY in .env.server.";
}

export function statsOnlySummaryMessage(params: {
  total: number;
  praise: number;
  critique: number;
  lang: SummaryDisplayLang;
  includeNoKeyHint: boolean;
}): string {
  const { total, praise, critique, lang, includeNoKeyHint } = params;
  const noKey =
    lang === "bg"
      ? "Разказното обобщение е изключено, защото няма настроен ключ за LLM. Задайте ANTHROPIC_API_KEY, GEMINI_API_KEY или OPENAI_API_KEY във .env.server, после рестартирайте wasp start."
      : "Narrative summary is disabled because no LLM key is configured. Set ANTHROPIC_API_KEY, GEMINI_API_KEY, or OPENAI_API_KEY in .env.server, then restart `wasp start`.";

  if (lang === "bg") {
    const entryWord = total === 1 ? "отзив" : "отзива";
    const parts = [
      `До момента има ${total} ${entryWord}.`,
      `Общ микс от тон: ${praise} похвали, ${critique} конструктивни забележки.`,
    ];
    if (includeNoKeyHint) parts.push(noKey);
    return parts.join(" ");
  }

  const parts = [
    `There ${total === 1 ? "is" : "are"} ${total} feedback entr${total === 1 ? "y" : "ies"} so far.`,
    `Overall tone mix: ${praise} praise-oriented, ${critique} constructive remarks.`,
  ];
  if (includeNoKeyHint) parts.push(noKey);
  return parts.join(" ");
}

export { DEFAULT_SUMMARY_SYSTEM_PROMPT } from "./prompts/defaultSummarySystemPrompt";
