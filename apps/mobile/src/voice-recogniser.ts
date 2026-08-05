import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

import {
  MICROPHONE_DENIED,
  ON_DEVICE_UNAVAILABLE,
  RECOGNITION_LOCALE,
  SPEECH_DENIED,
} from './voice.ts';

/**
 * The native recogniser, and the three things that are done to it (ADR-018).
 *
 * Separate from the hook so that how the microphone is configured and gated is
 * one readable thing, and the React state it produces is another. Nothing here
 * knows about a turn or a screen.
 */

/**
 * What stops a recording before it starts, or null to go ahead.
 *
 * The on-device check is first and is not a preference: with no local model for
 * the locale iOS sends the audio to Apple, and ADR-018's promise — audio never
 * leaves the phone — would stop being true with nothing saying so.
 *
 * The two permissions are asked here, at the tap that needs them rather than at
 * launch. The sentences in the system dialogs come from app.json.
 */
export async function blockedFromSpeaking(): Promise<string | null> {
  if (!ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) {
    return ON_DEVICE_UNAVAILABLE;
  }

  const microphone =
    await ExpoSpeechRecognitionModule.requestMicrophonePermissionsAsync();
  if (!microphone.granted) {
    return MICROPHONE_DENIED;
  }

  const speech =
    await ExpoSpeechRecognitionModule.requestSpeechRecognizerPermissionsAsync();
  return speech.granted ? null : SPEECH_DENIED;
}

/**
 * Open the microphone.
 *
 * `recordingOptions` is absent deliberately. Its `persist` defaults off, so the
 * brief's "the audio is not persisted anywhere" is met by the absence of code
 * rather than by any, and adding that option is the one change here that would
 * quietly break it.
 */
export function beginListening(): void {
  ExpoSpeechRecognitionModule.start({
    lang: RECOGNITION_LOCALE,
    requiresOnDeviceRecognition: true,
    // On iOS a final result only exists once recognition has stopped, so these
    // partials are the only words available while the person is still talking.
    interimResults: true,
    addsPunctuation: true,
    // The recording ends when the person says it does. Someone speaking slowly,
    // or stopping to think, must not be cut off mid-question by a three-second
    // silence timer.
    continuous: true,
    // Real level data, every 100ms. This is what the meter is drawn from, and
    // the reason it is a measurement rather than an animation.
    volumeChangeEventOptions: { enabled: true, intervalMillis: 100 },
  });
}

/** The person tapped "I'm done". Stopping is what asks for the final result. */
export function endListening(): void {
  ExpoSpeechRecognitionModule.stop();
}

/** Give up without waiting for a transcript nobody is left to read. */
export function abandonListening(): void {
  ExpoSpeechRecognitionModule.abort();
}
