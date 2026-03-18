<!-- markdownlint-disable-file -->
# Release Changes: Azure Speech STT Endpoint

**Related Plan**: `azure-speech-stt-endpoint-plan.instructions.md`
**Implementation Date**: 2026-03-10

## Summary

Implement Azure Speech SDK continuous speech-to-text groundwork by adding backend token brokering, browser recognition support, transcript-oriented realtime flow, and session-aware transcript persistence.

## Changes

### Added

* `packages/backend/src/routes/speech.ts` - Adds a backend Azure Speech token broker route that returns short-lived frontend auth material.
* `packages/backend/src/routes/__tests__/speech.test.ts` - Covers token issuance behavior and route safeguards for the new Speech endpoint.
* `packages/frontend/src/hooks/use-azure-speech-recognition.ts` - Adds the browser Azure Speech recognizer hook with token refresh and lifecycle handling.

### Modified

* `.env.example` - Documents Azure Speech configuration variables for workspace-level setup.
* `packages/backend/.env.example` - Documents backend-local Azure Speech configuration variables.
* `packages/backend/src/server.ts` - Registers the new `/api/speech/token` route.
* `packages/backend/src/routes/__tests__/ws.test.ts` - Extends websocket/session coverage with an explicit session mismatch rejection case.
* `packages/frontend/package.json` - Adds the browser Azure Speech SDK dependency.
* `pnpm-lock.yaml` - Records the frontend Speech SDK dependency change.
* `packages/frontend/src/lib/api.ts` - Adds typed Speech token retrieval support for the frontend.
* `packages/frontend/src/stores/interview-store.ts` - Tracks speech lifecycle state, partial transcript text, session ID, and speech errors.
* `packages/frontend/src/app/interview/[questionId]/page.tsx` - Uses actual Speech recognizer lifecycle outcomes for mic control and transcript preview.
* `packages/frontend/src/stores/__tests__/interview-store.test.ts` - Updates store tests to match the new speech-status-driven microphone behavior.
* `packages/shared/src/index.ts` - Migrates websocket message types from audio chunks to transcript-oriented events with timing metadata.
* `packages/frontend/src/hooks/use-interview-socket.ts` - Sends finalized transcript events and connects the live flow to session-backed realtime handling.
* `packages/frontend/src/hooks/use-azure-speech-recognition.ts` - Preserves optional recognition timing metadata on finalized transcript callbacks.
* `packages/backend/src/routes/ws.ts` - Persists transcript and feedback messages, restores session state on reconnect, and stops relying on raw audio chunk STT in the preferred flow.

### Removed

* `packages/backend/src/services/stt.ts` - Removes the unused legacy backend raw-audio transcription path.
* `packages/frontend/src/hooks/use-audio-capture.ts` - Removes the unused legacy browser raw-audio capture hook.

## Additional or Deviating Changes

* Review remediation confirmed the previously reported root validation blockers are resolved in the current branch.
	* Workspace lint and root build both pass directly via `corepack pnpm lint` and `corepack pnpm build`.
	* The remaining remediation work focused on closing test coverage and removing stale legacy STT source paths.

* The backend token route adds anonymous abuse controls because no existing user authentication boundary was available in the current app flow.
	* Route protections include origin validation, request scoping via `questionId` or `sessionId`, entity existence checks, and lightweight IP-based rate limiting.

* Phase 2 intentionally keeps final transcript handling local to the client.
	* Websocket contract migration and session-backed transcript delivery are deferred to Phase 3 to keep frontend recognizer work isolated and testable.

* Phase 3 reused the existing Prisma session schema without database changes.
	* `InterviewSession` and `SessionMessage` already supported transcript and feedback persistence, so no migration was needed.

* Final validation uncovered one stale frontend test caused directly by the Speech migration.
	* The interview store tests were updated to assert the new speech-status-driven mic behavior rather than the removed optimistic toggle flow.

* Review remediation closed the previously open websocket/session coverage gap with a direct mismatch test.
	* Existing websocket helper tests already covered reconnect hydration, transcript persistence, and feedback persistence.
	* The added test now locks in session mismatch rejection for finalized transcript events.

## Release Summary

The Azure Speech STT integration is functionally implemented across the backend, frontend, and shared realtime contract, and the review follow-up findings are now closed.

Files affected:

* Added: 3
	* `packages/backend/src/routes/speech.ts` - Backend token broker for Azure Speech
	* `packages/backend/src/routes/__tests__/speech.test.ts` - Token broker route coverage
	* `packages/frontend/src/hooks/use-azure-speech-recognition.ts` - Browser Speech SDK lifecycle hook
* Modified: 13
	* `.env.example`, `packages/backend/.env.example` - Azure Speech configuration examples
	* `packages/backend/src/server.ts` - Speech route registration
	* `packages/backend/src/routes/__tests__/ws.test.ts` - Expanded websocket/session coverage including mismatch rejection
	* `packages/frontend/package.json`, `pnpm-lock.yaml` - Frontend Speech SDK dependency
	* `packages/frontend/src/lib/api.ts` - Speech token and session helpers
	* `packages/frontend/src/stores/interview-store.ts`, `packages/frontend/src/stores/__tests__/interview-store.test.ts` - Speech-aware client state and updated tests
	* `packages/frontend/src/app/interview/[questionId]/page.tsx` - Speech recognizer-driven interview UI flow
	* `packages/frontend/src/hooks/use-interview-socket.ts` - Transcript-oriented websocket messaging
	* `packages/shared/src/index.ts` - Transcript and speech-status websocket types with optional timing metadata
	* `packages/backend/src/routes/ws.ts` - Session-backed transcript persistence and reconnect restoration
* Removed: 2
	* `packages/backend/src/services/stt.ts` - Unused legacy raw-audio STT service
	* `packages/frontend/src/hooks/use-audio-capture.ts` - Unused legacy raw-audio capture hook

Dependency and infrastructure notes:

* Added `microsoft-cognitiveservices-speech-sdk` to the frontend package.
* Reused the existing Prisma session schema, so no database migration was required.
* Replaced the preferred live interview STT path from websocket audio-blob upload to browser Azure Speech recognition plus transcript events.

Validation summary:

* Passed: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`, `corepack pnpm build`.
