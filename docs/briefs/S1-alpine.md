# S1: Ask a typed question, get a streamed answer

## Context
Empty repository. This slice builds the spine: the monorepo scaffolding, the
agent contract, and the thinnest end-to-end path from a typed question to a
streamed answer that is persisted. Everything else in the build hangs off it.
Constrained by ADR-003, ADR-004, ADR-006, ADR-008, ADR-009, ADR-010,
ADR-012, ADR-013, ADR-014, ADR-015, ADR-016, ADR-017 and ADR-018.

## Story
As a senior user, I want to type a question and watch the answer appear as
it is written, so that I never sit in front of a blank screen wondering
whether the app is working.

## In scope

Scaffolding
- Monorepo with npm workspaces: apps/mobile, apps/api, packages/contracts
  (ADR-008).
- Expo development build. Expo Go is not used.
- docker-compose.yml at the root bringing up Postgres 16 and nothing else.
- CLAUDE.md at the root, capped at 60 lines, without the domain vocabulary
  section for now. It states that the current slice brief is the only one in
  force and that closed ADRs outrank any subagent recommendation.
- .claude/rules/domain.md and .claude/rules/testing.md with paths
  frontmatter (ADR-009).
- .claude/settings.json with a PreToolUse hook blocking forbidden imports
  into apps/api/src/domain/** and a PostToolUse hook running the boundary
  lint after backend edits.
- .dependency-cruiser.js with three error-severity rules, and ESLint with
  max-classes-per-file 1, max-lines 200 on source and off on tests, and
  no-explicit-any as an error under domain/.
- npm run lint:boundaries, included in npm test.
- Config validated at boot: a missing provider API key fails at startup, not
  on the first user request.

Domain
- Value objects: ConversationId, MessageId, ModelId, TokenCount, Provenance,
  Usage.
- Message entity with typed content parts, private constructor, factories
  Message.fromUser and Message.fromAssistant (ADR-014).
- Conversation entity, thin: identity and timestamps (ADR-013).
- Domain events MessageCompleted and GenerationFailed (ADR-015).
- Ports in domain/ports: TextGenerationPort returning an AsyncIterable,
  ConversationRepository, MessageRepository, Clock, IdGenerator (ADR-012).
- Domain service AnswerGeneration: assembles the request, drives the stream,
  builds the completed Message with provenance and usage. It does not
  persist.
- Product policy as a versioned domain object holding the system prompt:
  short sentences, one instruction per line, numbered steps for procedures,
  no jargon, never "simply" or "just", admit uncertainty out loud.
- Typed domain errors: ConversationNotFound, ProviderUnavailable.

Application
- Use case AskQuestion: creates or loads the conversation, builds the user
  Message, calls AnswerGeneration, writes the assistant Message once when
  the turn closes (ADR-013).

Infrastructure
- One TextGenerationPort adapter for Gemini (ADR-017), normalising provider
  chunks inside the adapter so no provider type crosses the port.
- Drizzle schema and one migration creating conversations and messages.
  Content parts, provenance and usage stored as jsonb (ADR-010).
- Repository adapters with the row-to-domain mapping written by hand.
- HTTP: POST /conversations/:id/messages responding text/event-stream, with
  X-Accel-Buffering: no and compression disabled on that route (ADR-016).
- SSE events emitted: stage(thinking), stage(responding), message.delta,
  message.done carrying terminal state, provenance and usage, and error
  carrying the domain error class. No transcript events: transcription
  happens on the device (ADR-018).
- Structured logging with conversation id and request id, carrying latency,
  token usage, error class and message content passed through a redaction
  function. In this slice that function masks emails, phone numbers and
  card-shaped digit sequences. Where the boundary finally sits is D15; this
  slice ships the hook and one implementation (ADR-004).
- Composition root wiring every port. Nothing else constructs an adapter.

Contracts
- packages/contracts holds the request type and the SSE event union, hand
  written, imported by both sides.

Mobile
- One screen: text input, send button, answer area.
- Three states only: idle, thinking, responding.
- Visual reference: docs/briefs/assets/e1.png, e2.png and e3.png only.
  E4 to E8 are later slices and must not be built here. Accessibility
  values in this brief take precedence over anything measured off the
  images: verify 18pt body text and 60x60pt touch targets on device, not
  against the PNG.
- The support contact renders as "Contact Control+ support" with no phone
  number. The number in the design mockups is a placeholder in the 555
  range and must not ship.
- SSE consumed through an XHR-based reader, since EventSource is not native
  in React Native and Hermes does not implement ReadableStream on fetch.
- Streamed text buffered so the tree does not re-render per token.
- Accessibility baseline: 18pt minimum body text, 60x60pt touch targets,
  labelled controls, icons paired with text labels.

## Out of scope
- Stop and cancellation, and the turn state machine. S2 and D16.
- Conversation history across turns and context assembly. S3 and D8.
- Image input and attachments. S4.
- Voice, transcription and TranscriptionPort. S5. Note that transcription
  happens on the device (ADR-018), so nothing in this slice should
  anticipate an audio upload endpoint or transcript events in the stream.
- The OpenAI adapter, for either capability. S5 and S10.
- Timeouts, retries, and failure UI beyond rendering the error event. S9 and
  D14.
- Conversation cost totals and pricing. Usage is captured on the Message
  here; the total is S7 and D12.
- Control+ user context and its port. S8.
- AI disclosure in the interface. S6. Provenance ships here.
- Full log field coverage and redaction across every use case. S11.
- Provider fallback. S10.
- The evaluation harness. S12.
- Authentication, accounts, user management. Out of the exercise entirely.

## Acceptance criteria

1. Given a clean machine with Docker running, when the reviewer follows the
   README, then the database comes up, migrations run, the API starts and
   the app builds, with no manual steps beyond the documented commands.

2. Given the app is open, when the user types a question and taps send, then
   the screen shows the thinking label within 500ms of the tap, before any
   answer text exists.

3. Given a question has been sent, when the provider begins streaming, then
   answer text appears progressively and the label changes to the responding
   state.

4. Given a completed answer, when the stream closes, then a message row
   exists whose provenance records that it was AI generated with the model
   and provider that produced it, and whose usage records input and output
   token counts.

5. Given a completed turn, when the logs are inspected, then exactly one
   structured line exists for that turn carrying conversation id, request
   id, latency and token usage, with an email address in the question
   rendered masked rather than in clear.

6. Failure path: given the provider returns an error or is unreachable, when
   the user has sent a question, then the stream emits an error event
   carrying ProviderUnavailable, the screen shows a plain sentence with no
   code and no provider text, and no assistant message row is written.

7. Given any source file under apps/api/src/domain importing from
   infrastructure, application, or a package outside the allowlist, when
   npm test runs, then it fails and the message names both layers.

## Technical notes
- Ports touched: TextGenerationPort, ConversationRepository,
  MessageRepository, Clock, IdGenerator.
- The Gemini adapter targets the Interactions API, not generateContent,
  which Google now marks as the previous version. Do not pick the older one.
- Layer rules apply in full. The provider SDK appears only inside its
  adapter. No Date.now() or crypto.randomUUID() under domain/.
- Cancellation is not built here, but the adapter must already abort the SDK
  stream in a finally block when iteration stops, so S2 wires the UI rather
  than reworking the adapter (ADR-012).
- Usage crosses the port as a domain value object on the completion chunk,
  not as a loose field.
- Message.fromAssistant requires provenance, a terminal state and usage. A
  Message that cannot satisfy that must not be constructible.
- Do not relitigate the port shape, the aggregate boundary, the transport,
  the engine, or the repo layout. All are closed ADRs.
- Run this brief as a single session. Do not invoke autopilot, ralph or
  ultrawork: they are designed not to stop, and the Out of scope section
  depends on stopping.
- Delegate domain work with model=opus. The invariants in Message and
  AnswerGeneration are where a cheaper model produces plausible code that
  violates a closed ADR.
- The guard rails (hooks, rules, dependency-cruiser, ESLint config) are
  written in this slice and never edited afterwards, including by an agent
  that finds them inconvenient.

## Tests required
- Domain: Message.fromAssistant rejects construction without provenance,
  without usage, or without a terminal state. Message.fromUser rejects
  provenance. A user message requires at least one content part.
- Domain: AnswerGeneration produces a Message whose provenance names the
  model and provider from the completion chunk.
- Application: AskQuestion against in-memory fakes of every port, asserting
  one write at turn close and the emitted domain events.
- Application: AskQuestion when the generation port throws, asserting
  GenerationFailed and that no assistant message is written.
- Adapter contract: the shared TextGenerationPort suite against recorded
  fixtures, covering chunk normalisation and usage on completion.
- Persistence: the repository adapter against a real Postgres, asserting
  round trip of content parts, provenance and usage through jsonb.
- Redaction: an email, a phone number and a card-shaped digit sequence are
  masked; ordinary prose is untouched.
- End to end: one happy path over real HTTP with a stubbed provider,
  asserting the SSE event sequence.

## Done when
The acceptance criteria pass, npm test is green including lint:boundaries,
and the flow has been run once on a real iOS device.

## Size
Estimated 4h, of which roughly 2.5h is scaffolding committed by ADR-008,
ADR-009 and ADR-010 rather than by this slice. Record the actual time when
the session closes; the running budget needs real numbers.