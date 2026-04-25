# reShkolo

Web-first MVP for anonymous, aggregated student feedback in school spaces.

## Vision

reShkolo gives students a serious and familiar channel to provide feedback for teachers while keeping participation flat and collaborative. Invited teachers, principals, and parents can also contribute when invited.

## MVP principles

- One-page browser experience (no app-store install).
- Feedback input: free text or speech only.
- Output in UI: aggregated summary only (no raw feedback list).
- UI language: English.
- Space access via short code or invite link.
- Device-bound space picker state (no cross-device sync of local space list).

## Tech stack (decided)

- Wasp (single codebase: React client + Node server)
- Railway hosting (starting on free tier)
- PostgreSQL persistence
- Hosted APIs for STT + LLM aggregation (Claude Opus-class target)
- Hybrid pipeline:
  - Sync: sentiment/type classification during submit
  - Async: summary generation in background

## Current status

Wasp **basic** template is integrated. Core flows are implemented:

- `createSpace`, `joinSpace`, `submitFeedback`, `getSpaceSummary`
- Single-page UI with device-local space picker and invite link `/s/:shortCode`
- Hybrid pipeline: classification during submit (hosted LLM if `ANTHROPIC_API_KEY` is set, else heuristic); summary regeneration runs asynchronously after submit

## Local development

PostgreSQL is required (Wasp production builds do not support SQLite). The repo includes `docker-compose.yml` for a local database.

```bash
cp .env.server.example .env.server
docker compose up -d
npm install
wasp db migrate-dev --name <descriptive-name>
wasp start
```

### One-command dev (recommended): `npm run start:phone`

Use this when you want the same setup every time (correct Node version, Docker up, then Wasp):

```bash
npm run start:phone
```

This runs `scripts/start-phone-dev.sh`, which:

- Switches to **Node 22.22.2** (from `.node-version`) via `~/.nvm` or `nvm use`
- Verifies **Docker** is running, then runs **`docker compose up -d`**
- Checks that **`.env.server`** contains a **`DATABASE_URL`** line
- Starts **`wasp start`**

You still need **`.env.server`** (and for LAN/phone testing, **`.env.client`** plus `WASP_*` URLs as in the section below). After Vite prints **Network** URLs, open `http://<your-ip>:3000` on the phone.

If the client fails with **missing `wasp/client/...` modules**, stop the server, run **`wasp clean`**, then **`npm run start:phone`** again (see Wasp restart policy in `.cursor/rules/wasp-restart-after-changes.mdc`).

### Phone or another computer on your Wi‑Fi

The browser bundle talks to the API at **`http://localhost:3001`** by default. On your phone, **localhost is the phone itself**, so you must use your Mac’s LAN IP and matching env vars.

1. Run `npm run start:phone` (or `wasp start`) and note Vite’s **`Network`** lines (often several IPs). Prefer an address like **`192.168.x.x`**; an address like **`172.20.x.x`** is often from **iPhone Personal Hotspot** or another interface and may not work from Wi‑Fi—try another `Network` URL if the connection fails.
2. Open the **client** URL on the phone: `http://<that-ip>:3000` (or whatever port Vite prints after **Local:** for the client—if port 3000 was busy, use the port shown there).
3. Copy `.env.client.example` to `.env.client` and set  
   `REACT_APP_API_URL=http://<that-ip>:3001`  
   (same host, **API** port **3001** unless your terminal shows a different server port).
4. In **`.env.server`**, set (same host, correct ports):  
   `WASP_WEB_CLIENT_URL=http://<that-ip>:3000`  
   `WASP_SERVER_URL=http://<that-ip>:3001`  
   so CORS and server-side URLs match how you open the app.
5. Restart `npm run start:phone` (or `wasp start`). `vite.config.ts` uses `server.host: true` and `allowedHosts: true` so the dev server accepts your LAN IP as the `Host` header.
6. If the phone still cannot connect, check **macOS Firewall** (allow **Node** / incoming for ports **3000** and **3001**) and confirm the phone is on the **same network** as the Mac (not only cellular).

Optional: add `ANTHROPIC_API_KEY` to `.env.server` for hosted classification + narrative summaries (see `.env.server.example`).

## Next steps

- Speech-to-text path for `sourceType: "voice"`
- Railway Postgres + deploy
- Replace polling with a tighter refresh strategy if needed

## Repository notes

- `.cursor/rules/reshkolo-mvp-direction.mdc` contains project direction rules for AI-assisted development.
- Additional agent skills are installed under `.agents/skills/`.
