/**
 * The turn state machine (ADR-022).
 *
 * Pure and separate from the hook so it can be reasoned about and tested on its
 * own. The screen reads this and holds no booleans of its own: impossible
 * states — thinking and stopped at once, an input that is both ready and busy —
 * are what confuse this user, and the way to not render one is to not be able
 * to represent one.
 */
export type TurnState =
  | 'idle'
  | 'recording'
  | 'transcribing'
  | 'reviewing'
  | 'uploading'
  | 'thinking'
  | 'responding'
  | 'stopped'
  | 'failed';

/**
 * What can happen to a turn.
 *
 * `stop` is the user tapping Stop. There is no server event behind it: the tap
 * closes the connection, so nothing is coming back to confirm it.
 *
 * `upload` is asking with a photo attached, and `sent` is the last byte of it
 * leaving the phone. Both are client-only: no server event drives them, because
 * the server has not seen the request yet.
 *
 * `speak`, `transcribe`, `transcribed` and `discard` are client-only for a
 * stronger reason: ADR-018 put transcription on the device, so no part of a
 * voice turn exists on the server until the finished text is sent as an
 * ordinary question. `discard` is how a voice turn that produced nothing
 * usable ends — the person read a sentence and can start again.
 */
export type TurnEvent =
  | 'ask'
  | 'speak'
  | 'transcribe'
  | 'transcribed'
  | 'discard'
  | 'upload'
  | 'sent'
  | 'responding'
  | 'completed'
  | 'stop'
  | 'fail';

const READY: Partial<Record<TurnEvent, TurnState>> = {
  ask: 'thinking',
  upload: 'uploading',
  speak: 'recording',
};

const TRANSITIONS: Record<TurnState, Partial<Record<TurnEvent, TurnState>>> = {
  // A finished turn leaves its answer on screen and its input ready below, so
  // asking again is the only thing that moves it. That implicit return is
  // ADR-022; without it the app answers one question per launch.
  idle: READY,
  // The three voice states, all client-only (ADR-018 via ADR-022). The audio
  // never leaves the phone, so nothing on the server knows any of this is
  // happening; what eventually reaches it is `ask` with text, indistinguishable
  // from a typed question.
  //
  // None of them can fail. A refused microphone, a phone with no on-device
  // model, or a recording that heard nothing all leave by `discard`, back to
  // idle with a sentence to read. `failed` means the answer failed, and none of
  // these is that — the person can still type, which every one of those
  // sentences says.
  recording: { transcribe: 'transcribing', discard: 'idle' },
  transcribing: { transcribed: 'reviewing', discard: 'idle' },
  // The transcript is on screen and editable, and nothing has been sent. The
  // only two ways out are sending it, which is an ordinary question from here
  // on, and throwing it away.
  reviewing: { ask: 'thinking', discard: 'idle' },
  // A photo can take real time to leave the phone on a slow connection, and a
  // screen with no sign of progress reads as broken (E5). ADR-022 filed this
  // state under S5, before ADR-018 removed audio upload from the product
  // entirely — the photo is what needs it, and it arrives here.
  //
  // No `stop`: E5 draws no Stop control, and there is nothing to stop at the
  // provider yet. The turn is still on the way out.
  uploading: { sent: 'thinking', fail: 'failed' },
  thinking: { responding: 'responding', completed: 'idle', fail: 'failed' },
  responding: { completed: 'idle', stop: 'stopped', fail: 'failed' },
  stopped: READY,
  failed: READY,
};

/**
 * The state this event leads to, or null when it cannot happen from here.
 *
 * Null rather than a thrown error, deliberately. Refusing an impossible
 * transition must not take down a screen that a frightened person is in the
 * middle of reading; the caller ignores it and the screen does not move.
 *
 * The two rejections that carry real weight:
 *
 *   - responding + ask. A second question cannot be sent over a live answer.
 *   - stopped + fail. A transport error arriving after the user stopped the
 *     turn — which it will, because stopping is closing the connection — must
 *     not restyle their partial answer as a fault. E7 is explicit that stopped
 *     is not an error state.
 */
export function transition(
  state: TurnState,
  event: TurnEvent,
): TurnState | null {
  return TRANSITIONS[state][event] ?? null;
}

/**
 * Whether a turn is under way, and so cannot accept a question.
 *
 * The three voice states count. Not because the server is busy — it has not
 * been told anything yet — but because the screen is showing the person one
 * thing at a time: while they are speaking or checking what was written down,
 * the composer is not on screen to type a second question into.
 */
export function isInFlight(state: TurnState): boolean {
  return (
    state === 'recording' ||
    state === 'transcribing' ||
    state === 'reviewing' ||
    state === 'uploading' ||
    state === 'thinking' ||
    state === 'responding'
  );
}

/** Whether the screen is in the middle of a spoken question. */
export function isVoiceTurn(state: TurnState): boolean {
  return (
    state === 'recording' || state === 'transcribing' || state === 'reviewing'
  );
}

/**
 * Whether Try again is on offer (E8).
 *
 * A predicate rather than a `retry` event, and the reason is the photo. A retry
 * is an ask of the same words, so it takes the edges `ask` and `upload` already
 * provide: `failed + ask -> thinking` for a typed question, `failed + upload ->
 * uploading` for one that carried a photo. That second edge is not optional —
 * the photo goes out again as base64 in the body, and a screen saying "Thinking
 * about your question" while several megabytes are still leaving the phone is
 * the screen lying about where the turn is. So a `retry` event would have to be
 * a pair of events, each duplicating one that exists.
 *
 * What the machine owes this feature is therefore not a transition but a
 * boundary: retry is offered here, and nowhere else. The screen reads this and
 * draws the button; `useTurn` reads it again before re-sending, because a tap
 * and the state it was aimed at can disagree.
 */
export function canRetry(state: TurnState): boolean {
  return state === 'failed';
}
