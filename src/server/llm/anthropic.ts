const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta/models";
const OPENAI_CHAT_API = "https://api.openai.com/v1/chat/completions";
const GROQ_OPENAI_CHAT_API = "https://api.groq.com/openai/v1/chat/completions";
const GEMINI_SAFE_FALLBACK_MODEL = "gemini-2.5-flash-lite";

function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Parses "Please retry in 13.75s" from Gemini error JSON or plain text. */
function parseGeminiRetryDelayMs(bodyText: string): number | null {
  let haystack = bodyText;
  try {
    const j = JSON.parse(bodyText) as { error?: { message?: string } };
    if (typeof j?.error?.message === "string") haystack = j.error.message;
  } catch {
    /* not JSON */
  }
  const m = haystack.match(/please retry in ([\d.]+)\s*s/i);
  if (!m?.[1]) return null;
  const sec = Number.parseFloat(m[1]);
  if (!Number.isFinite(sec) || sec < 0) return null;
  return Math.ceil(sec * 1000) + Math.floor(Math.random() * 400);
}

export type AnthropicMessage = {
  role: "user" | "assistant";
  content: string;
};

function shouldRouteViaGemini(model: string): boolean {
  const m = model.trim().toLowerCase();
  return m.startsWith("gemini-");
}

function shouldRouteViaOpenAI(model: string): boolean {
  const m = model.trim().toLowerCase();
  return m.startsWith("gpt-") || m.startsWith("o1") || m.startsWith("o3") || m.startsWith("o4");
}

/** Groq-hosted model ids (OpenAI-compatible chat/completions, not api.openai.com). */
function shouldRouteViaGroq(model: string): boolean {
  const m = model.trim().toLowerCase();
  if (m.startsWith("groq/")) return true;
  if (m.startsWith("llama-") || m.startsWith("llama3")) return true;
  if (m.startsWith("mixtral-")) return true;
  if (m.startsWith("gemma")) return true;
  if (m.startsWith("meta-llama/")) return true;
  if (m.startsWith("qwen/")) return true;
  if (m.startsWith("canopylabs/")) return true;
  if (m.startsWith("groq/compound")) return true;
  if (m.startsWith("openai/gpt-oss")) return true;
  if (m.startsWith("moonshotai/")) return true;
  if (m.startsWith("mistral-")) return true;
  return false;
}

function groqChatModelId(model: string): string {
  const t = model.trim();
  if (t.toLowerCase().startsWith("groq/")) return t.slice(5).trim();
  return t;
}

