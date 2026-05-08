import {
  ANTHROPIC_HAIKU_45_MODEL,
  ANTHROPIC_SONNET_46_MODEL,
  BGGPT_GEMMA_3_27B_MODEL,
  OPENAI_GPT_55_MINI_MODEL,
} from "./modelIds";

type ProviderConfig = {
  displayName: string;
  apiKeyEnv: string;
  modelIdEnv: string;
  fallback: string;
};

export const MODEL_PROVIDERS = {
  anthropic: {
    displayName: "Anthropic Sonnet",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    modelIdEnv: "ANTHROPIC_MODEL_SUMMARY",
    fallback: ANTHROPIC_SONNET_46_MODEL,
  },
  anthropicHaiku: {
    displayName: "Anthropic Haiku",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    modelIdEnv: "ANTHROPIC_MODEL_HAIKU_SUMMARY",
    fallback: ANTHROPIC_HAIKU_45_MODEL,
  },
  openai: {
    displayName: "OpenAI GPT-5.5 mini",
    apiKeyEnv: "OPENAI_API_KEY",
    modelIdEnv: "OPENAI_MODEL_SUMMARY",
    fallback: OPENAI_GPT_55_MINI_MODEL,
  },
  bggpt: {
    displayName: "BgGPT Gemma 3 27B",
    apiKeyEnv: "BGGPT_API_KEY",
    modelIdEnv: "BGGPT_MODEL_SUMMARY",
    fallback: BGGPT_GEMMA_3_27B_MODEL,
  },
} as const satisfies Record<string, ProviderConfig>;

export type ModelProviderSlug = keyof typeof MODEL_PROVIDERS;

export const ALL_PROVIDER_SLUGS = Object.keys(MODEL_PROVIDERS) as ModelProviderSlug[];

export function isModelProviderSlug(slug: string): slug is ModelProviderSlug {
  return slug in MODEL_PROVIDERS;
}

export function getProviderConfig(slug: ModelProviderSlug): ProviderConfig {
  return MODEL_PROVIDERS[slug];
}

export function getModelApiId(slug: ModelProviderSlug): string {
  const cfg = MODEL_PROVIDERS[slug];
  return process.env[cfg.modelIdEnv]?.trim() || cfg.fallback;
}

export function isProviderEnabled(slug: ModelProviderSlug): boolean {
  return !!process.env[MODEL_PROVIDERS[slug].apiKeyEnv]?.trim();
}

export function getEnabledProviderSlugs(): ModelProviderSlug[] {
  return ALL_PROVIDER_SLUGS.filter(isProviderEnabled);
}

export function hasAnyProviderKey(): boolean {
  return ALL_PROVIDER_SLUGS.some(isProviderEnabled);
}

export type ModelProviderInfo = {
  slug: ModelProviderSlug;
  displayName: string;
  modelApiId: string;
};

export function getProviderInfo(slug: ModelProviderSlug): ModelProviderInfo {
  return {
    slug,
    displayName: MODEL_PROVIDERS[slug].displayName,
    modelApiId: getModelApiId(slug),
  };
}
