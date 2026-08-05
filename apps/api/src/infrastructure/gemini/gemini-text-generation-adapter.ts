import { ProviderUnavailable } from '../../domain/errors/provider-unavailable.ts';
import type {
  GenerationChunk,
  GenerationRequest,
  TextGenerationPort,
} from '../../domain/ports/text-generation-port.ts';
import { ModelId } from '../../domain/value-objects/model-id.ts';
import { Usage } from '../../domain/value-objects/usage.ts';
import type {
  InteractionEvent,
  InteractionStreamOpener,
  InteractionTurn,
} from './interaction-stream.ts';

export const GEMINI_PROVIDER = 'google';

/**
 * The domain's turns in the provider's vocabulary, ending with the question.
 *
 * Translation and nothing else. Which messages are here, what order they are
 * in and how a stopped answer is marked were all settled in the domain before
 * this was called; the only judgement made here is that Gemini calls the
 * assistant side "model".
 */
function toInteractionTurns(request: GenerationRequest): InteractionTurn[] {
  const turns = request.history.map(
    (turn): InteractionTurn => ({
      role: turn.author === 'assistant' ? 'model' : 'user',
      content: turn.text,
    }),
  );
  turns.push({ role: 'user', content: request.question });
  return turns;
}

/**
 * TextGenerationPort over the Gemini Interactions API (ADR-017).
 *
 * Normalises provider events into domain chunks here, so no provider type
 * crosses the port. Every failure becomes ProviderUnavailable: nothing above
 * this line branches on an SDK error.
 *
 * Only `step.delta` events of type `text` become answer text. Thought summaries
 * and tool deltas are not the answer and are dropped, not streamed to someone
 * reading at their own pace.
 */
export class GeminiTextGenerationAdapter implements TextGenerationPort {
  constructor(
    private readonly opener: InteractionStreamOpener,
    private readonly defaultModelId: ModelId,
  ) {}

  async *generate(
    request: GenerationRequest,
  ): AsyncIterable<GenerationChunk> {
    let stream;
    try {
      stream = await this.opener.open({
        model: this.defaultModelId.value,
        systemInstruction: request.policy.systemPrompt,
        input: toInteractionTurns(request),
      });
    } catch (cause) {
      throw new ProviderUnavailable(GEMINI_PROVIDER, { cause });
    }

    const iterator = stream.events();
    try {
      // Named before the provider has said anything, so a turn stopped in the
      // first second is still attributable. Waiting for interaction.created
      // would read better but it lands around 280ms in, and a turn stopped
      // before that could not be recorded at all.
      //
      // Inside the try, because a consumer that stops here must still release
      // the provider stream.
      yield {
        kind: 'started',
        modelId: this.defaultModelId,
        provider: GEMINI_PROVIDER,
      };

      while (true) {
        const step = await iterator.next();
        if (step.done === true) {
          return;
        }
        const chunk = this.translate(step.value);
        if (chunk !== null) {
          yield chunk;
        }
      }
    } catch (cause) {
      if (cause instanceof ProviderUnavailable) {
        throw cause;
      }
      throw new ProviderUnavailable(GEMINI_PROVIDER, { cause });
    } finally {
      // Reached on normal completion, on error, and when the consumer stops
      // iterating early. S2 wires the UI to that last case; the adapter is
      // already correct for it.
      await stream.abort();
    }
  }

  private translate(event: InteractionEvent): GenerationChunk | null {
    if (event.event_type === 'step.delta') {
      return event.delta.type === 'text' && event.delta.text.length > 0
        ? { kind: 'text', text: event.delta.text }
        : null;
    }

    if (event.event_type === 'error') {
      throw new ProviderUnavailable(GEMINI_PROVIDER, { cause: event.error });
    }

    if (event.event_type === 'interaction.completed') {
      return this.translateCompletion(event.interaction);
    }

    // interaction.created, interaction.status_update, step.start, step.stop:
    // lifecycle noise the domain has no use for in this slice.
    return null;
  }

  private translateCompletion(
    interaction: Extract<
      InteractionEvent,
      { event_type: 'interaction.completed' }
    >['interaction'],
  ): GenerationChunk {
    if (interaction.status !== 'completed') {
      throw new ProviderUnavailable(GEMINI_PROVIDER, {
        cause: new Error(`Interaction ended with status ${interaction.status}.`),
      });
    }

    // Every field on the provider's usage object is optional. When the provider
    // reports nothing we record zero rather than refusing the answer, and the
    // zero is visible in the turn's log line.
    const usage = interaction.usage;

    return {
      kind: 'completion',
      usage: Usage.fromCounts(
        usage?.total_input_tokens ?? 0,
        usage?.total_output_tokens ?? 0,
        // Gemini bills thinking outside input and output (ADR-020). Absent on
        // a model that does not think, which records zero.
        usage?.total_thought_tokens ?? 0,
      ),
      // The model that actually answered, when the provider says so. It may
      // differ from the one we asked for, and provenance should record what
      // happened rather than what we requested.
      modelId:
        interaction.model === undefined || interaction.model.length === 0
          ? this.defaultModelId
          : ModelId.fromString(interaction.model),
      provider: GEMINI_PROVIDER,
    };
  }
}
