import { ProviderUnavailable } from '../../domain/errors/provider-unavailable.ts';
import type {
  GenerationChunk,
  GenerationRequest,
  TextGenerationPort,
} from '../../domain/ports/text-generation-port.ts';
import { ModelId } from '../../domain/value-objects/model-id.ts';
import { Usage } from '../../domain/value-objects/usage.ts';
import type {
  AnthropicEvent,
  MessageStreamOpener,
  MessageTurn,
} from './message-stream.ts';

export const ANTHROPIC_PROVIDER = 'anthropic';

/** What the adapter learns from the stream before it can close the turn. */
interface PendingCompletion {
  inputTokens: number;
  outputTokens: number;
  model: string | null;
  stopReason: string | null;
}

/**
 * The domain's turns in the provider's vocabulary, ending with the question.
 *
 * Translation and nothing else. Which messages are here, what order they are
 * in and how a stopped answer is marked were all settled in the domain before
 * this was called; the only judgement made here is that Anthropic calls the
 * assistant side "assistant".
 */
function toMessageTurns(request: GenerationRequest): MessageTurn[] {
  const turns = request.history.map(
    (turn): MessageTurn => ({
      role: turn.author === 'assistant' ? 'assistant' : 'user',
      content: turn.text,
    }),
  );
  turns.push({ role: 'user', content: request.question });
  return turns;
}

/**
 * TextGenerationPort over the Anthropic Messages API (ADR-032).
 *
 * Normalises provider events into domain chunks here, so no provider type
 * crosses the port. Every failure becomes ProviderUnavailable: nothing above
 * this line branches on an SDK error.
 *
 * Only `text_delta` events become answer text. Thinking deltas and signature
 * deltas are not the answer and are dropped, not streamed to someone reading at
 * their own pace.
 */
export class AnthropicTextGenerationAdapter implements TextGenerationPort {
  constructor(
    private readonly opener: MessageStreamOpener,
    private readonly defaultModelId: ModelId,
  ) {}

  async *generate(request: GenerationRequest): AsyncIterable<GenerationChunk> {
    let stream;
    try {
      stream = await this.opener.open({
        model: this.defaultModelId.value,
        system: request.policy.systemPrompt,
        messages: toMessageTurns(request),
      });
    } catch (cause) {
      throw new ProviderUnavailable(ANTHROPIC_PROVIDER, { cause });
    }

    const pending: PendingCompletion = {
      inputTokens: 0,
      outputTokens: 0,
      model: null,
      stopReason: null,
    };

    const iterator = stream.events();
    try {
      // Named before the provider has said anything, so a turn stopped in the
      // first second is still attributable. A Message cannot be built without
      // provenance, so without this the partial answer of a stopped turn could
      // not be recorded at all.
      //
      // Inside the try, because a consumer that stops here must still release
      // the provider stream.
      yield {
        kind: 'started',
        modelId: this.defaultModelId,
        provider: ANTHROPIC_PROVIDER,
      };

      while (true) {
        const step = await iterator.next();
        if (step.done === true) {
          return;
        }
        const chunk = this.translate(step.value, pending);
        if (chunk !== null) {
          yield chunk;
        }
      }
    } catch (cause) {
      // A mid-stream `error` event reaches us as a thrown APIError: the SDK
      // converts it before we ever see the frame. That is the typed exception
      // ADR-032 expects, and it stops here — no provider text reaches the user.
      if (cause instanceof ProviderUnavailable) {
        throw cause;
      }
      throw new ProviderUnavailable(ANTHROPIC_PROVIDER, { cause });
    } finally {
      // Reached on normal completion, on error, and when the consumer stops
      // iterating early, which is how Stop is expressed (ADR-012).
      await stream.abort();
    }
  }

  private translate(
    event: AnthropicEvent,
    pending: PendingCompletion,
  ): GenerationChunk | null {
    if (event.type === 'content_block_delta') {
      return event.delta.type === 'text_delta' && event.delta.text.length > 0
        ? { kind: 'text', text: event.delta.text }
        : null;
    }

    if (event.type === 'message_start') {
      // The model that actually answered, which may differ from the one we
      // asked for. Provenance should record what happened, not what we wanted.
      pending.model = event.message.model;
      pending.inputTokens = event.message.usage?.input_tokens ?? 0;
      pending.outputTokens = event.message.usage?.output_tokens ?? 0;
      return null;
    }

    if (event.type === 'message_delta') {
      pending.stopReason = event.delta.stop_reason;
      // Cumulative, and the authoritative count: message_start reports only
      // what had been generated when the stream opened.
      pending.outputTokens = event.usage?.output_tokens ?? pending.outputTokens;
      return null;
    }

    if (event.type === 'message_stop') {
      return this.close(pending);
    }

    // content_block_start, content_block_stop: lifecycle noise the domain has
    // no use for in this slice.
    return null;
  }

  private close(pending: PendingCompletion): GenerationChunk {
    // end_turn, stop_sequence and max_tokens all produced an answer. Only a
    // refusal did not, and it is this provider's non-successful terminal
    // status: there is no answer to show and the reason is not the user's to
    // read.
    if (pending.stopReason === 'refusal') {
      throw new ProviderUnavailable(ANTHROPIC_PROVIDER, {
        cause: new Error('The provider refused to answer.'),
      });
    }

    return {
      kind: 'completion',
      usage: Usage.fromCounts(
        pending.inputTokens,
        pending.outputTokens,
        // Anthropic bills reasoning inside output_tokens and reports no
        // separate count (ADR-032). Zero is what the provider reported, not an
        // estimate of what reasoning cost, and the write up should say so.
        0,
      ),
      modelId:
        pending.model === null || pending.model.length === 0
          ? this.defaultModelId
          : ModelId.fromString(pending.model),
      provider: ANTHROPIC_PROVIDER,
    };
  }
}
