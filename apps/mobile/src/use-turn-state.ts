import { useCallback, useRef, useState } from 'react';

import { transition } from './turn-machine.ts';
import type { TurnEvent, TurnState } from './turn-machine.ts';

export interface TurnStateMachine {
  /** What to render. */
  readonly state: TurnState;
  /**
   * The state as it is now, without waiting for a render.
   *
   * The stream's callbacks, the Stop handler and the recogniser's events all
   * decide what a turn does next, and a state read from a closure is the state
   * as it was when that closure was made.
   */
  now: () => TurnState;
  /** Sends an event, and reports whether the machine accepted it. */
  apply: (event: TurnEvent) => boolean;
}

/**
 * Ownership of the turn state machine: the state, the ref that shadows it, and
 * the one way either changes.
 *
 * Separate from `useTurn` so that hook stays about a turn — asking, streaming,
 * settling — rather than about bookkeeping. Nothing else may call `setState`
 * for a turn; every change goes through `apply` and is therefore something the
 * machine agreed to.
 *
 * An event the machine refuses leaves the screen exactly where it was. That
 * matters most after a stop: closing the connection produces a transport error
 * a moment later, and the machine is what stops it repainting a deliberately
 * stopped answer as a failure — and what stops the same turn being written into
 * the conversation twice.
 */
export function useTurnState(): TurnStateMachine {
  const [state, setState] = useState<TurnState>('idle');
  const current = useRef<TurnState>('idle');

  const apply = useCallback((event: TurnEvent): boolean => {
    const next = transition(current.current, event);
    if (next === null) {
      return false;
    }
    current.current = next;
    setState(next);
    return true;
  }, []);

  const now = useCallback((): TurnState => current.current, []);

  return { state, now, apply };
}
