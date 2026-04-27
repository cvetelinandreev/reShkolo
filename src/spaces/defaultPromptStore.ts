import {
  DEFAULT_SUMMARY_PROMPT_INPUT,
  DEFAULT_SUMMARY_PROMPT_OUTPUT,
} from "./prompts/defaultSummarySystemPrompt";
import { splitPromptAtOutputMarker } from "./experimentPromptParts";

/** Legacy single-blob key: read only to seed split keys on old databases; never written. */
const LEGACY_PROMPT_KEY = "default_summary_system_prompt";

export const SUMMARY_PROMPT_INPUT_KEY = "summary_prompt_input";

export const DEFAULT_SUMMARY_PROMPT_OUTPUT_KEY = "default_summary_prompt_output";

type AppSettingEntity = {
  findUnique: (args: {
    where: { key: string };
    select: { value: true };
  }) => Promise<{ value: string } | null>;
  upsert: (args: {
    where: { key: string };
    create: { key: string; value: string };
    update: { value?: string };
  }) => Promise<unknown>;
};

export async function getSummaryPromptInputFromDb(
  appSetting: AppSettingEntity | undefined,
): Promise<string> {
  if (!appSetting) return DEFAULT_SUMMARY_PROMPT_INPUT;
  const row = await appSetting.findUnique({
    where: { key: SUMMARY_PROMPT_INPUT_KEY },
    select: { value: true },
  });
  return row?.value?.trim() || DEFAULT_SUMMARY_PROMPT_INPUT;
}

export async function getDefaultSummaryPromptOutputFromDb(
  appSetting: AppSettingEntity | undefined,
): Promise<string> {
  if (!appSetting) return DEFAULT_SUMMARY_PROMPT_OUTPUT;
  const row = await appSetting.findUnique({
    where: { key: DEFAULT_SUMMARY_PROMPT_OUTPUT_KEY },
    select: { value: true },
  });
  return row?.value?.trim() || DEFAULT_SUMMARY_PROMPT_OUTPUT;
}

/**
 * Ensures AppSetting rows exist for shared INPUT and default OUTPUT.
 * Migrates from legacy `default_summary_system_prompt` when the new keys are absent (read-only).
 */
export async function seedSummaryPromptAppSettingsIfMissing(
  appSetting: AppSettingEntity | undefined,
): Promise<void> {
  if (!appSetting) return;

  const legacyRow = await appSetting.findUnique({
    where: { key: LEGACY_PROMPT_KEY },
    select: { value: true },
  });
  const legacy = legacyRow?.value?.trim() ?? "";
  const split = legacy ? splitPromptAtOutputMarker(legacy) : null;

  const inputRow = await appSetting.findUnique({
    where: { key: SUMMARY_PROMPT_INPUT_KEY },
    select: { value: true },
  });
  const outputRow = await appSetting.findUnique({
    where: { key: DEFAULT_SUMMARY_PROMPT_OUTPUT_KEY },
    select: { value: true },
  });
  const curInput = inputRow?.value?.trim() ?? "";
  const curOut = outputRow?.value?.trim() ?? "";

  const inputVal =
    curInput || split?.part1 || DEFAULT_SUMMARY_PROMPT_INPUT;
  const outputVal =
    curOut ||
    split?.part2 ||
    (legacy && !split ? legacy : DEFAULT_SUMMARY_PROMPT_OUTPUT);

  if (!curInput) {
    await appSetting.upsert({
      where: { key: SUMMARY_PROMPT_INPUT_KEY },
      create: { key: SUMMARY_PROMPT_INPUT_KEY, value: inputVal },
      update: { value: inputVal },
    });
  }

  if (!curOut) {
    await appSetting.upsert({
      where: { key: DEFAULT_SUMMARY_PROMPT_OUTPUT_KEY },
      create: { key: DEFAULT_SUMMARY_PROMPT_OUTPUT_KEY, value: outputVal },
      update: { value: outputVal },
    });
  }
}

export { DEFAULT_SUMMARY_SYSTEM_PROMPT } from "./prompts/defaultSummarySystemPrompt";
