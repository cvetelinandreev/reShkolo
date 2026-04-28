import assert from "node:assert/strict";
import test from "node:test";

import { pairAggregationRows } from "./experimentAsync";

test("pairAggregationRows groups rows by prompt and model", () => {
  const rows = [
    {
      id: "en-1",
      spaceId: "space-1",
      promptId: "prompt-a",
      spaceModelId: "model-a",
      language: "en",
      prompt: { slug: "default", summaryPromptOutput: "Output A" },
      spaceModel: { slug: "gpt", displayName: "GPT", modelApiId: "openai/gpt" },
    },
    {
      id: "bg-1",
      spaceId: "space-1",
      promptId: "prompt-a",
      spaceModelId: "model-a",
      language: "bg",
      prompt: { slug: "default", summaryPromptOutput: "Output A" },
      spaceModel: { slug: "gpt", displayName: "GPT", modelApiId: "openai/gpt" },
    },
    {
      id: "bg-2",
      spaceId: "space-1",
      promptId: "prompt-b",
      spaceModelId: "model-a",
      language: "bg",
      prompt: { slug: "concise", summaryPromptOutput: "Output B" },
      spaceModel: { slug: "gpt", displayName: "GPT", modelApiId: "openai/gpt" },
    },
  ];

  const pairs = pairAggregationRows(rows);
  assert.equal(pairs.length, 2);

  const first = pairs.find((p) => p.promptId === "prompt-a");
  assert.ok(first);
  assert.equal(first.en?.id, "en-1");
  assert.equal(first.bg?.id, "bg-1");

  const second = pairs.find((p) => p.promptId === "prompt-b");
  assert.ok(second);
  assert.equal(second.en, null);
  assert.equal(second.bg?.id, "bg-2");
});
