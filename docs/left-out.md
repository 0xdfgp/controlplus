# What I left out, and why

None of this got forgotten. Each one was a decision. Below each I have said
what makes it safe to leave and what keeps the door open.

## Cut on the night

Five slices sat above the cut line and never got built. They went in this
order, because the brief protects the three input modes and the provider
comparison ahead of everything else.

### The Control+ user context port

Designed in full, contract and degradation included. Then not built. So the
assistant answers without knowing anything about the account, and that is the
one thing that would most change what a good answer looks like in this product.
If one slice comes back first, it should be this one.

### The conversation cost endpoint

Usage is captured on every message, thinking tokens included. The pricing
catalogue exists in the domain and keys correctly on the model snapshot the
provider answers on. What is missing is the endpoint that sums a conversation
and exposes the figure. All the numbers are there. Nothing adds them up over
HTTP.

### Provider fallback in the composition root

The port takes two implementations, and Anthropic and Gemini both pass the same
contract suite already. So this is wiring. Until it is wired, a provider outage
is our outage.

### Full log field coverage

One structured line per turn ships today, carrying conversation id, request id,
latency, the three token figures, error class and redacted content. What got
cut was auditing that every use case emits it.

### Past conversations

Conversations persist and no screen lists them, so a user can start a new
thread and never get back to the old one. Of the five this was the easiest to
drop, because it is the only one that would have added navigation to a product
that has none.

## Cut earlier, by decision

### Live Control+ API integration

There is no API contract available for the exercise, so the user context port
returns fixed sample data. The interface is real and tested. The shape is my
guess at their account model, which I have asked them to confirm. A real
endpoint replaces one adapter and nothing else moves.

### Human handoff and escalation

The public material advertises fully automated protection, a support email, a
phone number and a hosted help centre. It never establishes that a person
answers. Building a routing path to a channel that might be automated would
have meant designing for an assumption. So the assistant answers scam questions
directly, and the support contact appears as a static link that routes nothing.
If Control+ confirms a staffed channel, the conversation aggregate can raise a
domain event without a schema change.

### Notifying the account administrator about a family member

This one needs a per-member consent model before it is safe to build. An adult
member's private conversation being reported to another adult is a different
question from a parent seeing a child's, and a build this short is no place to
answer it. The domain events already carry the member identity, so the
notification is a subscriber.

### Partial answers surviving a dropped connection

A message is written once, when the turn closes. Cancellation is unaffected,
because stopping also closes the turn and the partial gets written. What is
lost is the case where the process dies or the user drops off the network
mid-stream. Roughly half an hour to fix: insert the row at stream start with a
streaming state, then update on a throttle.

### Persisting image bytes

The message keeps media type, dimensions and a hash. So a conversation cannot
be fully reconstructed from the database, and a follow up about the same photo
re-sends it. The production shape is object storage behind an attachment port.

### The full monitoring stack

Tracing, dashboards, alerting, and an evaluation pipeline built from real
conversations. Structured logs with redaction ship now, and they carry latency,
the three token counts, error class and redacted content. The data to build the
rest is there.

### Retention policy, access control and field-level encryption

Persistence is real, which is what makes this a real question and not a
hypothetical. Content is already isolated behind the repository port.

### Rate limiting

Nothing currently sits between a client and the provider bill.

## Out of scope by the brief

### Video attachments

Message content is a list of typed parts, so video is a new part type and a new
branch in prompt assembly. Not a new message type.

### Realtime voice to voice

This does not extend the current voice path. Voice today produces a text
transcript on the device, and the generation model is only ever spoken to in
text. Realtime is a different transport, WebSocket or WebRTC, with no
intermediate text. The transport decision records what would change.

### Authentication, accounts and user management

Explicitly not required. The context port takes an identifier and trusts it.

## Cut, and worth naming as a cost

The audio row of the provider comparison is measured by hand. Voice is
transcribed on the device, so the transcription port has no product caller and
exists for the evaluation. Running the fixture questions through it manually
was a condition of that decision. A port nothing executes is an omission
dressed as design.

Behavioural verification against the live model is the other one. There are
tests that the scam check and the disclosure rule are present in the assembled
prompt. There is no test that the model obeys them, and one probe showed a
model skipping the scam check unprompted, which is why the rule is in the
policy at all. Closing that gap needs an evaluation set built from real
conversations.