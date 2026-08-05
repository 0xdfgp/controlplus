# S5: Record a voice message

## Context
Text and photo work. This adds the third input mode. ADR-018 puts
transcription on the device, so there is no audio upload, no server-driven
transcribing stage and no transcript events in the stream: what reaches the
backend is text, exactly as if it had been typed. Constrained by ADR-005,
ADR-011, ADR-018 and ADR-022.

## Story
As a senior user, I want to ask by speaking, so that I do not have to type a
question I can barely describe.

## In scope
- "Speak instead" in the idle state, as e1.png shows.
- A community native module for on-device speech recognition, verified on
  iOS and stated rather than assumed on Android (ADR-005).
- Microphone and speech recognition permissions requested in context with a
  plain explanation, and denial handled with a way to continue by typing.
- Recording starts on an explicit tap, never press and hold. 03 forbids it:
  press and hold is unreliable for shaky hands.
- The recording state as e4.png shows: "I'm listening" with a live level
  indicator, and one large control to finish.
- The transcribing state as e6.png shows: the transcript on screen, editable
  by tapping, and one action to send it.
- Recording, transcribing and a transcript-review state join the turn state
  machine as client-only states (ADR-022).
- The audio never leaves the phone and is not persisted anywhere.

## Out of scope
- Any audio upload, TranscriptionPort call, or transcript event in the SSE
  stream. ADR-018 removed all three from the product path.
- The provider transcription adapter. It exists for the evaluation, S12.
- Realtime voice to voice. Different architecture, D19.
- Failure UI beyond what already exists. S9.
- Anything server-side. This slice should touch apps/api not at all.

## Acceptance criteria
1. Given the idle screen, when the user taps to speak and says a question,
   then the level indicator moves while they talk.
2. Given a finished recording, when transcription completes, then the
   transcript is on screen and editable before anything is sent.
3. Given a corrected transcript, when it is sent, then the backend receives
   text and answers as it would for a typed question.
4. Given microphone or speech permission denied, when the user taps to
   speak, then they see a plain explanation and can still type.
5. Given the transcript is empty because nothing was heard, then the user is
   told plainly and can record again.

## Technical notes
- Nothing under apps/api changes. If it looks like it must, stop and tell me.
- The transcript is the user message. It carries a TranscriptPart so the
  domain records how it arrived (ADR-014).
- The state machine gains states, it is not replaced.

## Tests required
- Client: the state machine accepts the new states and rejects impossible
  transitions, in the existing table-driven style.
- Domain: a Message carrying a TranscriptPart round-trips.
- No new e2e. A voice turn is a text turn once it reaches HTTP.

## Done when
The acceptance criteria pass, npm test is green including lint:boundaries,
and a question has been asked by voice on a real device.

## Size
Report the actual time.