import assert from "node:assert/strict";
import test from "node:test";

import { pairAggregationRows } from "./experimentAsync";

test("pairAggregationRows groups rows by prompt and model slug", () => {
  const rows = [
    {
      id: "en-1",
      spaceId: "space-1",
      promptId: "prompt-a",
      modelSlug: "openai",
      language: "en",
      prompt: { slug: "default", summaryPromptOutput: "Output A" },
    },
    {
      id: "bg-1",
      spaceId: "space-1",
      promptId: "prompt-a",
      modelSlug: "openai",
      language: "bg",
      prompt: { slug: "default", summaryPromptOutput: "Output A" },
    },
    {
      id: "bg-2",
      spaceId: "space-1",
      promptId: "prompt-b",
      modelSlug: "openai",
      language: "bg",
      prompt: { slug: "concise", summaryPromptOutput: "Output B" },
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

test("pairAggregationRows skips rows with unknown model slugs", () => {
  const rows = [
    {
      id: "en-1",
      spaceId: "space-1",
      promptId: "prompt-a",
      modelSlug: "legacy-unknown",
      language: "en",
      prompt: { slug: "default", summaryPromptOutput: "Output" },
    },
  ];
  assert.equal(pairAggregationRows(rows).length, 0);
});
