import OpenAI from 'openai';
import type { ResponseInput, ResponseUsage } from 'openai/resources/responses/responses';

import { ProviderUnavailable } from '../../../api/src/domain/errors/provider-unavailable.ts';
import type {
  GenerationChunk,
  GenerationRequest,
  TextGenerationPort,
} from '../../../api/src/domain/ports/text-generation-port.ts';
import { ModelId } from '../../../api/src/domain/value-objects/model-id.ts';
import { Usage } from '../../../api/src/domain/value-objects/usage.ts';

export const OPENAI_PROVIDER = 'openai';

/**
 * TextGenerationPort over the OpenAI Responses API, for the evaluation only.
 *
 * A thin runner rather than an adapter under apps/api, because ADR-017 was
 * superseded and nothing has decided that OpenAI is a provider this product
 * integrates. Wiring one in would be a design decision taken by a measuring
 * instrument, which is the wrong way round: this harness produces numbers and
 * the recommendation is the architect's.
 *
 * It implements the domain port anyway, so the measurement code treats all four
 * candidates identically and no candidate gets a differently-shaped path to a
 * differently-shaped number.
 */
export class OpenAIRunner implements TextGenerationPort {
  constructor(
    private readonly client: OpenAI,
    private readonly modelId: ModelId,
  ) {}

  static withApiKey(apiKey: string, model: string): OpenAIRunner {
    return new OpenAIRunner(new OpenAI({ apiKey }), ModelId.fromString(model));
  }

  async *generate(request: GenerationRequest): AsyncIterable<GenerationChunk> {
    let stream;
    try {
      stream = await this.client.responses.create({
        model: this.modelId.value,
        // The product policy is the system instruction, never a user turn, so
        // no amount of conversation can push it out of the window.
        instructions: request.policy.systemPrompt,
        input: toResponseInput(request),
        stream: true,
      });
    } catch (cause) {
      throw new ProviderUnavailable(OPENAI_PROVIDER, { cause });
    }

    let answeredModel: string | null = null;
    let usage: ResponseUsage | null = null;

    try {
      yield { kind: 'started', modelId: this.modelId, provider: OPENAI_PROVIDER };

      for await (const event of stream) {
        if (event.type === 'response.output_text.delta') {
          if (event.delta.length > 0) {
            yield { kind: 'text', text: event.delta };
          }
          continue;
        }
        if (event.type === 'response.completed') {
          answeredModel = event.response.model;
          usage = event.response.usage ?? null;
          continue;
        }
        if (event.type === 'response.failed' || event.type === 'response.incomplete') {
          throw new ProviderUnavailable(OPENAI_PROVIDER, {
            cause: new Error(`The response ended as ${event.type}.`),
          });
        }
        // Reasoning summary events and lifecycle noise are not the answer and
        // are dropped, not streamed to someone reading at their own pace.
      }

      yield this.close(answeredModel, usage);
    } catch (cause) {
      if (cause instanceof ProviderUnavailable) {
        throw cause;
      }
      throw new ProviderUnavailable(OPENAI_PROVIDER, { cause });
    } finally {
      // Cancellation is expressed by stopping iteration (ADR-012), and the
      // provider keeps billing for tokens nobody is reading.
      try {
        stream.controller.abort();
      } catch {
        /* already finished */
      }
    }
  }

  private close(
    answeredModel: string | null,
    usage: ResponseUsage | null,
  ): GenerationChunk {
    return {
      kind: 'completion',
      usage: toDomainUsage(usage),
      modelId:
        answeredModel === null || answeredModel.length === 0
          ? this.modelId
          : ModelId.fromString(answeredModel),
      provider: OPENAI_PROVIDER,
    };
  }
}

/**
 * Provider usage as the domain's three-part value object.
 *
 * The subtraction is the whole of this function and it is not cosmetic. OpenAI
 * counts reasoning tokens *inside* `output_tokens` and reports the count again
 * under `output_tokens_details`. Assigning both fields straight across would
 * count reasoning twice: once in the output component and once in the reasoning
 * one, inflating both the token total and the cost.
 *
 * Gemini is the opposite: `total_output_tokens` excludes thinking, which is why
 * its adapter assigns both fields directly and why ADR-020's three-part sum
 * matches the provider's own total there. Two providers, two conventions, and
 * the port's contract — that totalTokens() is the three-part sum — only holds
 * on both if the adapter knows which one it is talking to.
 */
function toDomainUsage(usage: ResponseUsage | null): Usage {
  if (usage === null) {
    return Usage.fromCounts(0, 0, 0);
  }
  const reasoning = usage.output_tokens_details?.reasoning_tokens ?? 0;
  const visibleOutput = Math.max(usage.output_tokens - reasoning, 0);
  return Usage.fromCounts(usage.input_tokens, visibleOutput, reasoning);
}

/**
 * The domain's turns in the provider's vocabulary, ending with the question.
 *
 * Image before text, matching both shipped adapters, so a comparison between
 * providers is about the providers rather than about how each was asked.
 */
function toResponseInput(request: GenerationRequest): ResponseInput {
  const input: ResponseInput = request.history.map((turn) => ({
    role: turn.author === 'assistant' ? 'assistant' : 'user',
    content: turn.text,
  }));

  const image = request.image;
  if (image === undefined) {
    input.push({ role: 'user', content: request.question });
    return input;
  }

  input.push({
    role: 'user',
    content: [
      {
        type: 'input_image',
        detail: 'auto',
        image_url: `data:${image.mediaType};base64,${image.data}`,
      },
      { type: 'input_text', text: request.question },
    ],
  });
  return input;
}
