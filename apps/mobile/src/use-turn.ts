import { useCallback, useEffect, useRef, useState } from 'react';

import { appendTurn, dropFailedTurn } from './conversation-log.ts';
import type { LoggedTurn } from './conversation-log.ts';
import { FAILURE_SENTENCE, sentenceFor } from './failure-sentences.ts';
import { askQuestionStream } from './streaming/ask-question-stream.ts';
import { canRetry, transition } from './turn-machine.ts';
import type { TurnEvent } from './turn-machine.ts';
import type { Turn } from './turn.ts';
import { useAnswerBuffer } from './use-answer-buffer.ts';
import { useLastAsk } from './use-last-ask.ts';
import { useTurnState } from './use-turn-state.ts';
import { toImagePayload } from './use-photo.ts';
import type { Photo } from './use-photo.ts';

export function useTurn(baseUrl: string, conversationId: string): Turn {
  const [history, setHistory] = useState<readonly LoggedTurn[]>([]);
  const [question, setQuestion] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const buffer = useAnswerBuffer();
  const asked = useRef('');
  const sentPhoto = useRef<string | null>(null);
  const cancel = useRef<(() => void) | null>(null);

  /** What Try again would send again. */
  const lastAsk = useLastAsk();

  /** The machine, and the only way this hook changes state. */
  const { state, now, apply } = useTurnState();

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
      buffer.stop();
      const finished: LoggedTurn = {
        question: asked.current,
        answer: buffer.current(),
        state: now(),
        errorMessage: failure,
        photoUri: sentPhoto.current,
      };
      setHistory((log) => appendTurn(log, finished));
      asked.current = '';
      sentPhoto.current = null;
      buffer.clear();
      setQuestion('');
      setPhotoUri(null);
      setProgress(null);
      setErrorMessage(null);
    },
    [apply, buffer, now],
  );

  useEffect(() => () => cancel.current?.(), []);

  const ask = useCallback(
    (question_: string, photo?: Photo | null) => {
      const trimmed = question_.trim();
      if (trimmed.length === 0) {
        return;
      }

      // A photo goes through the uploading state, a bare question does not:
      // there is nothing to show progress on for one line of text, and a
      // progress bar that finishes instantly is noise (E5).
      if (!apply(photo ? 'upload' : 'ask')) {
        return;
      }

      cancel.current?.();
      asked.current = trimmed;
      sentPhoto.current = photo?.uri ?? null;
      lastAsk.remember(trimmed, photo ?? null);
      setQuestion(trimmed);
      setPhotoUri(photo?.uri ?? null);
      setProgress(null);
      setErrorMessage(null);
      buffer.start();

      cancel.current = askQuestionStream(
        { baseUrl, conversationId, question: trimmed, image: toImagePayload(photo) },
        {
          // The percentage, and only that. What ends the uploading state is the
          // server's first event, below: one signal, not two racing.
          onUploadProgress: setProgress,
          onEvent: (event) => {
            // The server speaking at all proves the photo arrived, and it is
            // the only thing that proves it: upload progress is optional and
            // React Native emits no upload-finished event. Hanging the turn off
            // it left a completed answer unable to reach a screen frozen on
            // "Sending your photo". A no-op once the turn has moved on.
            apply('sent');

            switch (event.type) {
              case 'stage':
                if (event.stage === 'responding') {
                  apply('responding');
                }
                return;
              case 'message.delta':
                buffer.append(event.text);
                return;
              case 'message.done':
                settle('completed', null);
                return;
              case 'error':
                settle('fail', sentenceFor(event.error));
                return;
            }
          },
          onTransportError: () => {
            settle('fail', FAILURE_SENTENCE);
          },
          onClose: buffer.stop,
        },
      );
    },
    [apply, baseUrl, buffer, conversationId, lastAsk, settle],
  );

  /**
   * Stop the answer.
   *
   * The tap is the whole transition. Aborting the request is what the server
   * detects (ADR-016), and nothing comes back over a connection we just closed,
   * so waiting for confirmation would mean waiting forever. The words already
   * on screen stay exactly where they are.
   *
   * Settle first, abort second, on purpose: closing a socket can report a
   * failure on the way out, and `stopped + fail` is refused only from `stopped`.
   */
  const stop = useCallback(() => {
    if (transition(now(), 'stop') === null) {
      return;
    }
    settle('stop', null);
    cancel.current?.();
    cancel.current = null;
  }, [now, settle]);

  /**
   * Send the failed question again (E8).
   *
   * The state is read from the machine rather than from a render, for the same
   * reason `stop` does: a tap arrives with whatever the closure was holding, and
   * only the machine knows where the turn actually is. `ask` then picks its own
   * event, so a question that carried a photo goes back through uploading and a
   * typed one goes straight to thinking.
   *
   * The failed attempt comes off the conversation first, so the retry appears
   * where it was rather than beneath it.
   */
  const retry = useCallback(() => {
    const last = lastAsk.read();
    if (last === null || !canRetry(now())) {
      return;
    }
    setHistory(dropFailedTurn);
    ask(last.question, last.photo);
  }, [ask, lastAsk, now]);

  // The four voice transitions (ADR-018, ADR-022). Each is one event and
  // nothing else: no request, nothing logged, no answer touched. A spoken
  // question exists only on the phone until `ask` makes it an ordinary turn.
  const move = useCallback(
    (event: TurnEvent) => () => {
      apply(event);
    },
    [apply],
  );

  return {
    history,
    state,
    question,
    answer: buffer.answer,
    errorMessage,
    photoUri,
    progress,
    ask,
    stop,
    retry,
    speak: move('speak'),
    transcribe: move('transcribe'),
    transcribed: move('transcribed'),
    discard: move('discard'),
  };
}
