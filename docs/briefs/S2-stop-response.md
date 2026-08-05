# S2: Stop a response

## Context
S1 ships a typed question streaming back an attributed answer. This slice
adds cancellation from tap to provider stream, and the turn state machine
(ADR-022). Constrained by ADR-012, ADR-013, ADR-016 and ADR-022.

## Story
As a senior user, I want to stop an answer that is going nowhere, so that I
am not stuck waiting for something I no longer want.

## In scope
- The turn state machine in a client hook: idle, thinking, responding,
  stopped, failed. The screen reads it and holds no separate booleans.
- Streamed text buffered in a ref, flushed on a ~80ms interval.
- A Stop control in the responding state, as e3.png shows: large, one
  primary action, text label paired with any icon.
- Tapping Stop aborts the request. The server detects the client
  disconnect, stops iterating the AsyncIterable, and the adapter aborts the
  SDK stream in its finally block. Measured at 2ms in S1.
- The partial answer is written once, marked as stopped, with provenance and
  whatever usage the provider reported (ADR-013, ADR-014).
- Stopped state as e7.png shows: partial answer stays, small neutral
  "Stopped" label, not styled as a fault, text input below ready.
- Implicit return to idle after any terminal state (ADR-022).

## Out of scope
- Conversation history across turns and context assembly. S3.
- Image, voice, and their states. S4 and S5.
- Timeouts, retries, failure UI beyond what S1 already renders. S9.
- Resuming a stopped answer. Not in this product.
- Conversation cost totals. S7.

## Acceptance criteria
1. Given an answer is streaming, when the user taps Stop, then text stops
   growing within one second and the Stopped label appears.
2. Given Stop was tapped, when the database is inspected, then one assistant
   message row exists with terminal state stopped, carrying the partial text,
   provenance and usage.
3. Given Stop was tapped, when the server logs are inspected, then the
   provider stream was aborted, not left running.
4. Given a stopped turn, when the user types a new question, then it is sent
   normally and the previous partial stays visible until replaced.
5. Failure path: given the client disconnects without tapping Stop, for
   example the app is backgrounded, then the server behaves the same way and
   no orphaned provider stream remains.

## Tests required
- Application: the use case stops iterating on consumer abort and writes a
  Message with terminal state stopped.
- Adapter contract: the shared suite covers abort mid-stream, asserting the
  SDK stream is closed.
- Client: the state machine rejects impossible transitions.
- E2E: a stopped turn over real HTTP with a stubbed provider, asserting the
  event sequence ends without message.done carrying completed.

## Done when
The acceptance criteria pass, npm test is green including lint:boundaries,
and Stop has been tapped once on a real device.

## Size
Report the actual time.