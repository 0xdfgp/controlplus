/**
 * What happens to a spoken question on the phone (ADR-018).
 *
 * Pure, so the numbers that drive the level meter and the words a refused
 * microphone produces are testable without a device. The hook that drives the
 * native recogniser imports these and does no arithmetic of its own.
 */

/** US adults are the audience, so this is the locale recognition is asked for. */
export const RECOGNITION_LOCALE = 'en-US';

/**
 * The range the recogniser reports volume in.
 *
 * Anything at or below the floor is inaudible, which is the recogniser's own
 * wording rather than a threshold picked here.
 */
export const LEVEL_INAUDIBLE = 0;
export const LEVEL_LOUDEST = 10;

/**
 * The height every bar rests at when nothing is being heard.
 *
 * Visible and still. Silence has to look like silence: a meter that keeps
 * moving with no sound reaching it is the same lie as a progress bar on a
 * timer, which 03-senior-ux-principles rules out and S4 already got wrong once.
 */
export const RESTING_BAR = 0.15;

/**
 * How much shorter the outer bars are than the middle one.
 *
 * A fixed shape, so the meter reads as a voice rather than as a progress bar
 * filling left to right. The shape never changes; only the loudness scaling it
 * does, and that comes from the microphone.
 */
const EDGE_FALLOFF = 0.55;

/**
 * How loud the microphone is hearing, as 0 to 1.
 *
 * Clamped at both ends: the recogniser's range runs from −2, and a value below
 * the floor means inaudible rather than negative. A value that is not a number
 * reads as silence, because the alternative is a meter drawn from NaN.
 */
export function levelFraction(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const above = value - LEVEL_INAUDIBLE;
  if (above <= 0) {
    return 0;
  }

  return Math.min(1, above / (LEVEL_LOUDEST - LEVEL_INAUDIBLE));
}

/**
 * The height of each bar, 0 to 1, for one reported volume.
 *
 * Every bar sits at the resting height when nothing is audible and grows from
 * there in proportion to what the microphone reported. There is no easing and
 * no decay, because both would keep the bars moving after the sound stopped.
 */
export function levelToBars(value: number, count: number): readonly number[] {
  const loudness = levelFraction(value);

  return Array.from({ length: count }, (_, index) => {
    const height = RESTING_BAR + (1 - RESTING_BAR) * loudness * shapeAt(index, count);
    return Math.min(1, height);
  });
}

/** Tallest in the middle, shortest at the ends. */
function shapeAt(index: number, count: number): number {
  if (count <= 1) {
    return 1;
  }

  const centre = (count - 1) / 2;
  return 1 - EDGE_FALLOFF * (Math.abs(index - centre) / centre);
}

/**
 * Whether there is anything here worth sending.
 *
 * A recogniser that heard nothing reports an empty transcript rather than an
 * error on every platform, so this is what AC5 actually turns on.
 */
export function isTranscriptUsable(transcript: string): boolean {
  return transcript.trim().length > 0;
}

/**
 * The sentences shown when speaking does not work out.
 *
 * Each says what happened, that nothing is broken, and how to carry on. None of
 * these is a failure state: the person can always type, and every sentence
 * says so. A refused microphone is not the answer failing.
 */
export const MICROPHONE_DENIED =
  'Control+ does not have permission to use the microphone. You can turn it on in the Settings app, under Control+. You can also type your question instead.';

export const SPEECH_DENIED =
  'Control+ does not have permission to turn what you say into writing. You can turn it on in the Settings app, under Control+. You can also type your question instead.';

export const NOTHING_HEARD =
  'I did not hear anything. Please tap to speak and try again, holding the phone a little closer. You can also type your question instead.';

/**
 * ADR-018 promises the audio never leaves the phone. When the phone cannot keep
 * that promise the person is told plainly and types instead — the one thing
 * that must never happen quietly is the recording going to a server.
 */
export const ON_DEVICE_UNAVAILABLE =
  'This phone cannot turn what you say into writing on its own, and Control+ never sends your voice anywhere. Please type your question instead.';

/** Everything else the microphone can do: interrupted by a call, busy, unknown. */
export const COULD_NOT_LISTEN =
  'Something stopped the microphone. Please tap to speak and try again, or type your question instead.';

/**
 * The sentence for a recogniser problem.
 *
 * The codes never reach the screen. They are the recogniser's vocabulary, and
 * this is the one place they are translated into the reader's.
 */
export function sentenceForRecognitionProblem(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return SPEECH_DENIED;
    case 'no-speech':
    case 'speech-timeout':
      return NOTHING_HEARD;
    case 'language-not-supported':
      return ON_DEVICE_UNAVAILABLE;
    default:
      return COULD_NOT_LISTEN;
  }
}

/** Whether this problem means nothing was heard, rather than something broke. */
export function meansNothingHeard(code: string): boolean {
  return code === 'no-speech' || code === 'speech-timeout';
}
