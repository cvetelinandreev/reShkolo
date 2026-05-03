import assert from "node:assert/strict";
import test from "node:test";

import { PrismaClient } from "@prisma/client";

import {
  DEFAULT_SUMMARY_PROMPT_OUTPUT_KEY,
  getDefaultSummaryPromptOutputFromDb,
  getSummaryPromptInputFromDb,
  SUMMARY_PROMPT_INPUT_KEY,
} from "./defaultPromptStore";
import { composeExperimentSystemPrompt } from "./experimentPromptParts";

const dbConfigured = Boolean(process.env.DATABASE_URL?.trim());
const skipReason = dbConfigured
  ? false
  : "DATABASE_URL is not set — run `npm run test:db` to load .env.server.";

test(
  "system prompt sent to LLM includes both summary_prompt_input and an OUTPUT block (read from DB)",
  { skip: skipReason },
  async () => {
    const prisma = new PrismaClient();
    try {
      const sharedInput = await getSummaryPromptInputFromDb(prisma.appSetting);
      assert.ok(
        sharedInput.length > 0,
        `AppSetting row '${SUMMARY_PROMPT_INPUT_KEY}' must be populated; ` +
          `an empty value is what caused the INPUT half to be dropped from the system prompt.`,
      );

      const promptRow = await prisma.spacePrompt.findFirst({
        where: { summaryPromptOutput: { not: "" } },
        select: { summaryPromptOutput: true },
      });

      const output = (
        promptRow?.summaryPromptOutput ??
        (await getDefaultSummaryPromptOutputFromDb(prisma.appSetting))
      ).trim();
      assert.ok(
        output.length > 0,
        `Need at least one non-empty SpacePrompt.summaryPromptOutput, ` +
          `or AppSetting '${DEFAULT_SUMMARY_PROMPT_OUTPUT_KEY}', to test the OUTPUT half.`,
      );

      const system = composeExperimentSystemPrompt(sharedInput, output);

      assert.ok(
        system.includes(sharedInput),
        "Composed system prompt is missing the summary_prompt_input value from the DB.",
      );
      assert.ok(
        system.includes(output),
        "Composed system prompt is missing the per-card summaryPromptOutput value from the DB.",
      );
      assert.equal(
        system,
        `${sharedInput}\n\n${output}`,
        "Composed system prompt must be INPUT + blank line + OUTPUT, in that order.",
      );
    } finally {
      await prisma.$disconnect();
    }
  },
);

test(
  "getSummaryPromptInputFromDb returns the populated DB value verbatim (trimmed)",
  { skip: skipReason },
  async () => {
    const prisma = new PrismaClient();
    try {
      const fromHelper = await getSummaryPromptInputFromDb(prisma.appSetting);
      const raw = await prisma.appSetting.findUnique({
        where: { key: SUMMARY_PROMPT_INPUT_KEY },
        select: { value: true },
      });
      assert.ok(raw, `AppSetting row '${SUMMARY_PROMPT_INPUT_KEY}' is missing.`);
      assert.equal(fromHelper, raw.value.trim());
      assert.ok(fromHelper.length > 0, "summary_prompt_input must not be empty.");
    } finally {
      await prisma.$disconnect();
    }
  },
);
