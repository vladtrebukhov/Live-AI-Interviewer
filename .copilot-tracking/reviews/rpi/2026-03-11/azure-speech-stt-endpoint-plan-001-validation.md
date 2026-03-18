---
title: Azure Speech STT endpoint Phase 1 validation
description: Validation of Phase 1 backend Speech token broker and configuration against the plan, changes log, research, and workspace evidence
author: GitHub Copilot
ms.date: 2026-03-11
ms.topic: review
---

## Scope

This review validates Phase 1, Backend Speech token broker and configuration, using these artifacts:

* Plan: `/Users/vlad/Development/Projects/agentsgalore/.copilot-tracking/plans/2026-03-10/azure-speech-stt-endpoint-plan.instructions.md`
* Changes log: `/Users/vlad/Development/Projects/agentsgalore/.copilot-tracking/changes/2026-03-10/azure-speech-stt-endpoint-changes.md`
* Research: `/Users/vlad/Development/Projects/agentsgalore/.copilot-tracking/research/2026-03-10/azure-speech-sdk-stt-endpoint-research.md`

The validation focus is limited to environment configuration, backend route creation and registration, token issuance security posture, and validation claims.

## Verdict

* Status: Partial
* Coverage assessment: Phase 1 implementation is substantially present, but the phase is not fully satisfied because Step 1.3 remains open and the logged fallback validation trail is incomplete.

The backend implementation aligns well with the selected research path. The repository now documents Azure Speech environment variables, exposes a dedicated `/api/speech/token` broker, keeps the long-lived Speech key on the backend, and applies anonymous abuse controls that fit the current unauthenticated app boundary. The remaining gap is validation closure, not core implementation.

## Requirement coverage

### Step 1.1, configuration contract and route scaffold

This step is satisfied.

The plan marks Step 1.1 complete and ties it to the Phase 1 through-line (`.copilot-tracking/plans/2026-03-10/azure-speech-stt-endpoint-plan.instructions.md:63-64`). The detail spec requires Azure Speech env variables, a dedicated route module, route registration, a stable response contract, and room for caller verification (`.copilot-tracking/details/2026-03-10/azure-speech-stt-endpoint-details.md:12-29`).

The workspace evidence matches those requirements:

* The root env example documents backend-only Speech credentials and a frontend-safe locale at `.env.example:7-14`.
* The backend package env example mirrors the backend-only Speech variables at `packages/backend/.env.example:6-10`.
* The backend server imports and registers the Speech route at `packages/backend/src/server.ts:4-7` and `packages/backend/src/server.ts:24-30`.
* The new route defines a stable response shape with `token`, `region`, optional `endpoint`, and `expiresInSeconds` at `packages/backend/src/routes/speech.ts:15-20` and returns that payload at `packages/backend/src/routes/speech.ts:162-172`.

This implementation also matches the research recommendation to add a backend token endpoint with backend-held credentials and frontend-safe configuration examples (`.copilot-tracking/research/2026-03-10/azure-speech-sdk-stt-endpoint-research.md:238-245`, `.copilot-tracking/research/2026-03-10/azure-speech-sdk-stt-endpoint-research.md:265-265`, `.copilot-tracking/research/2026-03-10/azure-speech-sdk-stt-endpoint-research.md:375-375`).

### Step 1.2, secure token issuance, validation, and failure handling

This step is satisfied.

The detail spec requires backend-only token exchange, explicit error handling, and either authentication or equivalent anonymous abuse controls such as rate limiting, origin validation, and session-bound checks (`.copilot-tracking/details/2026-03-10/azure-speech-stt-endpoint-details.md:40-55`). The plan also calls out keeping credentials off the frontend and protecting `/api/speech/token` with the strongest available boundary (`.copilot-tracking/plans/2026-03-10/azure-speech-stt-endpoint-plan.instructions.md:21-23`, `.copilot-tracking/plans/2026-03-10/azure-speech-stt-endpoint-plan.instructions.md:127-128`).

The route implementation provides the expected protections and failure branches:

* Origin normalization and request-origin extraction appear at `packages/backend/src/routes/speech.ts:22-42`.
* IP-based rate limiting appears at `packages/backend/src/routes/speech.ts:44-58`.
* Session or question scope validation appears at `packages/backend/src/routes/speech.ts:68-98`.
* Upstream Speech token exchange uses the backend-held subscription key and a 5-second timeout at `packages/backend/src/routes/speech.ts:100-115`.
* The route enforces origin validation, missing-config handling, body validation, scope validation, and upstream failure handling at `packages/backend/src/routes/speech.ts:118-185`.
* CORS is restricted to `FRONTEND_URL` at `packages/backend/src/server.ts:15-17`, which supports the route-level origin boundary.

