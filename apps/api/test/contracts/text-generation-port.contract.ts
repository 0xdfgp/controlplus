import { describe, expect, it } from 'vitest';

import { ProviderUnavailable } from '../../src/domain/errors/provider-unavailable.ts';
import { ProductPolicy } from '../../src/domain/policy/product-policy.ts';
import type {
  GenerationChunk,
  TextGenerationPort,
} from '../../src/domain/ports/text-generation-port.ts';

/**
 * The shared contract every TextGenerationPort adapter must satisfy.
 *
 * One suite per port, run against each adapter (ADR-012). The OpenAI adapter in
 * S10 imports this file and passes it unchanged, or it is not a
 * TextGenerationPort.
 *
 * Scenario names are the vocabulary; each adapter supplies its own recorded
 * fixtures for them.
 */
export interface TextGenerationPortScenarios {
  /** Streams three text runs, then completes with usage 118 in / 27 out. */
  readonly happyPath: () => TextGenerationPort;
  /**
   * What `happyPath`'s completion reports as reasoning.
   *
   * This is the one number the port cannot fix for every provider, and it is
   * parameterised rather than asserted because pretending otherwise would make
   * one provider's billing model a requirement of the port. Gemini bills
   * reasoning outside input and output and reports it separately (ADR-020);
   * Anthropic bills it inside output_tokens and reports no separate count
   * (ADR-032), so zero is what it reported rather than an estimate.
   *
   * The invariant that does hold for both, and is asserted unconditionally
   * below, is that totalTokens() is the three-part sum. That is what the
   * ADR-020 regression actually broke.
   */
  readonly expectedThoughtTokens: number;
  /** Completes with usage reported but no separate reasoning count. */
  readonly noThoughtTokens: () => TextGenerationPort;
  /** Emits a non-answer delta (a thought summary) alongside answer text. */
  readonly withNonAnswerDeltas: () => TextGenerationPort;
  /** The provider reports an error mid-stream. */
  readonly providerError: () => TextGenerationPort;
  /** The stream closes with a non-successful terminal status. */
  readonly failedStatus: () => TextGenerationPort;
  /** The completion carries no usage block. */
  readonly noUsage: () => TextGenerationPort;
  /**
   * Maps a photo travelling with the question onto the provider's own image
   * block, and reports what was sent (S4, ADR-024).
   *
   * OPTIONAL, and the reason is worth stating rather than leaving as a `?`.
   * The S4 brief asks this suite to gain an image scenario and puts the Gemini
   * adapter out of scope in the same document. Making it mandatory would fail
   * the Gemini adapter, which is still in the tree and still implements this
   * port. An adapter that does not declare these two hooks does not get the
   * cases below: nothing is marked as pending and no assertion is reduced to
   * nothing, the block is simply not generated.
   *
   * S10 wires Gemini and supplies them, at which point this stops being
   * optional. Until then the contract is uniform on everything else and this
   * one capability is declared per adapter, which is honest about where the
   * build actually is.
   */
  readonly imageTurn?: (() => TextGenerationPort) | undefined;
  /** What the adapter handed the provider for the image, if anything. */
  readonly sentImage?:
    | (() => { readonly mediaType: string; readonly data: string } | null)
    | undefined;
  /** Whether the question text still reached the provider alongside it. */
  readonly sentQuestionWithImage?: (() => string | null) | undefined;
  /** True once the adapter has released the provider stream. */
  readonly wasAborted: () => boolean;
  /** Resets abort tracking between cases. */
  readonly reset: () => void;
}

/**
 * The photo the image scenario sends. Shared, so an adapter's own tests assert
 * against the same bytes the contract does.
 */
export const CONTRACT_IMAGE = {
  data: 'LzlqLzRBQVFTa1pKUmdBQkFRQUFBUUFCQUFELy1ub3QtYS1yZWFsLXBob3Rv',
  mediaType: 'image/jpeg',
  width: 1568,
  height: 1176,
} as const;

export const CONTRACT_IMAGE_QUESTION = 'What does this message on my screen mean?';

async function collect(
  port: TextGenerationPort,
  image?: typeof CONTRACT_IMAGE,
): Promise<GenerationChunk[]> {
  const chunks: GenerationChunk[] = [];
  for await (const chunk of port.generate({
    policy: ProductPolicy.current(),
    history: [],
    question:
      image === undefined
        ? 'Is this text about my bank a scam?'
        : CONTRACT_IMAGE_QUESTION,
    image,
  })) {
    chunks.push(chunk);
  }
  return chunks;
}

