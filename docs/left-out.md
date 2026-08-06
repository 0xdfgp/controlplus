# What I left out, and why

Everything here was a decision rather than an oversight. Each one has a note on
why deferring it is safe and what keeps the door open.

## Cut on the night, in priority order

Five slices were planned above the cut line and not built. The order they were
dropped in reflects what the brief protects most: the three input modes and the
provider comparison came first, and these went.

**The Control+ user context port.** Designed in full, contract and degradation
included, and not built. The assistant therefore answers without knowing
anything about the account, which is the single thing that would most change
what a good answer looks like in this product. If one slice were added back
first, this is it.

**The conversation cost endpoint.** Usage is captured on every message,
including thinking tokens, and the pricing catalogue exists in the domain and
keys correctly on the model snapshot the provider answers on. What is missing
is the endpoint that sums a conversation and exposes the figure. The numbers
are all there; nothing adds them up over HTTP.

**Provider fallback wired into the composition root.** The port takes two
implementations and both Anthropic and Gemini pass the same contract suite, so
this is wiring rather than a rewrite. Until it is wired, a provider outage is
an outage.

**Full log field coverage.** One structured line per turn ships with
conversation id, request id, latency, the three token figures, error class and
redacted content. What was cut is auditing that every use case emits it.

**Past conversations.** Conversations persist and there is no screen listing
them, so a user can start a new thread and cannot return to the old one. It is
the only cut item that would add navigation to a product that currently has
none, which is why it went rather than the others.

## Cut earlier, by decision

**Live Control+ API integration.** There is no API contract available for the
exercise, so the user context port returns fixed sample data. The interface is
real and tested and the shape is my guess at their account model, which I've
asked them to confirm. A real endpoint replaces one adapter and nothing else
changes.

**Human handoff and escalation.** The public material advertises fully
automated protection, a support email, a phone number and a hosted help
centre, and never establishes that a person answers. Building a routing path
to a channel that might be automated would have been designing for an
assumption. The assistant answers scam questions directly instead, and the
support contact appears as a static link that routes nothing. If Control+
confirms a staffed channel, the conversation aggregate can raise a domain
event without a schema change.

**Notifying the account administrator when something happens to a family
member.** This needs a per-member consent model before it is safe to build. An
adult member's private conversation being reported to another adult is a
different question from a parent seeing a child's, and a build this short is not the place to answer it. The domain events already carry the member
identity, so the notification is a subscriber.

**Partial answers surviving a dropped connection.** A message is written once
when the turn closes. Cancellation is unaffected, because stopping also closes
the turn and the partial gets written. What is lost is the case where the
process dies or the user drops off the network mid-stream. Roughly half an
hour to fix, by inserting the row at stream start with a streaming state and
updating on a throttle.

**Persisting image bytes.** The message keeps media type, dimensions and a
hash. A conversation cannot be fully reconstructed from the database, and a
follow up about the same photo re-sends it. The production shape is object
storage behind an attachment port.

**The full monitoring stack.** Tracing, dashboards, alerting, and an evaluation
pipeline built from real conversations. Structured logs with redaction ship
now, and they carry latency, the three token counts, error class and redacted
content, so the data to build the rest exists.

**Retention policy, access control and field-level encryption.** Persistence is
real, which is what makes this a real question rather than a hypothetical one.
Content is already isolated behind the repository port.

**Rate limiting.** Nothing currently sits between a client and the provider
bill.

## Out of scope by the brief

**Video attachments.** Message content is a list of typed parts, so video is a
new part type and a new branch in prompt assembly, not a new message type.

**Realtime voice to voice.** Not an extension of the current voice path. Voice
today produces a text transcript on the device and the generation model is only
ever spoken to in text. Realtime is a different transport, WebSocket or WebRTC,
with no intermediate text, and the transport decision records what would
change.

**Authentication, accounts and user management.** Explicitly not required. The
context port takes an identifier and trusts it.

## Cut and worth naming as a cost

**The audio row of the provider comparison is measured by hand.** Voice is
transcribed on the device, so the transcription port has no product caller and
exists for the evaluation. Running the fixture questions through it manually
was a condition of that decision rather than an afterthought, because a port
nothing executes is an omission dressed as design.

**Behavioural verification against the live model.** There are tests that the
scam check and the disclosure rule are present in the assembled prompt. There
is no test that the model obeys them, and one probe showed a model skipping the
scam check unprompted, which is why the rule is in the policy at all. Closing
that gap needs an evaluation set built from real conversations.
