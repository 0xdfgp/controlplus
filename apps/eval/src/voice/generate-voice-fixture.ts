import { writeFileSync } from 'node:fs';

import OpenAI from 'openai';

import { fixturePath, loadFixtures } from '../fixtures/load-fixtures.ts';
import { requireEnv } from '../config.ts';

/**
 * The voice fixture is synthesised, not recorded from a person.
 *
 * Stated here as well as in the report, because it is the single most
 * misreadable thing in the whole evaluation. What this measures honestly is the
 * latency, the cost and the integration effort of the transcription hop. What it
 * says nothing about is recognition accuracy on a 78 year old voice, which is
 * exactly where ADR-018 records that on-device quality diverges most. Clean
 * synthetic speech is the easy case for any recogniser.
 *
 * Run once with `npm run eval:voice`; the WAV is then committed, so every
 * evaluation run transcribes identical bytes and the comparison is reproducible
 * from the repository rather than from whoever last held a microphone.
 */
const TTS_MODEL = 'gpt-4o-mini-tts';
const TTS_VOICE = 'alloy';

/**
 * Recorded so the fixture is reproducible, and because it is the only thing
 * standing between "synthetic speech" and "synthetic speech read like a
 * newsreader", which would be an even weaker proxy for the real case.
 */
const TTS_INSTRUCTIONS = [
  'Speak as an anxious woman in her late seventies talking to a support line.',
  'Speak slowly, with natural pauses, as if choosing your words.',
  'Sound worried but polite, not theatrical.',
].join(' ');

async function main(): Promise<void> {
  const apiKey = requireEnv('OPENAI_API_KEY');
  const fixtures = loadFixtures();
  const voice = fixtures.fixtures.find((f) => f.kind === 'voice');
  if (voice === undefined) {
    throw new Error('No voice fixture in questions.json.');
  }

  const client = new OpenAI({ apiKey });
  const response = await client.audio.speech.create({
    model: TTS_MODEL,
    voice: TTS_VOICE,
    input: voice.script,
    instructions: TTS_INSTRUCTIONS,
    // 16 bit PCM at 24 kHz, which is what this model emits and what
    // gpt-transcribe accepts. No lossy codec sits between the fixture and the
    // measurement, and no resampling step exists to get wrong.
    response_format: 'wav',
  });

  const target = fixturePath(voice.audio);
  writeFileSync(target, Buffer.from(await response.arrayBuffer()));

  const characters = voice.script.length;
  process.stdout.write(
    `Wrote ${target}\n` +
      `  model ${TTS_MODEL}, voice ${TTS_VOICE}, ${characters} characters of script\n` +
      '  Commit this file. Re-running it changes the fixture and therefore the comparison.\n',
  );
}

await main();
