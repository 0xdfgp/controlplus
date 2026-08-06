import { assertWithinAttachmentLimit } from '../domain/policy/attachment-policy.ts';
import { assertWithinTurnLimit } from '../domain/policy/turn-limit-policy.ts';
import type { MessageRepository } from '../domain/ports/message-repository.ts';
import type { ConversationId } from '../domain/value-objects/conversation-id.ts';
import type { AskQuestionImage } from './user-message.ts';

/**
 * Whether this turn is allowed to happen at all, asked before anything happens.
 *
 * Its own file rather than two blocks inside the use case, for the reason
 * `turn.ts` and `use-last-ask.ts` already record on the client: ESLint caps
 * source at 200 lines and `ask-question.ts` was at it. The seam is a real one
 * even so — everything here runs before the conversation is touched, so a
 * refusal writes nothing, starts no conversation, calls no provider and costs
 * nothing.
 *
 * Both rules live in the domain and both throw typed domain errors. This decides
 * only when they are asked, never what the answer is: a limit that an
 * application service could reason about would be a business rule outside the
 * domain, which is the thing the layer boundaries exist to stop.
 *
 * The conversation id is taken rather than a Conversation, so the check runs
 * before `loadOrStart` and a refused turn does not leave an empty conversation
 * behind it.
 */
export async function assertTurnMayHappen(
  messages: MessageRepository,
  conversationId: ConversationId,
  image: AskQuestionImage | undefined,
): Promise<void> {
  if (image !== undefined) {
    assertWithinAttachmentLimit(image.byteSize);
  }

  // A count, not the messages. Reading the conversation to find out how long it
  // is would undo the bound it is being read for (ADR-034).
  assertWithinTurnLimit(await messages.countByConversation(conversationId));
}
