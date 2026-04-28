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
  if (!appSetting) return "";
  const row = await appSetting.findUnique({
    where: { key: SUMMARY_PROMPT_INPUT_KEY },
    select: { value: true },
  });
  return row?.value?.trim() || "";
}

export async function getDefaultSummaryPromptOutputFromDb(
  appSetting: AppSettingEntity | undefined,
): Promise<string> {
  if (!appSetting) return "";
  const row = await appSetting.findUnique({
    where: { key: DEFAULT_SUMMARY_PROMPT_OUTPUT_KEY },
    select: { value: true },
  });
  return row?.value?.trim() || "";
}

/** Ensures AppSetting rows exist for shared INPUT and default OUTPUT. */
export async function seedSummaryPromptAppSettingsIfMissing(
  appSetting: AppSettingEntity | undefined,
): Promise<void> {
  if (!appSetting) return;

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

  if (!curInput) {
    await appSetting.upsert({
      where: { key: SUMMARY_PROMPT_INPUT_KEY },
      create: { key: SUMMARY_PROMPT_INPUT_KEY, value: "" },
      update: { value: "" },
    });
  }

  if (!curOut) {
    await appSetting.upsert({
      where: { key: DEFAULT_SUMMARY_PROMPT_OUTPUT_KEY },
      create: { key: DEFAULT_SUMMARY_PROMPT_OUTPUT_KEY, value: "" },
      update: { value: "" },
    });
  }
}

