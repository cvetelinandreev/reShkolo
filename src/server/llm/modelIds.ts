/** Anthropic Messages API — fast/cheap default for classification. */
export const ANTHROPIC_HAIKU_45_MODEL = "claude-haiku-4-5-20251001";

/** Anthropic Messages API balanced model for high-quality aggregation summaries. */
export const ANTHROPIC_SONNET_46_MODEL = "claude-sonnet-4-6";

/** Gemini free-tier-friendly model that works on generateContent v1beta. */
export const GEMINI_25_FLASH_LITE_MODEL = "gemini-2.5-flash-lite";

/** OpenAI fast model for low-cost classification. */
export const OPENAI_GPT_54_MINI_MODEL = "gpt-5.4-mini";

/** OpenAI quality model for summary generation alternatives. */
export const OPENAI_GPT_55_MODEL = "gpt-5.5";

/** OpenAI smaller / cheaper summary default (set OPENAI_MODEL_SUMMARY to override). */
export const OPENAI_GPT_55_MINI_MODEL = "gpt-5.5-mini";

/** Groq Cloud OpenAI-compatible chat — Llama default with higher TPM headroom for summaries (set GROQ_MODEL_SUMMARY to override). */
export const GROQ_LLAMA_4_SCOUT_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
