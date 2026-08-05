import type { ConversationId } from '../value-objects/conversation-id.ts';

/**
 * A turn ended without producing an assistant Message (ADR-015).
 *
 * Carries the domain error class by name, not the provider's message, so
 * everything downstream — the stream, the log line, the screen — branches on a
 * name we own.
 *
 * When this is raised, no assistant message row is written.
 */
export class GenerationFailed {
  readonly name = 'GenerationFailed' as const;

  private constructor(
    readonly conversationId: ConversationId,
    readonly errorClass: string,
    readonly occurredAt: Date,
  ) {}

  static from(
    conversationId: ConversationId,
    error: Error,
    occurredAt: Date,
  ): GenerationFailed {
    return new GenerationFailed(conversationId, error.name, occurredAt);
  }
}
