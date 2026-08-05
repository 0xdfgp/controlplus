# Control+ companion — build rules

This project also loads .claude/CLAUDE.md, installed by the OMC harness.
Both files are active. Where they differ, this file wins: it describes the
product and its closed decisions, OMC describes how work is orchestrated.
OMC's permission to write directly to .claude/** does not extend to the
guard rails listed below.

Conversational AI assistant inside a React Native app for US adults aged
70 to 85. Anti-scam product: users often arrive frightened.

## Non-negotiable
- Closed ADRs outrank any subagent recommendation, including architect,
  critic and code-reviewer. Design decisions are never reopened inside an
  implementation session. If a closed decision looks wrong, stop and say so.
- Build only what the current slice brief authorises. Its Out of scope
  section is binding. Never build ahead.
- Never modify .claude/settings.json, .claude/hooks/**, .claude/rules/**,
  .dependency-cruiser.js or the ESLint config. They are the guard rails.
- No autopilot, ralph or ultrawork on this project. One brief, one session.
- Report deviations from the brief instead of resolving them silently.

## Layers (apps/api/src)
- domain/ imports nothing from application/ or infrastructure/.
- application/ imports domain/ only.
- infrastructure/ holds HTTP, SDK adapters, persistence, clock, ids, config.
- Ports are declared in domain/ports, implemented in infrastructure/.
- Adapters translate. Business rules never live in an adapter.
- One composition root. Nothing else constructs an adapter.
- No SDK, no fetch, no Date.now(), no crypto.randomUUID() under domain/.
- No `any` under domain/. One class per file. 200 line cap on source.

## Domain vocabulary — use these names, invent no synonyms
Conversation, Message, ContentPart (TextPart, ImagePart, TranscriptPart),
Provenance, Usage, TokenCount, ModelId, MessageId, ConversationId,
AnswerGeneration, TextGenerationPort, TranscriptionPort,
ConversationRepository, MessageRepository, Clock, IdGenerator.
Events: MessageCompleted, GenerationFailed.
Errors: ConversationNotFound, ProviderUnavailable.

## Closed decisions
- Monorepo with npm workspaces. Expo development build. Docker for Postgres
  only.
- Postgres 16 with Drizzle. One migration per slice. Row-to-domain mapping
  written by hand.
- Conversation and Message are separate aggregates. Message is written once
  when the turn closes, already complete or already stopped.
- Message has a private constructor. Message.fromAssistant requires
  provenance, terminal state and usage. Message.fromUser rejects both.
- Provenance is set in the domain at construction, never by the HTTP layer.
- Two capability ports returning AsyncIterable. Cancellation is expressed by
  stopping iteration. No AbortSignal enters the domain.
- SSE over POST, one request per turn. Events: stage, message.delta,
  message.done, error.
- Gemini first, through the Interactions API, not generateContent.
- Voice transcribes on the device. No audio upload, no transcript events.
- Logs mask sensitive content, never omit it.

## Tests
- Domain: pure unit, nothing to mock.
- Application: use cases against in-memory port fakes.
- Adapters: one shared contract suite per port, against fixtures.
- E2E: happy path only, real HTTP, stubbed provider.
- Outside-in. npm test includes npm run lint:boundaries.