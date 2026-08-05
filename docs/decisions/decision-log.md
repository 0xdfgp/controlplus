# 04-decision-log

Living document. Every closed decision gets an entry. The assistant drafts it when a decision closes and writes it straight into this page.

This log is the raw material for the architecture explanation in the submission, and the evidence for "an architectural decision I made personally". Keep it honest, including the ones I reversed.

The list of open decisions lives in `06-work-breakdown.md`, not here, so the two cannot drift.

## Entry template

```
### ADR-00X: <decision name>
Date:
Status: accepted | superseded by ADR-00Y

Context
Two or three lines. What forced the decision, what constraints applied.

Options considered
A: <name>. One line summary.
B: <name>. One line summary.

Decision
What I chose and, in a sentence or two, the reason that actually
drove it. Not a list of every pro.

Consequences
What this makes easy. What this makes hard. What we now owe the
backlog.

Revisit when
The signal that would change our minds.
```

## Closed decisions

Six decisions were settled before the design work started. They shape everything downstream. ADR-007 onwards are closed during the architecture work.

### ADR-001: Control+ user context is in scope, behind a port

Status: accepted

Context

The brief scopes the companion to questions beyond Control+'s existing features and does not require auth, which suggested a standalone prototype. The product is an anti-scam service for older adults, where knowing the user's recent scan and threat history changes what a good answer looks like.

Options considered

A: Standalone assistant, no access to Control+ data, seam left as a backlog note.

B: A defined user context port, in scope, with a stub adapter in the prototype.

Decision

B. The interface is designed properly, with a real contract and real types. The adapter returns fixed sample data because there is no Control+ API to call in this exercise. A vague placeholder port would defeat the purpose; a concrete one shows where the boundary between our domain and their existing services sits.

Consequences

Costs roughly thirty to forty minutes. Adds a failure mode (context unavailable) that the reliability work has to cover. Makes the personalisation rules in `03-senior-ux-principles.md` live rather than hypothetical. The shape of the contract is a guess at Control+'s data model and is declared as such.

Revisit when

A real Control+ API contract becomes available, at which point the stub adapter is replaced and nothing else changes.

### ADR-002: No human handoff in this build

Status: accepted

Context

A user describing an active scam is the central case for this product. Whether Control+ operates a staffed support channel is not established from public information.

Options considered

A: Model handoff as a domain concept now, with an event and a routing path.

B: No handoff. The assistant answers directly with protective guidance, and the published support contact appears as a static link.

Decision

B. Building a routing path to a channel that may be automated would be designing for an assumption. The static contact link stays because a visible way to reach the company reassures a frightened user regardless.

Consequences

Handoff and account-administrator notification move to the backlog. The scam handling policy in the domain has to be good enough to stand alone, since there is nothing to escalate to.

Revisit when

Control+ confirms a staffed channel, or the EU Digital Fairness Act lands with a consumer right to human contact.

### ADR-003: Real persistence, not an in-memory store

Status: accepted

Context

The brief permits an in-memory or local store, and the conventional answer is an in-memory repository behind a clean port with the production alternative explained in the README.

Options considered

A: In-memory repository, production alternative documented.

B: A real database with migrations, running on Docker locally.

Decision

B. The in-memory default is a habit from when infrastructure code was slow to write. With AI assistance the schema, migrations and repository adapter are quick enough that the shortcut buys very little, and persisting properly removes a class of "works until you restart it" behaviour while turning the production story from a README paragraph into running code.

Consequences

Database calls become one more external dependency needing timeouts, a bounded pool and defined behaviour when unreachable. Conversation content now sits at rest, which raises retention and access questions the prototype does not solve. The in-memory implementation survives as a test double for application-layer tests, which is where it belonged anyway.

Revisit when

Never for this exercise. Engine and migration tooling remain open.

### ADR-004: Mask sensitive data in logs rather than excluding content

Status: accepted

Context

An earlier position kept all message content, transcripts and attachments out of application logs, framed as appropriate care for a security product handling US consumer data.

Options considered

A: No message content in logs at all.

B: Content logged with sensitive data masked at a single redaction boundary.

Decision

B. The requirement was to handle sensitive data carefully, not to go blind. A conversational product is non-deterministic by construction, so its output cannot be reasoned about without seeing what was said and returned. Without that there is no way to investigate a bad answer, detect a prompt regression or build an evaluation set from real traffic. Observability is one of the most important properties of this system.

Consequences

A redaction boundary has to be designed and tested. Deterministic masking catches structured identifiers such as card numbers, emails and phone numbers; it does not catch sensitive information expressed in free prose, which here is most of it. Masking narrows exposure, it does not remove it. The full monitoring stack is deferred past the MVP as a documented decision rather than an omission.

Revisit when

Real traffic exists, at which point retention windows and access controls stop being optional.

### ADR-005: Both platforms, iOS first

Status: accepted

Context

An earlier assumption restricted the demo recording to one platform, which was ambiguously worded and read as restricting the prototype itself.

Options considered

A: One target platform for the prototype.

B: Both platforms, with one prioritised.

Decision

B. React Native covers both at this size, so restricting the build saves almost nothing. Everything repeatable is done for both. iOS is the primary, because it is the device I own and can verify end to end. The demo recording is still made on a single device, because recording quality matters more than showing the same flows twice.

Consequences

Audio capture is the one place the platforms genuinely diverge: output formats, permission flows and denial handling. The backend has to accept whatever both produce. Anything not verified on Android is stated as such rather than implied to work.

Revisit when

The founder states a platform preference or shares how their user base splits.

### ADR-006: Provenance marking implemented, not deferred

Status: accepted

Context

Machine-readable marking of AI-generated output had been filed as a backlog item on the grounds that the prototype serves no EU users. Two distinct obligations had also been collapsed into one: telling the user they are talking to an AI, and marking the generated content itself.

Options considered

A: Defer marking, implement disclosure only.

B: Implement both, treated separately.

Decision

B. The provenance metadata costs well under an hour, so deferring it saved nothing worth the paperwork of deferring it. Disclosure lives in the interface; marking travels with the content so any system that later consumes or exports it can tell what produced it.

Consequences

The Message aggregate carries provenance (AI-generated, model, provider), set in the domain on completion and included in the API response, the stream completion event and the stored record. Honest limit for the write up: for plain text there is no settled watermarking standard, so this is metadata-level provenance rather than an embedded signal, and text copied out of the app loses the marker.

Revisit when

A workable text watermarking standard exists.

### ADR-007: Slice sequence and cut line

Date: 2026-08-05

Status: accepted

Context

The MLP bar was already fixed by the brief, the six pre-kickoff ADRs and the "do not cut" list in `05-mlp-definition.md`, so D1 reduced to one open question: the order of the vertical slices in `08-implementation-briefs.md` and where the timebox cut line falls.

Options considered

A: Build strictly to the tabled order, retrofitting provenance at S6 and the redaction boundary at S11.

