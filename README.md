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

Planning and architecture are defined. Implementation has not started yet.

## Next steps

1. Initialize Wasp app in this repository.
2. Implement core endpoints:
   - `createSpace`
   - `joinSpace`
   - `submitFeedback`
   - `getSpaceSummary`
3. Build single-page UI with space picker and share flow.
4. Add sync classification + async summary worker pipeline.

## Repository notes

- `.cursor/rules/reshkolo-mvp-direction.mdc` contains project direction rules for AI-assisted development.
- Additional agent skills are installed under `.agents/skills/`.
