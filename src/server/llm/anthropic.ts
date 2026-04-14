const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";

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
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }

  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
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
