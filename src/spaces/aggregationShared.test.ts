import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAggregationUserMessage,
  emptyAggregationUserMessage,
  noLlmKeyAggregationMessage,
  pickSummaryForDisplay,
} from "./aggregationShared";

test("pickSummaryForDisplay prefers bg when available", () => {
  const result = pickSummaryForDisplay(
    { summaryTextEn: "English summary", summaryTextBg: " Българско резюме " },
    "bg",
  );
  assert.equal(result, " Българско резюме ");
});

test("pickSummaryForDisplay falls back to en when bg is empty", () => {
  const result = pickSummaryForDisplay(
    { summaryTextEn: "English summary", summaryTextBg: "   " },
    "bg",
  );
  assert.equal(result, "English summary");
});

test("buildAggregationUserMessage emits normalized JSON payload", () => {
  const message = buildAggregationUserMessage(
    [
      {
        contributorHandleId: "student_1",
        rawText: "Line one\nLine two ",
        createdAt: new Date("2026-04-28T08:30:00.000Z"),
      },
    ],
    "8A Class",
    "Bulgarian",
  );
  const parsed = JSON.parse(message) as {
    Subject: string;
    Language: string;
    Entries: Array<{ timestamp: string; sender_id: string; feedback_text: string }>;
  };
  assert.equal(parsed.Subject, "8A Class");
  assert.equal(parsed.Language, "bg");
  assert.equal(parsed.Entries.length, 1);
  assert.deepEqual(parsed.Entries[0], {
    timestamp: "2026-04-28T08:30:00.000Z",
    sender_id: "student_1",
    feedback_text: "Line one Line two",
  });
});

test("emptyAggregationUserMessage emits empty entries array", () => {
  const message = emptyAggregationUserMessage("8A Class", "English");
  const parsed = JSON.parse(message) as {
    Subject: string;
    Language: string;
    Entries: unknown[];
  };
  assert.equal(parsed.Subject, "8A Class");
  assert.equal(parsed.Language, "en");
  assert.deepEqual(parsed.Entries, []);
});

test("noLlmKeyAggregationMessage mentions GROQ key", () => {
  assert.match(noLlmKeyAggregationMessage("en"), /GROQ_API_KEY/);
  assert.match(noLlmKeyAggregationMessage("bg"), /GROQ_API_KEY/);
});
