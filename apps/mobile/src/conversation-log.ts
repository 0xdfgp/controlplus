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
