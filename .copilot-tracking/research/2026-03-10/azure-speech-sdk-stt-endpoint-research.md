<!-- markdownlint-disable-file -->
# Task Research: Azure Speech SDK STT Endpoint

Research how to add Azure Speech-to-Text using the Speech SDK for continuous microphone capture and transcription in this workspace, with an emphasis on endpoint design, browser microphone flow, streaming patterns, and implementation groundwork for a future interviewer/interviewee voice loop.

## Task Implementation Requests

* Research how to add an endpoint for Azure Speech-to-Text using the Speech SDK.
* Determine how a user microphone can be opened and streamed continuously to produce text.
* Gather documentation and implementation guidance for integrating Azure Speech into the existing app.
* Capture higher-level considerations for future text-to-speech and LLM round trips without implementing them yet.

## Scope and Success Criteria

* Scope: Research only. Cover Azure Speech SDK capabilities, browser/server integration options, security considerations, endpoint design choices, and fit with this monorepo. Exclude implementation changes outside this research document.
* Assumptions:
  * The workspace is a TypeScript monorepo with a web frontend and Node backend.
  * The product goal is live interviewer-style conversation using STT now, then LLM feedback and TTS later.
  * Azure AI Speech is the intended STT/TTS provider.
* Success Criteria:
  * Identify viable integration approaches for continuous speech transcription.
  * Determine the recommended architecture for this repository.
  * Provide implementation-oriented examples, file references, and pitfalls.
  * Cite Azure documentation and codebase evidence.

## Outline

1. Research Azure Speech SDK capabilities for continuous recognition.
2. Inspect relevant frontend and backend code paths for audio, sockets, and service boundaries.
3. Evaluate browser-direct versus backend-mediated recognition patterns.
4. Select a recommended approach and document next implementation steps.

## Potential Next Research

* Investigate Azure Speech Text-to-Speech response loop design after STT path is selected.
  * Reasoning: The higher-level goal includes a spoken interviewer voice and interruption handling.
  * Reference: `.copilot-tracking/research/subagents/2026-03-10/future-voice-loop-constraints-research.md`