This implementation aligns with the research guidance that API keys must not be exposed publicly, STS tokens are short-lived, browser recognition should use backend-issued auth material, and the selected architecture is a browser Speech SDK plus backend token endpoint (`.copilot-tracking/research/2026-03-10/azure-speech-sdk-stt-endpoint-research.md:96-102`, `.copilot-tracking/research/2026-03-10/azure-speech-sdk-stt-endpoint-research.md:149-163`, `.copilot-tracking/research/2026-03-10/azure-speech-sdk-stt-endpoint-research.md:319-320`, `.copilot-tracking/research/2026-03-10/azure-speech-sdk-stt-endpoint-research.md:346-375`).

### Step 1.3, backend token broker validation

This step is only partially satisfied.

The plan leaves Step 1.3 unchecked and says Phase 1 validation depends on a backend build plus workspace lint, while noting that workspace lint is blocked by a pre-existing frontend ESLint/plugin failure (`.copilot-tracking/plans/2026-03-10/azure-speech-stt-endpoint-plan.instructions.md:67-70`). The detail spec requires `pnpm --filter @agentsgalore/backend build` and `pnpm lint` as the validation commands (`.copilot-tracking/details/2026-03-10/azure-speech-stt-endpoint-details.md:65-71`).

The changes log also admits that workspace lint could not serve as the sole Phase 1 gate, and it substitutes backend build, focused backend lint, and backend route tests as the fallback evidence (`.copilot-tracking/changes/2026-03-10/azure-speech-stt-endpoint-changes.md:41-46`, `.copilot-tracking/changes/2026-03-10/azure-speech-stt-endpoint-changes.md:89-94`).

Session validation performed during this review produced these results:

* `corepack pnpm --filter @agentsgalore/backend build` passed on 2026-03-11.
* `corepack pnpm lint` failed with the same frontend ESLint/plugin crash described in the plan and changes log while linting `packages/frontend/eslint.config.mjs`.
* `NODE_ENV=test corepack pnpm exec vitest run packages/backend/src/routes/__tests__/speech.test.ts` passed.

That evidence supports the logged lint blocker, but it does not fully close Step 1.3 because the required workspace lint command still fails and the replacement "focused backend lint" path is not captured in a reproducible repo-level entry point.

## Findings by severity

### Major findings

1. Phase 1 is not fully satisfied because the planned validation step remains open.

   The plan keeps Step 1.3 unchecked and explicitly requires backend build plus workspace lint (`.copilot-tracking/plans/2026-03-10/azure-speech-stt-endpoint-plan.instructions.md:67-70`; `.copilot-tracking/details/2026-03-10/azure-speech-stt-endpoint-details.md:65-71`). The code implementation is present, but the required workspace lint gate still fails, so the phase cannot be marked fully complete.

2. The changes log claims a "focused backend lint" fallback, but the repository does not provide a reproducible backend lint entry point.

   The fallback validation claim appears at `.copilot-tracking/changes/2026-03-10/azure-speech-stt-endpoint-changes.md:41-43` and the validation summary repeats it at `.copilot-tracking/changes/2026-03-10/azure-speech-stt-endpoint-changes.md:89-94`. The root package exposes only workspace-wide `lint` and root `build` scripts at `package.json:10` and `package.json:17`, while the backend package exposes `dev`, `build`, and `start` only at `packages/backend/package.json:7-9`. That leaves the alternate lint validation path undocumented and hard to reproduce.

### Minor findings

1. Automated coverage for Phase 1 safeguards is narrower than the changes log wording suggests.

   The changes log says the route test file covers token issuance behavior and route safeguards (`.copilot-tracking/changes/2026-03-10/azure-speech-stt-endpoint-changes.md:15-16`). The current test file exercises only unexpected-origin rejection and valid question-scope issuance at `packages/backend/src/routes/__tests__/speech.test.ts:42-89`. The source route also contains rate limiting, missing-config handling, scope mismatch handling, 404 scope rejection, and upstream failure handling at `packages/backend/src/routes/speech.ts:44-58`, `packages/backend/src/routes/speech.ts:68-98`, `packages/backend/src/routes/speech.ts:134-159`, and `packages/backend/src/routes/speech.ts:173-184`, but those branches are not covered by the visible tests in this file.

## Coverage assessment

The phase has high implementation coverage and partial validation coverage.

* Environment configuration is implemented and documented in both env examples.
* Backend route creation and registration are implemented.
* Token issuance security posture is implemented with sensible anonymous abuse controls for the current app boundary.
* Validation closure is incomplete because the required workspace lint gate remains blocked and the substitute backend-only lint path is not reproducibly documented.

## Clarifying questions

1. What exact command or artifact was used to support the changes log statement that "focused backend lint" passed for Phase 1?

If that command exists outside the tracked scripts, adding it to the validation record or package scripts would make this phase easier to mark complete on re-validation.
