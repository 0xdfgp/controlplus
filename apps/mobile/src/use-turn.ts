import { useCallback, useEffect, useRef, useState } from 'react';

import { askQuestionStream } from './streaming/ask-question-stream.ts';

export type ScreenState = 'idle' | 'thinking' | 'responding';

export interface Turn {
  readonly state: ScreenState;
  readonly question: string;
  readonly answer: string;
  readonly errorMessage: string | null;
  ask: (question: string) => void;
}

/**
 * How often buffered answer text is flushed to React state.
 *
 * Deltas arrive faster than anyone reads. Re-rendering per token would burn
 * frames on a screen whose whole job is to be calm, so text accumulates in a ref
 * and lands four times a second.
 */
const FLUSH_INTERVAL_MS = 250;

/**
 * The one sentence shown when a turn fails.
 *
 * Plain language, no error code, no provider name. Someone who has just been
 * frightened by a scam message should not then be handed a stack trace.
 */
const FAILURE_SENTENCE =
  'Something went wrong on our side. Your question was not answered. Please try again in a moment.';

export function useTurn(baseUrl: string, conversationId: string): Turn {
  const [state, setState] = useState<ScreenState>('idle');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const buffer = useRef('');
  const flushTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancel = useRef<(() => void) | null>(null);

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

      cancel.current?.();
      buffer.current = '';
      setQuestion(trimmed);
      setAnswer('');
      setErrorMessage(null);
      setState('thinking');

      flushTimer.current = setInterval(() => {
        setAnswer(buffer.current);
      }, FLUSH_INTERVAL_MS);

      cancel.current = askQuestionStream(
        { baseUrl, conversationId, question: trimmed },
        {
          onEvent: (event) => {
            switch (event.type) {
              case 'stage':
                setState(event.stage === 'thinking' ? 'thinking' : 'responding');
                return;
              case 'message.delta':
                buffer.current += event.text;
                return;
              case 'message.done':
                stopFlushing();
                return;
              case 'error':
                stopFlushing();
                setErrorMessage(FAILURE_SENTENCE);
                return;
            }
          },
          onTransportError: () => {
            stopFlushing();
            setErrorMessage(FAILURE_SENTENCE);
          },
          onClose: () => {
            stopFlushing();
            setState((current) => (current === 'idle' ? current : 'responding'));
          },
        },
      );
    },
    [baseUrl, conversationId, stopFlushing],
  );

  return { state, question, answer, errorMessage, ask };
}
