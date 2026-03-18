---
title: Future voice loop constraints research
description: Architectural constraints and best practices for a future interviewer and interviewee voice loop around Azure Speech in agentsgalore
author: GitHub Copilot
ms.date: 2026-03-10
ms.topic: reference
keywords:
  - azure speech
  - speech to text
  - text to speech
  - latency
  - turn taking
  - barge in
  - llm
estimated_reading_time: 11
---

## Research topics

* Identify architectural constraints for a future interviewer and interviewee voice loop built around Azure Speech
* Focus on how STT partial and final results could feed a later LLM call without designing the full feature
* Focus on how later LLM text could become Azure TTS without implementing that path yet
* Emphasize latency, turn-taking, interruption concerns, and Azure Speech features that influence the initial STT choice
* Ground the research in the current `agentsgalore` codebase and official Azure documentation

## Status

* Complete

## Current repo state

* `packages/frontend/src/hooks/use-audio-capture.ts` captures browser microphone audio with `MediaRecorder` and sends base64 chunks every 3000 ms
* `packages/frontend/src/hooks/use-interview-socket.ts` forwards raw audio chunks over the existing app WebSocket and plays assistant audio only after a complete audio payload arrives
* `packages/backend/src/routes/ws.ts` transcribes each received chunk independently, stores the returned text as a user message, and only calls the LLM when a separate `request_feedback` message arrives
* `packages/backend/src/services/stt.ts` uses Azure OpenAI Whisper on a chunked file-style transcription request, not continuous real-time STT
* `packages/backend/src/services/tts.ts` uses Azure OpenAI speech synthesis and returns a full audio buffer, not streamed chunks
* `packages/backend/src/services/llm.ts` only receives the latest finalized transcript text, so there is no distinction between interim speech, committed speech, and end-of-turn

## Key findings

### The current audio path is structurally high latency for conversational turn-taking

The current design batches microphone audio into 3-second chunks in the browser, base64-encodes each chunk, sends it to the backend, and runs file transcription on each chunk. That creates avoidable delay before the app can show or act on speech, and it prevents access to incremental recognition events.

For a future voice loop, this matters more than model quality. The user experience depends on how fast the app can detect that the candidate started speaking, is still speaking, or has finished speaking. Chunked upload plus file transcription gives only delayed finalized text. It does not naturally provide the partial and timing signals needed for fluid turn-taking.

### Azure Speech continuous recognition is the relevant STT primitive, not batch chunk transcription

Azure Speech SDK continuous recognition is built around long-lived recognition sessions. In JavaScript, the SDK exposes `startContinuousRecognitionAsync()` and `stopContinuousRecognitionAsync()`, and recognition results arrive through events such as `recognizing`, `recognized`, `canceled`, and `sessionStopped`.

This event model is the core architectural reason to prefer Azure Speech SDK for the first STT integration decision. It gives the app a clear separation between:

* Interim text that can update live UI or local speech state
* Final text that is safe to commit into conversation history
* Session and cancellation signals that can be used to recover, reconnect, or stop listening during state transitions

### Browser microphone capture is a browser concern for JavaScript

Microsoft documentation states that microphone recognition is supported in browser-based JavaScript environments, not in Node.js. That means a JavaScript app that wants true microphone-driven continuous recognition should treat the browser as the natural home of the recognizer if it wants the Speech SDK event stream.

This does not force the entire voice loop into the browser. It does mean the first STT decision is strongly influenced by where microphone recognition is actually supported for the JavaScript SDK.

### Partial results are useful, but they are not stable enough to commit directly into LLM history

Azure Speech returns mutable partial results in `Recognizing` events and final results in `Recognized` events. Microsoft notes that partial results can change while the utterance is still being processed and that punctuation is not available in partial results. Microsoft also documents a stable partial result threshold that reduces flicker by waiting for higher confidence words before returning partials.

Implication:

* Partial text is good for live transcript UI, candidate feedback indicators, and early interruption detection
* Final text is the safer unit for app state, durable transcript history, and later LLM prompts
* If the app sends every partial to the LLM, it risks duplicated context, unstable wording, and prompt churn

The initial STT integration should therefore introduce a distinction between preview speech and committed speech, even if the LLM remains text-only for now.

### Silence handling and segmentation directly shape turn-taking behavior

Azure Speech exposes segmentation controls that determine when a spoken phrase is treated as complete. Microsoft documents both segmentation silence timeout and initial silence timeout. Higher segmentation silence values produce longer phrases and slower finalization. Lower values produce shorter phrases and faster finalization, but they can split natural sentences too aggressively.

