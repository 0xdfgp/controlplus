import { describe, expect, it } from 'vitest';

import { ProviderUnavailable } from '../../src/domain/errors/provider-unavailable.ts';
import type {
  TranscriptionChunk,
  TranscriptionPort,
} from '../../src/domain/ports/transcription-port.ts';

/**
 * The shared contract every TranscriptionPort adapter must satisfy.
 *
 * One suite per port (ADR-012), the second of the two. It is written the same
 * way as the TextGenerationPort contract and asserts the same properties where
 * they apply, because the two ports were designed as a pair and a reader
 * comparing them should not have to translate.
 *
 * There is one adapter today. The suite exists anyway, for the reason ADR-012
 * gave: the value of a port is that a second implementation passes the same
 * suite unchanged, and that claim is only checkable if the suite is separate
 * from the adapter that happens to be first.
 *
 * Scenario names are the vocabulary; each adapter supplies its own recorded
 * fixtures for them.
 */
export interface TranscriptionPortScenarios {
  /** Streams the transcript in many deltas, then completes. */
  readonly happyPath: () => TranscriptionPort;
  /** The full transcript the happy path is expected to reassemble to. */
  readonly expectedTranscript: string;
  /** The stream closes without a completion event. */
  readonly truncated: () => TranscriptionPort;
  /** The provider refuses to open the stream at all. */
  readonly failsToOpen: () => TranscriptionPort;
  /** True once the adapter has released the provider stream. */
  readonly wasAborted: () => boolean;
  /** Resets abort tracking between cases. */
  readonly reset: () => void;
}

/** The recording every scenario is asked about. Base64 of a short WAV header. */
export const CONTRACT_AUDIO = {
  data: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=',
  mediaType: 'audio/wav',
  fileName: 'contract.wav',
} as const;

async function collect(port: TranscriptionPort): Promise<TranscriptionChunk[]> {
  const chunks: TranscriptionChunk[] = [];
  for await (const chunk of port.transcribe({ audio: CONTRACT_AUDIO })) {
    chunks.push(chunk);
  }
  return chunks;
}

export function describeTranscriptionPortContract(
  adapterName: string,
  scenarios: TranscriptionPortScenarios,
): void {
  describe(`TranscriptionPort contract: ${adapterName}`, () => {
    it('opens with exactly one started chunk, before any transcript text', async () => {
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

      expect(started.modelId.value.length).toBeGreaterThan(0);
      expect(started.provider.length).toBeGreaterThan(0);
    });

    it('streams text chunks and ends with exactly one completion chunk', async () => {
      const chunks = await collect(scenarios.happyPath());

      const kinds = chunks.map((c) => c.kind);
      expect(kinds.filter((k) => k === 'completion')).toHaveLength(1);
      expect(kinds.at(-1)).toBe('completion');
      // Many, not one. A provider that returned the whole transcript in a
      // single chunk would satisfy an ordering assertion and would not be
      // streaming, which is the same hole the S1 e2e had (ADR-028).
      expect(kinds.filter((k) => k === 'text').length).toBeGreaterThan(1);
    });

    it('reassembles the deltas into the transcript, in order', async () => {
      const chunks = await collect(scenarios.happyPath());

      const text = chunks
        .filter(
          (c): c is Extract<TranscriptionChunk, { kind: 'text' }> =>
            c.kind === 'text',
        )
        .map((c) => c.text)
        .join('');

      expect(text).toBe(scenarios.expectedTranscript);
    });

    it('reports the same transcript on the completion chunk', async () => {
      const chunks = await collect(scenarios.happyPath());
      const completion = chunks.at(-1);
      if (completion?.kind !== 'completion') {
        throw new Error('expected a completion chunk');
      }

      expect(completion.transcript).toBe(scenarios.expectedTranscript);
      expect(completion.modelId.value.length).toBeGreaterThan(0);
      expect(completion.provider.length).toBeGreaterThan(0);
    });

    it('carries no token usage, because transcription is billed by duration', async () => {
      const chunks = await collect(scenarios.happyPath());
      const completion = chunks.at(-1);
      if (completion?.kind !== 'completion') {
        throw new Error('expected a completion chunk');
      }

      // ADR-011 keeps audio seconds and tokens as two ledger lines. A Usage on
      // this chunk would invite them to be summed, which is the blended figure
      // that decision exists to prevent.
      expect(Object.keys(completion)).not.toContain('usage');
    });

    it('treats a stream that ends without completing as a failure', async () => {
      // A partial transcript is not a transcript. Handing one back as if it
      // were finished would put words in the user's mouth that they can no
      // longer see were cut off.
      await expect(collect(scenarios.truncated())).rejects.toBeInstanceOf(
        ProviderUnavailable,
      );
    });

    it('translates a failure to open the stream into ProviderUnavailable', async () => {
      await expect(collect(scenarios.failsToOpen())).rejects.toBeInstanceOf(
        ProviderUnavailable,
      );
    });

    it('releases the provider stream when the consumer stops early', async () => {
      scenarios.reset();
      const port = scenarios.happyPath();

      for await (const chunk of port.transcribe({ audio: CONTRACT_AUDIO })) {
        if (chunk.kind === 'text') {
          break;
        }
      }

      // Cancellation is expressed by stopping iteration (ADR-012). The adapter
      // aborts in its finally, so nothing keeps billing for a transcript nobody
      // is reading.
      expect(scenarios.wasAborted()).toBe(true);
    });

    it('releases the provider stream after a normal completion', async () => {
      scenarios.reset();
      await collect(scenarios.happyPath());

      expect(scenarios.wasAborted()).toBe(true);
    });

    it('leaks no provider type across the port', async () => {
      const chunks = await collect(scenarios.happyPath());

      for (const chunk of chunks) {
        expect(['started', 'text', 'completion']).toContain(chunk.kind);
        expect(Object.keys(chunk)).not.toContain('type');
        expect(Object.keys(chunk)).not.toContain('delta');
      }
    });
  });
}
