import type { ContentPart } from '../content/content-part.ts';
import { TextPart } from '../content/text-part.ts';
import type { Conversation } from '../entities/conversation.ts';
import { Message } from '../entities/message.ts';
import type { TerminalState } from '../entities/message.ts';
import { ProviderUnavailable } from '../errors/provider-unavailable.ts';
import { MessageCompleted } from '../events/message-completed.ts';
import { toGenerationTurns } from '../policy/conversation-context.ts';
import type { ProductPolicy } from '../policy/product-policy.ts';
import type { Clock } from '../ports/clock.ts';
import type { IdGenerator } from '../ports/id-generator.ts';
import type {
  CompletionChunk,
  TextGenerationPort,
} from '../ports/text-generation-port.ts';
import { Provenance } from '../value-objects/provenance.ts';
import { Usage } from '../value-objects/usage.ts';

/** Answer text as it arrives, one run at a time. */
export interface AnswerDelta {
  readonly kind: 'delta';
  readonly text: string;
}

/**
 * The turn closed. The Message is complete and not yet persisted.
 *
 * One event for both terminal states: the Message says which it is. ADR-015
 * rejected a separate MessageStopped for the same reason.
 */
export interface AnswerCompleted {
  readonly kind: 'completed';
  readonly message: Message;
  readonly event: MessageCompleted;
}

export type AnswerGenerationEvent = AnswerDelta | AnswerCompleted;

/**
 * Drives one turn of generation.
 *
 * Assembles the request from the product policy, the conversation so far and
 * the question, drives the stream, and builds the Message with the provenance
 * and usage the provider reported.
 *
 * Assembly is here rather than in the use case because ADR-012 puts it here:
 * in a product whose domain is conversing, deciding what the model is told is
 * domain language. The use case reads the history; this decides what becomes of
 * it.
 *
 * It does not persist. The use case decides when and whether to write.
 *
 * Cancellation is expressed by the consumer stopping iteration (ADR-012). That
 * unwinds this generator, which releases the port's stream and then hands back
 * the partial answer as a stopped Message — see the `finally` below.
 */
export class AnswerGeneration {
  constructor(
    private readonly textGeneration: TextGenerationPort,
    private readonly clock: Clock,
    private readonly idGenerator: IdGenerator,
    private readonly policy: ProductPolicy,
  ) {}

  /**
   * @param history Earlier messages, oldest first, already bounded by the
   *   context window. It does not contain `question`.
   */
  async *run(
    conversation: Conversation,
    history: readonly Message[],
    question: string,
  ): AsyncGenerator<AnswerGenerationEvent, void, undefined> {
    let answer = '';
    let provenance: Provenance | null = null;
    let closed = false;
    let failed = false;

    try {
      let completion: CompletionChunk | null = null;

      for await (const chunk of this.textGeneration.generate({
        policy: this.policy,
        history: toGenerationTurns(history),
        question,
      })) {
        if (chunk.kind === 'started') {
          provenance = Provenance.aiGenerated(chunk.modelId, chunk.provider);
          continue;
        }
        if (chunk.kind === 'text') {
          answer += chunk.text;
          yield { kind: 'delta', text: chunk.text };
          continue;
        }
        completion = chunk;
      }

      if (completion === null) {
        // The port's contract is that a successful generation ends with a
        // completion chunk. A stream that just stops has not produced an answer
        // we can record usage or provenance for.
        throw new ProviderUnavailable('text generation');
      }

      closed = true;
      yield this.close(
        conversation,
        answer,
        Provenance.aiGenerated(completion.modelId, completion.provider),
        completion.usage,
        'completed',
      );
    } catch (error) {
      // A turn that failed is not a turn that was stopped. It writes no
      // assistant message at all, so the `finally` below must know the
      // difference between unwinding from a throw and unwinding from a
      // consumer that walked away.
      failed = true;
      throw error;
    } finally {
      // No provenance means the stream was abandoned before the port named a
      // provider, which leaves nothing to attribute a Message to. Nothing is
      // written, and nothing was generated either.
      if (!closed && !failed && provenance !== null) {
        // Reached when the consumer stopped iterating: the turn is over and
        // whatever text arrived is the answer, marked as stopped.
        //
        // Yielding here is what hands that Message back. A generator resumed by
        // `return()` runs its `finally`, and a `yield` inside it becomes the
        // result of that `return()` call. The use case reads it there. A plain
        // `for await` would discard it, which is why the use case does not use
        // one.
        yield this.close(
          conversation,
          answer,
          provenance,
          // Providers report the turn's usage on a completion event that a
          // stopped turn never reaches. Zero is what the provider reported. It
          // is not an estimate of what the turn cost, and the write up should
          // not read it as one.
          Usage.fromCounts(0, 0, 0),
          'stopped',
        );
      }
    }
  }

  private close(
    conversation: Conversation,
    answer: string,
    provenance: Provenance,
    usage: Usage,
    state: TerminalState,
  ): AnswerCompleted {
    const parts: ContentPart[] = answer.length > 0 ? [TextPart.of(answer)] : [];

    const message = Message.fromAssistant({
      id: this.idGenerator.nextMessageId(),
      conversationId: conversation.id,
      parts,
      createdAt: this.clock.now(),
      // Provenance is built here, in the domain, from what the provider
      // actually reported. The HTTP layer never supplies it.
      provenance,
      usage,
      state,
    });

    return {
      kind: 'completed',
      message,
      event: MessageCompleted.from(message, message.createdAt),
    };
  }
}
