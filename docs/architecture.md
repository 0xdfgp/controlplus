# Architecture

One day build of a conversational assistant for Control+, an anti-scam and
device security product for older adults in the US. Users are roughly 70 to 85
and often frightened when they open it. That shaped more of this than the
feature list did.

Every decision is written up in docs/decisions/decision-log.md, including the
ones I reversed.

## Layers

Hexagonal, three layers, dependencies inwards only. Domain holds entities, value
objects, ports, domain services and the product policy. Application holds use
cases. Infrastructure holds HTTP, SDK adapters, persistence, clock, ids, config.

The boundary is enforced, not agreed. dependency-cruiser runs inside npm test
with three error-severity rules, and a pre-write hook blocks a forbidden import
before it lands. Run npm run lint:boundaries and it either passes or names both
layers in the failure. The code was written by a coding agent, and an agent
under time pressure will import an SDK into the domain with a good excuse. The
rule went in during the first slice for that reason.

## Domain

Conversation and Message are separate aggregates. The invariant that would have
justified a Conversation root was "no two assistant responses in flight at
once", and this is a single-user chat driven by one client, so that race does
not happen. Conversation ends up thin: identity and timestamps. Worth saying
plainly rather than dressing it up.

Message has a private constructor and two factories. The assistant one will not
construct without provenance, a terminal state and usage. Content is a list of
typed parts, so adding video later is a new part type rather than a new message
type.

One write per turn, when the turn closes. If the process dies mid-stream the
partial is lost. Deliberate trade: the brief does not name that failure and the
user reads it as "it cut off, I will ask again". Making it survivable is about
half an hour of work and a lifecycle invariant, and the door is open.

## Providers

Two ports, text generation and transcription, both returning an AsyncIterable.
A voice turn uses two providers by design, so a single provider port would have
needed a capability descriptor and a runtime check. With two ports the routing
is wiring in the composition root.

Normalisation happens inside each adapter. Nothing vendor-shaped crosses the
boundary. Cancellation is the consumer stopping iteration: the runtime calls
return on the iterator and the adapter aborts the SDK stream in its finally. No
AbortSignal in the domain. Measured at 2ms.

Weak point, stated because it is: the transcription port has no product caller,
since voice is transcribed on the device. It exists for the evaluation. The
split is still right because the two ports have different implementations and
different failure modes, but the composition root no longer proves it.

## Streaming

SSE over POST, one request per turn. Events are stage, message delta, message
done carrying terminal state and provenance and usage, and error carrying a
domain error class the client turns into plain language.

I settled the events before the transport. Every stage of the wait needs a
sentence behind it driven by real backend events, and picking the transport
first would have let the transport decide what the user gets told.

WebSocket was the alternative. During generation this is unidirectional, and the
only mid-turn action is Stop, which under SSE is aborting the request. That is a
strong signal: the connection close is detected in a few hundred milliseconds
and the provider stops billing for tokens nobody is reading.

Two things that cost time. Hermes does not implement ReadableStream on fetch and
EventSource is not native in React Native, so the client reads SSE over XHR, and
that failure is silent so it has to be checked on a device. And proxy buffering
will swallow the whole stream, so the streaming route disables compression and
sets X-Accel-Buffering to no.

The production shape splits the prompt request from the response stream and
keeps a token store so a dropped client can resume. Not built.

## Voice, images, context

Voice is transcribed on the device. Audio never leaves the phone. It started as
a cost decision, since audio bills roughly ten times the tokens of the
equivalent transcript and attachments stay in context so every follow up pays
again. It ended up being a better privacy story than any redaction rule. The
cost is two recognition APIs and quality that varies most on older voices, which
is exactly this audience.

Images are resized on device to 1568px long edge and sent inline with the
question. The server does not keep the bytes, only media type, dimensions and a
hash. So a conversation cannot be fully reconstructed from the database and a
follow up about the same photo re-sends it. Production answer is object storage
behind an attachment port.

Follow ups get the last N complete messages, no summarisation. Counting tokens
instead would need a provider tokenizer, which either enters the domain or moves
a business rule into an adapter. The bound is on count, not size, so long
messages can still make a large request.

Control+ account context is designed and not built. The port would return
concrete types, last scan, recent threats, plan, device count and family member
count, with family member names deliberately absent so a name that is not in
the contract cannot leak into an answer about someone else. It was cut for time
and is in the left-out list rather than here.

## Product policy

Tone, the scam check and the answer to "are you a person" live in the domain as
versioned policy with tests, not in a prompt string next to an SDK call.

That turned out to matter. Live probes showed 76 to 90 percent of tokens going
to reasoning, with 18 to 52 seconds of silence before any text. Capping the
reasoning budget removed both, but in one run of seven the capped model skipped
the scam check and told the user a fake "storage almost full" popup was normal.
Buying the check back with reasoning tokens would mean a safety guarantee held
by accident, so it became an explicit rule with a test instead.

Limit: two control runs cannot tell a real quality drop from a tail that happens
at any reasoning level. The experiment that would settle it is not run here.

## Cost, reliability, logs

Usage carries input, output and thinking tokens. The third field exists because
a live call returned 22 input, 20 output and 388 thought tokens out of 430. A
figure built on the first two would have been a tenth of the real spend.
Pricing lives in a domain catalogue that prices the three components separately
because providers bill them separately, and it keys on the dated model snapshot
the provider actually answers on rather than the alias that was requested,
which would otherwise have reported every real turn as free. The endpoint that
sums a whole conversation is not built.

Timeouts are 60s on generation and 5s on the context port and the database.
Retries only on network errors, 429 and 5xx, twice, never on 4xx. Each
degradation is named: context port failing means the prompt says so and the
assistant admits it cannot see the account; database failing at write means the
user is told the answer was not saved.

Provider fallback is designed and not wired. It would run before the first text
chunk or not at all, because switching later splices one answer out of two
models and makes the provenance record untrue. What makes that a claim rather
than a hope is that two adapters, Anthropic and Gemini, pass the same shared
contract suite today, so adding the second to the composition root is wiring.

Logs keep message content with sensitive data masked rather than excluded.
Excluding it was my first instinct and it was wrong: without seeing what was
said and returned there is no way to investigate a bad answer or catch a prompt
regression. Redaction is a policy in the domain called by a formatter in
infrastructure, because what counts as sensitive here is a product judgement.

It only catches structured identifiers. "The man said my account at my bank was
frozen" is not matchable. Masking narrows exposure, it does not remove it.

## Disclosure

Two obligations kept separate. Disclosure is a persistent indicator in the
interface, not a first-screen banner, because someone of 80 forgets
mid-conversation what they are talking to. Provenance is metadata on every
assistant message set in the domain at construction, recording model and
provider, and it travels in the response, the stream and the stored row.

There is no settled watermarking standard for plain text, so text copied out of
the app loses the marker.

## What the build changed

Three decisions were amended by things only a live call showed.

Gemini bills thinking tokens outside input and output. Found because the adapter
ran against the real provider rather than fixtures we wrote ourselves.

Google's migration guide documents one usage shape and the API returns another,
and the SDK types declare a parameter the server rejects. In the other direction,
a parameter the docs describe correctly was rejected six times because it was
being sent at the wrong nesting level. Neither the docs nor the types are
evidence for this API.

Cancellation exposed a hole: a stopped message still needs provenance, and
provenance only arrived on the completion chunk, which a cancelled stream never
reaches. The port gained a started chunk carrying model and provider. Injecting
the wired provider from the composition root would have been wrong the moment
fallback picked a different one.
