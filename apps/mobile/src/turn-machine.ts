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
 */
export type TurnEvent =
  | 'ask'
  | 'upload'
  | 'sent'
  | 'responding'
  | 'completed'
  | 'stop'
  | 'fail';

const READY: Partial<Record<TurnEvent, TurnState>> = {
  ask: 'thinking',
  upload: 'uploading',
};

const TRANSITIONS: Record<TurnState, Partial<Record<TurnEvent, TurnState>>> = {
  // A finished turn leaves its answer on screen and its input ready below, so
  // asking again is the only thing that moves it. That implicit return is
  // ADR-022; without it the app answers one question per launch.
  idle: READY,
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

/** Whether a turn is under way, and so cannot accept a question. */
export function isInFlight(state: TurnState): boolean {
  return (
    state === 'uploading' || state === 'thinking' || state === 'responding'
  );
}
