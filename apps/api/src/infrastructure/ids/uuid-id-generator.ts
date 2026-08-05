import { randomUUID } from 'node:crypto';

import type { IdGenerator } from '../../domain/ports/id-generator.ts';
import { ConversationId } from '../../domain/value-objects/conversation-id.ts';
import { MessageId } from '../../domain/value-objects/message-id.ts';

/** The real id source. The only place a UUID is generated. */
export class UuidIdGenerator implements IdGenerator {
  nextConversationId(): ConversationId {
    return ConversationId.fromString(randomUUID());
  }

  nextMessageId(): MessageId {
    return MessageId.fromString(randomUUID());
  }
}
