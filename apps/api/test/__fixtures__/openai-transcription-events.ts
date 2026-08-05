import type { OpenAITranscriptionEvent } from '../../src/infrastructure/openai/transcription-stream.ts';

/**
 * Captured from a live gpt-transcribe call on 2026-08-05, against the committed
 * voice fixture. Not hand written: the point of a fixture is to catch the shape
 * drifting, and a shape we invented ourselves cannot do that. This is the trap
 * ADR-020 was found by.
 *
 * Two things on the wire are not in the SDK's TypeScript types, which is why the
 * cast below exists rather than the events being reshaped to compile:
 *
 *   - `usage` arrived as { type: 'duration', seconds: 22 }. The SDK declares
 *     only a { type: 'tokens', ... } variant. A fixture edited to satisfy the
 *     compiler would be a fixture testing a payload the provider never sends.
 *   - `languages` is on the done event and is declared nowhere.
 *
 * That is the fourth provider in this build whose types and deployed API
 * disagree, after Google's documented usage shape, Gemini's thinking parameter
 * and Anthropic's five phantom fields. The conclusion for the provider
 * comparison is unchanged and now better evidenced: neither documentation nor
 * generated types count as evidence for any of them. Only a live call settles it.
 *
 * The transcript came back identical to the script the fixture was synthesised
 * from, which is worth knowing when reading the audio row: this is clean
 * synthetic speech, the easy case for any recogniser.
 */
