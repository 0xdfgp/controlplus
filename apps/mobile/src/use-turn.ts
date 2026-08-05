import { useCallback, useEffect, useRef, useState } from 'react';

import { appendTurn } from './conversation-log.ts';
import type { LoggedTurn } from './conversation-log.ts';
import { FAILURE_SENTENCE, sentenceFor } from './failure-sentences.ts';
import { askQuestionStream } from './streaming/ask-question-stream.ts';
import { transition } from './turn-machine.ts';
import type { TurnEvent, TurnState } from './turn-machine.ts';
import { useAnswerBuffer } from './use-answer-buffer.ts';
import { useTurnState } from './use-turn-state.ts';
import { toImagePayload } from './use-photo.ts';
import type { Photo } from './use-photo.ts';

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
    [apply, baseUrl, buffer, conversationId, settle],
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
    if (transition(now(), 'stop') === null) {
      return;
    }
    cancel.current?.();
    cancel.current = null;
    settle('stop', null);
  }, [now, settle]);

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
    speak: move('speak'),
    transcribe: move('transcribe'),
    transcribed: move('transcribed'),
    discard: move('discard'),
  };
}
