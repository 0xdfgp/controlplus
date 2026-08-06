# Extending to video and to realtime voice

Two capabilities the brief asks about and neither is built. They are worth
separating, because one is an extension of what exists and the other is not.

## Video attachments

This one is additive. Nothing in the current shape has to change.

A message holds a list of typed content parts, so today a question can carry a
TextPart, an ImagePart, or both. Video is a fourth part type rather than a new
kind of message. That was the reason for choosing content parts over separate
UserMessage and AssistantMessage types in the first place, and this is where
that choice pays.

What changes, concretely:

**A VideoPart in the domain**, alongside ImagePart, carrying media type,
duration, dimensions and a hash. Same rule as images: the part references the
attachment and never holds the bytes.

**A branch in prompt assembly** that renders a video part into whatever the
provider expects, and a matching branch in the history renderer so a video turn
does not drop out of the context window the way an image-only turn would have
before a notice was added for it.

**A branch in each adapter.** Providers model content as typed blocks, so a
video block sits next to the image block that already exists. Adapters that
cannot take video declare so; the shared contract suite already has an optional
image scenario for exactly this reason, and video adds another.

**The persistence mapping**, which is one more variant inside the jsonb parts
column and needs no migration.

What does have to change, and it is not the domain:

**Where the bytes live.** Images are resized on the device and sent inline as
base64 in the same request, and the server never keeps them. That works because
a resized screenshot is about a megabyte. A video is not, so inline stops being
viable and the two-step upload with an attachment storage port, which was
explicitly rejected for images as production shape that demonstrated nothing,
becomes necessary. That is a new port and a new adapter, and the Message does
not notice: it already holds a reference rather than the bytes.

**The upload state on the client** gains real duration. The uploading state
exists and shows progress, so what changes is that the progress starts
mattering and cancelling an upload becomes a thing someone will want.

**Cost.** A minute of video costs considerably more than an image, and because
history carries references rather than bytes, the video is paid for once rather
than on every follow up. The usage model already prices input, output and
reasoning separately per message, so nothing about the accounting changes
shape.

Rough shape of the work: a part type and its invariants, a branch in three or
four places, an attachment port with one adapter, and an upload flow on the
client. The domain model, the transport, the state machine and the persistence
schema are untouched.

## Realtime voice to voice

This one is not an extension. It is a second product path that shares the
domain and almost nothing else, and the honest answer is that adding an adapter
does not get you there.

Voice today is transcribed on the device, and the transcript is what reaches
the backend, indistinguishable from typing. Generation then streams text back
over SSE. Every part of that is built around a turn: one request, one response,
text in and text out.

Realtime voice breaks three of those assumptions at once.

**The transport.** SSE is unidirectional by design, which was the argument for
choosing it: during generation the only client action is Stop, and under SSE
that is aborting the request. Realtime voice needs audio flowing in both
directions continuously, so it needs WebSocket or WebRTC. That is not a
different adapter behind the same port, it is a different connection model with
reconnection, heartbeat and connection state to manage, all of which the
current reliability design deliberately does not have.

**The turn.** There is no turn. The user interrupts mid-sentence, the model
stops talking, both talk at once, and the notion of a message that is written
once when the turn closes stops describing what is happening. The aggregate
would need a lifecycle it currently refuses to have, or the realtime path would
persist a transcript after the fact and accept that the live exchange is not
the record.

**The intermediate text.** Realtime models take audio and emit audio without
passing through a transcript. That removes the thing the interface for this
audience is built on: the transcript shown before the answer so a
mis-transcription is visible and correctable. For someone of 80 with an accent
or a shaky voice, losing that is not a small trade, and it is the reason
transcription happens on the device today rather than natively at the model.

What survives, and it is not nothing. The product policy is domain code, so the
tone rules, the scam check and the disclosure answer apply to a realtime path
without being rewritten. The conversation and message model still describes
what was said, if written after the fact. The usage and pricing model still
works, priced in seconds rather than tokens. What has to be built new is a
transport, a session concept, and an interface that tells someone what is
happening when there is no text on screen at all.

The right way to add it is a third capability port beside generation and
transcription, with its own adapter, wired independently in the composition
root, rather than trying to make the existing generation port carry a shape it
was not designed for. The capability split exists so that this is possible; it
does not make it cheap.

One open question, which is product rather than architecture. Losing the
correctable transcript is a real cost for this audience, and I do not know how
it weighs against being able to talk and be answered straight away. It may not
weigh much. Worth putting in front of a few real users before the work is
scoped, since it changes what the interface has to do rather than only how it
is built.
