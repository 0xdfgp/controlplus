# S9a: Retry a failed answer, and start a new conversation

## Context
S6 has just reshaped the screen. Two things the design promises and the build
does not have: E8 draws a "Try again" button on the failure state and there
is none, and there is no way to start a fresh conversation, so the app holds
one growing thread from launch. Constrained by ADR-022 and ADR-029.

## Story
As a senior user, I want one obvious way forward when something goes wrong,
and a way to start again when my next question has nothing to do with the
last one.

## In scope

Retry
- The failure state gains a "Try again" control, as e8.png draws it: one
  large primary action, nothing else competing.
- Tapping it re-sends the same question. The user does not retype it, and if
  the question carried a photo they do not re-take it.
- The failure text stays plain. No code, no provider name, no error class.
- Retry is available on every failure the client can render, including a
  provider failure, a timeout and a lost connection.

New conversation
- One control to start a fresh conversation. It clears the screen and the
  context window, and the next question starts a new conversation on the
  server.
- It is not the primary action. The input is. Place it where it will not be
  hit by accident, and label it in plain words.
- The previous conversation is not deleted. It stays in the database; it is
  simply no longer on screen.

## Out of scope
- A list of past conversations, or any way to return to one. That is S9b.
- Timeouts, retry classes and backoff on the server. ADR-029 settled those
  and they are not being changed here.
- Any change under apps/api beyond starting a new conversation id, if that
  is not already possible.
- Editing or resending an earlier question from the conversation.

## Acceptance criteria
1. Given a failed answer, when the user taps Try again, then the same
   question is sent without retyping and the thinking state appears.
2. Given a failed answer to a question that carried a photo, when the user
   taps Try again, then the photo goes with it and is not re-taken.
3. Given a second failure after a retry, then Try again is still offered.
4. Given a conversation with several turns, when the user starts a new
   conversation, then the screen clears and the next answer carries no
   context from the previous thread.
5. Given a new conversation was started, when the database is inspected,
   then the previous conversation and its messages are still there.

## Technical notes
- Retry re-sends, it does not resume. There is no partial to continue from.
- Starting a new conversation must not be reachable by accident from the
  responding state.
- No React test renderer exists, so say what you could not verify.

## Tests required
- Client: the state machine allows failed to thinking on retry, and rejects
  it from states where retry is not offered.
- The existing suite stays green.

## Done when
The acceptance criteria pass, npm test is green including lint:boundaries,
and both have been used once on a real device.

## Size
Report the actual time.