B: Resequence. Fold the aggregate-level parts of S6 and S11 into S1, promote S9 ahead of S7 and S8, and place the cut line after S11.

Decision

B. Provenance is set in the domain when a message completes (ADR-006), so adding it at S6 reopens the Message aggregate and every use case that constructs one. Inside S1 it is roughly twenty minutes on a slice that is already building Message. The same argument applies to the structured log line and its redaction hook (ADR-004): a logging boundary added after eleven slices is a retrofit across all of them. S9 moves up because every failure state it adds is a UI change, and UI changes get more expensive as screens multiply.

Sequence: S1, S2, S3, S4, S5, S9, S7, S8, S6, S11, cut line, S10, S12.

Consequences

S1 grows by roughly 20 to 30 minutes and now carries provenance on Message and the structured log line with its redaction hook. S6 narrows to the disclosure interface, the "are you a person" policy and its test. S11 narrows to log fields, latency, token usage, error classes and redaction coverage across every use case. S1's brief now depends on six closed decisions rather than three: D4, D5 and D6, plus D2 (repo and runtime shape), D3 ([CLAUDE.md](http://CLAUDE.md) and the boundary lint rule, which is written in the first slice) and D11 (persistence engine and migration tool). D16 is deferred to S2, where impossible states first appear. If the timebox bites, S10 ships as designed-not-wired with a backlog entry, and S12 degrades to running the four fixture questions by hand rather than disappearing, because the comparison itself is a deliverable.

Revisit when

S1 overruns materially, or the build shows that provenance and usage cannot be set at completion on a cancelled stream, which would move part of S1 into S2.

### ADR-008: Monorepo, Expo development build, Docker for the database only
Date: 2026-08-05
Status: accepted

Context
D2 asked where the code lives and how it starts: one repository or two,
Expo or bare React Native, how the HTTP contract types travel between app
and backend, and where the Docker setup committed by ADR-003 sits. It
blocks the S1 brief, which cannot name a folder without it.

Options considered
A: Two repositories, contract types duplicated by hand or published as a
   package.
B: One monorepo with npm workspaces, contract types in a shared package,
   Expo with a development build, docker-compose for the database only.

Decision
B. The submission is handed over as a Git link and has to run on a clean
machine in five minutes, which a single repository with one README serves
better than two. Expo with a development build gives the native modules
that audio capture and camera need on both platforms (ADR-005) without
configuring Xcode and Gradle by hand. Expo Go is ruled out for exactly
that reason: it cannot load the native modules this build requires.

Layout: apps/mobile, apps/api, packages/contracts. The contract types are
hand-written in packages/contracts and imported by both sides, with no
code generation step. docker-compose.yml at the root brings up the
database and nothing else; the API and the app run on the host.

Consequences
The contract package becomes the place where a breaking API change shows
up as a type error rather than a runtime surprise, which is worth more
than generation at this size. Hand-written types can drift from what the
API actually returns, so the end-to-end test over real HTTP is the thing
that catches it. Expo prebuild output (ios/ and android/) is committed or
regenerated, and that choice belongs to the S1 brief rather than here.
Roughly 45 minutes of the 2h setup line.

Revisit when
A native module turns out to be unavailable under Expo, which would mean
ejecting to bare React Native, or the contract package starts carrying
domain logic instead of transport types.

### ADR-009: Agent contract as paired statements and sensors
Date: 2026-08-05
Status: accepted