Microsoft also documents a known issue: setting the segmentation timeout above 1000 ms can cause hallucinated words in some cases, and the published workaround is to keep the default value of 650 ms.

This is highly relevant for an interview voice loop:

* If finalization is too slow, the interviewer waits too long before reacting
* If finalization is too eager, the candidate gets chopped into many tiny utterances and the LLM receives fragmented context
* Aggressive tuning too early can create accuracy regressions that look like model problems but are actually segmentation problems

For an initial STT integration, the safest posture is to stay near Speech defaults and validate with realistic interview speech before tuning silence behavior.

### Semantic segmentation is probably not the right default for the first interview loop

Azure Speech supports semantic segmentation in continuous recognition. Microsoft describes it as useful for dictation and captioning because it waits for semantically complete segments, often around sentence-ending punctuation, and avoids walls of text.

Microsoft also says semantic segmentation is intended for continuous recognition scenarios such as dictation and captioning, not interactive scenarios.

That makes it a risky default for an interviewer loop. It may produce cleaner finalized chunks, but it can also delay finalization until the service has enough evidence of sentence structure. For an interactive coding interview, low-friction turn detection is more important than perfectly sentence-shaped utterances at the outset.

### Word timing and offsets are available and are useful for future turn-state logic

Azure Speech recognition results include offsets and durations, and word-level timestamps can be requested for final results. These signals are useful later for transcript alignment, interruption heuristics, and deciding whether a user utterance is complete enough to send to the LLM.

The first STT integration does not need a full timing-driven state machine, but it should avoid throwing timing metadata away if the SDK already provides it.

### Real-time diarization and conversation transcription are not the first feature to optimize for

Azure Speech supports diarization and conversation transcription for multi-speaker scenarios. That is valuable when multiple humans speak into the same audio source.

For this product, the first voice-loop decision appears to be single local microphone input from one candidate, with the interviewer voice generated by the app itself. That means diarization is not the gating factor for the initial STT architecture. It is a possible future enhancement, not a prerequisite for the first continuous STT choice.

### Browser-direct STT requires a secure token story

Microsoft documentation and the browser React sample guidance point to token management patterns for browser-based microphone recognition. Microsoft also recommends Microsoft Entra authentication where possible and warns against embedding API keys directly in client code.

For this repo, that implies:

* Do not put a Speech key in the frontend bundle
* If the browser runs the Speech recognizer, the backend should issue short-lived Speech auth material or otherwise broker authentication
* The existing backend WebSocket can remain the orchestration channel for transcripts, prompts, and session state even if raw STT happens in the client

This is one of the biggest architectural constraints behind the initial STT choice. The moment STT moves into the browser, auth brokering becomes a required backend responsibility.

### Future TTS barge-in depends more on playback control and streaming than on voice quality

Microsoft documents that lower TTS latency comes from streaming audio as chunks arrive, pre-connecting, and reusing the `SpeechSynthesizer`. The Speech SDK also exposes synthesis lifecycle events such as `SynthesisStarted`, `Synthesizing`, `SynthesisCompleted`, and `SynthesisCanceled`.

That matters for future interruption behavior:

* If assistant audio is produced only as a full blob after synthesis completes, user barge-in will feel sluggish
* If assistant audio can begin on the first audio chunk and stop locally as soon as the user speaks, interruption becomes manageable
* Barge-in therefore depends on streaming and local playback cancelation, not only on STT accuracy

The current repo returns one full synthesized audio buffer to the browser. That is workable for push-to-play feedback, but it is not yet compatible with low-latency conversational interruption.

## Sources and evidence

### Workspace evidence

* `packages/frontend/src/hooks/use-audio-capture.ts`
* `packages/frontend/src/hooks/use-interview-socket.ts`
* `packages/backend/src/routes/ws.ts`
* `packages/backend/src/services/stt.ts`
* `packages/backend/src/services/tts.ts`
* `packages/backend/src/services/llm.ts`
* `.copilot-tracking/research/2026-03-10/azure-speech-sdk-stt-endpoint-research.md`
* `.copilot-tracking/research/subagents/2026-03-10/repo-audio-realtime-integration-research.md`

### Microsoft and Azure sources

