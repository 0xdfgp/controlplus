import { useCallback, useEffect, useRef, useState } from 'react';

import { appendTurn } from './conversation-log.ts';
import type { LoggedTurn } from './conversation-log.ts';
import { askQuestionStream } from './streaming/ask-question-stream.ts';
import { transition } from './turn-machine.ts';
import type { TurnEvent, TurnState } from './turn-machine.ts';

export interface Turn {
  /** Finished turns, oldest first. The live turn is not in here. */
  readonly history: readonly LoggedTurn[];
  readonly state: TurnState;
  readonly question: string;
  readonly answer: string;
  readonly errorMessage: string | null;
  ask: (question: string) => void;
  stop: () => void;
}

/**
 * How often buffered answer text is flushed to React state (ADR-022).
 *
 * Deltas arrive faster than anyone reads. Re-rendering per token would burn
 * frames on a screen whose whole job is to be calm, so text accumulates in a ref
 * and lands on this interval instead. 80ms is a guess and ADR-022 says so.
 */
const FLUSH_INTERVAL_MS = 80;

/**
 * The one sentence shown when a turn fails.
 *
 * Plain language, no error code, no provider name. Someone who has just been
 * frightened by a scam message should not then be handed a stack trace.
 */
const FAILURE_SENTENCE =
  'Something went wrong on our side. Your question was not answered. Please try again in a moment.';

export function useTurn(baseUrl: string, conversationId: string): Turn {
  const [history, setHistory] = useState<readonly LoggedTurn[]>([]);
  const [state, setState] = useState<TurnState>('idle');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const buffer = useRef('');
  const asked = useRef('');
  const flushTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancel = useRef<(() => void) | null>(null);

  /**
   * The machine's state, readable without waiting for a render. The stream's
   * callbacks and the Stop handler both decide what a turn does next, and a
   * state read from a closure is the state as it was when that closure was made.
   */
  const current = useRef<TurnState>('idle');

  /**
   * The only way this hook changes state, and it reports whether the machine
   * accepted the event.
   *
   * An event the machine refuses leaves the screen exactly where it was. That
   * matters most after a stop: closing the connection produces a transport
   * error a moment later, and the machine is what stops it repainting a
   * deliberately stopped answer as a failure — and, now, what stops the same
   * turn being written into the conversation twice.
   */
  const apply = useCallback((event: TurnEvent): boolean => {
    const next = transition(current.current, event);
    if (next === null) {
      return false;
    }
    current.current = next;
    setState(next);
    return true;
  }, []);

  const stopFlushing = useCallback(() => {
    if (flushTimer.current !== null) {
      clearInterval(flushTimer.current);
      flushTimer.current = null;
    }
    setAnswer(buffer.current);
  }, []);

  /**
   * Ends the turn and moves it into the conversation.
   *
   * The words do not go anywhere: the finished turn renders through the same
   * component it rendered through while it was live, one place further up the
   * screen. Clearing the live fields is what stops it being drawn twice.
   */
  const settle = useCallback(
    (event: TurnEvent, failure: string | null) => {
      if (!apply(event)) {
        return;
      }
      stopFlushing();
      const finished: LoggedTurn = {
        question: asked.current,
        answer: buffer.current,
        state: current.current,
        errorMessage: failure,
      };
      setHistory((log) => appendTurn(log, finished));
      buffer.current = '';
      asked.current = '';
      setQuestion('');
      setAnswer('');
      setErrorMessage(null);
    },
    [apply, stopFlushing],
  );

  useEffect(
    () => () => {
      cancel.current?.();
      if (flushTimer.current !== null) {
        clearInterval(flushTimer.current);
      }
    },
    [],
  );

  const ask = useCallback(
    (question_: string) => {
      const trimmed = question_.trim();
      if (trimmed.length === 0) {
        return;
      }

      // A question arriving over a live answer. The machine refuses it, so no
      // request goes out either.
      if (!apply('ask')) {
        return;
      }

      cancel.current?.();
      buffer.current = '';
      asked.current = trimmed;
      setQuestion(trimmed);
      setAnswer('');
      setErrorMessage(null);

      flushTimer.current = setInterval(() => {
        setAnswer(buffer.current);
      }, FLUSH_INTERVAL_MS);

      cancel.current = askQuestionStream(
        { baseUrl, conversationId, question: trimmed },
        {
          onEvent: (event) => {
            switch (event.type) {
              case 'stage':
                if (event.stage === 'responding') {
                  apply('responding');
                }
                return;
              case 'message.delta':
                buffer.current += event.text;
                return;
              case 'message.done':
                settle('completed', null);
                return;
              case 'error':
                settle('fail', FAILURE_SENTENCE);
                return;
            }
          },
          onTransportError: () => {
            settle('fail', FAILURE_SENTENCE);
          },
          onClose: stopFlushing,
        },
      );
    },
    [apply, baseUrl, conversationId, settle, stopFlushing],
  );

  /**
   * Stop the answer.
   *
   * The tap is the whole transition. Aborting the request is what the server
   * detects (ADR-016), and nothing comes back over a connection we just closed,
   * so waiting for confirmation would mean waiting forever. The words already
   * on screen stay exactly where they are.
   */
  const stop = useCallback(() => {
    if (transition(current.current, 'stop') === null) {
      return;
    }
    cancel.current?.();
    cancel.current = null;
    settle('stop', null);
  }, [settle]);

  return { history, state, question, answer, errorMessage, ask, stop };
}