async function callOpenAiCompatibleChatCompletions(params: {
  url: string;
  apiKey: string;
  model: string;
  system: string;
  messages: AnthropicMessage[];
  maxTokens: number;
  providerLabel: string;
  /** Merged into the JSON body (e.g. Groq `reasoning_effort` for gpt-oss). */
  extraBody?: Record<string, unknown>;
}): Promise<string> {
  const body: Record<string, unknown> = {
    model: params.model,
    max_completion_tokens: params.maxTokens,
    messages: [
      { role: "system", content: params.system },
      ...params.messages,
    ],
    ...params.extraBody,
  };

  const res = await fetch(params.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`${params.providerLabel} HTTP ${res.status}: ${errBody.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{
      finish_reason?: string | null;
      message?: { content?: unknown; reasoning?: unknown };
    }>;
  };
  const choice0 = data.choices?.[0];
  const raw = choice0?.message?.content;
  const text = chatAssistantText(raw);
  if (!text.trim()) {
    const fin = choice0?.finish_reason ?? "";
    throw new Error(
      `${params.providerLabel} returned empty content` +
        (fin ? ` (finish_reason=${fin})` : "") +
        (params.model.toLowerCase().includes("gpt-oss")
          ? " — gpt-oss uses reasoning tokens; raise max_completion_tokens or lower reasoning_effort."
          : ""),
    );
  }
  return text.trim();
}

/** Chat APIs may return string content or a parts array. */
function chatAssistantText(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    return raw
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object") {
          const p = part as Record<string, unknown>;
          if (typeof p.text === "string") return p.text;
          if (p.type === "text" && typeof p.text === "string") return p.text;
        }
        return "";
      })
      .join("");
  }
  return "";
}

export async function callLlmText(params: {
  model: string;
  system: string;
  messages: AnthropicMessage[];
  maxTokens: number;
  /** When LLM_DEBUG_LOG=true, included in server logs for grep-friendly traces. */
  debugLabel?: string;
}): Promise<string> {
  if (process.env.LLM_DEBUG_LOG === "true") {
    console.log("[LLM_DEBUG]", {
      debugLabel: params.debugLabel,
      model: params.model,
      maxTokens: params.maxTokens,
      system: params.system,
      messages: params.messages,
    });
  }

  const callGeminiOnce = async (modelName: string, key: string): Promise<string> => {
    const model = encodeURIComponent(modelName.trim());
    const res = await fetch(`${GEMINI_API}/${model}:generateContent?key=${key}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: params.system }],
        },
        generationConfig: {
          maxOutputTokens: params.maxTokens,
        },
        contents: params.messages.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
      }),
    });
    const bodyText = await res.text();
    if (!res.ok) {
      const cap = res.status === 429 ? 12_000 : 800;
      throw new Error(`Gemini HTTP ${res.status}: ${bodyText.slice(0, cap)}`);
    }
    const data = JSON.parse(bodyText) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text =
      data.candidates?.[0]?.content?.parts
        ?.map((p) => (typeof p.text === "string" ? p.text : ""))
        .join("") ?? "";
    if (!text.trim()) {
      throw new Error("Gemini returned empty content");
    }
    return text.trim();
  };

  const callGeminiWithRateLimitRetries = async (
    modelName: string,
    key: string,
  ): Promise<string> => {
    const maxAttempts = 12;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await callGeminiOnce(modelName, key);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const is429 = msg.includes("Gemini HTTP 429");
        const isResourceExhausted =
          msg.includes("RESOURCE_EXHAUSTED") || msg.includes("Quota exceeded");
        if ((is429 || isResourceExhausted) && attempt < maxAttempts - 1) {
          const fromBody = parseGeminiRetryDelayMs(msg);
          const backoff = Math.min(45_000, 1500 * 2 ** attempt);
          const wait = fromBody ?? backoff;
          await sleepMs(wait);
          continue;
        }
        throw err;
      }
    }
    throw new Error("Gemini: exhausted retries");
  };

  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (geminiKey && shouldRouteViaGemini(params.model)) {
    try {
      return await callGeminiWithRateLimitRetries(params.model, geminiKey);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isModelMissing =
        msg.includes("Gemini HTTP 404") &&
        (msg.includes("is not found") || msg.includes("not supported for generateContent"));
      if (isModelMissing && params.model.trim() !== GEMINI_SAFE_FALLBACK_MODEL) {
        return await callGeminiWithRateLimitRetries(GEMINI_SAFE_FALLBACK_MODEL, geminiKey);
      }
      throw err;
    }
  }

  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  if (openAiKey && shouldRouteViaOpenAI(params.model)) {
    return await callOpenAiCompatibleChatCompletions({
      url: OPENAI_CHAT_API,
      apiKey: openAiKey,
      model: params.model,
      system: params.system,
      messages: params.messages,
      maxTokens: params.maxTokens,
      providerLabel: "OpenAI",
    });
  }

  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (groqKey && shouldRouteViaGroq(params.model)) {
    const groqModel = groqChatModelId(params.model);
    const isGptOss = groqModel.toLowerCase().includes("gpt-oss");
    // gpt-oss spends completion budget on chain-of-thought; small caps yield empty `content`.
    const maxTokens = isGptOss ? Math.max(params.maxTokens, 4096) : params.maxTokens;
    const extraBody: Record<string, unknown> = isGptOss
      ? { reasoning_effort: "low" as const }
      : {};
    return await callOpenAiCompatibleChatCompletions({
      url: GROQ_OPENAI_CHAT_API,
      apiKey: groqKey,
      model: groqModel,
      system: params.system,
      messages: params.messages,
      maxTokens,
      providerLabel: "Groq",
      extraBody: Object.keys(extraBody).length > 0 ? extraBody : undefined,
    });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!anthropicKey) {
    throw new Error("No matching API key is set for selected model/provider");
  }

  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: params.model,
      max_tokens: params.maxTokens,
      system: params.system,
      messages: params.messages,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    let detail = body.slice(0, 800);
    try {
      const j = JSON.parse(body) as { error?: { type?: string; message?: string } };
      if (j?.error?.message) {
        detail = [j.error.type, j.error.message].filter(Boolean).join(": ");
      }
    } catch {
      /* keep raw slice */
    }
    throw new Error(`Anthropic HTTP ${res.status}: ${detail}`);
  }

  const data = (await res.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const text = data.content?.map((b) => b.text ?? "").join("") ?? "";
  if (!text.trim()) {
    throw new Error("Anthropic returned empty content");
  }
  return text.trim();
}
