import type { ContentPart } from '../content/content-part.ts';
import { TextPart } from '../content/text-part.ts';
import type { Conversation } from '../entities/conversation.ts';
import { Message } from '../entities/message.ts';
import { ProviderUnavailable } from '../errors/provider-unavailable.ts';
import { MessageCompleted } from '../events/message-completed.ts';
import type { ProductPolicy } from '../policy/product-policy.ts';
import type { Clock } from '../ports/clock.ts';
import type { IdGenerator } from '../ports/id-generator.ts';
import type {
  CompletionChunk,
  TextGenerationPort,
} from '../ports/text-generation-port.ts';
import { Provenance } from '../value-objects/provenance.ts';

/** Answer text as it arrives, one run at a time. */
export interface AnswerDelta {
  readonly kind: 'delta';
  readonly text: string;
}

/** The turn closed. The Message is complete and not yet persisted. */
export interface AnswerCompleted {
  readonly kind: 'completed';
  readonly message: Message;
  readonly event: MessageCompleted;
}

export type AnswerGenerationEvent = AnswerDelta | AnswerCompleted;

/**
 * Drives one turn of generation.
 *
 * Assembles the request from the product policy and the question, drives the
 * stream, and builds the completed Message with the provenance and usage the
 * provider reported on the completion chunk.
 *
 * It does not persist. The use case decides when and whether to write.
 *
 * Cancellation is not built in this slice (S2), but the shape already supports
 * it: a caller that stops iterating stops the port's iteration too, and the
 * adapter aborts the provider stream in its `finally`.
 */
export class AnswerGeneration {
  constructor(
    private readonly textGeneration: TextGenerationPort,
    private readonly clock: Clock,
    private readonly idGenerator: IdGenerator,
    private readonly policy: ProductPolicy,
  ) {}

  async *run(
    conversation: Conversation,
    question: string,
  ): AsyncGenerator<AnswerGenerationEvent, void, undefined> {
    const stream = this.textGeneration.generate({
      policy: this.policy,
      question,
    });

    let answer = '';
    let completion: CompletionChunk | null = null;

    for await (const chunk of stream) {
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

    const message = this.buildMessage(conversation, answer, completion);
    yield {
      kind: 'completed',
      message,
      event: MessageCompleted.from(message, message.createdAt),
    };
  }

  private buildMessage(
    conversation: Conversation,
    answer: string,
    completion: CompletionChunk,
  ): Message {
    const parts: ContentPart[] = answer.length > 0 ? [TextPart.of(answer)] : [];

    return Message.fromAssistant({
      id: this.idGenerator.nextMessageId(),
      conversationId: conversation.id,
      parts,
      createdAt: this.clock.now(),
      // Provenance is built here, in the domain, from what the provider
      // actually reported. The HTTP layer never supplies it.
      provenance: Provenance.aiGenerated(
        completion.modelId,
        completion.provider,
      ),
      usage: completion.usage,
      state: 'completed',
    });
  }
}
