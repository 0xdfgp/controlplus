import { PricingCatalogue } from '../../../api/src/domain/pricing/pricing-catalogue.ts';
import { ModelId } from '../../../api/src/domain/value-objects/model-id.ts';
import { Usage } from '../../../api/src/domain/value-objects/usage.ts';
import type { JudgeOutcome } from '../scoring/judge.ts';
import type { CellResult, LedgerLine } from './results.ts';

const catalogue = PricingCatalogue.current();

/**
 * Published on 2026-08-05: gpt-transcribe is billed per minute of audio, not
 * per token.
 *
 * It is a separate ledger line and stays out of the domain's token catalogue,
 * which is what ADR-011 asked for: audio seconds billed by the transcription
 * service, tokens by the generation service, two lines rather than one blended
 * calculation. Blending them would also hide that the audio cost here is
 * rounding error next to generation, which is a real finding.
 */
const TRANSCRIBE_USD_PER_MINUTE = 0.0045;

/** gpt-4o-mini-tts, $0.60 per million input text tokens. */
const TTS_USD_PER_MILLION_TEXT_TOKENS = 0.6;
const CHARS_PER_TOKEN_ESTIMATE = 4;

export function candidateLedgerLine(cells: readonly CellResult[]): LedgerLine {
  const usd = cells.reduce(
    (sum, cell) => sum + (cell.measurement?.cost?.totalUsd ?? 0),
    0,
  );
  const answered = cells.filter((cell) => cell.measurement !== null).length;
  return {
    id: 'candidates',
    description: 'Candidate generation',
    basis: `${answered} answers, priced three ways from the domain catalogue on the model that answered`,
    usd,
  };
}

export function judgeLedgerLine(outcomes: readonly JudgeOutcome[]): LedgerLine {
  let usd = 0;
  let unpriced = 0;

  for (const outcome of outcomes) {
    const price = catalogue.priceFor(ModelId.fromString(outcome.judgeModel));
    if (price === null) {
      unpriced += 1;
      continue;
    }
    usd += price
      .costOf(
        Usage.fromCounts(
          outcome.usage.input,
          outcome.usage.output,
          outcome.usage.reasoning,
        ),
      )
      .totalUsd();
  }

  return {
    id: 'judges',
    description: 'Layer two judging',
    basis:
      `${outcomes.length} gradings` +
      (unpriced > 0 ? `, ${unpriced} of them on a model the catalogue does not price` : ''),
    usd,
  };
}

export function transcriptionLedgerLine(seconds: number): LedgerLine {
  return {
    id: 'transcription',
    description: 'Voice fixture transcription',
    basis: `${seconds.toFixed(1)}s of audio at $${TRANSCRIBE_USD_PER_MINUTE.toFixed(4)} per minute`,
    usd: (seconds / 60) * TRANSCRIBE_USD_PER_MINUTE,
  };
}

/**
 * The one-off cost of synthesising the voice fixture.
 *
 * Not part of a run: the WAV is committed, so a normal evaluation never calls
 * the speech API. Reported anyway because it was real money spent to make this
 * comparison possible, and because leaving it out would make the total look
 * tidier than it is.
 *
 * Marked approximate on purpose. The speech endpoint returns audio, not a token
 * count, so this is characters divided by an assumed tokens-per-character
 * ratio. An exact-looking figure derived from a guess would be worse than a
 * labelled estimate.
 */
export function ttsLedgerLine(scriptCharacters: number): LedgerLine {
  const tokens = scriptCharacters / CHARS_PER_TOKEN_ESTIMATE;
  return {
    id: 'tts',
    description: 'Voice fixture synthesis (one-off, not part of a run)',
    basis: `${scriptCharacters} characters of script, estimated at ~${CHARS_PER_TOKEN_ESTIMATE} characters per token`,
    usd: (tokens / 1_000_000) * TTS_USD_PER_MILLION_TEXT_TOKENS,
    approximate: true,
  };
}
