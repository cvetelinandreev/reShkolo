const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const OPENROUTER_CHAT_API = "https://openrouter.ai/api/v1/chat/completions";

export type AnthropicMessage = {
  role: "user" | "assistant";
  content: string;
};

export async function callAnthropicText(params: {
  model: string;
  system: string;
  messages: AnthropicMessage[];
  maxTokens: number;
}): Promise<string> {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (openRouterKey) {
    const res = await fetch(OPENROUTER_CHAT_API, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${openRouterKey}`,
      },
      body: JSON.stringify({
        model: params.model,
        max_tokens: params.maxTokens,
        messages: [
          { role: "system", content: params.system },
          ...params.messages,
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenRouter HTTP ${res.status}: ${body.slice(0, 500)}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text.trim()) {
      throw new Error("OpenRouter returned empty content");
    }
    return text.trim();
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    throw new Error("Neither OPENROUTER_API_KEY nor ANTHROPIC_API_KEY is set");
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
    throw new Error(`Anthropic HTTP ${res.status}: ${body.slice(0, 500)}`);
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