export function describeTextGenerationPortContract(
  adapterName: string,
  scenarios: TextGenerationPortScenarios,
): void {
  describe(`TextGenerationPort contract: ${adapterName}`, () => {
    it('opens with exactly one started chunk, before any answer text', async () => {
      const chunks = await collect(scenarios.happyPath());

      const kinds = chunks.map((c) => c.kind);
      expect(kinds.filter((k) => k === 'started')).toHaveLength(1);
      expect(kinds[0]).toBe('started');
    });

    it('names the model and provider on the started chunk', async () => {
      const chunks = await collect(scenarios.happyPath());
      const started = chunks[0];
      if (started?.kind !== 'started') {
        throw new Error('expected a started chunk first');
      }

      // What makes a turn stopped before completion attributable at all.
      expect(started.modelId.value.length).toBeGreaterThan(0);
      expect(started.provider.length).toBeGreaterThan(0);
    });

    it('streams text chunks and ends with exactly one completion chunk', async () => {
      const chunks = await collect(scenarios.happyPath());

      const kinds = chunks.map((c) => c.kind);
      expect(kinds.filter((k) => k === 'completion')).toHaveLength(1);
      expect(kinds.at(-1)).toBe('completion');
      expect(kinds.filter((k) => k === 'text').length).toBeGreaterThan(1);
    });

    it('normalises provider chunks so the text reassembles in order', async () => {
      const chunks = await collect(scenarios.happyPath());

      const text = chunks
        .filter((c): c is Extract<GenerationChunk, { kind: 'text' }> => c.kind === 'text')
        .map((c) => c.text)
        .join('');

      expect(text).toBe(
        'That message has two signs of a scam: it asks you to click a link right away, and it tries to make you feel rushed.',
      );
    });

    it('reports usage as a domain value object on the completion chunk', async () => {
      const chunks = await collect(scenarios.happyPath());
      const completion = chunks.at(-1);
      if (completion?.kind !== 'completion') {
        throw new Error('expected a completion chunk');
      }

      expect(completion.usage.inputTokens.value).toBe(118);
      expect(completion.usage.outputTokens.value).toBe(27);
      expect(completion.usage.thoughtTokens.value).toBe(
        scenarios.expectedThoughtTokens,
      );
      // The three-part sum, matching the provider's own total (ADR-020).
      expect(completion.usage.totalTokens().value).toBe(
        118 + 27 + scenarios.expectedThoughtTokens,
      );
    });

    it('reports whatever the provider said about reasoning, and no more', async () => {
      const chunks = await collect(scenarios.happyPath());
      const completion = chunks.at(-1);
      if (completion?.kind !== 'completion') {
        throw new Error('expected a completion chunk');
      }

      // The failure this guards against is a total that silently excludes
      // reasoning, which on Gemini understated real spend by roughly ten times.
      // On a provider that reports no separate count the same assertion says
      // the adapter invented nothing, which is the other way to get this wrong.
      expect(completion.usage.thoughtTokens.value).toBe(
        scenarios.expectedThoughtTokens,
      );
      expect(completion.usage.totalTokens().value).toBe(
        completion.usage.inputTokens.value +
          completion.usage.outputTokens.value +
          completion.usage.thoughtTokens.value,
      );
    });

    it('records zero thinking tokens when the provider reports no reasoning count', async () => {
      const chunks = await collect(scenarios.noThoughtTokens());
      const completion = chunks.at(-1);
      if (completion?.kind !== 'completion') {
        throw new Error('expected a completion chunk');
      }

      expect(completion.usage.inputTokens.value).toBe(31);
      expect(completion.usage.outputTokens.value).toBe(12);
      expect(completion.usage.thoughtTokens.value).toBe(0);
      expect(completion.usage.totalTokens().value).toBe(43);
    });

    it('names the model and provider that produced the answer', async () => {
      const chunks = await collect(scenarios.happyPath());
      const completion = chunks.at(-1);
      if (completion?.kind !== 'completion') {
        throw new Error('expected a completion chunk');
      }

      expect(completion.modelId.value.length).toBeGreaterThan(0);
      expect(completion.provider.length).toBeGreaterThan(0);
    });

    it('does not stream non-answer deltas as answer text', async () => {
      const chunks = await collect(scenarios.withNonAnswerDeltas());

      const text = chunks
        .filter((c): c is Extract<GenerationChunk, { kind: 'text' }> => c.kind === 'text')
        .map((c) => c.text)
        .join('');

      expect(text).toBe('Yes. That is a scam.');
    });

    it('translates a provider error into ProviderUnavailable', async () => {
      await expect(collect(scenarios.providerError())).rejects.toBeInstanceOf(
        ProviderUnavailable,
      );
    });

    it('translates a non-successful terminal status into ProviderUnavailable', async () => {
      await expect(collect(scenarios.failedStatus())).rejects.toBeInstanceOf(
        ProviderUnavailable,
      );
    });

    it('records zero usage rather than refusing an answer that reported none', async () => {
      const chunks = await collect(scenarios.noUsage());
      const completion = chunks.at(-1);
      if (completion?.kind !== 'completion') {
        throw new Error('expected a completion chunk');
      }

      expect(completion.usage.inputTokens.value).toBe(0);
      expect(completion.usage.outputTokens.value).toBe(0);
      expect(completion.usage.thoughtTokens.value).toBe(0);
    });

    it('leaks no provider type across the port', async () => {
      const chunks = await collect(scenarios.happyPath());

      for (const chunk of chunks) {
        expect(['started', 'text', 'completion']).toContain(chunk.kind);
        expect(Object.keys(chunk).sort()).not.toContain('event_type');
      }
    });

    it('releases the provider stream when iteration completes', async () => {
      scenarios.reset();
      await collect(scenarios.happyPath());

      expect(scenarios.wasAborted()).toBe(true);
    });

    it('releases the provider stream when the consumer stops early', async () => {
      scenarios.reset();
      const port = scenarios.happyPath();
      const seen: GenerationChunk['kind'][] = [];

      for await (const chunk of port.generate({
        policy: ProductPolicy.current(),
        history: [],
        question: 'Is this a scam?',
      })) {
        seen.push(chunk.kind);
        if (chunk.kind === 'text') {
          break; // Cancellation is stopping iteration. No AbortSignal involved.
        }
      }

      expect(scenarios.wasAborted()).toBe(true);
      // The turn was attributable at the moment it was abandoned. Without this
      // the partial answer could not be recorded, because a Message cannot be
      // built without provenance.
      expect(seen[0]).toBe('started');
    });

    it('releases the provider stream when the consumer stops before any text', async () => {
      scenarios.reset();
      const port = scenarios.happyPath();

      // The app backgrounded during the thinking silence: the client is gone
      // before a single word arrived, and the provider must not keep billing.
      for await (const _chunk of port.generate({
        policy: ProductPolicy.current(),
        history: [],
        question: 'Is this a scam?',
      })) {
        break;
      }

      expect(scenarios.wasAborted()).toBe(true);
    });

    it('releases the provider stream when the provider errors', async () => {
      scenarios.reset();
      await expect(collect(scenarios.providerError())).rejects.toBeInstanceOf(
        ProviderUnavailable,
      );

      expect(scenarios.wasAborted()).toBe(true);
    });

    describeImageMapping(scenarios);
  });
}

