---
name: railway-redeploy
description: >-
  Redeploys this Wasp app to Railway after the initial `wasp deploy railway launch`.
  Covers full stack vs client-only deploy, required `REACT_APP_API_URL` / `--custom-server-url`,
  and Node/Wasp invocation for reShkolo. Use when the user asks to redeploy, ship an update
  to Railway, refresh production, or run `deploy railway` for this repo.
---

# Railway redeploy (reShkolo)

Assume the **first** deploy already ran (`wasp deploy railway launch <name>`). For updates, use **`deploy` only** — do **not** rerun `launch`.

## Prerequisites

- Repo root; **pinned Node** via `npm run wasp -- …` or `bash scripts/with-project-node.sh wasp …` (see `.nvmrc` / project rules).
- **Railway CLI**: `npm run railway` (local `@railway/cli`) or a logged-in global `railway`; project linked from a prior launch.
- Production **server** public URL (example for this project’s default naming: `https://reshkolo-prod-server-production.up.railway.app`). Confirm in Railway if names differ.

## Client env (required every client build)

Production static client must be built with **`REACT_APP_API_URL`** pointing at the **public server URL** (HTTPS, no trailing path). Export it in the **same shell** as `wasp deploy`, and pass **`--custom-server-url`** with the same value so Wasp keeps client/server wiring consistent.

## Commands

**Full redeploy (server + client):**

```bash
export REACT_APP_API_URL="https://<your-server-host>.up.railway.app"
npm run wasp -- deploy railway deploy reshkolo-prod --custom-server-url "$REACT_APP_API_URL"
```

Use the real Railway `<project-name>` if not `reshkolo-prod`.

**Client only** (no server image / env change):

```bash
export REACT_APP_API_URL="https://<your-server-host>.up.railway.app"
npm run wasp -- deploy railway deploy reshkolo-prod --skip-server --custom-server-url "$REACT_APP_API_URL"
```

**Server only** (rare):

```bash
npm run wasp -- deploy railway deploy reshkolo-prod --skip-client
```

## Secrets

- Do **not** paste production API keys into chat or commit them.
- New server env vars: Railway dashboard → **server** service → **Variables**, or one-off `wasp deploy railway deploy …` with `--server-secret KEY=value` from the user’s machine only.

## If the client build fails

- **Missing `wasp/...` / Vite 7 Rollup resolution**: this repo’s `vite.config.ts` defines a **`resolve.alias`** for `wasp/universal/ansiColors` (needed for production `vite build`). Restore it if removed.
- **`Cannot find module .../node_modules/wasp/dist/client/vite`**: run `bash scripts/with-project-node.sh wasp build`, then `npm install` at repo root so the `wasp` workspace link exists before deploying.

## Reference

- Pair with [.agents/skills/deploying-app/SKILL.md](../deploying-app/SKILL.md) for first-time launch and pre-deploy validation.
- Wasp 0.22 Railway docs: versioned map at `https://wasp.sh/llms-0.22.txt` → “Automated Deployment to Railway with Wasp CLI”.