const CAPTURED = [
  { type: 'transcript.text.delta', delta: "Hello" },
  { type: 'transcript.text.delta', delta: "," },
  { type: 'transcript.text.delta', delta: " I" },
  { type: 'transcript.text.delta', delta: " had" },
  { type: 'transcript.text.delta', delta: " a" },
  { type: 'transcript.text.delta', delta: " phone" },
  { type: 'transcript.text.delta', delta: " call" },
  { type: 'transcript.text.delta', delta: " this" },
  { type: 'transcript.text.delta', delta: " morning" },
  { type: 'transcript.text.delta', delta: " from" },
  { type: 'transcript.text.delta', delta: " a" },
  { type: 'transcript.text.delta', delta: " man" },
  { type: 'transcript.text.delta', delta: " who" },
  { type: 'transcript.text.delta', delta: " said" },
  { type: 'transcript.text.delta', delta: " he" },
  { type: 'transcript.text.delta', delta: " was" },
  { type: 'transcript.text.delta', delta: " from" },
  { type: 'transcript.text.delta', delta: " my" },
  { type: 'transcript.text.delta', delta: " bank" },
  { type: 'transcript.text.delta', delta: "." },
  { type: 'transcript.text.delta', delta: " He" },
  { type: 'transcript.text.delta', delta: " said" },
  { type: 'transcript.text.delta', delta: " somebody" },
  { type: 'transcript.text.delta', delta: " had" },
  { type: 'transcript.text.delta', delta: " been" },
  { type: 'transcript.text.delta', delta: " trying" },
  { type: 'transcript.text.delta', delta: " to" },
  { type: 'transcript.text.delta', delta: " take" },
  { type: 'transcript.text.delta', delta: " money" },
  { type: 'transcript.text.delta', delta: " out" },
  { type: 'transcript.text.delta', delta: " of" },
  { type: 'transcript.text.delta', delta: " my" },
  { type: 'transcript.text.delta', delta: " account" },
  { type: 'transcript.text.delta', delta: "," },
  { type: 'transcript.text.delta', delta: " and" },
  { type: 'transcript.text.delta', delta: " he" },
  { type: 'transcript.text.delta', delta: " asked" },
  { type: 'transcript.text.delta', delta: " me" },
  { type: 'transcript.text.delta', delta: " to" },
  { type: 'transcript.text.delta', delta: " read" },
  { type: 'transcript.text.delta', delta: " him" },
  { type: 'transcript.text.delta', delta: " the" },
  { type: 'transcript.text.delta', delta: " code" },
  { type: 'transcript.text.delta', delta: " they" },
  { type: 'transcript.text.delta', delta: " had" },
  { type: 'transcript.text.delta', delta: " just" },
  { type: 'transcript.text.delta', delta: " sent" },
  { type: 'transcript.text.delta', delta: " to" },
  { type: 'transcript.text.delta', delta: " my" },
  { type: 'transcript.text.delta', delta: " phone" },
  { type: 'transcript.text.delta', delta: "." },
  { type: 'transcript.text.delta', delta: " I" },
  { type: 'transcript.text.delta', delta: " did" },
  { type: 'transcript.text.delta', delta: " not" },
  { type: 'transcript.text.delta', delta: " give" },
  { type: 'transcript.text.delta', delta: " it" },
  { type: 'transcript.text.delta', delta: " to" },
  { type: 'transcript.text.delta', delta: " him" },
  { type: 'transcript.text.delta', delta: "," },
  { type: 'transcript.text.delta', delta: " but" },
  { type: 'transcript.text.delta', delta: " he" },
  { type: 'transcript.text.delta', delta: " knew" },
  { type: 'transcript.text.delta', delta: " my" },
  { type: 'transcript.text.delta', delta: " name" },
  { type: 'transcript.text.delta', delta: " and" },
  { type: 'transcript.text.delta', delta: " he" },
  { type: 'transcript.text.delta', delta: " sounded" },
  { type: 'transcript.text.delta', delta: " very" },
  { type: 'transcript.text.delta', delta: " official" },
  { type: 'transcript.text.delta', delta: "." },
  { type: 'transcript.text.delta', delta: " Now" },
  { type: 'transcript.text.delta', delta: " I" },
  { type: 'transcript.text.delta', delta: " am" },
  { type: 'transcript.text.delta', delta: " worried" },
  { type: 'transcript.text.delta', delta: " I" },
  { type: 'transcript.text.delta', delta: " have" },
  { type: 'transcript.text.delta', delta: " done" },
  { type: 'transcript.text.delta', delta: " something" },
  { type: 'transcript.text.delta', delta: " wrong" },
  { type: 'transcript.text.delta', delta: "." },
  { type: 'transcript.text.delta', delta: " Did" },
  { type: 'transcript.text.delta', delta: " I" },
  { type: 'transcript.text.delta', delta: " do" },
  { type: 'transcript.text.delta', delta: " the" },
  { type: 'transcript.text.delta', delta: " right" },
  { type: 'transcript.text.delta', delta: " thing" },
  { type: 'transcript.text.delta', delta: "?" },
  {
    type: 'transcript.text.done',
    text: "Hello, I had a phone call this morning from a man who said he was from my bank. He said somebody had been trying to take money out of my account, and he asked me to read him the code they had just sent to my phone. I did not give it to him, but he knew my name and he sounded very official. Now I am worried I have done something wrong. Did I do the right thing?",
    usage: { type: 'duration', seconds: 22 },
    languages: ['english'],
  },
] as unknown as OpenAITranscriptionEvent[];

/** The full capture: 87 text deltas, then one done event. */
export const HAPPY_PATH_EVENTS: readonly OpenAITranscriptionEvent[] = CAPTURED;

/**
 * The same stream with the done event removed.
 *
 * A real shape, produced by truncating a real capture: it is what the consumer
 * sees when the connection drops mid transcription. The adapter must treat it
 * as a failure rather than returning a partial transcript it cannot attest to.
 */
export const TRUNCATED_EVENTS: readonly OpenAITranscriptionEvent[] =
  CAPTURED.slice(0, CAPTURED.length - 1);

/** What the provider actually transcribed, for assertions. */
export const CAPTURED_TRANSCRIPT = "Hello, I had a phone call this morning from a man who said he was from my bank. He said somebody had been trying to take money out of my account, and he asked me to read him the code they had just sent to my phone. I did not give it to him, but he knew my name and he sounded very official. Now I am worried I have done something wrong. Did I do the right thing?";
