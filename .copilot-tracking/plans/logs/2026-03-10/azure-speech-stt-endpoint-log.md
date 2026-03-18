<!-- markdownlint-disable-file -->
# Planning Log: Azure Speech STT Endpoint

## Discrepancy Log

Gaps and differences identified between research findings and the implementation plan.

### Unaddressed Research Items

* None currently identified.

### Plan Deviations from Research

* None currently identified.

## Implementation Paths Considered

### Selected: Browser Speech SDK with backend token broker

* Approach: Use `microsoft-cognitiveservices-speech-sdk` in the browser for continuous recognition, broker auth through a Fastify token route, and send finalized transcript events through the application’s realtime layer.
* Rationale: Best match for Microsoft’s browser guidance, lowest latency path, and strongest fit with the current frontend-backend split.
* Evidence: `.copilot-tracking/research/2026-03-10/azure-speech-sdk-stt-endpoint-research.md`

### IP-01: Backend-mediated Azure Speech streaming relay

* Approach: Relay microphone audio through the backend and stream or proxy it to Azure Speech from server-side code.
* Trade-offs: Centralizes control, but adds transport complexity and works against the browser-first JavaScript microphone support model.
* Rejection rationale: Higher complexity with weaker alignment to the documented Speech SDK browser path.

### IP-02: Keep backend Whisper-style chunk transcription

* Approach: Preserve the existing `MediaRecorder` plus websocket plus backend transcription model and swap the backend speech provider later.
* Trade-offs: Minimal short-term change, but retains three-second chunk latency and lacks a clean partial/final event model.
* Rejection rationale: Poor fit for responsive conversation and a weak foundation for the future interviewer voice loop.

## Suggested Follow-On Work

* WI-01: Design TTS streaming and interruption behavior — Plan the assistant speech playback path after STT is stable, including cancelation and latency targets. (high)
  * Source: `.copilot-tracking/research/subagents/2026-03-10/future-voice-loop-constraints-research.md`
  * Dependency: Completion of browser Speech STT and transcript event flow

* WI-02: Define automatic feedback turn-taking rules — Decide when finalized speech should automatically trigger an LLM request versus remaining button-driven. (medium)
  * Source: `.copilot-tracking/research/2026-03-10/azure-speech-sdk-stt-endpoint-research.md`
  * Dependency: Availability of final transcript events and realistic latency measurements

* WI-03: Evaluate Entra-based Speech authentication — Assess whether the project should evolve from key-backed token issuance to Microsoft Entra-backed auth for production hardening. (low)
  * Source: `.copilot-tracking/research/subagents/2026-03-10/azure-speech-sdk-continuous-stt-research.md`
  * Dependency: Initial key-backed token broker working end to end

* WI-06: Design explicit session resume behavior — Decide whether page refreshes should reuse an existing interview session through URL state or local persistence. (low)
  * Source: Phase 3 implementation
  * Dependency: Current session bootstrap flow remaining stable

## User Decisions

* ID-01: Address review findings in implementation — Proceed with remediation for websocket/session test coverage, stale legacy STT paths, and validation ergonomics within the current implementation thread
  * Rationale: The user explicitly requested that the review findings be addressed rather than deferred
