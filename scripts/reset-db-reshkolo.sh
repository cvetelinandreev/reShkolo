#!/usr/bin/env bash
# Wipe all application rows and recreate the canonical in-app feedback space
# (shortCode `reshkolo`, id fixed in migrations — must match `appFeedbackSpace.ts`).
#
# Usage (from repo root):
#   bash scripts/reset-db-reshkolo.sh
#
# Requires: `.env.server` with DATABASE_URL, Docker Postgres up, Node from .nvmrc.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env.server ]]; then
  echo "Missing .env.server (copy from .env.server.example)." >&2
  exit 1
fi

echo "Resetting database (truncating space data, preserving AppSetting rows, then seeding reshkolo space)..."

bash scripts/with-project-node.sh npx dotenv -e .env.server -- prisma db execute --schema=schema.prisma --stdin <<'SQL'
-- Keep _prisma_migrations and AppSetting (see `defaultPromptStore.ts` / getSpaceSummary seeding).
TRUNCATE TABLE "Space" CASCADE;

-- IDs and shortCode must match `APP_FEEDBACK_SPACE_ID` / `APP_FEEDBACK_SPACE_SHORT_CODE` in
-- `src/spaces/appFeedbackSpace.ts` and historical migrations.
INSERT INTO "Space" ("id", "shortCode", "name", "createdAt")
VALUES (
  'a1b2c3d4-0000-4000-8000-000000000001',
  'reshkolo',
  'reShkolo',
  CURRENT_TIMESTAMP
);

INSERT INTO "SpaceSummary" (
  "spaceId",
  "summaryText",
  "summaryTextBg",
  "jobStatus",
  "totalCount",
  "positiveCount",
  "negativeCount",
  "updatedAt"
)
VALUES (
  'a1b2c3d4-0000-4000-8000-000000000001',
  NULL,
  NULL,
  'ready',
  0,
  0,
  0,
  NULL
);
SQL

bash scripts/with-project-node.sh node scripts/ensure-app-settings.mjs

echo "Done. Join path: /reshkolo. AppSetting rows were preserved; missing default prompt key was back-filled if needed."