* Validate the preferred authentication broker pattern for browser Speech SDK use in this repo.
  * Reasoning: Browser microphone recognition should not expose a long-lived Speech key.
  * Reference: [Authenticate requests to Azure AI services](https://learn.microsoft.com/azure/ai-services/authentication)

* Define end-of-turn rules before auto-triggering LLM feedback.
  * Reasoning: Partial and final transcript events arrive differently, and over-triggering on brief pauses would make the interview flow feel twitchy.
  * Reference: [How to recognize speech](https://learn.microsoft.com/azure/ai-services/speech-service/how-to-recognize-speech)

## Research Executed

### File Analysis

* `packages/frontend/src/app/interview/[questionId]/page.tsx`
  * Couples mic start and stop to websocket audio upload flow; the current live interview path is question-scoped and does not use `sessionId`.
* `packages/frontend/src/hooks/use-audio-capture.ts`
  * Captures browser microphone audio with `MediaRecorder`, emits base64 chunks every 3000 ms, and does not expose partial recognition semantics.
* `packages/frontend/src/hooks/use-interview-socket.ts`
  * Transports `audio_chunk`, `code_update`, and `request_feedback` messages over websocket, and appends transcript and feedback messages into the client store.
* `packages/backend/src/routes/ws.ts`
  * Decodes base64 audio chunks, calls backend STT on each chunk, and keeps transient in-memory conversation state per websocket connection.
* `packages/backend/src/services/stt.ts`
  * Uses Azure OpenAI Whisper deployment for file-style transcription, not Azure AI Speech SDK continuous recognition.
* `packages/backend/src/services/tts.ts`
  * Uses Azure OpenAI audio synthesis and returns a full audio buffer, which is workable for push playback but not yet optimized for streaming or interruption.
* `packages/backend/src/routes/sessions.ts`
  * Existing REST session layer can anchor future persistent transcript state, but the current interview page bypasses it.
* `packages/backend/prisma/schema.prisma`
  * Already has `InterviewSession` and `SessionMessage` models that can store finalized utterances.
* `.env.example`, `packages/backend/.env.example`, `README.md`
  * Currently document Azure OpenAI speech-related variables only; no `AZURE_SPEECH_*` pattern exists yet.

### Code Search Results

* `audio_chunk`
  * Found in `packages/shared/src/index.ts` and `packages/backend/src/routes/ws.ts`; confirms the current protocol is built around raw audio upload to the backend.
* `request_feedback`
  * Found in websocket types and backend route; confirms feedback is currently a manual action instead of an automatic response to finalized speech.
* `SessionMessage`
  * Found in Prisma schema and session routes; confirms a persistence seam already exists for durable transcript history.
* `AZURE_OPENAI_`
  * Found throughout env examples and README; confirms Azure OpenAI is the only currently documented speech provider.

### External Research

* Microsoft Learn: `How to recognize speech`
  * Browser microphone recognition is supported in browser JavaScript, not in Node.js, and continuous recognition uses `startContinuousRecognitionAsync()` with event callbacks.
    * Source: [How to recognize speech](https://learn.microsoft.com/azure/ai-services/speech-service/how-to-recognize-speech)
* Microsoft Learn: `Quickstart: Recognize and convert speech to text`
  * Confirms the JavaScript Speech SDK setup flow and browser-oriented microphone usage.
    * Source: [Get started with speech to text](https://learn.microsoft.com/azure/ai-services/speech-service/get-started-speech-to-text)
* JavaScript SDK reference: `SpeechRecognizer`
  * Documents `recognizing`, `recognized`, `canceled`, `sessionStarted`, `sessionStopped`, `speechStartDetected`, and `speechEndDetected` events.
    * Source: [SpeechRecognizer JavaScript API](https://learn.microsoft.com/en-us/javascript/api/microsoft-cognitiveservices-speech-sdk/speechrecognizer?view=azure-node-latest)
* JavaScript SDK reference: `AudioConfig`
  * Documents `AudioConfig.fromDefaultMicrophoneInput()` and `AudioConfig.fromMicrophoneInput(deviceId)` for browser microphone capture.
    * Source: [AudioConfig class](https://learn.microsoft.com/en-us/javascript/api/microsoft-cognitiveservices-speech-sdk/audioconfig?view=azure-node-latest)
* Microsoft Learn: `Authenticate requests to Azure AI services`
  * Confirms API keys must not be exposed publicly and that STS tokens are valid for 10 minutes.
    * Source: [Authenticate requests to Azure AI services](https://learn.microsoft.com/azure/ai-services/authentication)
* JavaScript SDK reference: `SpeechConfig`
  * Notes that recognizers copy configuration at creation time, so token refresh on a live recognizer must update the recognizer itself, not only the source config.
    * Source: [SpeechConfig class](https://learn.microsoft.com/en-us/javascript/api/microsoft-cognitiveservices-speech-sdk/speechconfig?view=azure-node-latest)
* Azure sample: `AzureSpeechReactSample`
  * Demonstrates the practical browser pattern of a backend token endpoint plus client-side `SpeechConfig.fromAuthorizationToken(...)`.
    * Source: [AzureSpeechReactSample](https://github.com/Azure-Samples/AzureSpeechReactSample)
* Microsoft Learn: `Captioning concepts`
  * Explains that partial results are mutable and punctuation is not available until finalization; useful for UI, risky for durable history.
    * Source: [Captioning concepts](https://learn.microsoft.com/azure/ai-services/speech-service/captioning-concepts#get-partial-results)
* Microsoft Learn: `Get speech recognition results`
  * Describes offsets, durations, and word timestamps that may later be useful for turn-taking heuristics.
    * Source: [Get speech recognition results](https://learn.microsoft.com/azure/ai-services/speech-service/get-speech-recognition-results#speech-synchronization)
* Microsoft Learn: `Known issues` and `silence handling`
  * Warns against increasing segmentation timeout beyond 1000 ms and suggests keeping default behavior initially.
    * Source: [How to recognize speech](https://learn.microsoft.com/azure/ai-services/speech-service/how-to-recognize-speech#change-how-silence-is-handled)
    * Source: [Azure Speech known issues](https://learn.microsoft.com/azure/ai-services/speech-service/known-issues#active-known-issues-speech-sdk-runtime)
* Microsoft Learn: Speech synthesis docs
  * Useful for future TTS planning because low-latency playback and barge-in depend on streaming and cancellation control.
    * Source: [How to synthesize speech from text](https://learn.microsoft.com/azure/ai-services/speech-service/how-to-speech-synthesis#subscribe-to-synthesizer-events)
    * Source: [Lower speech synthesis latency using Speech SDK](https://learn.microsoft.com/azure/ai-services/speech-service/how-to-lower-speech-synthesis-latency)

### Project Conventions

* Standards referenced: Azure instructions; Task Researcher mode requirements.
* Instructions followed: Research-only changes under `.copilot-tracking/research/`; external claims grounded in Microsoft documentation and subagent research.

## Key Discoveries

### Project Structure

The repository already has most of the seams needed for a clean Azure Speech integration, but they are pointed at the wrong speech primitive for this use case.

* Frontend interview flow:
  * `packages/frontend/src/app/interview/[questionId]/page.tsx:37-67`
  * `packages/frontend/src/hooks/use-audio-capture.ts:15-47`
  * `packages/frontend/src/hooks/use-interview-socket.ts:17-82`
* Backend realtime and services:
  * `packages/backend/src/routes/ws.ts:36-152`
  * `packages/backend/src/services/stt.ts:1-18`
  * `packages/backend/src/services/tts.ts:9-18`
  * `packages/backend/src/services/llm.ts:1-64`
* Persistence layer ready for future transcript durability:
  * `packages/backend/src/routes/sessions.ts:5-102`
  * `packages/backend/prisma/schema.prisma:50-77`

The important structural observation is that the app already separates audio capture, websocket orchestration, LLM feedback, and persistence. That means the recommended change is not a full rewrite; it is a swap of the STT boundary from “backend chunk transcription” to “browser continuous recognizer plus backend auth broker.”

### Implementation Patterns

Three implementation patterns were identified:

1. **Selected:** browser-side Azure Speech SDK continuous recognition with a backend token endpoint.
2. **Possible but not preferred:** backend-mediated streaming or relay of raw audio to Azure Speech.
3. **Rejected for this scenario:** continue using backend chunk transcription with Whisper-style uploads.

Why the selected pattern wins:

* JavaScript microphone recognition is supported in the browser, not Node.js.
* Continuous recognition emits partial and final events directly.
* It avoids the current 3-second chunk latency caused by `MediaRecorder` uploads.
* It keeps Azure credentials out of the frontend bundle by using short-lived backend-issued tokens.
* It fits the current architecture, where the websocket can remain the control plane for text events, code context, and feedback requests.

Critical gotchas:

* Speech auth tokens last 10 minutes and must be refreshed during long interview sessions.
* Refreshing a `SpeechConfig` alone does not update an already-created recognizer.
* Partial transcripts are mutable and should not be committed directly to conversation history.
* Silence tuning can change responsiveness and quality; defaults are the safest first step.

### Complete Examples

```ts
import * as SpeechSDK from 'microsoft-cognitiveservices-speech-sdk';

type SpeechTokenResponse = {
  token: string;
  region: string;
};

export async function createContinuousRecognizer(
  getToken: () => Promise<SpeechTokenResponse>,
  onPartial: (text: string) => void,
  onFinal: (text: string) => void,
  onCanceled: (reason: string) => void,
) {
  const { token, region } = await getToken();
  const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(token, region);
  speechConfig.speechRecognitionLanguage = 'en-US';

  const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
  const recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);

  recognizer.recognizing = (_, event) => {
    if (event.result.text) onPartial(event.result.text);
  };

  recognizer.recognized = (_, event) => {
    if (event.result.text) onFinal(event.result.text);
  };

  recognizer.canceled = (_, event) => {
    onCanceled(event.errorDetails || event.reason?.toString() || 'Recognition canceled');
  };

  await new Promise<void>((resolve, reject) => {
    recognizer.startContinuousRecognitionAsync(resolve, reject);
  });

  return recognizer;
}
```

### API and Schema Documentation

Azure Speech SDK APIs most relevant to this task:

* `SpeechSDK.AudioConfig.fromDefaultMicrophoneInput()`
  * Browser microphone capture.
* `SpeechSDK.AudioConfig.fromMicrophoneInput(deviceId)`
  * Optional microphone device selection.
* `SpeechSDK.SpeechConfig.fromAuthorizationToken(token, region)`
  * Preferred browser auth path when a backend issues short-lived tokens.
* `SpeechSDK.SpeechRecognizer`
  * Event-driven recognizer for partial and final speech results.
* `startContinuousRecognitionAsync()` / `stopContinuousRecognitionAsync()`
  * Required for continuous microphone sessions.

Relevant existing schema and app contracts:

* `packages/shared/src/index.ts:84-93`
  * Current websocket messages: `code_update`, `audio_chunk`, `request_feedback`.
* `packages/backend/prisma/schema.prisma:50-77`
  * `InterviewSession` and `SessionMessage` can store finalized speech turns later.

### Configuration Examples

```env
# Existing Azure OpenAI settings remain unchanged.

# Backend only
AZURE_SPEECH_KEY=your_speech_resource_key
AZURE_SPEECH_REGION=eastus
# Optional if you prefer endpoint-based config instead of region
# AZURE_SPEECH_ENDPOINT=https://your-custom-subdomain.cognitiveservices.azure.com/

# Frontend-safe
NEXT_PUBLIC_SPEECH_LOCALE=en-US
```

## Technical Scenarios

### Continuous Speech-to-Text in Browser-Based Interview Flow

The app needs low-latency microphone transcription that can power a conversational interview experience. The current path records `MediaRecorder` chunks in the browser every three seconds, uploads them to the backend, and transcribes each chunk with Azure OpenAI Whisper. That works for rough transcription, but it is poorly matched to a live interviewer loop because it cannot emit stable partials, speech start/end events, or fast finalization boundaries.

**Requirements:**

* Continuous microphone capture from the browser.
* Incremental speech recognition results.
* Backend compatibility with existing realtime/session architecture.
* Secure handling of Azure Speech credentials.
* A path that keeps future LLM and TTS loop work viable without forcing a second STT redesign.

**Preferred Approach:**

* Use the Azure Speech SDK in the browser for continuous microphone recognition.
* Add a backend token endpoint, for example `GET /api/speech/token`, that exchanges the backend-held Speech key for a short-lived token.
* Keep the websocket for coordination and app events, but stop sending raw audio chunks through it.
* Send finalized transcript segments over the existing realtime layer and preserve partial text only in client state unless explicitly needed by the UI.
* Thread `sessionId` into the live interview flow so final utterances can later be persisted into `SessionMessage` rows.

```text
Browser microphone
  -> Azure Speech SDK recognizer in frontend
    -> partial transcript in local UI/store
    -> final transcript sent through app websocket or persisted via backend
      -> backend merges code context + transcript
        -> LLM feedback
          -> future Azure Speech TTS or existing audio path

Backend responsibilities
  -> issue short-lived Speech token
  -> keep Speech key private
  -> accept finalized transcript events
  -> maintain session and conversation history
Pending
```

**Implementation Details:**

Recommended insertion points:

* Add backend route module such as `packages/backend/src/routes/speech.ts`.
  * Register it in `packages/backend/src/server.ts:23-28`.
  * Endpoint shape: `/api/speech/token`.
* Replace or augment `packages/frontend/src/hooks/use-audio-capture.ts:15-47` with a browser Speech SDK hook.
  * Suggested name: `useAzureSpeechRecognition`.
  * Responsibilities:
    * fetch token
    * create recognizer
    * start and stop continuous recognition
    * emit partial and final transcript events
    * expose status and permission errors
* Rework `packages/frontend/src/hooks/use-interview-socket.ts:63-72`.
  * Use it for `code_update`, final transcript delivery, feedback requests, and later TTS coordination.
  * Remove raw `audio_chunk` transport from the preferred path.
* Extend `packages/shared/src/index.ts:84-93`.
  * Likely new event types:
    * `transcript_partial`
    * `transcript_final`
    * `speech_status`
    * `session_bound`
* Introduce `sessionId` earlier in the interview flow.
  * Current live route only uses `questionId`.
  * Existing session APIs already exist in `packages/backend/src/routes/sessions.ts:5-102`.
* Store only final transcript segments durably.
  * Partial results should remain ephemeral because they can change.

Pitfalls to avoid:

* Do not put a Speech key in the browser.
* Do not assume token refresh is automatic for an already-created recognizer.
* Do not feed every partial result into the LLM.
* Do not aggressively tune silence segmentation on day one.
* Do not rely on the current 3-second `MediaRecorder` path if the goal is responsive conversation.

```ts
type TranscriptEvent =
  | { type: 'transcript_partial'; text: string }
  | { type: 'transcript_final'; text: string; sessionId: string; questionId: string }
  | { type: 'speech_status'; status: 'idle' | 'listening' | 'recognizing' | 'error'; error?: string };

async function onFinalTranscript(text: string) {
  websocket.send(
    JSON.stringify({
      type: 'transcript_final',
      text,
      questionId,
      sessionId,
      code: latestEditorCode,
    }),
  );
}
```

#### Considered Alternatives

1. **Browser Azure Speech SDK + backend token endpoint** — **Selected**
   * Benefits:
     * Best alignment with Microsoft browser guidance.
     * Lowest latency path available in this architecture.
     * Exposes partial and final recognition events cleanly.
     * Keeps secrets server-side.
   * Trade-offs:
     * Requires token issuance and refresh handling.
     * Requires client-side recognizer lifecycle management.

2. **Backend streaming relay to Azure Speech** — Not selected for the first implementation
   * Benefits:
     * Centralizes Azure integration on the backend.
     * May simplify some audit or control requirements.
   * Drawbacks:
     * Adds transport complexity.
     * Fights the JavaScript SDK’s browser-first microphone support model.
     * Duplicates low-latency audio streaming work that the Speech SDK already solves in the browser.

3. **Continue current backend chunk transcription flow** — Rejected for this scenario
   * Benefits:
     * Reuses existing code.
   * Drawbacks:
     * Three-second chunk latency.
     * No stable partial/final event model.
     * Weak foundation for interruption, turn-taking, and future voice conversation.

## Selected Approach

The recommended approach for this repository is **browser-side Azure Speech SDK continuous recognition with a backend-issued short-lived Speech token endpoint**, while retaining the existing websocket and session architecture as the application control plane.

Why this is the best fit:

* It matches Microsoft’s documented JavaScript support model for microphone recognition.
* It gives the frontend the exact event boundaries needed for conversational UX: partial, final, canceled, and session lifecycle events.
* It removes the current 3-second chunking bottleneck.
* It keeps Azure credentials secure.
* It preserves future options for LLM turn logic and TTS interruption handling.

## Actionable Next Steps for Implementation

1. Add backend Speech configuration variables and a token route.
2. Add a frontend Speech SDK hook using `startContinuousRecognitionAsync()`.
3. Introduce explicit transcript event types and speech status in shared/frontend state.
4. Stop transporting raw audio blobs on the preferred path.
5. Thread `sessionId` through the live interview route so final utterances can be persisted and associated with later LLM responses.
6. Only after STT works cleanly, research and design the TTS streaming and interruption path.

## Evidence Log

### Workspace References

* `packages/frontend/src/app/interview/[questionId]/page.tsx:37-67`
* `packages/frontend/src/hooks/use-audio-capture.ts:15-47`
* `packages/frontend/src/hooks/use-interview-socket.ts:17-82`
* `packages/frontend/src/stores/interview-store.ts:48-57`
* `packages/backend/src/routes/ws.ts:36-152`
* `packages/backend/src/routes/sessions.ts:5-102`
* `packages/backend/src/services/stt.ts:1-18`
* `packages/backend/src/services/tts.ts:9-18`
* `packages/backend/src/services/llm.ts:1-64`
* `packages/backend/prisma/schema.prisma:50-77`
* `packages/shared/src/index.ts:84-93`
* `.env.example:1-15`
* `README.md:25-33`
* `README.md:131-159`
* `README.md:215-222`

### Supporting Research Documents

* `.copilot-tracking/research/subagents/2026-03-10/azure-speech-sdk-continuous-stt-research.md`
* `.copilot-tracking/research/subagents/2026-03-10/repo-audio-realtime-integration-research.md`
* `.copilot-tracking/research/subagents/2026-03-10/future-voice-loop-constraints-research.md`
