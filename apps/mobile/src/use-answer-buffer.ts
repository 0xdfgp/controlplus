import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * How often buffered answer text is flushed to React state (ADR-022).
 *
 * Deltas arrive faster than anyone reads. Re-rendering per token would burn
 * frames on a screen whose whole job is to be calm, so text accumulates in a ref
 * and lands on this interval instead. 80ms is a guess and ADR-022 says so.
 */
export const FLUSH_INTERVAL_MS = 80;

export interface AnswerBuffer {
  /** The answer as the screen should currently draw it. */
  readonly answer: string;
  append: (text: string) => void;
  /** Start flushing, from empty. */
  start: () => void;
  /** Stop flushing and show everything that arrived. */
  stop: () => void;
  /** Everything that has arrived, readable without waiting for a render. */
  current: () => string;
  clear: () => void;
}

/**
 * Answer text as it arrives, shown at a rate a person can read.
 *
 * Its own hook because it is the one piece of useTurn that has nothing to do
 * with the turn: it is a rendering concern, and keeping it here leaves the turn
 * hook about the machine, the request and the photo.
 */
export function useAnswerBuffer(): AnswerBuffer {
  const [answer, setAnswer] = useState('');
  const buffer = useRef('');
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback(() => {
    if (timer.current !== null) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => stopTimer, [stopTimer]);

  return {
    answer,
    append: useCallback((text: string) => {
      buffer.current += text;
    }, []),
    start: useCallback(() => {
      buffer.current = '';
      setAnswer('');
      stopTimer();
      timer.current = setInterval(() => {
        setAnswer(buffer.current);
      }, FLUSH_INTERVAL_MS);
    }, [stopTimer]),
    stop: useCallback(() => {
      stopTimer();
      // The last flush, so the final words are not left in the ref.
      setAnswer(buffer.current);
    }, [stopTimer]),
    current: useCallback(() => buffer.current, []),
    clear: useCallback(() => {
      buffer.current = '';
      setAnswer('');
    }, []),
  };
}
