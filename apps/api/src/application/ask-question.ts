import { TextPart } from '../domain/content/text-part.ts';
import { Conversation } from '../domain/entities/conversation.ts';
import { Message } from '../domain/entities/message.ts';
import { GenerationFailed } from '../domain/events/generation-failed.ts';
import type { MessageCompleted } from '../domain/events/message-completed.ts';
import type { Clock } from '../domain/ports/clock.ts';
import type { ConversationRepository } from '../domain/ports/conversation-repository.ts';
import type { IdGenerator } from '../domain/ports/id-generator.ts';
import type { MessageRepository } from '../domain/ports/message-repository.ts';
import type {
  AnswerGeneration,
  AnswerGenerationEvent,
} from '../domain/services/answer-generation.ts';
import type { ConversationId } from '../domain/value-objects/conversation-id.ts';

export interface AskQuestionInput {
  readonly conversationId: ConversationId;
  readonly question: string;
}

export interface AskQuestionDelta {
  readonly kind: 'delta';
  readonly text: string;
}

export interface AskQuestionCompleted {
  readonly kind: 'completed';
  readonly message: Message;
  readonly event: MessageCompleted;
}

export interface AskQuestionFailed {
  readonly kind: 'failed';
  readonly error: Error;
  readonly event: GenerationFailed;
}

export type AskQuestionEvent =
  | AskQuestionDelta
  | AskQuestionCompleted
  | AskQuestionFailed;

/**
 * One turn: a question in, a streamed answer out, both recorded.
 *
 * Creates or loads the conversation, builds the user Message, drives
 * AnswerGeneration, and writes the assistant Message exactly once when the turn
 * closes (ADR-013).
 *
 * A generation failure is not thrown at the caller. It comes back as a `failed`
 * event carrying GenerationFailed, and no assistant message row is written.
 * The user's own message stays: they asked, and the record should say so.
 */
export class AskQuestion {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly messages: MessageRepository,
    private readonly answerGeneration: AnswerGeneration,
    private readonly clock: Clock,
    private readonly idGenerator: IdGenerator,
  ) {}

  async *execute(
    input: AskQuestionInput,
  ): AsyncGenerator<AskQuestionEvent, void, undefined> {
    const conversation = await this.loadOrStart(input.conversationId);

    // A user message is complete the moment it is built: there is nothing to
    // stream, so the turn has already closed for it.
    await this.messages.save(
      Message.fromUser({
        id: this.idGenerator.nextMessageId(),
        conversationId: conversation.id,
        parts: [TextPart.of(input.question)],
        createdAt: this.clock.now(),
      }),
    );

    // Driven by hand rather than with `for await`, and this is the reason: when
    // the caller walks away mid-turn, AnswerGeneration hands back the partial
    // answer as a stopped Message on the way out. `for await` calls `return()`
    // on our behalf and discards whatever comes back, which would silently drop
    // that write.
    const generation = this.answerGeneration.run(conversation, input.question);

    try {
      while (true) {
        const step = await generation.next();
        if (step.done === true) {
          return;
        }
        const event = step.value;

        if (event.kind === 'delta') {
          yield { kind: 'delta', text: event.text };
          continue;
        }

        await this.messages.save(event.message);
        yield {
          kind: 'completed',
          message: event.message,
          event: event.event,
        };
      }
    } catch (caught) {
      const error = caught instanceof Error ? caught : new Error(String(caught));
      yield {
        kind: 'failed',
        error,
        event: GenerationFailed.from(conversation.id, error, this.clock.now()),
      };
    } finally {
      await this.writeStoppedTurn(generation);
    }
  }

  /**
   * Closes the generation and writes the partial answer, if there is one.
   *
   * On a turn that ran to completion or failed, the generator is already
   * finished and `return()` resolves done with nothing to write, so this cannot
   * double-write the completed path.
   */
  private async writeStoppedTurn(
    generation: AsyncGenerator<AnswerGenerationEvent, void, undefined>,
  ): Promise<void> {
    const closing = await generation.return(undefined);
    if (closing.done === false && closing.value.kind === 'completed') {
      await this.messages.save(closing.value.message);
    }
  }

  private async loadOrStart(id: ConversationId): Promise<Conversation> {
    const existing = await this.conversations.findById(id);
    if (existing !== null) {
      return existing;
    }
    const started = Conversation.start(id, this.clock.now());
    await this.conversations.save(started);
    return started;
  }
}