Context
D3 asked what goes in CLAUDE.md and what enforces the layer boundaries.
Claude Code loads CLAUDE.md and .claude/rules/*.md as context, not as
enforced configuration; the documented way to block an action regardless
of what the agent decides is a hook. The agent is non-deterministic, so a
statement lowers the probability of a violation and never removes it.

Options considered
A: One CLAUDE.md carrying every rule, with a build-time lint as the only
   sensor.
B: Every rule that matters gets a statement that prevents it and a sensor
   that catches it, with statements split by scope and sensors split
   between edit time and build time.

Decision
B. CLAUDE.md holds only what applies in every session and is capped at 60
lines, because files past 200 lines consume more context and reduce
adherence. Layer-specific rules live in .claude/rules/*.md with paths
frontmatter, so they load only when the agent touches matching files.
Sensors: a PreToolUse hook that blocks writes into apps/api/src/domain/**
carrying a forbidden import, a PostToolUse hook that runs the boundary
lint after any backend edit, dependency-cruiser over the full import
graph, and ESLint for one class per file, a 200 line cap on source, and
no `any` under domain/. All of it runs in npm run lint:boundaries, which
is part of npm test.

Third-party subagents (wshobson/agents marketplace) are in use for
implementation. CLAUDE.md states that closed ADRs outrank any subagent
recommendation and that design decisions are not reopened inside a coding
session, because agents such as architect-review carry their own opinions
about layering and have not read this log.

Consequences
Roughly 1.5h against a 2h setup line that already held 1.25h, so setup
runs about 0.5h over budget and that time comes from somewhere else.
eslint-plugin-boundaries was rejected: it reasons file by file, while
dependency-cruiser sees transitive and type-only imports and names both
layers in the failure message. The domain vocabulary cannot go into
CLAUDE.md until D6 closes, so S1 ships a version without it. Outside-in
unit tests and happy-path-only e2e are recorded here but belong to D17,
which opens with them already settled.

Revisit when
The PreToolUse hook fires often enough to be noise rather than a guard, or
a subagent produces a recommendation that contradicts a closed ADR, which
would mean the CLAUDE.md line is not doing its job and the sensor has to
move into the hook.

### ADR-010: Postgres with Drizzle, one migration per slice
Date: 2026-08-05
Status: accepted

Context
ADR-003 committed to a real database with migrations on Docker, leaving
the engine, the migration tool and the question of how the query builder
stays out of the domain. D11 blocks the S1 brief, which cannot name a
persistence adapter without it.

Options considered
A: Kysely with kysely-ctl. Typed query builder, no generated entities,
   every migration written by hand.
B: Drizzle with drizzle-kit. Typed query builder, no generated entities,
   migrations generated from a declared schema and reviewable as SQL
   before they are applied.

Decision
B, on Postgres 16. Kysely and Drizzle are equivalent on the point that
decides this: both return plain rows, neither puts a decorator on
anything, and the mapping to domain objects has to be written by hand
either way. They separate on migrations. Twelve slices means roughly
twelve migrations, and generating the DDL from a declared schema saves
twenty to thirty minutes of hand-written up and down blocks and removes a
class of column-level typos. drizzle-kit also ships with the library,
where Kysely needs kysely-ctl, a community CLI moving on its own release
schedule.

Prisma was rejected earlier in the same decision and is recorded here
because the reason generalises: its generated client carries entity types
that tend to become the model, which contradicts the rule in
02-architecture-principles.md that no entity carries a decorator or a type
from a persistence library.

Postgres over SQLite because the production story has to be credible, and
because jsonb carries usage and provenance metadata without inventing
columns for fields whose shape is still open at D6 and D12.

Consequences
The Drizzle schema is a model that lives somewhere, so the temptation to
import InferSelectModel as a domain type is real. Smaller than the Prisma
risk, larger than the Kysely one. The boundary lint already blocks it:
drizzle-orm is not on the domain allowlist, and the repository adapter
under infrastructure/persistence is the only place that sees a row.

Migrations land one per slice rather than as a single init written on day
one. The history then shows the schema evolving with the build, and each
migration is small enough to be tested when it is written.

Only the engine, the tooling and the hand-written mapping rule are settled
here. The tables are not: their shape follows the aggregate, which is D6,
and they are specified in the S1 brief.

Roughly 45 minutes, inside the 0.75h ADR-003 already reserved for the
adapter and migrations.

Discovered in the ADR-020 amendment: a change to the shape of a jsonb
payload produces no DDL, so drizzle-kit generates nothing and the migration
is a data backfill written by hand. The generated-from-schema argument
covers columns, not payload shapes. Anything living inside jsonb is
protected by the mapper and its tests, not by the migration.

Revisit when
The generated DDL needs hand correction often enough that the saving is
gone, or a domain type turns out to be imported from the Drizzle schema,
which would mean the allowlist is not tight enough.

### ADR-011: Voice goes through transcription, never as native audio
Date: 2026-08-05
Status: accepted

Context
D10 asked whether a recorded voice message reaches the model as audio or as
text. Verified in August 2026: Anthropic's Messages API accepts text and
images but not audio, Gemini accepts audio natively in the generation call,
and OpenAI has a dedicated file transcription path that supports streaming
over SSE. So both routes were technically available through at least one
eligible provider.

Options considered
A: Send audio natively to a model that accepts it, one hop, no transcript.
B: Transcribe first, then talk to the generation model in text only.

Decision
B, on cost across turns rather than on latency. Audio bills roughly an
order of magnitude more input tokens than the equivalent transcript, and
because attachments stay in conversation context, a native-audio turn is
re-paid on every follow-up. Follow-ups working is the fourth MLP criterion,
so the multiplier lands exactly where the product is strongest.

03-senior-ux-principles.md had already settled the same question from the
other side: the transcript must be shown before or alongside the answer so
a mis-transcription is visible and correctable. That rule requires a text
transcript to exist. Native audio could only mean dropping the transcript,
which breaks the rule, or transcribing anyway and paying for both.

Consequences
One more hop, so one or two seconds before generation starts on a twenty
second recording. Covered by a distinct "Writing down what you said" state
rather than silence, per 03.

Non-verbal signal is lost. A frightened user describing a scam conveys
something in tone that a transcript does not carry. Stated in the write up
as a known limitation rather than defended; it is also not established that
a model uses that signal well, and the transcript was required regardless.

Realtime voice-to-voice is not the extension of this path. It is a
different architecture with a different transport, WebSocket or WebRTC, and
no intermediate text. D19 says so explicitly instead of implying an adapter
gets us there.

Cost accounting gets simpler: audio seconds are billed by the transcription
service, tokens by the generation service, two separate ledger lines rather
than one blended calculation. That makes D12 cheaper.

A voice turn now uses two providers by design, which is why the provider
port boundary splits by capability (D5).

Revisit when
A frontier provider prices audio input close to text, or an evaluation
shows the tone signal changes answer quality enough to pay for it.

### ADR-012: Capability ports in the domain, driven by a domain service
Date: 2026-08-05
Status: accepted

Context
D5 asked where the boundary with model providers sits and what shape it
has. ADR-011 settled that a voice turn transcribes first and then talks to
the generation model in text, so a single turn already uses two providers
by design. 02-architecture-principles.md requires the assistant's
behavioural rules to live in the domain as versioned product policy.

Options considered
A: Two capability ports declared in application/, with a pure policy object
   producing a request that the use case carries to the provider.
B: Two capability ports declared in domain/, driven by a domain service
   that conducts generation.

Decision
B. In a product whose domain is conversing, generating an answer belongs in
the domain language, and the port that produces it belongs beside the
repository port rather than in orchestration. It also keeps the door open
for policy that reacts to what the model returned, which the scam-handling
rules will eventually want.

Shape:
- domain/ports: TextGenerationPort, TranscriptionPort. Providers implement
  only the capabilities they have; Anthropic appears on generation only.
  Both return an AsyncIterable, transcription included, because streaming
  transcription exists on the OpenAI file path and 03-senior-ux-principles
  requires a visible, correctable transcript rather than an opaque wait.
- domain/services: AnswerGeneration. Assembles the request from the
  conversation, the product policy and the user context, drives the stream,
  and builds the completed Message with provenance and usage. It does not
  persist; the use case does.
- infrastructure: one adapter per provider per capability. Normalisation of
  provider chunks happens inside the adapter, so no ChatCompletionChunk or
  Gemini part crosses the boundary. Usage crosses as a domain value object
  on the completion chunk, not as a loose field.
- Composition root wires each port independently, so capability routing is
  wiring rather than a runtime capability check.

Cancellation is expressed, not modelled. The consumer stops iterating, the
runtime calls return() on the iterator, and the adapter aborts the SDK
stream in its finally block. No AbortSignal and no invented cancellation
type enters the domain, which keeps the layer rule intact at no cost.

Consequences
Fallback has to be defined per port rather than per provider, and that is
now honest rather than inconvenient: with transcription and generation in
different hands, one provider's fallback is not the other's. D14 inherits
this.

One shared contract suite per port, which every adapter must pass. Two
suites instead of one.

Known wobble: TranscriptionPort has no domain service calling it; the use
case invokes it directly before assembly. It sits in domain/ because
Transcript is a domain concept and this port is what produces one, the same
argument that puts the repository port there. Recorded because it is the
weakest part of this decision, not because it is settled beyond argument.

Roughly 70 minutes against the 3h provider adapters line.

Revisit when
A third capability appears that neither port covers, which realtime
voice-to-voice will be, or the AnswerGeneration service turns out to need
persistence mid-stream, which would mean the aggregate boundary in D6 is
wrong.

### ADR-013: Conversation and Message as separate aggregates, one write per turn
Date: 2026-08-05
Status: accepted

Context
D6 asked where the aggregate boundary sits. The candidate invariant that
would have justified a Conversation root holding its messages was "no two
assistant responses in flight at once". The product is a single-user chat
driven by one client, so that race does not occur. The remaining candidate
invariant was the conversation cost total, which is a sum and can be
computed. A second question rode along: when a streamed message is written.

Options considered
A: Conversation as the aggregate root, Message an internal entity, one
   write per turn through the root, running usage total held as state.
B: Conversation and Message as separate aggregates, Message holding a
   ConversationId, conversation total computed as a projection.

Decision
B, with a single write when the turn closes rather than incremental writes
during the stream. Writing a message no longer loads the conversation.
AnswerGeneration drives the stream and returns a finished Message, complete
or marked as stopped; the use case writes it once.

Progressive rendering is unaffected and is not what this decides. Chunks
reach the client as they arrive, per ADR-012. What is decided here is only
when the row is written.

Consequences
Accepted failure mode: if the process dies or the user loses connectivity
mid-stream, the partial answer is lost entirely. Cancellation is not
affected, because stopping also closes the turn and the partial is written
with what it had. This is a deliberate trade, taken knowing that
05-mlp-definition.md treats a saving under an hour as work rather than a
cut. It was allowed here because the lost case is a failure mode the brief
does not name and the core journey does not include, and because the user
experiences it as "it cut off, I will ask again".

Message therefore has no in-flight state. It is written once, already
complete or already stopped, which keeps provenance and usage (ADR-006) set
at construction with no row existing without them.

Conversation is thin: identity, timestamps, and little else. It carries few
invariants, and the write up should say so plainly rather than present it
as a rich aggregate. The consistency that matters in this product lives in
Message, which is constructed valid or not at all.

The conversation cost total becomes a computed projection over messages
rather than maintained state. D12 inherits that and has to decide where the
sum happens and how it is exposed.

Roughly 45 minutes, against the 3h backend line.

Revisit when
Losing a partial on disconnect turns out to matter in use, which would mean
inserting the row at stream start with a streaming state and updating it on
a throttle, roughly 35 minutes and a lifecycle invariant on Message. Or a
second concurrent writer appears, for example a second device on the same
account, which would put the in-flight invariant back on the table.

### ADR-014: One Message entity with typed content parts
Date: 2026-08-05
Status: accepted

Context
D6 asked what a Message is when it carries text, an image, a transcript, a
partial body and provenance. ADR-006 requires provenance on every assistant
message, set in the domain at construction. ADR-013 means a Message is
written once, already complete or already stopped.

Options considered
A: One Message entity holding a list of typed content parts, with role and
   role-dependent metadata.
B: UserMessage and AssistantMessage as separate types, invariants
   structural.

Decision
A. Content parts (TextPart, ImagePart, TranscriptPart) match how the
problem is actually shaped: a voice question is a transcript, a screenshot
question is an image plus text, and both are one message from the user.
Anything traversing history does so uniformly, and the write up can state
that adding video is a new part rather than a new message type.

The three provider APIs also model content as typed blocks, verified in
August 2026. That is convergence, not imitation, and 02-architecture-
principles.md still governs: the domain part types are ours, and no
provider block type crosses the port.

Invariants, since this option does not get them from the type system:
- Constructor is private. Two named factories: Message.fromUser and
  Message.fromAssistant.
- fromAssistant requires provenance, a terminal state (completed or
  stopped) and usage, and accepts exactly one TextPart.
- fromUser requires at least one part and rejects provenance and usage.
- An attachment is referenced, never embedded; the bytes live wherever D9
  decides.

Consequences
The provenance guarantee is enforced by a factory rather than by a type, so
it is one test rather than a compiler error. That test is not optional: it
is the thing making ADR-006 true.

Adding video is a new part type and a new branch in prompt assembly and in
the persistence mapping, and nothing else.

Persistence has one shape rather than two. Parts are stored as jsonb
(ADR-010), which suits a list whose variants will grow.

Roughly 50 minutes, against the 3h backend line.

Revisit when
The role-dependent rules in the factories outgrow what a reader can hold at
once, which would mean the type split in option B was the right call after
all.

### ADR-015: No sensitivity marking in the model, two domain events
Date: 2026-08-05
Status: accepted

Context
Two remaining parts of D6. First, whether content sensitive enough to
redact is marked as such in the model, which ADR-004 left open and which is
a prerequisite for one of the options in D15. Second, which domain events
exist, given that 02-architecture-principles.md asks for events where the
rest of the system reacts.

Decision, marking
No marking. A TextPart is text. Marking would mean running the detector on
the hot path, at message construction, for a consumer that is a log line,
and then persisting a judgement about the content alongside the content.
A9 already states that deterministic redaction catches structured
identifiers and not sensitive information expressed in prose, which here is
most of it, so a persisted mark would advertise a precision the mechanism
does not have.

Both D15 options stay open: a domain policy can receive text and decide
without the text arriving pre-marked. What closes is the variant of D15
that assumed persisted marks, which was the weakest of them.

Decision, events
Two, both carrying the member identity so the backlog claim about
administrator notification stays true.

- MessageCompleted: conversationId, messageId, terminal state, provenance,
  usage. Emitted by Message.fromAssistant.
- GenerationFailed: conversationId, domain error class, provider. Emitted
  by AnswerGeneration when a port fails.

Rejected: ConversationStarted, which nothing listens to; MessageStopped,
because stopped is a terminal state already inside MessageCompleted; and
UsageRecorded, which duplicates what MessageCompleted already carries.

Consequences
Today both events have one real consumer, the structured log line in S1.
That is ceremony, and it is worth it only because emitting them costs
minutes now while retrofitting them would touch every use case, and
because the backlog already promises that notification is a subscriber
away.

The conversation cost total remains a projection (ADR-013). It does not
need an event to stay correct, so D12 decides where the sum happens
without inheriting an event-sourcing shape it does not want.

Redaction now unambiguously works on text rather than on marked objects,
so D15 is a question about where the boundary sits, not about what it
receives.

Roughly 25 minutes on top of ADR-014.

Revisit when
A consumer appears that needs to know a message was stopped without
inspecting terminal state, or free-prose detection becomes reliable enough
that marking would mean something.

### ADR-016: SSE over POST, with a staged event vocabulary
Date: 2026-08-05
Status: accepted

Context
D4 asked which transport carries the stream to the client and what events
the client needs. 03-senior-ux-principles.md requires the second to be
settled before the first, because every stage of the wait needs a plain
language label driven by real backend events rather than guessed at by the
client. D4 was the last decision blocking the S1 brief.

Verified in August 2026, and one of these corrected an earlier claim of
mine. Hermes does not implement ReadableStream on fetch, so RN clients read
SSE through an XHR-based reader and EventSource needs a polyfill; WebSocket
is native in RN. SSE is what every major LLM streaming API uses, and the
current default recommendation is SSE for LLM output, with WebSocket
reserved for genuinely bidirectional flows: voice agents, mid-generation
human approval, multi-device interaction. None of those is in scope.

Options considered
A: SSE over POST, XHR-based reader on the client.
B: WebSocket, one socket per turn, stop sent as a message.

Decision
A. During generation this product is unidirectional. The only client action
mid-turn is Stop, and under SSE that is aborting the request, which is a
strong signal rather than a weak one: closing the underlying HTTP
connection is detected in a few hundred milliseconds, at which point the
use case stops iterating and the adapter aborts the provider stream in its
finally block (ADR-012). That matters in money as well as UX, because a
provider keeps billing for tokens nobody is reading.

Choosing WebSocket would buy reconnection, heartbeat and connection state
management, all of which D14 would inherit, in exchange for capabilities
this product does not use.

Event vocabulary, one POST per turn responding text/event-stream:
- stage: transcribing | thinking | responding. This is what makes the
  labels in 03 backend-driven rather than client-guessed.
- transcript.delta and transcript.done, because TranscriptionPort returns
  an AsyncIterable (ADR-012) and the transcript must be visible and
  correctable before the answer.
- message.delta, the answer text.
- message.done, carrying terminal state, provenance and usage (ADR-006).
- error, carrying the domain error class, which the client maps to plain
  language. Never a raw code or provider message.

Consequences
The client takes a dependency for SSE reading, since EventSource is not
native in RN. It must be verified on a real device rather than a simulator,
because the Hermes failure is silent at runtime.

Proxy buffering has to be handled from the first slice: X-Accel-Buffering:
no and no compression on the streaming route. It is invisible locally and
appears at the worst moment otherwise.

One turn is one request, so the structured log line correlates a turn to a
request with no extra work (ADR-004).

Known limitation to state in the write up rather than hide: the full
production shape separates the prompt request from the response stream and
keeps a token store so a dropped client can resume. ADR-013 already
accepted losing the partial on disconnect. We know what the complete shape
is and chose not to build it.

Realtime voice-to-voice is not reached from here. ADR-011 already recorded
it as a different architecture with its own transport.

Roughly 40 minutes, against the 3h provider adapters and streaming line.

Revisit when
Mid-generation client-to-server interaction appears, such as tool approval
or interruption that is not a plain stop, which is the condition under
which the current consensus moves to WebSocket.

### ADR-017: Gemini first, OpenAI second
Date: 2026-08-05
Status: accepted

Context
The S1 brief needs a TextGenerationPort adapter and no ADR named a
provider. D18, the evaluation, comes later. Verified in August 2026:
Gemini accepts text, images and audio; OpenAI covers generation and has a
dedicated file transcription path that streams over SSE; Anthropic accepts
text and images but not audio. Chinese-hosted models are excluded by the
brief.

Decision
Gemini is the first integrated provider and ships in S1. OpenAI is the
second and appears in S5 for transcription and in S10 for generation
fallback.

Gemini covers all three capabilities with one provider, so the prototype is
demonstrable end to end without a second integration on the critical path.
OpenAI is the second because it also covers both capabilities, which gives
real fallback on both ports rather than on one, and because its file
transcription streams, which is the property TranscriptionPort's
AsyncIterable was designed around (ADR-012).

Consequences
Both providers implement both ports, so fallback is symmetric and S10 is
fully demonstrable if it ships.

Cost of choosing OpenAI over Anthropic, stated rather than hidden:
Anthropic cannot transcribe, and that asymmetry would have forced the
capability split in running code. With two complete providers, the split in
ADR-012 is a design judgement the write up has to argue for rather than one
the composition root demonstrates. The argument still holds, because a
voice turn uses two providers by design and fallback is defined per port,
but it is now an argument.

The Gemini adapter has to choose between the Interactions API and
generateContent, which Google now marks as the previous version. That
choice belongs to the adapter and is named in the S1 brief so the agent
does not pick the one most common in its training data.

The OpenAI transcription adapter targets gpt-transcribe, which is the
current recommended model for new integrations. gpt-4o-transcribe is
supported for existing integrations and is not the starting point here.

Ordering caveat for the write up: this settles integration order, not the
recommendation. D18 must be able to contradict it. If the evaluation
favours OpenAI for default text conversations, that is a composition root
change and the write up says so.

Revisit when
The evaluation contradicts it, or a capability appears that only one of the
two covers, which would restore the asymmetry the previous pairing had.

### ADR-018: On-device transcription for the product, provider path kept for evaluation
Date: 2026-08-05
Status: accepted. Amends ADR-011, ADR-012, ADR-016 and ADR-017.

Context
ADR-011 settled that a voice turn produces a text transcript and the
generation model is only ever spoken to in text. It assumed a provider
transcribed. On-device speech recognition (SFSpeechRecognizer on iOS, the
Android equivalent) was not raised at the time and should have been: it is
free, needs no upload, and keeps the audio on the phone.

Against that: 01 requires audio processing to be accounted for in the cost
of a conversation, and the brief requires a recorded voice question among
the four fixture questions and audio capability compared across providers.
On-device transcription empties both.

Options considered
A: On-device only. Cheapest, and the audio row of the comparison
   disappears.
B: On-device for the product, with TranscriptionPort and a provider
   adapter retained and exercised by the evaluation.

Decision
B. The product transcribes on the device. The transcript is produced and
corrected on the phone, and what reaches the backend is text, exactly as if
the user had typed it.

TranscriptionPort stays in domain/ports with a provider adapter in
infrastructure, reachable by a script the evaluation uses. The audio row of
the comparison is produced by running the four fixture questions through
that path by hand against both providers and timing them, which is the
degradation ADR-007 already anticipated for S12.

Condition attached, because without it this option fails its own test: if
the provider adapter is only reachable from S12 and S12 falls below the cut
line, nothing executes it and the port becomes an omission dressed as
design (05-mlp-definition.md). Running the fixtures by hand is therefore
not optional, and it does not depend on the harness being built.

Consequences
The voice turn is one request, not two. There is no audio upload, no
server-driven transcribing stage and no transcript events in the stream, so
the transcript.delta and transcript.done events leave the ADR-016
vocabulary and E5 and E6 become client-only states. The transcript review
in E6 happens on the phone before anything is sent.

ADR-012 is weakened and this is the second time. TranscriptionPort already
had no domain service calling it; it now has no product caller at all, only
an evaluation one. The capability split is still correct, because the
generation port and the transcription port genuinely have different
implementations and different failure modes, but the write up has to argue
for it rather than point at the composition root.

ADR-017 chose OpenAI partly because its file transcription streams. That
reason no longer applies to the product path, only to the evaluation one.
The choice stands on generation fallback; the write up should not repeat
the streaming argument as if it were still load-bearing.

The platform divergence ADR-005 named gets worse. Two recognition APIs, two
permission flows, and quality that differs most on older voices, which is
exactly this audience. A community native module is needed; the development
build (ADR-008) allows it, and it has to be verified on both platforms
rather than assumed.

What this buys, and it belongs in the write up: audio never leaves the
phone. For an anti-scam product handling US consumer data, that is a
stronger privacy claim than any redaction rule, and it costs nothing.

Honest limit: on-device quality is not uniform across platforms, and
production may prefer the server path for consistency. That path exists and
is documented rather than hypothetical.

Roughly 40 minutes more than on-device alone.

Revisit when
On-device recognition proves unreliable on older voices during the build,
which would move the product path back to the provider adapter that already
exists, or Android quality diverges enough to need a per-platform decision.

### ADR-019: The guard rails are inside the agent's reach
Date: 2026-08-05
Status: accepted. Amends ADR-009.

Context
ADR-009 paired every rule that matters with a statement that prevents it
and a sensor that catches it, on the premise that the sensor is a
constraint the agent cannot argue with. The OMC harness is now installed on
this project. Its CLAUDE.md grants direct write access to .claude/**, which
is where the PreToolUse hook, the PostToolUse hook and the layer rules
live. The premise no longer holds: an agent blocked by the hook can remove
the hook and proceed, with a plausible justification.

Verified in August 2026: root CLAUDE.md and .claude/CLAUDE.md are both
valid project locations and both load, concatenated rather than merged.
Where concatenated files conflict, no precedence is guaranteed. Only the
project-root CLAUDE.md is re-read from disk and re-injected after /compact.

Decision
Our rules live in CLAUDE.md at the repository root, not in .claude/, for
two reasons: OMC owns .claude/CLAUDE.md and rewrites it between marker
comments, and the root file is the only one that survives compaction. It
opens by naming the OMC file, stating that both are active and that this
one wins on product and closed decisions.

The guard rails are declared immutable in that file: .claude/settings.json,
.claude/hooks/**, .claude/rules/**, .dependency-cruiser.js and the ESLint
config are never edited by an implementation session.

Accepted honestly: that is a statement, not a sensor, and this project's
own rule says a statement only lowers the probability. The sensors that
survive are dependency-cruiser inside npm test, which the agent would have
to disable in a visible way, and the git diff, which I read. Reviewing
whether the guard rail files appear modified is now part of accepting a
slice, not an optional check.

Autonomous execution modes are excluded on this project. Autopilot, ralph
and ultrawork are designed not to stop, and the Out of scope section of
every brief depends on stopping.

Consequences
The domain vocabulary can now enter CLAUDE.md, since D6 closed. The 60 line
cap from ADR-009 is relaxed to roughly 60 lines for our file alone, while
acknowledging that the agent starts each session with our file plus OMC's,
which is more instruction than either was designed for.

.omc/ is gitignored except .omc/skills/**, so state artefacts do not reach
the reviewer.

What the harness buys, recorded rather than dismissed: it consults official
documentation before implementing against an SDK, which targets the exact
risk flagged for the Gemini Interactions API; it separates authoring from
review with no self-approval in the same context; and its commit trailers
leave a decision trail. That trail records what the agent rejected, not
what I rejected, and the two must not be mixed in the submission.

The first version of this list omitted .claude/hooks/**, which is where the
hooks actually live, so the statement had a hole exactly where the
protection mattered. Found when S1 reported changes to two files that were
not on the list I asked it to check.

Revisit when
The first session shows the guard rail files modified, which would mean the
statement is not enough and the constraint has to move somewhere the agent
cannot reach, such as a pre-commit hook outside .claude/ or CI.

### ADR-020: Usage carries thinking tokens, not only input and output
Date: 2026-08-05
Status: accepted. Amends ADR-014.

Context
S1 verified the Gemini adapter against the live API. interaction.completed
carries usage, as assumed, but the real numbers were total_input_tokens 22,
total_output_tokens 20, total_tokens 430. The gap is total_thought_tokens
388: roughly ninety per cent of the spend, in neither input nor output.
The Usage value object modelled input and output only, so a conversation
total computed from it is wrong by an order of magnitude, and 01 requires
usage tracking sufficient to estimate the cost of a conversation.

Decision
Usage gains a third field, thoughtTokens, defaulting to zero for providers
that do not report one. Added now rather than in S7, for the same reason
ADR-007 pulled provenance into S1: Usage is set in Message.fromAssistant at
construction, so a third field later reopens the value object, the factory,
the migration, the contracts package and every adapter. Roughly 25 minutes
now against an hour and a re-test pass later.

Consequences
The jsonb usage column gains a field; parts and provenance are unaffected.
D12 inherits a three-part sum and has to decide whether the conversation
total exposes thinking tokens separately or blended, since they are priced
differently.

Providers that report no separate reasoning count record zero, which is
honest rather than approximate. The write up should say that the number is
what the provider reports and not an independent measurement.

Discovered by a live call, not by reasoning. The stub-only path would have
verified this against fixtures we invented ourselves and shipped a cost
figure ten times too low. Recorded in the scratch section as the problem
found by verification.

Two consumers were missed when this was written and surfaced during
implementation: Usage.totalTokens(), which returned input plus output and
now returns the three-part sum matching the provider's own total_tokens,
and the structured turn log, which carried two of the three cost components.
Both are corrected in the same amendment. The lesson is that adding a field
to a value object is not one change; it is one change per consumer.

Revisit when
A provider reports reasoning usage under a different name or splits it
further, which would make a single field too coarse.

### ADR-021: thinking_level minimal, with the scam check moved into product policy
Date: 2026-08-05
Status: accepted

Context
S1 measured 18 to 52 seconds of dead air before the first text delta, with
76 to 90 per cent of billed generation going to reasoning tokens the user
never sees. That breaks MLP criterion 1, which 05-mlp-definition.md treats
as not negotiable, and it inflates the cost figure the brief asks for.

A live probe established that thinking_level is accepted inside
generation_config on the Interactions API. The earlier six failures were
placement, not availability: the parameter had been sent at the top level.
This does not reopen ADR-017: same provider, same API, generateContent
never called.

Measured: minimal takes reasoning to exactly zero tokens across seven runs
and first text to roughly one second. low, medium and high are monotonic
but all three still spend 1,000 to 1,800 thought tokens and leave six to
ten seconds of silence, so there is no useful middle setting.

Options considered
A: minimal by default, with the scam check written into product policy.
B: keep reasoning, accept the silence, decide it all at D18.

Decision
A. The finding that forced it: in one of seven minimal runs the model
skipped the scam check and asserted outright that the message was normal
and nobody was trying to trick anyone. A fake "storage almost full" popup
is a real scam vector, and 07-product-context.md states that a confident
wrong answer here costs the user money.

The response is not to buy the check back with reasoning tokens. Today that
check happens because the model thinks long enough, which is a safety
guarantee held by accident. 02-architecture-principles.md says the
assistant's behavioural rules are product policy and live in the domain,
versioned. So the check becomes an explicit rule in the domain policy with
a test, and stops depending on how much reasoning was purchased.

Consequences
The silence and roughly 85 per cent of token spend both go away. The
conversation cost figure becomes meaningful rather than dominated by
invisible tokens.

The product policy grows and now carries a safety-critical rule that must
be tested rather than assumed. That test is not optional: it is what makes
this decision safe.

Honest limit: the single skipped scam check is not established as a
regression. Two control runs cannot separate a real quality drop at minimal
from a tail that occurs at every level. The write up should say so. The
experiment that would settle it is matched samples at minimal versus unset,
scored for presence of the scam check, and it is not run here.

The per-level numbers were measured on gemini-3.6-flash after free-tier
quota on gemini-3.5-flash was exhausted. Parameter acceptance is proven on
3.5-flash; the zero-thought-token result is not, and the confirming run
could not be made because the quota did not reset within the exercise. The
write up states this as a gap rather than implying the configured model was
verified. The first live run after the change is the confirmation, and if
minimal does not produce zero thought tokens on 3.5-flash, this decision is
wrong on that model rather than wrong in general.

Not decided here: which model is used, and whether harder questions get a
different configuration. The probe showed a four to six times latency gap
between 3.5-flash and 3.6-flash at similar thought token counts, confounded
by session load. Both belong to D18.

Roughly 30 minutes: the parameter, the policy rule, and its test.

Revisit when
The matched-sample experiment shows minimal degrades scam handling in a way
the policy rule does not recover, or D18 selects a model whose reasoning
behaviour differs.


## Backlog (deliberately deferred)

Everything cut for the timebox, with one line on why deferring is safe and what keeps the door open. This section becomes the "what I intentionally left out" deliverable.

| Item | Why deferred | What keeps the door open |
| --- | --- | --- |
| Live Control+ API integration | No API contract available for the exercise | User context port is defined; only the adapter changes |
| Human handoff and escalation routing | No confirmed staffed channel, and the assistant has to stand alone either way (ADR-002) | Conversation aggregate can raise a domain event without a schema change |
| Notifying the account administrator when something happens to a family member | Needs a per-member consent model before it is safe to build. An adult member's private conversation being reported to another adult is a different question from a parent seeing a child's | Domain events already carry the member identity; the notification is a subscriber |
| Full monitoring stack: tracing, dashboards, alerting, evaluation pipeline from real traffic | Deliberate post-MVP decision (ADR-004), not an omission | Structured logs and redaction ship now, so the data exists to build on |
| Retention policy, access controls and field-level encryption for stored conversations | Out of scope for two days, but persistence makes it a real question (ADR-003) | Content is already isolated behind the repository port |
| Video attachments | Explicitly out of scope for the exercise | Attachment is already a value object with a media type |
| Realtime voice to voice | Explicitly out of scope | The transport decision records what would change |

## Scratch: submission evidence

Capture as it happens, not from memory on day two.

### AI suggestions rejected or corrected

**1. An inference presented as fact about the client's support model.**

The assistant stated that Control+ operates a staffed 24/7 human support channel. The evidence turned out to be a published phone number, a support email and a Crisp-hosted help centre, which is an inference, not a fact, and the marketing copy attaches "fully automated 24/7" to the protection rather than to support. Caught before it reached a design decision. The original plan had scam conversations escalating to a human, which would have meant building a routing path to a channel that may not be staffed. Produced ADR-002.

**2. An in-memory store proposed as the persistence approach.**

Conventional for a timeboxed prototype and explicitly permitted by the brief. Rejected: writing the schema, migrations and repository adapter with AI assistance is fast enough that the shortcut buys very little. The reasoning behind the in-memory default is a habit from when infrastructure code was slow to write, and that premise no longer holds. Produced ADR-003. The in-memory implementation survives as a test double, which is where it belonged.

**3. Deferring the Control+ context integration.**

The assistant recommended treating account context as a backlog item with the seam left open, since the brief requires no auth. Overruled: for an anti-scam product serving older adults, knowing that a scan ran clean yesterday changes what a good answer looks like, and a support assistant that cannot see any of that is a demo rather than a product. Produced ADR-001.

**4. A blanket no-logging rule that would have made the system unobservable.**

The assistant proposed keeping all message content out of application logs, framed as deliberate privacy care, and took that framing from my own instruction to account for US consumer data law. Rejected: the requirement was to handle sensitive data carefully, not to go blind. Masking achieves the intent; excluding content means shipping a non-deterministic product with no way to investigate a bad answer or detect a prompt regression. Produced ADR-004.

**5. Content marking deferred, and a constraint misattributed.**

The assistant filed machine-readable marking of generated output as a backlog item and recorded the constraint as coming from my instructions when it had come from its own reading of the regulation. It had also collapsed two distinct obligations into one: disclosing that the user is talking to an AI, and marking the generated content itself. Different provisions, different mechanisms. Produced ADR-006.

**The pattern worth naming.** Three of these five are the same failure. Under a tight timebox the assistant reached for whichever option sounded most prudent, without checking whether the saving was real. In each case the cut cost more than it saved: an unobservable system, a prototype that forgets everything on restart, and a deferral of work that takes under an hour. The architect's job here was not to catch mistakes of fact but to test whether each proposed economy actually economised. That is now rule 8 in the architect assistant's instructions, and the boundary lint rule in `02-architecture-principles.md` exists for the same reason: an agent under time pressure needs constraints it cannot argue with.

### Problems found by tests or manual verification

**Gemini bills thinking tokens outside input and output.**

Verified against the live API while building S1. interaction.completed
returned total_input_tokens 22, total_output_tokens 20 and total_tokens 430,
with the 388 token gap sitting in total_thought_tokens. The Usage value
object modelled input and output only, so every cost figure the product
produced would have been roughly a tenth of the real spend, against a brief
that asks explicitly for enough usage tracking to estimate the cost of a
conversation. Fixed by ADR-020, which adds the field at construction time
rather than deferring it.

Worth noting how it was found. The implementing agent offered a stubbed-only
path as the recommended option, which would have verified usage capture
against fixtures we wrote ourselves and passed. It surfaced only because the
adapter was run against the real provider with a real key.

Two smaller live findings recorded alongside it: Google's migration guide
documents usage.{prompt_tokens, completion_tokens} while the real payload
uses interaction.usage.{total_input_tokens, total_output_tokens}; and
provider errors arrive as typed SDK exceptions from create() rather than as
inline error events, which D14 has to account for.

**A keyword matcher fired on a negation.**

The prompt for the ADR-020 amendment contained the words "no autopilot", and
the OMC hook matched the keyword and injected [MAGIC KEYWORD: AUTOPILOT].
The instruction that existed to forbid autonomous execution came within one
agent's judgement of triggering it. What stopped it was the agent reading
the root CLAUDE.md and choosing to ignore the injection, which is a
statement, not a sensor, and ADR-019 had already recorded that a statement
only lowers the probability. Mitigation: prompts no longer name the modes at
all, even negated. Recorded because a sensor that fires toward the dangerous
action is worse than no sensor.

**Answers did not render progressively, and the cause was not in our code.**

Found by hand on device: the screen stayed on thinking for the whole
generation, then the complete answer appeared at once. Three candidates were
proposed, in order of suspicion: the adapter draining the provider stream
before yielding, the route failing to flush, the client buffering. All three
were wrong. Instrumented with a raw socket client against the live API:

    11ms  stage(thinking)
          ... 14.9 seconds of nothing ...
 14921ms  stage(responding)
 14921ms  message.delta  #1
   ...    8 deltas, 8 separate TCP chunks, spread over 493ms
 16904ms  message.done

A longer answer gave the same shape: 29.7s of silence, then 14 deltas over
1044ms. The pipeline streams correctly at whatever pace the model emits. What
looks like "all at once" is 167 output tokens arriving in half a second, which
is below the threshold at which a person perceives text building up.

The silence is the model thinking: 949 thought tokens against 167 output on
that turn. So the defect was never in the streaming path. It is that 92% of
the turn has nothing to show, which breaks MLP criterion 1 and 03's rule that
a step over a second or two must be surfaced as a distinct backend event.

**Why the green suite could not have caught it.** The e2e stub replayed
fixtures from an async generator with no delay, so every chunk was available
in one microtask drain. A pipeline that buffered everything and flushed at
close produced the identical event *sequence*, and sequence was all that was
asserted. The suite was not weak; it was asking a question that could not
distinguish the two cases. Now fixed: the stub pauses between chunks and the
tests assert separation in time and separate socket reads. Both were verified
by mutation — buffering the server makes three of them fail, and the ordering
assertion still passes, which is the whole point.

**Parked: filling the thinking silence is not currently possible.**

The instruction was to use the thought_summary deltas the adapter discards as
evidence of progress without showing the reasoning text. That premise does not
hold. Full event timeline from the live Interactions API:

     282ms  interaction.created
     284ms  interaction.status_update
            <- 18,759ms with no event of any kind
   19043ms  step.start
   19043ms  step.delta(thought_signature)
   19044ms  step.delta(text)   first text

There are no thought_summary deltas to use. The only non-text delta is a
single thought_signature, an opaque signature string rather than a summary,
and it arrives at 19043ms — the same millisecond as the first text, not
during the wait. Nothing at all is emitted in the 18.8 second gap, so there is
no backend event to drive an indicator from.

Every documented way to turn summaries on is rejected by the deployed API,
though the SDK's TypeScript types declare the first of them:

    thinking_summaries: 'auto'          Unknown parameter 'thinking_summaries'.
    thinking_level: 'low'               Unknown parameter 'thinking_level'.
    thinking_level: 'minimal'           Unknown parameter 'thinking_level'.
    thinking_config.include_thoughts    Unknown parameter 'thinking_config'.
    thinkingConfig.includeThoughts      Unknown parameter 'thinkingConfig'.
    generation_config.thinking_config   Unknown parameter 'thinking_config' at
                                        'generation_config'.
    include_thoughts (top level)        Unknown parameter 'include_thoughts'.

All returned code invalid_request. This is the same class of trap as the
ADR-020 discrepancy: the SDK types are ahead of the deployed API, and only a
live call tells you which.

generateContent, with thinkingConfig.includeThoughts, does stream them: three
thought parts, the first at 1ms. So the capability exists on the API that
ADR-017 closed against and the S1 brief explicitly forbids. That is the
decision to take, and it was not taken here.

A placeholder indicator was offered and refused, correctly: any animation not
driven by a backend event is client-side time-based UI, which 03 forbids, and
it would keep moving after the backend had died. A screen that lies to a
frightened user is worse than one that is honest about waiting.

That ruling implicates existing code. The thinking indicator currently loops a
dot animation on a client timer, which has exactly the property just
described. 03's state table also requires Thinking to show "movement so it
does not look frozen", so removing it without a backend-driven replacement
trades one breach for another. Both sides of that need the same missing
capability, so the animation is parked here rather than changed.




### Decisions I made personally rather than delegating

- ADR-001 through ADR-006, all settled before the architecture work started.
- ADR-007, the slice sequence and cut line, settled at the start of the architecture work.
- The two-agent split itself: an architect that produces briefs and never writes code, and Claude Code that writes code and never makes design decisions.
- The voice strategy, decided on cost-per-follow-up rather than on the
  latency comparison the assistant had framed (ADR-011).
- The persistence tooling, after rejecting the framing the assistant offered
  rather than the option it recommended (ADR-010).
- Provider selection and integration order, taken before the evaluation
  rather than after it, with the reason and the risk stated (ADR-017).
- Re-reading every remaining estimate as an upper bound after S1 came in at
  a quarter of its estimate, rather than leaving the inflated numbers to
  justify cuts that were no longer necessary.
- What the user sees while the model reasons. I proposed
  discarding the reasoning text and using the thought deltas only as a
  progress signal. I set the requirement more precisely: neither the raw
  reasoning nor an empty wait, but something in between, calibrated so it
  reassures rather than alarms. In an anti-scam product the model's
  intermediate thoughts about fraud are exactly the wrong thing to put in
  front of a frightened 78-year-old, and a slow reader may take them for the
  answer. The silence has to be filled with something that says work is
  happening without saying what the work is.
- Treating a safety behaviour as product policy rather than as a property
  bought with reasoning tokens. Probes showed that capping reasoning removed
  an 18 to 52 second silence and 85 per cent of token spend, but in one run
  of seven the model dropped the scam check and reassured outright. Rather
  than pay for reasoning to keep a guarantee that was holding by accident, I
  moved the scam check into the versioned domain policy with a test, where
  02-architecture-principles.md says behavioural rules belong (ADR-021).

### AI development tools used

- This Claude Project as architect: Socratic, two options per decision, never decides, produces ADRs and implementation briefs.
- Claude Code as implementer: executes one vertical slice per session against a brief, constrained by `CLAUDE.md` and a boundary lint rule that fails the build on layer violations.
- The corrections above are the evidence that the supervision was real rather than nominal.

## Running time budget

Update as decisions close. Target from `05-mlp-definition.md` is 16 hours total.

| Area | Budgeted | Committed so far |
| --- | --- | --- |
| Setup and skeleton | 2h | 0.25h Docker compose, 0.25h boundary lint rule |
| Backend domain, use cases, tests | 3h | 0.5h context port, 0.75h persistence adapter and migrations, 0.25h provenance (now inside S1 per ADR-007) |
| Provider adapters and streaming | 3h |  |
| Mobile app and state machine | 4h |  |
| Provider evaluation | 2h |  |
| Write up, README, recording | 2h |  |

Roughly 2h of the 16 is already committed by the closed decisions. That came out of the backend and setup lines, so the domain modelling has less room than it looks. ADR-007 moved work between slices without adding to this total.

S1 was estimated at 4h and took 60 minutes, verified in Claude Code. The
estimate was roughly four times the actual. Every remaining slice estimate
in this log was made on the same basis and should be read as an upper bound
rather than a forecast. The cut line in ADR-007 was drawn against the
inflated numbers, so S10 and S12 are more likely to fit than that decision
assumed. This is not a reason to widen scope; it is a reason to stop
treating the budget as the binding constraint and start treating the
reviewer's attention as one.