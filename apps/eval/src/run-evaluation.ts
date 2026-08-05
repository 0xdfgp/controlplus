import { OpenAITranscriptionAdapter } from '../../api/src/infrastructure/openai/openai-transcription-adapter.ts';
import {
  OpenAITranscriptionStreamOpener,
  TRANSCRIPTION_MODEL,
} from '../../api/src/infrastructure/openai/transcription-stream.ts';
import { ModelId } from '../../api/src/domain/value-objects/model-id.ts';
import { optionalEnv, requireEnv } from './config.ts';
import { loadAudio } from './fixtures/load-fixtures.ts';
import { GeminiJudge } from './scoring/gemini-judge.ts';
import { OpenAIJudge } from './scoring/openai-judge.ts';
import type { Judge } from './scoring/judge.ts';
import type { TranscriptionRecord } from './report/results.ts';

/**
 * Words only, lowercased.
 *
 * Punctuation and spacing are exactly what a speech recogniser is entitled to
 * render differently from the script it was read from, and none of it changes
 * the question the candidates are asked.
 */
export function normaliseForComparison(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Transcribes the voice fixture once per run, through the real port. */
export async function transcribeVoiceFixture(
  audioPath: string,
  script: string,
): Promise<{ record: TranscriptionRecord; seconds: number }> {
  const audio = loadAudio(audioPath);
  const adapter = new OpenAITranscriptionAdapter(
    OpenAITranscriptionStreamOpener.withApiKey(requireEnv('OPENAI_API_KEY')),
    ModelId.fromString(TRANSCRIPTION_MODEL),
  );

  const start = process.hrtime.bigint();
  const elapsed = (): number => Number(process.hrtime.bigint() - start) / 1_000_000;

  let firstTextAt: number | null = null;
  let transcript = '';
  let model = TRANSCRIPTION_MODEL;
  let provider = 'openai';

  for await (const chunk of adapter.transcribe({ audio })) {
    if (chunk.kind === 'text') {
      firstTextAt ??= elapsed();
      continue;
    }
    if (chunk.kind === 'completion') {
      transcript = chunk.transcript;
      model = chunk.modelId.value;
      provider = chunk.provider;
    }
  }

  return {
    seconds: audio.seconds,
    record: {
      model,
      provider,
      transcript,
      // Worth recording rather than assuming: the fixture is synthesised from
      // this exact script, so a mismatch would mean the transcription hop lost
      // something and the four candidates are no longer being asked the same
      // question as the script says they are.
      //
      // Compared on words, not characters. Strict equality reported a mismatch
      // for "Hello. I had" against "Hello, I had" — a full stop heard as a
      // comma, which is not the transcription losing anything and is not a
      // difference any of the four candidates can see. A check that fires on
      // that tells the reader nothing.
      matchesScript: normaliseForComparison(transcript) === normaliseForComparison(script),
      audioSeconds: audio.seconds,
      audioBytes: audio.bytes,
      timeToFirstTokenMs: firstTextAt,
      totalMs: elapsed(),
    },
  };
}

/**
 * Judge per candidate, chosen so no run is self-judged (ADR-033).
 *
 * With three families and four candidates there is no single judge that covers
 * all four without grading its own family, so three rows share the OpenAI judge
 * and the OpenAI row is graded by Gemini. That asymmetry is real and the report
 * names it. It is not self-judging, which is the thing ADR-033 actually
 * required and the thing that would have made a ranking claim unusable.
 */
export interface JudgePair {
  /** Cross-family with the candidate. Its verdict is the headline. */
  readonly primary: Judge;
  /** The other judge, recorded so the judge effect is measurable. */
  readonly secondary: Judge;
}

export function buildJudges(): ReadonlyMap<string, JudgePair> {
  const openai = OpenAIJudge.withApiKey(
    requireEnv('OPENAI_API_KEY'),
    optionalEnv('EVAL_OPENAI_JUDGE', 'gpt-5.5'),
  );
  const gemini = GeminiJudge.withApiKey(
    requireEnv('GEMINI_API_KEY'),
    optionalEnv('EVAL_GEMINI_JUDGE', 'gemini-3.5-flash'),
  );

  const openaiPrimary: JudgePair = { primary: openai, secondary: gemini };

  return new Map<string, JudgePair>([
    ['anthropic-sonnet-4-5', openaiPrimary],
    ['anthropic-opus-5', openaiPrimary],
    ['gemini', openaiPrimary],
    // The one candidate OpenAI may not grade. Gemini leads, OpenAI is the
    // secondary and is a self-judgement, recorded and excluded.
    ['openai', { primary: gemini, secondary: openai }],
  ]);
}
