import { joinSpace } from "wasp/client/operations";
import type { SummaryDisplayLang } from "./aggregationShared";

/**
 * Fixed primary key for the in-app feedback space (join via `APP_FEEDBACK_SPACE_SHORT_CODE`).
 * Must stay aligned with:
 * - `migrations/20260422160000_app_feedback_space` and `20260425181000_space_shortcode_lowercase`
 * - `scripts/reset-db-reshkolo.sh`
 */
export const APP_FEEDBACK_SPACE_ID =
  "a1b2c3d4-0000-4000-8000-000000000001" as const;

/** Must match the canonical `shortCode` for the app feedback space (see DB migrations). */
export const APP_FEEDBACK_SPACE_SHORT_CODE = "reshkolo";

export function isAppFeedbackSpaceShortCode(shortCode: string): boolean {
  return shortCode.trim().toLowerCase() === APP_FEEDBACK_SPACE_SHORT_CODE;
}

type JoinSpaceResult = Awaited<ReturnType<typeof joinSpace>>;

let appFeedbackJoinInFlight: Promise<JoinSpaceResult> | null = null;

/**
 * De-duplicates concurrent joins (e.g. React Strict Mode). After the promise settles,
 * a later call can run again (e.g. new contributor handle after clearing device storage).
 */
export async function joinAppFeedbackSpace(
  displayLang: SummaryDisplayLang,
): Promise<JoinSpaceResult | null> {
  if (!appFeedbackJoinInFlight) {
    appFeedbackJoinInFlight = joinSpace({
      shortCode: APP_FEEDBACK_SPACE_SHORT_CODE,
      displayLang,
    }).finally(() => {
      appFeedbackJoinInFlight = null;
    });
  }
  try {
    return await appFeedbackJoinInFlight;
  } catch {
    return null;
  }
}
