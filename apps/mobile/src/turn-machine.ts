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
  | 'thinking'
  | 'responding'
  | 'stopped'
  | 'failed';

/**
 * What can happen to a turn.
 *
 * `stop` is the user tapping Stop. There is no server event behind it: the tap
 * closes the connection, so nothing is coming back to confirm it.
 */
export type TurnEvent = 'ask' | 'responding' | 'completed' | 'stop' | 'fail';

const TRANSITIONS: Record<TurnState, Partial<Record<TurnEvent, TurnState>>> = {
  // A finished turn leaves its answer on screen and its input ready below, so
  // asking again is the only thing that moves it. That implicit return is
  // ADR-022; without it the app answers one question per launch.
  idle: { ask: 'thinking' },
  thinking: { responding: 'responding', completed: 'idle', fail: 'failed' },
  responding: { completed: 'idle', stop: 'stopped', fail: 'failed' },
  stopped: { ask: 'thinking' },
  failed: { ask: 'thinking' },
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

/** Whether the turn is waiting on the server, and so cannot accept a question. */
export function isInFlight(state: TurnState): boolean {
  return state === 'thinking' || state === 'responding';
}
