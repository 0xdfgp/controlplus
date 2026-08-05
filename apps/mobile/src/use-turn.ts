import { useCallback, useEffect, useRef, useState } from 'react';

import { askQuestionStream } from './streaming/ask-question-stream.ts';
import { transition } from './turn-machine.ts';
import type { TurnEvent, TurnState } from './turn-machine.ts';

export interface Turn {
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
 * and lands on this interval instead.
 *
 * 80ms is a guess and ADR-022 says so. If it reads as choppy on a low-end
 * device, it moves.
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
  const [state, setState] = useState<TurnState>('idle');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const buffer = useRef('');
  const flushTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancel = useRef<(() => void) | null>(null);

  /**
   * The only way this hook changes state.
   *
   * An event the machine refuses leaves the screen exactly where it was. That
   * matters most after a stop: closing the connection produces a transport
   * error a moment later, and the machine is what stops it repainting a
   * deliberately stopped answer as a failure.
   */
  const apply = useCallback((event: TurnEvent) => {
    setState((current) => transition(current, event) ?? current);
  }, []);

  const stopFlushing = useCallback(() => {
    if (flushTimer.current !== null) {
      clearInterval(flushTimer.current);
      flushTimer.current = null;
    }
    setAnswer(buffer.current);
  }, []);

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
    (asked: string) => {
      const trimmed = asked.trim();
      if (trimmed.length === 0) {
        return;
      }

      if (transition(state, 'ask') === null) {
        // A question arriving over a live answer. The machine refuses it, so no
        // request goes out either.
        return;
      }

      cancel.current?.();
      buffer.current = '';
      setQuestion(trimmed);
      setAnswer('');
      setErrorMessage(null);
      apply('ask');

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
                stopFlushing();
                apply('completed');
                return;
              case 'error':
                stopFlushing();
                setErrorMessage(FAILURE_SENTENCE);
                apply('fail');
                return;
            }
          },
          onTransportError: () => {
            stopFlushing();
            setErrorMessage(FAILURE_SENTENCE);
            apply('fail');
          },
          onClose: stopFlushing,
        },
      );
    },
    [apply, baseUrl, conversationId, state, stopFlushing],
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
    if (transition(state, 'stop') === null) {
      return;
    }
    stopFlushing();
    cancel.current?.();
    cancel.current = null;
    apply('stop');
  }, [apply, state, stopFlushing]);

  return { state, question, answer, errorMessage, ask, stop };
}
