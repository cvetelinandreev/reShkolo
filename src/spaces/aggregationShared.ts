export type SummaryDisplayLang = "en" | "bg";
type SummaryLanguageLabel = "English" | "Bulgarian";

function toSummaryLangCode(language: SummaryLanguageLabel): SummaryDisplayLang {
  return language === "Bulgarian" ? "bg" : "en";
}

function buildAggregationPayload(
  subject: string,
  language: SummaryLanguageLabel,
  entries: Array<{ timestamp: string; sender_id: string; feedback_text: string }>,
): string {
  return JSON.stringify(
    {
      Subject: subject,
      Language: toSummaryLangCode(language),
      Entries: entries,
    },
    null,
    2,
  );
}

export function pickSummaryForDisplay(
  row: { summaryTextEn: string | null; summaryTextBg: string | null },
  lang: SummaryDisplayLang,
): string | null {
  if (lang === "bg") {
    const bg = row.summaryTextBg?.trim();
    if (bg) return row.summaryTextBg;
    return row.summaryTextEn;
  }
  return row.summaryTextEn;
}

export function buildAggregationUserMessage(
  entries: Array<{
    contributorHandleId: string;
    rawText: string;
    createdAt: Date | string;
  }>,
  subject: string,
  language: SummaryLanguageLabel,
): string {
  const normalizedEntries = entries.map((e) => {
    const timestamp =
      typeof e.createdAt === "string" ? e.createdAt : e.createdAt.toISOString();
    const text = e.rawText.replace(/\r?\n/g, " ").trim();
    return {
      timestamp,
      sender_id: e.contributorHandleId,
      feedback_text: text,
    };
  });
  return buildAggregationPayload(subject, language, normalizedEntries);
}

export function emptyAggregationUserMessage(
  subject: string,
  language: SummaryLanguageLabel,
): string {
  return buildAggregationPayload(subject, language, []);
}

export function noLlmKeyAggregationMessage(lang: SummaryDisplayLang): string {
  return lang === "bg"
    ? "Няма настроен ключ за LLM. Задайте ANTHROPIC_API_KEY, GROQ_API_KEY, GEMINI_API_KEY или OPENAI_API_KEY във .env.server."
    : "No LLM key configured. Set ANTHROPIC_API_KEY, GROQ_API_KEY, GEMINI_API_KEY, or OPENAI_API_KEY in .env.server.";
}

