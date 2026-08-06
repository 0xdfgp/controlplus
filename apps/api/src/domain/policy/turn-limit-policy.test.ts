import { describe, expect, it } from 'vitest';

import { ConversationTurnLimitReached } from '../errors/conversation-turn-limit-reached.ts';
import {
  MAX_MESSAGES_PER_CONVERSATION,
  assertWithinTurnLimit,
} from './turn-limit-policy.ts';

/**
 * The conversation ceiling (ADR-034).
 *
 * The boundary is asserted from both sides on purpose. `>=` and `>` are one
 * character apart and the difference is a whole turn, which is exactly the kind
 * of thing that is right when written and wrong after an edit.
 */
describe('the conversation limit (ADR-034)', () => {
  it('allows a conversation that is one message short of the limit', () => {
    expect(() =>
      assertWithinTurnLimit(MAX_MESSAGES_PER_CONVERSATION - 1),
    ).not.toThrow();
  });

  it('refuses at the limit, because the turn being asked for is the one over', () => {
    // The count is what is already stored. A conversation holding exactly the
    // limit has no room for another question, so this is a refusal and not an
    // off-by-one.
    expect(() => assertWithinTurnLimit(MAX_MESSAGES_PER_CONVERSATION)).toThrow(
      ConversationTurnLimitReached,
    );
  });

  it('refuses past the limit', () => {
    expect(() =>
      assertWithinTurnLimit(MAX_MESSAGES_PER_CONVERSATION + 1),
    ).toThrow(ConversationTurnLimitReached);
  });

  it('allows an empty conversation', () => {
    expect(() => assertWithinTurnLimit(0)).not.toThrow();
  });

  it('carries the count and the limit for the log line, not for the user', () => {
    try {
      assertWithinTurnLimit(MAX_MESSAGES_PER_CONVERSATION);
      expect.unreachable('the limit should have been refused');
    } catch (caught) {
      const error = caught as ConversationTurnLimitReached;
      expect(error.name).toBe('ConversationTurnLimitReached');
      expect(error.messageCount).toBe(MAX_MESSAGES_PER_CONVERSATION);
      expect(error.limitMessages).toBe(MAX_MESSAGES_PER_CONVERSATION);
    }
  });
});
