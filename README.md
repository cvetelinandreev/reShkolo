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

### Phone or another computer on your Wi‑Fi

The dev client defaults to `http://localhost:3001` for API calls. On your phone, **localhost is the phone itself**, so creating a space fails until you point the client at your Mac:

1. Copy `.env.client.example` to `.env.client`.
2. Set `REACT_APP_API_URL` to `http://<YOUR_MAC_LAN_IP>:3001` (same IP you use for the app, port **3001**).
3. Restart `wasp start`. Vite is configured with `server.host: true` so you can open `http://<YOUR_MAC_LAN_IP>:3000` on the phone.

Optional: add `ANTHROPIC_API_KEY` to `.env.server` for hosted classification + narrative summaries (see `.env.server.example`).

## Next steps

- Speech-to-text path for `sourceType: "voice"`
- Railway Postgres + deploy
- Replace polling with a tighter refresh strategy if needed

## Repository notes

- `.cursor/rules/reshkolo-mvp-direction.mdc` contains project direction rules for AI-assisted development.
- Additional agent skills are installed under `.agents/skills/`.
