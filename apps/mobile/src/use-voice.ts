import { useCallback, useEffect, useRef, useState } from 'react';
import { useSpeechRecognitionEvent } from 'expo-speech-recognition';

import {
  abandonListening,
  beginListening,
  blockedFromSpeaking,
  endListening,
} from './voice-recogniser.ts';
import {
  COULD_NOT_LISTEN,
  isTranscriptUsable,
  LEVEL_INAUDIBLE,
  meansNothingHeard,
  NOTHING_HEARD,
  sentenceForRecognitionProblem,
} from './voice.ts';

export interface VoiceHandlers {
  /** A final transcript with words in it, ready to be checked (AC2). */
  readonly onTranscript: (transcript: string) => void;
  /** The recording produced nothing usable (AC5). */
  readonly onNothingHeard: () => void;
  /** The microphone or the recogniser said no (AC4). */
  readonly onProblem: () => void;
}

export interface VoiceRecogniser {
  /**
   * The volume the microphone last reported, in the recogniser's own −2 to 10.
   * It starts inaudible and changes only when an event arrives, so a recogniser
   * reporting nothing leaves the meter still rather than moving.
   */
  readonly level: number;
  /** Something the person needs to read. Plain sentence, never a code. */
  readonly message: string | null;
  start: () => void;
  finish: () => void;
  clearMessage: () => void;
}

/**
 * Speaking a question, transcribed on the phone (ADR-018).
 *
 * The recogniser's four events become React state and three callbacks: the
 * screen reads `level` and `message`, and the turn state machine is driven by
 * what this reports. It owns no turn state of its own.
 */
export function useVoice(handlers: VoiceHandlers): VoiceRecogniser {
  const [level, setLevel] = useState(LEVEL_INAUDIBLE);
  const [message, setMessage] = useState<string | null>(null);

  /**
   * What has been heard so far, readable without waiting for a render.
   *
   * Two parts because the recogniser reports in two: segments it has settled on
   * and a guess at the words being spoken now. iOS finalises once, at the end;
   * Android in continuous mode finalises a segment at a time. Keeping the
   * settled ones and only the newest guess is what makes both add up to the
   * same sentence rather than a stutter of half-repeated phrases.
   */
  const confirmed = useRef('');
  const guess = useRef('');
  const spoken = (): string => `${confirmed.current} ${guess.current}`.trim();

  /**
   * Whether a recognition is still to be accounted for. A finished recording
   * produces a final result, then `end`, or an error instead of both. Only the
   * first to arrive moves the turn on; this makes the rest no-ops rather than a
   * second transition on a turn that has already left.
   */
  const pending = useRef(false);

  /** The handlers as they are now, so the event listeners never go stale. */
  const report = useRef(handlers);
  report.current = handlers;

  const settle = useCallback((transcript: string) => {
    if (!pending.current) {
      return;
    }
    pending.current = false;

    if (isTranscriptUsable(transcript)) {
      report.current.onTranscript(transcript.trim());
      return;
    }

    setMessage(NOTHING_HEARD);
    report.current.onNothingHeard();
  }, []);

  const giveUp = useCallback((sentence: string, nothingHeard: boolean) => {
    if (!pending.current) {
      return;
    }
    pending.current = false;

    setMessage(sentence);
    if (nothingHeard) {
      report.current.onNothingHeard();
    } else {
      report.current.onProblem();
    }
  }, []);

  useSpeechRecognitionEvent('volumechange', (event) => {
    setLevel(event.value);
  });

  // Collected, never acted on. A turn is only ever moved on by `end` below,
  // because a final result is not the end of the recording: in continuous mode
  // Android finalises each segment while the person is still talking, and
  // settling on the first of those would end the turn mid-question.
  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results[0]?.transcript ?? '';

    if (event.isFinal) {
      confirmed.current = `${confirmed.current} ${transcript}`.trim();
      guess.current = '';
      return;
    }

    guess.current = transcript;
  });

  useSpeechRecognitionEvent('error', (event) => {
    giveUp(
      sentenceForRecognitionProblem(event.error),
      meansNothingHeard(event.error),
    );
  });

  // The recogniser has stopped, for any reason, and this is the one event that
  // always follows. Everything heard by now is the question — including the
  // last guess, which on iOS is all there is if no final result arrives.
  useSpeechRecognitionEvent('end', () => {
    settle(spoken());
  });

  const start = useCallback(() => {
    void (async () => {
      setMessage(null);
      setLevel(LEVEL_INAUDIBLE);
      confirmed.current = '';
      guess.current = '';

      try {
        const blocked = await blockedFromSpeaking();
        if (blocked !== null) {
          setMessage(blocked);
          report.current.onProblem();
          return;
        }

        pending.current = true;
        beginListening();
      } catch {
        // Whatever the native layer did, the person reads one sentence and
        // still has two other ways to ask.
        pending.current = false;
        setMessage(COULD_NOT_LISTEN);
        report.current.onProblem();
      }
    })();
  }, []);

  const finish = useCallback(() => {
    endListening();
  }, []);

  const clearMessage = useCallback(() => {
    setMessage(null);
  }, []);

  // Abandon on the way out: there is no transcript to wait for once nobody is
  // here to read it.
  useEffect(
    () => () => {
      if (pending.current) {
        pending.current = false;
        abandonListening();
      }
    },
    [],
  );

  return { level, message, start, finish, clearMessage };
}