* [How to recognize speech, JavaScript, including microphone support and continuous recognition](https://learn.microsoft.com/azure/ai-services/speech-service/how-to-recognize-speech)
* [SpeechRecognizer JavaScript API, including `recognizing`, `recognized`, `startContinuousRecognitionAsync`, and `stopContinuousRecognitionAsync`](https://learn.microsoft.com/javascript/api/microsoft-cognitiveservices-speech-sdk/speechrecognizer?view=azure-node-latest)
* [Captioning concepts, including partial versus final results and stable partial result threshold](https://learn.microsoft.com/azure/ai-services/speech-service/captioning-concepts#get-partial-results)
* [Get speech recognition results, including offsets, durations, and word timestamps](https://learn.microsoft.com/azure/ai-services/speech-service/get-speech-recognition-results#speech-synchronization)
* [How to recognize speech, silence handling and semantic segmentation](https://learn.microsoft.com/azure/ai-services/speech-service/how-to-recognize-speech#change-how-silence-is-handled)
* [Azure Speech known issues, including segmentation timeout guidance](https://learn.microsoft.com/azure/ai-services/speech-service/known-issues#active-known-issues-speech-sdk-runtime)
* [Role-based access control for Speech resources, including authentication with keys and tokens](https://learn.microsoft.com/azure/ai-services/speech-service/role-based-access-control#authentication-with-keys-and-tokens)
* [Quickstart: Recognize and convert speech to text, JavaScript](https://learn.microsoft.com/azure/ai-services/speech-service/get-started-speech-to-text)
* [How to synthesize speech from text, including synthesizer events](https://learn.microsoft.com/azure/ai-services/speech-service/how-to-speech-synthesis#subscribe-to-synthesizer-events)
* [Lower speech synthesis latency using Speech SDK](https://learn.microsoft.com/azure/ai-services/speech-service/how-to-lower-speech-synthesis-latency)
* [Quickstart: Create real-time diarization](https://learn.microsoft.com/azure/ai-services/speech-service/get-started-stt-diarization)

## Implications for today’s STT choice

### Recommended direction

For the next STT step, prefer browser-based Azure Speech SDK continuous recognition, paired with backend-issued Speech authentication, over continuing to evolve the current backend Whisper chunk-transcription path.

### Why this choice fits the current app

* It aligns with where JavaScript microphone recognition is supported
* It unlocks partial and final event separation without inventing a custom audio streaming protocol first
* It reduces latency by removing the current 3-second chunk batching from the recognition path
* It lets the existing backend WebSocket remain the control plane for interview state, committed transcript events, and later LLM requests
* It creates a clean foundation for future interruption handling because the browser can detect speech activity sooner than a backend file-transcription loop can

### What this means for the STT integration boundary

The first integration should treat STT as a local streaming recognizer that emits structured events such as:

* preview transcript updated
* final transcript committed
* recognition canceled or restarted
* local mic listening state changed

Only finalized transcript segments should be appended to conversation history or used as primary LLM input. Partial text should remain ephemeral unless the UI explicitly needs it.

### What should not be optimized first

* Do not optimize for diarization first
* Do not optimize for semantic segmentation first
* Do not tune silence thresholds aggressively before collecting interview-specific speech samples
* Do not design the full duplex TTS loop before the app can cleanly distinguish preview speech, committed speech, and end-of-turn

## Architectural constraints to carry forward

* The app needs separate state for interim transcript, final transcript, and assistant playback state
* The app needs an auth-broker pattern if Speech recognition runs in the browser
* The LLM boundary should accept only stable transcript units unless a future design explicitly supports speculative prompting
* The future TTS path should assume streaming and cancelable playback if barge-in is a product goal
* Recognition timing metadata should be preserved for future turn-state logic
* Existing backend Whisper chunk transcription is acceptable for coarse feedback, but it is a poor substrate for a conversational interviewer loop

## Follow-up research items

* Validate the best browser auth-broker pattern for Azure Speech in this repo, including token lifetime refresh and whether the backend should issue Speech tokens or Entra-backed auth artifacts
* Research browser playback cancelation and audio-ducking strategies so assistant TTS can stop immediately when the candidate interrupts
* Compare Azure Speech SDK browser-direct recognition with any viable backend streaming alternatives for cases where client-side SDK use is restricted
* Determine whether word-level timestamps and stable partial thresholds should be exposed in the app event model from day one or added later
* Research how to represent end-of-turn in the app state machine without over-calling the LLM on every short pause
* Evaluate whether future TTS should stay on Azure OpenAI audio synthesis or move to Azure Speech synthesis for better streaming control and lifecycle events

## Open questions

* None that block the initial STT architectural decision. The main remaining questions are implementation and product-tuning questions, not research gaps.
