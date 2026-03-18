---
applyTo: '.copilot-tracking/changes/2026-03-10/azure-speech-stt-endpoint-changes.md'
---
<!-- markdownlint-disable-file -->
# Implementation Plan: Azure Speech STT Endpoint

## Overview

Add Azure Speech SDK continuous speech-to-text to the interview experience by brokering Speech authentication through the backend, moving microphone recognition into the browser, and migrating the realtime flow from raw audio chunks to finalized transcript events.

## Objectives

### User Requirements

* Research and prepare a path to add an endpoint for Azure Speech-to-Text using the Speech SDK — Source: user conversation on 2026-03-10
* Enable a user microphone flow that continuously sends speech for transcription into text — Source: user conversation on 2026-03-10
* Keep the broader interviewer loop in mind while focusing this implementation on speech-to-text integration groundwork — Source: user conversation on 2026-03-10

### Derived Objectives

* Keep Azure Speech credentials off the frontend by brokering short-lived auth through the backend — Derived from: research guidance showing browser microphone recognition should use backend-mediated auth material
* Protect the Speech token endpoint with the strongest available caller boundary or equivalent abuse controls — Derived from: research and validator feedback identifying quota-abuse risk around `/api/speech/token`
* Replace the current raw-audio websocket flow with transcript-oriented events to reduce latency and align with continuous recognition — Derived from: research showing the current 3-second chunk upload path is a poor fit for conversational turn-taking
* Bind live transcription to persisted interview sessions so finalized utterances can support later LLM and TTS flows — Derived from: existing session schema and route capabilities in the repository
* Preserve recognition timing metadata on finalized transcript events so future turn-taking logic can evolve without a second protocol migration — Derived from: future-loop research calling out offsets and durations as useful conversational signals

## Context Summary

### Project Files

* `packages/backend/src/server.ts` - Registers backend routes and is the insertion point for a Speech token endpoint.
* `packages/backend/src/routes/ws.ts` - Current realtime orchestration layer that still expects audio chunks.
* `packages/backend/src/routes/sessions.ts` - Existing session REST layer that can anchor transcript persistence.
* `packages/backend/src/services/stt.ts` - Current backend Whisper-style STT implementation to retire or repurpose.
* `packages/frontend/src/app/interview/[questionId]/page.tsx` - Live interview entry point with current mic toggle flow.
* `packages/frontend/src/hooks/use-audio-capture.ts` - Current `MediaRecorder` chunk uploader to replace or demote.
* `packages/frontend/src/hooks/use-interview-socket.ts` - Current websocket hook to migrate from audio payloads to transcript payloads.
* `packages/frontend/src/stores/interview-store.ts` - Current interview state container that needs speech recognition state.
* `packages/frontend/src/lib/api.ts` - Existing API helper to extend for Speech token and session calls.
* `packages/shared/src/index.ts` - Shared websocket contract types to evolve for transcript events.
* `packages/backend/prisma/schema.prisma` - Existing `InterviewSession` and `SessionMessage` models for durable speech turns.

### References

* `.copilot-tracking/research/2026-03-10/azure-speech-sdk-stt-endpoint-research.md` - Consolidated research findings and selected implementation approach.
* `.copilot-tracking/research/subagents/2026-03-10/azure-speech-sdk-continuous-stt-research.md` - Azure Speech SDK browser recognition and token refresh findings.
* `.copilot-tracking/research/subagents/2026-03-10/repo-audio-realtime-integration-research.md` - Codebase-specific insertion points and current protocol constraints.
* `.copilot-tracking/research/subagents/2026-03-10/future-voice-loop-constraints-research.md` - Future LLM and TTS constraints that influence the STT design.

### Standards References

* `/Users/vlad/.vscode/extensions/ms-azuretools.vscode-azure-github-copilot-1.0.176-darwin-arm64/resources/azureRules/azure.instructions.md` — Required Azure guidance for Azure-related research and planning.
* `/Users/vlad/.vscode/extensions/ise-hve-essentials.hve-core-3.1.46/.github/prompts/hve-core/task-plan.prompt.md` — Planning prompt requirements used for this artifact set.
* `/Users/vlad/.vscode/extensions/ise-hve-essentials.hve-core-3.1.46/.github/instructions/hve-core/markdown.instructions.md` — Markdown authoring standards that apply to tracked planning artifacts.
* `/Users/vlad/.vscode/extensions/ise-hve-essentials.hve-core-3.1.46/.github/instructions/hve-core/writing-style.instructions.md` — Writing style conventions for markdown content.

## Implementation Checklist

### [x] Implementation Phase 1: Backend Speech token broker and configuration

<!-- parallelizable: true -->

* [x] Step 1.1: Add Azure Speech configuration contract and backend route scaffold
  * Details: .copilot-tracking/details/2026-03-10/azure-speech-stt-endpoint-details.md (Lines 12-38)
* [x] Step 1.2: Implement secure token issuance, validation, and failure handling
  * Details: .copilot-tracking/details/2026-03-10/azure-speech-stt-endpoint-details.md (Lines 40-63)
