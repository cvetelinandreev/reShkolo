/**
 * If `default_summary_system_prompt` is missing in AppSetting, insert it from
 * `src/spaces/prompts/defaultSummarySystemPrompt.ts` (same text as server seed).
 * Does not overwrite an existing row (preserves custom prompts).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DEFAULT_PROMPT_KEY = "default_summary_system_prompt";

function loadDatabaseUrlFromEnvServer() {
  const envPath = path.join(ROOT, ".env.server");
  if (!fs.existsSync(envPath)) {
    throw new Error("Missing .env.server");
  }
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const m = t.match(/^(?:export\s+)?DATABASE_URL\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[1].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    return v;
  }
  throw new Error("DATABASE_URL not found in .env.server");
}

function readDefaultPromptFromSourceFile() {
  const tsPath = path.join(
    ROOT,
    "src/spaces/prompts/defaultSummarySystemPrompt.ts",
  );
  const src = fs.readFileSync(tsPath, "utf8");
  const m = src.match(
    /export const DEFAULT_SUMMARY_SYSTEM_PROMPT = `([\s\S]*)`\.trim\(\)/,
  );
  if (!m) {
    throw new Error(
      "Could not parse DEFAULT_SUMMARY_SYSTEM_PROMPT from defaultSummarySystemPrompt.ts",
    );
  }
  return m[1].trim();
}

process.env.DATABASE_URL = loadDatabaseUrlFromEnvServer();
const prisma = new PrismaClient();

try {
  const existing = await prisma.appSetting.findUnique({
    where: { key: DEFAULT_PROMPT_KEY },
  });
  if (existing) {
    console.log(
      `AppSetting "${DEFAULT_PROMPT_KEY}" already present; leaving unchanged.`,
    );
  } else {
    const value = readDefaultPromptFromSourceFile();
    await prisma.appSetting.create({
      data: { key: DEFAULT_PROMPT_KEY, value },
    });
    console.log(`AppSetting "${DEFAULT_PROMPT_KEY}" created from source file.`);
  }
} finally {
  await prisma.$disconnect();
}
