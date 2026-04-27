const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta/models";
const OPENAI_CHAT_API = "https://api.openai.com/v1/chat/completions";
const GEMINI_SAFE_FALLBACK_MODEL = "gemini-2.5-flash-lite";

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
      throw new Error(`Gemini HTTP ${res.status}: ${bodyText.slice(0, 800)}`);
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

  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (geminiKey && shouldRouteViaGemini(params.model)) {
    try {
      return await callGeminiOnce(params.model, geminiKey);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isModelMissing =
        msg.includes("Gemini HTTP 404") &&
        (msg.includes("is not found") || msg.includes("not supported for generateContent"));
      if (isModelMissing && params.model.trim() !== GEMINI_SAFE_FALLBACK_MODEL) {
        return await callGeminiOnce(GEMINI_SAFE_FALLBACK_MODEL, geminiKey);
      }
      throw err;
    }
  }

  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  if (openAiKey && shouldRouteViaOpenAI(params.model)) {
    const res = await fetch(OPENAI_CHAT_API, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${openAiKey}`,
      },
      body: JSON.stringify({
        model: params.model,
        max_completion_tokens: params.maxTokens,
        messages: [
          { role: "system", content: params.system },
          ...params.messages,
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenAI HTTP ${res.status}: ${body.slice(0, 500)}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const raw = data.choices?.[0]?.message?.content;
    const text = chatAssistantText(raw);
    if (!text.trim()) {
      throw new Error("OpenAI returned empty content");
    }
    return text.trim();
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
