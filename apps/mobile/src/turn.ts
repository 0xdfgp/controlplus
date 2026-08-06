import type { LoggedTurn } from './conversation-log.ts';
import type { TurnState } from './turn-machine.ts';
import type { Photo } from './use-photo.ts';

/**
 * Everything the screen may know about a turn, and everything it may do to one.
 *
 * Its own file rather than a header on the hook, for the reason
 * `first-question.tsx` already records: `use-turn.ts` sits at the 200 line cap
 * the ESLint guard rail sets, and this is the part of it that is a description
 * rather than a mechanism. `use-turn-state.ts` and `use-answer-buffer.ts` came
 * out of the same hook on the same argument.
 */
export interface Turn {
  /** Finished turns, oldest first. The live turn is not in here. */
  readonly history: readonly LoggedTurn[];
  readonly state: TurnState;
  readonly question: string;
  readonly answer: string;
  readonly errorMessage: string | null;
  /** The photo sent with the live turn, for the screen to show. */
  readonly photoUri: string | null;
  /**
   * How much of the photo has left the phone, 0 to 1, or null when nothing is
   * measuring it. Null rather than 0: "none yet" and "nobody is telling us"
   * are different, and only one of them is honest to draw as a bar.
   */
  readonly progress: number | null;
  ask: (question: string, photo?: Photo | null) => void;
  stop: () => void;
  /**
   * Send the failed question again, exactly as it was asked (E8).
   *
   * Nothing is retyped and no photo is re-taken: the words and the picture are
   * the ones already on their way out once. It re-sends rather than resuming —
   * there is no partial to continue from — and the failed attempt leaves the
   * conversation as the retry takes its place.
   *
   * Only ever offered where `canRetry` is true, and it checks again before
   * sending.
   */
  retry: () => void;
  /** The person tapped "Speak instead". */
  speak: () => void;
  /** They tapped "I'm done", so the recogniser is being asked for the words. */
  transcribe: () => void;
  /** The words arrived and are on screen to be checked before anything is sent. */
  transcribed: () => void;
  /**
   * The spoken question came to nothing: a refused microphone, a phone that
   * cannot transcribe, or a recording that heard nothing. Back to idle with a
   * sentence to read, never to `failed`.
   */
  discard: () => void;
}
