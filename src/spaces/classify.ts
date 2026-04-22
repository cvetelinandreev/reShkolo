import { callAnthropicText } from "../server/llm/anthropic";

function classifyHeuristic(text: string): "praise" | "constructive_criticism" {
  const t = text.toLowerCase();
  const praiseHints = [
    "good",
    "great",
    "excellent",
    "love",
    "thank",
    "best",
    "amazing",
    "helpful",
    "appreciate",
  ];
  const critiqueHints = [
    "bad",
    "worse",
    "hate",
    "never",
    "shouldn't",
    "should not",
    "problem",
    "issue",
    "unfair",
    "disappointed",
  ];
  const praiseScore = praiseHints.filter((h) => t.includes(h)).length;
  const critiqueScore = critiqueHints.filter((h) => t.includes(h)).length;
  if (critiqueScore > praiseScore) return "constructive_criticism";
  if (praiseScore > critiqueScore) return "praise";
  return t.length > 120 ? "constructive_criticism" : "praise";
}

function parseToneJson(raw: string): "praise" | "constructive_criticism" | null {
  const trimmed = raw.trim();
  const tryParse = (s: string) => {
    try {
      return JSON.parse(s) as { tone?: string };
    } catch {
      return null;
    }
  };
  let parsed = tryParse(trimmed);
  if (!parsed && trimmed.includes("{")) {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      parsed = tryParse(trimmed.slice(start, end + 1));
    }
  }
  const tone = parsed?.tone;
  if (tone === "praise" || tone === "constructive_criticism") return tone;
  return null;
}

/**
 * Separate classification step (hosted LLM when configured).
 * Falls back to local heuristic if no API key or on failure.
 */
export async function classifyFeedbackText(
  text: string,
): Promise<"praise" | "constructive_criticism"> {
  if (!process.env.OPENROUTER_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    return classifyHeuristic(text);
  }

  const model =
    process.env.OPENROUTER_MODEL_CLASSIFY ??
    process.env.ANTHROPIC_MODEL_CLASSIFY ??
    (process.env.OPENROUTER_API_KEY ? "openrouter/free" : "claude-3-5-haiku-20241022");

  try {
    const raw = await callAnthropicText({
      model,
      maxTokens: 120,
      system: `You classify anonymous school feedback as exactly one JSON object: {"tone":"praise"} or {"tone":"constructive_criticism"}.
"praise" means positive recognition.
"constructive_criticism" means critical feedback meant to improve behavior or conditions.
Respond with JSON only, no markdown.`,
      messages: [
        {
          role: "user",
          content: `Classify this feedback:\n\n${text.slice(0, 8000)}`,
        },
      ],
    });
    const parsed = parseToneJson(raw);
    if (parsed) return parsed;
  } catch (err) {
    console.error("classifyFeedbackText LLM failed, using heuristic", err);
  }

  return classifyHeuristic(text);
}
