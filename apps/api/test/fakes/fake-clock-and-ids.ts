import type { Clock } from '../../src/domain/ports/clock.ts';
import type { IdGenerator } from '../../src/domain/ports/id-generator.ts';
import { ConversationId } from '../../src/domain/value-objects/conversation-id.ts';
import { MessageId } from '../../src/domain/value-objects/message-id.ts';

/** Time stands still unless a test moves it. */
export class FakeClock implements Clock {
  constructor(private current: Date = new Date('2026-08-05T10:00:00.000Z')) {}

  now(): Date {
    return this.current;
  }

  advanceBy(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}

/** Predictable, ordered ids so assertions can name them. */
export class SequentialIdGenerator implements IdGenerator {
  private conversationCount = 0;
  private messageCount = 0;

  nextConversationId(): ConversationId {
    this.conversationCount += 1;
    return ConversationId.fromString(`conv-${this.conversationCount}`);
  }

  nextMessageId(): MessageId {
    this.messageCount += 1;
    return MessageId.fromString(`msg-${this.messageCount}`);
  }
}
