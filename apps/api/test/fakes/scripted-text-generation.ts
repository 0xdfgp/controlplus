import { ModelId } from '../../src/domain/value-objects/model-id.ts';
import { Usage } from '../../src/domain/value-objects/usage.ts';
import type {
  CompletionChunk,
  GenerationChunk,
  GenerationRequest,
  TextGenerationPort,
} from '../../src/domain/ports/text-generation-port.ts';

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

/** A TextGenerationPort that replays a fixed script. */
export class ScriptedTextGeneration implements TextGenerationPort {
  readonly seenRequests: GenerationRequest[] = [];

  constructor(private readonly chunks: readonly GenerationChunk[]) {}

  async *generate(request: GenerationRequest): AsyncIterable<GenerationChunk> {
    this.seenRequests.push(request);
    for (const chunk of this.chunks) {
      yield chunk;
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
    for (const chunk of this.chunksBeforeFailure) {
      yield chunk;
    }
    throw this.error;
  }
}
