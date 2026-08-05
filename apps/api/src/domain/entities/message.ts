import type { ContentPart } from '../content/content-part.ts';
import { textOf } from '../content/content-part.ts';
import type { ConversationId } from '../value-objects/conversation-id.ts';
import type { MessageId } from '../value-objects/message-id.ts';
import type { Provenance } from '../value-objects/provenance.ts';
import type { Usage } from '../value-objects/usage.ts';

export type MessageAuthor = 'user' | 'assistant';

/**
 * How a turn ended. A Message is written once, already in one of these states
 * (ADR-013). 'stopped' is a turn the user or a lost connection ended early: the
 * partial answer is kept, and it is not a failure.
 */
export type TerminalState = 'completed' | 'stopped';

export interface FromUserInput {
  readonly id: MessageId;
  readonly conversationId: ConversationId;
  readonly parts: readonly ContentPart[];
  readonly createdAt: Date;
  /** A user message is never machine generated. Passing this is a type error. */
  readonly provenance?: never;
  /** A user message has no generation usage. Passing this is a type error. */
  readonly usage?: never;
}

export interface FromAssistantInput {
  readonly id: MessageId;
  readonly conversationId: ConversationId;
  readonly parts: readonly ContentPart[];
  readonly createdAt: Date;
  readonly provenance: Provenance;
  readonly usage: Usage;
  readonly state: TerminalState;
}

const TERMINAL_STATES: readonly TerminalState[] = ['completed', 'stopped'];

/**
 * A single turn's message. Separate aggregate from Conversation (ADR-013).
 *
 * The constructor is private. The only ways in are the two factories, and each
 * enforces what its author kind means:
 *
 *   - fromAssistant requires provenance, a terminal state and usage. A Message
 *     that cannot satisfy that must not be constructible.
 *   - fromUser rejects provenance and usage, and requires at least one part.
 *
 * Provenance is built here in the domain, never handed in by the HTTP layer.
 *
 * A Message is written once, when the turn closes, already complete or already
 * stopped. There is no mutation and no partial save.
 */
export class Message {
  private constructor(
    readonly id: MessageId,
    readonly conversationId: ConversationId,
    readonly author: MessageAuthor,
    readonly parts: readonly ContentPart[],
    readonly createdAt: Date,
    readonly provenance: Provenance | null,
    readonly usage: Usage | null,
    readonly state: TerminalState | null,
  ) {}

  static fromUser(input: FromUserInput): Message {
    if (input.parts.length === 0) {
      throw new TypeError('Message.fromUser requires at least one content part.');
    }
    // Belt and braces: the `never` types reject this at compile time, but a row
    // coming back from the database is not type checked by the compiler.
    if (input.provenance !== undefined) {
      throw new TypeError(
        'Message.fromUser rejects provenance: a user message is not machine generated.',
      );
    }
    if (input.usage !== undefined) {
      throw new TypeError(
        'Message.fromUser rejects usage: a user message has no generation usage.',
      );
    }
    return new Message(
      input.id,
      input.conversationId,
      'user',
      [...input.parts],
      input.createdAt,
      null,
      null,
      null,
    );
  }

  static fromAssistant(input: FromAssistantInput): Message {
    // Deliberately no minimum on parts. A provider can close a turn having
    // produced no text, and that turn still spent tokens: recording it with its
    // usage is more honest than refusing to represent it.
    if (input.provenance === undefined || input.provenance === null) {
      throw new TypeError(
        'Message.fromAssistant requires provenance naming the model and provider.',
      );
    }
    if (input.usage === undefined || input.usage === null) {
      throw new TypeError('Message.fromAssistant requires usage.');
    }
    if (!TERMINAL_STATES.includes(input.state)) {
      throw new TypeError(
        `Message.fromAssistant requires a terminal state, received ${String(input.state)}.`,
      );
    }
    return new Message(
      input.id,
      input.conversationId,
      'assistant',
      [...input.parts],
      input.createdAt,
      input.provenance,
      input.usage,
      input.state,
    );
  }

  isFromAssistant(): boolean {
    return this.author === 'assistant';
  }

  /** The message's text content, in order. */
  text(): string {
    return textOf(this.parts);
  }
}
