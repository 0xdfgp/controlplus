# S4: Send a photo

## Context
S1 to S3b ship a typed conversation on Anthropic with cancellation and
follow ups. This slice adds the second input mode: a photo or screenshot
travelling with the question. Constrained by ADR-014, ADR-024, ADR-029 and
ADR-032.

## Story
As a senior user, I want to show the assistant what is on my screen, so that
I do not have to describe an error message I do not understand.

## In scope

Mobile
- "Add a photo" in the idle state, as e1.png shows: camera and photo library,
  each with a text label, requested in context with a plain explanation and
  handled gracefully when denied.
- Resize on device to 1568px on the long edge, JPEG quality 0.8, before
  anything is sent (ADR-024).
- A retake option before sending. The photo is visible while the question is
  typed.
- The uploading state as e5.png shows: "Sending your photo" with visible
  progress, because the connection may be slow.
- The photo appears in the conversation above its answer.

Contracts
- The request type gains an optional image: base64 data, media type and
  dimensions. Sent inside the same POST as the question (ADR-024).

Domain
- ImagePart joins the ContentPart union: media type, dimensions, hash. The
  bytes are never held by the domain (ADR-014).
- Message.fromUser accepts a message carrying an ImagePart with or without a
  TextPart.
- AttachmentTooLarge as a typed domain error, over 5MB after resizing.

Infrastructure
- The Anthropic adapter maps an ImagePart to the provider's image content
  block. Normalisation stays inside the adapter.
- The persistence mapper round-trips an ImagePart through jsonb. One
  migration only if the shape requires DDL, which it should not.
- Request size limit of 6MB rejected before reaching the provider (ADR-029).
- The turn log records that the message carried an image, its media type and
  dimensions. Never the bytes.

Product policy
- A rule for images: if the photo is too blurry or cropped to read, say so
  plainly and ask for another one rather than guessing. 03 requires this.

## Out of scope
- Voice and transcription. S5.
- Persisting the image bytes. ADR-024 decided against it; the Message keeps
  media type, dimensions and a hash.
- A separate upload endpoint or an attachment storage port. ADR-024.
- Video. Backlog.
- Failure UI beyond rendering the error event. S9.
- Conversation cost totals. S7.
- The Gemini and OpenAI adapters. S10 and S12.

## Acceptance criteria
1. Given a photo taken or chosen, when it is sent with a question, then the
   answer refers to what is in the image.
2. Given a large uncropped screenshot, when it is sent, then what leaves the
   device is at most 1568px on the long edge and the upload state shows
   progress.
3. Given a completed turn with an image, when the stored message is read,
   then it carries an ImagePart with media type, dimensions and a hash, and
   no image bytes are in the database.
4. Given a photo over 5MB after resizing, when it is sent, then the user sees
   a plain sentence saying the photo is too big, with no code and no
   technical term.
5. Given camera or photo library permission is denied, when the user taps
   "Add a photo", then they see a plain explanation and a way to continue
   without it.
6. Given a follow up after an image turn, when it is sent, then history
   assembly does not resend the image bytes, since the Message holds a
   reference (ADR-023, ADR-024).

## Technical notes
- The image is base64 in the same POST. No second request.
- Resizing happens on device, not on the server. 03 requires it because
  screenshots are large and the connection is slow.
- ImagePart is a new variant of an existing union. It must not become a new
  message type.
- Do not relitigate: bytes are not persisted, there is no attachment port,
  and the upload is single-step. All ADR-024.

## Tests required
- Domain: Message.fromUser accepts an ImagePart alone and with text; an
  oversized attachment is rejected as AttachmentTooLarge.
- Application: a turn carrying an image reaches the port with the image
  present; a follow up after it does not resend the bytes.
- Adapter contract: the shared suite gains an image scenario, mapping an
  ImagePart to the provider block.
- Persistence: an ImagePart round-trips through jsonb.
- E2E: one image turn over real HTTP with a stubbed provider.

## Done when
The acceptance criteria pass, npm test is green including lint:boundaries,
and a photo has been sent and answered once on a real device.

## Size
Report the actual time.