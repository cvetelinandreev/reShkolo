/**
 * Split legacy full prompts on a line containing only `OUTPUT` (optional spaces).
 * Used when migrating AppSetting rows from the old single blob.
 */

const OUTPUT_SECTION_SPLIT = /(?:^|\n)OUTPUT\s*\n/;

export type SplitPromptAtOutputMarker = {
  part1: string;
  part2: string;
};

export function splitPromptAtOutputMarker(body: string): SplitPromptAtOutputMarker | null {
  const m = OUTPUT_SECTION_SPLIT.exec(body);
  if (!m) return null;
  const end = m.index + m[0].length;
  const part1 = body.slice(0, end).trimEnd();
  const part2 = body.slice(end).trimStart();
  return { part1, part2 };
}

/** Full system prompt sent to the model: shared INPUT + this space’s OUTPUT rules. */
export function composeExperimentSystemPrompt(inputPart: string, outputPart: string): string {
  const a = inputPart.trim();
  const b = outputPart.trim();
  if (!a) return b;
  if (!b) return a;
  return `${a}\n\n${b}`;
}
