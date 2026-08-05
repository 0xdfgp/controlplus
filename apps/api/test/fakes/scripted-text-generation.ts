import { ModelId } from '../../src/domain/value-objects/model-id.ts';
import { Usage } from '../../src/domain/value-objects/usage.ts';
import type {
  CompletionChunk,
  GenerationChunk,
  GenerationRequest,
  StartedChunk,
  TextGenerationPort,
} from '../../src/domain/ports/text-generation-port.ts';

export function startedChunk(
  overrides: Partial<Omit<StartedChunk, 'kind'>> = {},
): StartedChunk {
  return {
    kind: 'started',
    modelId: overrides.modelId ?? ModelId.fromString('gemini-3.5-flash'),
    provider: overrides.provider ?? 'google',
  };
}

export function completionChunk(
  overrides: Partial<Omit<CompletionChunk, 'kind'>> = {},
): CompletionChunk {
  return {
    kind: 'completion',
    usage: overrides.usage ?? Usage.fromCounts(18, 42),
    modelId: overrides.modelId ?? ModelId.fromString('gemini-3.5-flash'),
    provider: overrides.provider ?? 'google',
  };
}

/**
 * A TextGenerationPort that replays a fixed script.
 *
 * It opens with a started chunk unless the script supplies its own, because a
 * real adapter does and a turn stopped before the first delta has nothing to
 * attribute the partial to otherwise.
 *
 * `released` records that the consumer's iteration ended, which is what a real
 * adapter turns into aborting the provider stream.
 */
export class ScriptedTextGeneration implements TextGenerationPort {
  readonly seenRequests: GenerationRequest[] = [];
  released = false;

  constructor(private readonly chunks: readonly GenerationChunk[]) {}

  async *generate(request: GenerationRequest): AsyncIterable<GenerationChunk> {
    this.seenRequests.push(request);
    try {
      if (this.chunks[0]?.kind !== 'started') {
        yield startedChunk();
      }
      for (const chunk of this.chunks) {
        yield chunk;
      }
    } finally {
      this.released = true;
    }
  }
}

/** A TextGenerationPort that fails partway through, like a dropped connection. */
export class FailingTextGeneration implements TextGenerationPort {
  constructor(
    private readonly error: Error,
    private readonly chunksBeforeFailure: readonly GenerationChunk[] = [],
  ) {}

  async *generate(): AsyncIterable<GenerationChunk> {
    yield startedChunk();
    for (const chunk of this.chunksBeforeFailure) {
      yield chunk;
    }
    throw this.error;
  }
}
