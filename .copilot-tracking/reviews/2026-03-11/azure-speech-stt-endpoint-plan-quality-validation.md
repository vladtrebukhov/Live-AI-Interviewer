<!-- markdownlint-disable-file -->
# Implementation Quality Validation: Azure Speech STT Endpoint

## Scope

Validated implementation quality for the Azure Speech STT endpoint work across the changed backend, frontend, and shared-contract files, using the implementation plan, changes log, research, diagnostics, and direct code inspection.

Artifacts used:

* Plan: `.copilot-tracking/plans/2026-03-10/azure-speech-stt-endpoint-plan.instructions.md`
* Changes log: `.copilot-tracking/changes/2026-03-10/azure-speech-stt-endpoint-changes.md`
* Research: `.copilot-tracking/research/2026-03-10/azure-speech-sdk-stt-endpoint-research.md`

## Summary

* Status: Needs follow-up
* Critical findings: 0
* Major findings: 1
* Minor findings: 1

## Notable strengths

* The backend token broker keeps long-lived Azure Speech credentials server-side and applies meaningful anonymous abuse controls in `packages/backend/src/routes/speech.ts:118-185`.
* The frontend recognizer correctly refreshes the live recognizer token instead of only refreshing a stale config object in `packages/frontend/src/hooks/use-azure-speech-recognition.ts:112-129`.
* The implementation preserved optional recognition timing metadata end to end through `packages/frontend/src/hooks/use-azure-speech-recognition.ts:41-52`, `packages/shared/src/index.ts:71-82`, and `packages/backend/src/routes/ws.ts:160-165`.
* Existing Prisma session models were reused cleanly, avoiding unnecessary schema churn while still enabling transcript and feedback persistence in `packages/backend/src/routes/ws.ts:141-156` and `packages/backend/src/routes/ws.ts:207-215`.

## Findings by category

### Test coverage

#### Major

* The websocket and session-persistence migration still lacks direct automated coverage.
  * The highest-risk behavior added in this feature lives in `packages/backend/src/routes/ws.ts:47-72` and `packages/backend/src/routes/ws.ts:119-239`, plus the corresponding client flow in `packages/frontend/src/hooks/use-interview-socket.ts:14-125`.
  * Current automated coverage does not directly exercise that migration path:
    * `packages/backend/src/__tests__/server.test.ts:24-31` only covers `/health`
    * `packages/backend/src/routes/__tests__/speech.test.ts:42-89` only covers token route happy-path and origin rejection
    * `packages/frontend/src/stores/__tests__/interview-store.test.ts:40-109` only covers local store transitions
    * `packages/frontend/e2e/initial-flow.spec.ts:3-55` only covers navigation into the interview page
    * `packages/shared/src/__tests__/types.test.ts:13-70` is a type smoke test, not protocol behavior coverage
  * Impact: the code looks structurally sound, but regressions in transcript delivery, reconnect restoration, or message persistence could land without a focused test failing.

### Refactoring and cleanup

#### Minor

* The old raw-audio STT path remains in the repository as stale surface area after the transcript-oriented migration.
  * The legacy backend Whisper path still exists in `packages/backend/src/services/stt.ts:1-18`.
  * The legacy browser chunk-capture hook still exists in `packages/frontend/src/hooks/use-audio-capture.ts:1-41`.
  * The preferred flow now runs through browser Azure Speech recognition and transcript events in `packages/frontend/src/hooks/use-azure-speech-recognition.ts:151-257` and `packages/frontend/src/hooks/use-interview-socket.ts:106-124`, so the older raw-audio path is no longer the primary implementation.
  * Impact: this is not a correctness bug, but it increases maintenance surface and muddies the intended architecture unless it is either documented as fallback behavior or removed.

## Validation context

Command results reproduced during review:

* `corepack pnpm lint` failed with the pre-existing frontend ESLint/plugin crash while linting `packages/frontend/eslint.config.mjs`.
* `corepack pnpm typecheck` passed.
* `corepack pnpm test` passed with 28/28 tests.
* `corepack pnpm -r build` passed for shared, frontend, and backend.
* `corepack pnpm build` failed because the root script shells out to bare `pnpm -r build`, and `pnpm` is not directly on `PATH` in this shell.
* `corepack pnpm exec eslint packages/backend/src/server.ts packages/backend/src/routes/speech.ts packages/backend/src/routes/__tests__/speech.test.ts` passed.
* `corepack pnpm --filter @agentsgalore/frontend lint` passed.
* `corepack pnpm --filter @agentsgalore/frontend build` passed.

## Recommended follow-up work

* Add focused websocket/session integration tests covering:
  * transcript persistence
  * reconnect recovery
  * feedback persistence
  * `sessionId` mismatch handling
* Decide whether `packages/backend/src/services/stt.ts` and `packages/frontend/src/hooks/use-audio-capture.ts` are supported fallbacks or cleanup candidates, and document or remove them accordingly.
* Repair the pre-existing frontend ESLint/plugin crash separately so full workspace lint can become a reliable gate again.
* Consider hardening the root build ergonomics for Corepack-only environments so `pnpm build` and `corepack pnpm build` behave consistently.
