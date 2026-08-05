import { PricingCatalogue } from '../../../api/src/domain/pricing/pricing-catalogue.ts';
import type {
  GenerationImage,
  GenerationTurn,
  TextGenerationPort,
} from '../../../api/src/domain/ports/text-generation-port.ts';
import { ProductPolicy } from '../../../api/src/domain/policy/product-policy.ts';
import { ModelId } from '../../../api/src/domain/value-objects/model-id.ts';
import type { Usage } from '../../../api/src/domain/value-objects/usage.ts';

const catalogue = PricingCatalogue.current();

export interface TokenCounts {
  readonly input: number;
  readonly output: number;
  readonly reasoning: number;
  readonly total: number;
}

export interface CostBreakdown {
  readonly inputUsd: number;
  readonly outputUsd: number;
  readonly reasoningUsd: number;
  readonly totalUsd: number;
}

export interface Measurement {
  readonly answer: string;
  /**
   * Milliseconds to the first chunk of visible answer text.
   *
   * The first *text* chunk, not the started chunk. What the person waits for is
   * words on a screen, which is the same thing ADR-021 measured when it found
   * 18 to 52 seconds of dead air. Null when no text ever arrived.
   */
  readonly timeToFirstTokenMs: number | null;
  readonly totalMs: number;
  readonly tokens: TokenCounts;
  /** The model the provider said answered, which can differ from the request. */
  readonly reportedModel: string;
  readonly provider: string;
  /** Null when the catalogue has no entry: unpriced must look unpriced. */
  readonly cost: CostBreakdown | null;
}

export interface RunInput {
  readonly port: TextGenerationPort;
  readonly question: string;
  readonly history?: readonly GenerationTurn[];
  readonly image?: GenerationImage | undefined;
}

const millisSince = (start: bigint): number =>
  Number(process.hrtime.bigint() - start) / 1_000_000;

/**
 * Runs one turn through a candidate and measures it.
 *
 * Everything here is measured from this side of the port. Timings come from a
 * monotonic clock around the iteration, token counts come from the value object
 * the adapter built out of what the provider reported, and cost comes from the
 * domain catalogue keyed on the model that actually answered. Nothing is
 * estimated from anything else.
 */
export async function runFixture(input: RunInput): Promise<Measurement> {
  const start = process.hrtime.bigint();
  let firstTextAt: number | null = null;
  let answer = '';
  let usage: Usage | null = null;
  let reportedModel = '';
  let provider = '';

  for await (const chunk of input.port.generate({
    policy: ProductPolicy.current(),
    history: input.history ?? [],
    question: input.question,
    image: input.image,
  })) {
    if (chunk.kind === 'text') {
      firstTextAt ??= millisSince(start);
      answer += chunk.text;
      continue;
    }
    if (chunk.kind === 'completion') {
      usage = chunk.usage;
      reportedModel = chunk.modelId.value;
      provider = chunk.provider;
      continue;
    }
    // The started chunk names the model we asked for. The completion names the
    // one that answered, and that is the one worth recording.
    if (reportedModel.length === 0) {
      reportedModel = chunk.modelId.value;
      provider = chunk.provider;
    }
  }

  const totalMs = millisSince(start);

  if (usage === null) {
    throw new Error(
      'The candidate produced no completion chunk, so there is no usage to attribute.',
    );
  }

  return {
    answer,
    timeToFirstTokenMs: firstTextAt,
    totalMs,
    tokens: {
      input: usage.inputTokens.value,
      output: usage.outputTokens.value,
      reasoning: usage.thoughtTokens.value,
      total: usage.totalTokens().value,
    },
    reportedModel,
    provider,
    cost: costOf(reportedModel, usage),
  };
}

function costOf(reportedModel: string, usage: Usage): CostBreakdown | null {
  // The identifier the provider reported, dated snapshot and all. Looking the
  // price up under the alias we asked for is exactly the bug ADR-025 records,
  // and it reports zero rather than failing, which is why it survived S3b.
  const price = catalogue.priceFor(ModelId.fromString(reportedModel));
  if (price === null) {
    return null;
  }

  const cost = price.costOf(usage);
  return {
    inputUsd: cost.inputUsd,
    outputUsd: cost.outputUsd,
    reasoningUsd: cost.reasoningUsd,
    totalUsd: cost.totalUsd(),
  };
}