* [x] Step 1.3: Validate backend token broker changes
  * Run `pnpm --filter @agentsgalore/backend build`
  * Run `pnpm lint`
  * Result: Backend build passed, and workspace lint also passes with the current root validation setup.

### [x] Implementation Phase 2: Frontend Speech SDK hook and recognition state

<!-- parallelizable: true -->

* [x] Step 2.1: Add browser Speech SDK integration and recognizer lifecycle hook
  * Details: .copilot-tracking/details/2026-03-10/azure-speech-stt-endpoint-details.md (Lines 77-102)
* [x] Step 2.2: Integrate recognition state into interview UI and client store
  * Details: .copilot-tracking/details/2026-03-10/azure-speech-stt-endpoint-details.md (Lines 104-128)
* [x] Step 2.3: Validate frontend Speech integration changes
  * Run `pnpm --filter @agentsgalore/frontend lint`
  * Run `pnpm --filter @agentsgalore/frontend build`
  * Skip phase validation if shared contract changes are still in flight
  * Result: Both package-scoped validation commands passed.

### [x] Implementation Phase 3: Realtime contract, session bootstrap, and transcript persistence

<!-- parallelizable: false -->

* [x] Step 3.1: Replace raw audio websocket payloads with transcript-oriented events
  * Details: .copilot-tracking/details/2026-03-10/azure-speech-stt-endpoint-details.md (Lines 142-168)
* [x] Step 3.2: Bind live interviews to persisted sessions and store final utterances
  * Details: .copilot-tracking/details/2026-03-10/azure-speech-stt-endpoint-details.md (Lines 170-196)
  * Result: Existing Prisma session models were sufficient, so no schema migration was required.

### [x] Implementation Phase 4: Validation

<!-- parallelizable: false -->

* [x] Step 4.1: Run full project validation
  * Execute all lint commands (`pnpm lint`)
  * Execute build scripts for all modified components (`pnpm build`)
  * Run test suites covering modified code (`pnpm test`, `pnpm typecheck`)
  * Result: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`, and `corepack pnpm build` all passed during review remediation closure.
* [x] Step 4.2: Fix minor validation issues
  * Iterate on lint errors, type errors, and build warnings caused directly by the Speech integration
  * Result: Updated stale frontend store tests to match the speech-status-driven mic state.
* [x] Step 4.3: Report blocking issues
  * Document issues requiring additional research or follow-up planning
  * Avoid large-scale refactoring within this validation phase
  * Result: Documented the pre-existing frontend ESLint crash and the environment-specific root build-script PATH issue.

### [x] Implementation Phase 5: Review remediation and validation closure

<!-- parallelizable: false -->

* [x] Step 5.1: Add targeted websocket and session persistence tests
  * Details: .copilot-tracking/details/2026-03-10/azure-speech-stt-endpoint-details.md (Lines 220-236)
  * Result: Websocket/session coverage now directly exercises reconnect hydration, transcript persistence, feedback persistence, and session mismatch rejection.
* [x] Step 5.2: Remove retired raw-audio STT implementation surface
  * Details: .copilot-tracking/details/2026-03-10/azure-speech-stt-endpoint-details.md (Lines 238-251)
  * Result: Removed the unused backend `stt.ts` service and unused frontend `use-audio-capture.ts` hook from the source tree.
* [x] Step 5.3: Repair root validation ergonomics and re-run full validation
  * Details: .copilot-tracking/details/2026-03-10/azure-speech-stt-endpoint-details.md (Lines 253-268)
  * Result: Root lint and build validation now pass directly via `corepack pnpm lint` and `corepack pnpm build`, closing the remaining review findings.

## Planning Log

See `.copilot-tracking/plans/logs/2026-03-10/azure-speech-stt-endpoint-log.md` for discrepancy tracking, implementation paths considered, and suggested follow-on work.

## Dependencies

* Azure Speech resource credentials and token issuance capability
* Frontend dependency: `microsoft-cognitiveservices-speech-sdk`
* Existing Fastify route registration and websocket infrastructure
* Existing session persistence models in Prisma
* Browser microphone permissions in supported user environments

## Success Criteria

* Backend-issued Speech auth enables browser recognition without exposing long-lived Speech keys — Traces to: user requirement for Azure Speech SDK endpoint and research-selected auth model
* The Speech token broker is protected by authentication or equivalent abuse controls appropriate to the app boundary — Traces to: derived objective for backend token endpoint hardening
* Browser microphone transcription uses Azure Speech continuous recognition rather than 3-second chunk uploads — Traces to: user requirement for continuous speech-to-text and research-selected browser recognition path
* Finalized transcript events can be associated with a live interview session and reused by later feedback flows — Traces to: derived objective for durable session-backed transcript handling
* Finalized transcript events preserve optional timing metadata for future conversational turn-taking work — Traces to: derived objective for future-loop alignment without another protocol redesign
* The modified workspace passes lint, typecheck, tests, and builds after implementation — Traces to: final validation requirements for production-ready integration
