import { isInFlight } from './turn-machine.ts';
import type { TurnState } from './turn-machine.ts';

/**
 * One finished turn, kept so the conversation reads as a sequence.
 *
 * It holds the terminal state of the turn rather than a state of its own, so a
 * finished turn renders through exactly the same component as the live one. E7
 * is explicit that a stopped answer keeps the colour and the layout it had while
 * it was arriving; the way to guarantee that is for there to be one renderer.
 */
export interface LoggedTurn {
  readonly question: string;
  readonly answer: string;
  /** How the turn ended. 'idle' is the machine's word for finished normally. */
  readonly state: TurnState;
  readonly errorMessage: string | null;
  /**
   * The photo that was sent with it, if there was one.
   *
   * A local file on the phone. The server keeps no bytes (ADR-024), so this is
   * the only copy anywhere and it lives as long as the app is open, which is
   * the same life the rest of this log has.
   */
  readonly photoUri: string | null;
}

/**
 * The conversation so far, with the newest turn last.
 *
 * Two things are refused rather than stored:
 *
 *   - A turn that is still in flight. Only a turn that has ended is history,
 *     and the machine already knows which states those are.
 *   - A turn with no question. Nothing was asked, so nothing happened.
 *
 * Not persisted anywhere. The log lives for as long as the app is open, which
 * is as long as the conversation id does.
 */
export function appendTurn(
  log: readonly LoggedTurn[],
  turn: LoggedTurn,
): LoggedTurn[] {
  if (isInFlight(turn.state) || turn.question.trim().length === 0) {
    return [...log];
  }
  return [...log, turn];
}

/**
 * The conversation without its last turn, when that turn failed.
 *
 * What Try again does to the screen. A retry sends the same words again, so it
 * is the same turn happening a second time rather than a new one: the failed
 * attempt comes off the log and the retry takes its place. Three failures then
 * read as one question and one sentence, instead of the same question repeating
 * down the screen under three identical apologies.
 *
 * The state is checked rather than assumed. Retry is only reachable from
 * `failed`, so the last turn always is the failed one — which is exactly the
 * kind of guarantee that is true until something moves, and a function that
 * popped blindly would then be eating an answer.
 */
export function dropFailedTurn(log: readonly LoggedTurn[]): LoggedTurn[] {
  return log[log.length - 1]?.state === 'failed' ? log.slice(0, -1) : [...log];
}