/**
 * The image cases, generated only for an adapter that declares them.
 *
 * See `imageTurn` on the scenarios interface for why this is conditional
 * rather than mandatory. The condition is on the scenario being declared, not
 * on a runtime flag: an adapter that supplies the hooks gets every case below,
 * and no case is ever skipped or emptied.
 */
function describeImageMapping(scenarios: TextGenerationPortScenarios): void {
  const imageTurn = scenarios.imageTurn;
  const sentImage = scenarios.sentImage;
  const sentQuestionWithImage = scenarios.sentQuestionWithImage;

  if (
    imageTurn === undefined ||
    sentImage === undefined ||
    sentQuestionWithImage === undefined
  ) {
    return;
  }

  describe('a photo travelling with the question (ADR-024)', () => {
    it('maps it onto the provider image block, bytes intact', async () => {
      await collect(imageTurn(), CONTRACT_IMAGE);

      const image = sentImage();
      expect(image?.mediaType).toBe(CONTRACT_IMAGE.mediaType);
      expect(image?.data).toBe(CONTRACT_IMAGE.data);
    });

    it('keeps the question alongside it, not instead of it', async () => {
      await collect(imageTurn(), CONTRACT_IMAGE);

      // The photo and the question about it are one turn. An adapter that sent
      // the picture and dropped the words would produce a confident answer to
      // a question nobody asked.
      expect(sentQuestionWithImage()).toBe(CONTRACT_IMAGE_QUESTION);
    });

    it('sends no image block on a turn that has no photo', async () => {
      await collect(imageTurn());

      expect(sentImage()).toBeNull();
    });

    it('answers an image turn through the same chunks as any other', async () => {
      const chunks = await collect(imageTurn(), CONTRACT_IMAGE);

      // Nothing about the response path changes because a picture went up.
      const kinds = chunks.map((c) => c.kind);
      expect(kinds[0]).toBe('started');
      expect(kinds.at(-1)).toBe('completion');
      expect(kinds).toContain('text');
    });
  });
}
