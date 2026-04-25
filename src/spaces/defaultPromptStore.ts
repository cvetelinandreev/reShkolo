import { DEFAULT_SUMMARY_SYSTEM_PROMPT } from "./prompts/defaultSummarySystemPrompt";

const DEFAULT_PROMPT_KEY = "default_summary_system_prompt";

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

export async function getDefaultSummaryPromptFromDb(
  appSetting: AppSettingEntity | undefined,
): Promise<string> {
  if (!appSetting) return DEFAULT_SUMMARY_SYSTEM_PROMPT;
  const row = await appSetting.findUnique({
    where: { key: DEFAULT_PROMPT_KEY },
    select: { value: true },
  });
  return row?.value?.trim() || DEFAULT_SUMMARY_SYSTEM_PROMPT;
}

export async function seedDefaultSummaryPromptIfMissing(
  appSetting: AppSettingEntity | undefined,
): Promise<void> {
  if (!appSetting) return;
  await appSetting.upsert({
    where: { key: DEFAULT_PROMPT_KEY },
    create: { key: DEFAULT_PROMPT_KEY, value: DEFAULT_SUMMARY_SYSTEM_PROMPT },
    update: {},
  });
}
