import type { RegenerateAllSummaries } from "wasp/server/api";
import { regenerateAllExperimentAggregations } from "./experimentAsync";

export const regenerateAllSummaries: RegenerateAllSummaries = async (
  req,
  res,
  context,
) => {
  const want = process.env.REGENERATE_ALL_SUMMARIES_SECRET?.trim();
  if (!want) {
    res.status(503).json({
      error:
        "Set REGENERATE_ALL_SUMMARIES_SECRET in .env.server, restart the server, then POST with header x-reshkolo-regenerate-secret.",
    });
    return;
  }
  if (req.get("x-reshkolo-regenerate-secret") !== want) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const { spaceCount, updatedPromptRows } =
      await regenerateAllExperimentAggregations(context.entities);
    res.json({ ok: true, spaceCount, updatedPromptRows });
  } catch (err) {
    console.error("regenerateAllSummaries failed", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Regeneration failed",
    });
  }
};
