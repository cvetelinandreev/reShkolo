/**
 * If `summary_prompt_input` / `default_summary_prompt_output` are missing,
 * insert them from `src/spaces/prompts/defaultSummarySystemPrompt.ts`.
 * Does not overwrite existing rows (preserves custom prompts).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const INPUT_KEY = "summary_prompt_input";
const OUTPUT_DEFAULT_KEY = "default_summary_prompt_output";

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

function readConstBlock(src, exportName) {
  const re = new RegExp(
    `export const ${exportName} = \`([\\s\\S]*?)\`\\.trim\\(\\)`,
  );
  const m = src.match(re);
  if (!m) {
    throw new Error(
      `Could not parse ${exportName} from defaultSummarySystemPrompt.ts`,
    );
  }
  return m[1].trim();
}

function readDefaultsFromSourceFile() {
  const tsPath = path.join(
    ROOT,
    "src/spaces/prompts/defaultSummarySystemPrompt.ts",
  );
  const src = fs.readFileSync(tsPath, "utf8");
  const input = readConstBlock(src, "DEFAULT_SUMMARY_PROMPT_INPUT");
  const output = readConstBlock(src, "DEFAULT_SUMMARY_PROMPT_OUTPUT");
  return { input, output };
}

process.env.DATABASE_URL = loadDatabaseUrlFromEnvServer();
const prisma = new PrismaClient();

try {
  const { input, output } = readDefaultsFromSourceFile();

  for (const [key, value] of [
    [INPUT_KEY, input],
    [OUTPUT_DEFAULT_KEY, output],
  ]) {
    const existing = await prisma.appSetting.findUnique({ where: { key } });
    if (existing) {
      console.log(`AppSetting "${key}" already present; leaving unchanged.`);
    } else {
      await prisma.appSetting.create({ data: { key, value } });
      console.log(`AppSetting "${key}" created from source file.`);
    }
  }
} finally {
  await prisma.$disconnect();
}
