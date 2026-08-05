import { describe, expect, it } from 'vitest';

import { TextPart } from '../content/text-part.ts';
import { Message } from '../entities/message.ts';
import type { TerminalState } from '../entities/message.ts';
import { ConversationId } from '../value-objects/conversation-id.ts';
import { MessageId } from '../value-objects/message-id.ts';
import { ModelId } from '../value-objects/model-id.ts';
import { Provenance } from '../value-objects/provenance.ts';
import { Usage } from '../value-objects/usage.ts';
import {
  CONTEXT_WINDOW_MESSAGES,
  STOPPED_ANSWER_NOTICE,
  toGenerationTurns,
} from './conversation-context.ts';

const conversationId = ConversationId.fromString('conv-1');
const createdAt = new Date('2026-08-05T10:00:00.000Z');

let counter = 0;

function nextId(): MessageId {
  counter += 1;
  return MessageId.fromString(`msg-${counter}`);
}

function fromUser(text: string): Message {
  return Message.fromUser({
    id: nextId(),
    conversationId,
    parts: [TextPart.of(text)],
    createdAt,
  });
}

function fromAssistant(text: string, state: TerminalState): Message {
  return Message.fromAssistant({
    id: nextId(),
    conversationId,
    parts: text.length > 0 ? [TextPart.of(text)] : [],
    createdAt,
    provenance: Provenance.aiGenerated(
      ModelId.fromString('gemini-3.5-flash'),
      'google',
    ),
    usage: Usage.fromCounts(1, 2, 3),
    state,
  });
}

describe('the context window', () => {
  it('is a message count, not a token count', () => {
    // ADR-023. A number of tokens would need a provider tokenizer, which the
    // domain is not allowed to have and an adapter is not allowed to decide.
    expect(Number.isInteger(CONTEXT_WINDOW_MESSAGES)).toBe(true);
    expect(CONTEXT_WINDOW_MESSAGES).toBeGreaterThan(0);
  });
});

describe('toGenerationTurns', () => {
  it('keeps the messages in the order they were had', () => {
    const turns = toGenerationTurns([
      fromUser('Is this text about my bank a scam?'),
      fromAssistant('Yes. Do not click the link.', 'completed'),
      fromUser('And how do I do that on my phone?'),
    ]);

    expect(turns).toEqual([
      { author: 'user', text: 'Is this text about my bank a scam?' },
      { author: 'assistant', text: 'Yes. Do not click the link.' },
      { author: 'user', text: 'And how do I do that on my phone?' },
    ]);
  });

  it('marks a stopped answer as unfinished', () => {
    const turns = toGenerationTurns([
      fromUser('Is this a scam?'),
      fromAssistant('That message has two signs of a', 'stopped'),
    ]);

    // Without the marker the model reads its own half sentence as a finished
    // thought and follows on from it, so the follow up builds on advice that
    // was never actually given.
    expect(turns[1]?.text).toBe(
      `That message has two signs of a\n\n${STOPPED_ANSWER_NOTICE}`,
    );
  });

  it('leaves a completed answer unmarked', () => {
    const turns = toGenerationTurns([
      fromAssistant('Yes. Do not click the link.', 'completed'),
    ]);

    expect(turns[0]?.text).toBe('Yes. Do not click the link.');
    expect(turns[0]?.text).not.toContain(STOPPED_ANSWER_NOTICE);
  });

  it('drops a turn that has no text, rather than sending an empty one', () => {
    // A turn stopped before the first delta. It is a real row, and it has
    // nothing to say; an empty turn is a payload a provider may reject.
    const turns = toGenerationTurns([
      fromUser('Is this a scam?'),
      fromAssistant('', 'stopped'),
      fromUser('Are you still there?'),
    ]);

    expect(turns.map((t) => t.author)).toEqual(['user', 'user']);
  });

  it('renders nothing for a conversation that has not started', () => {
    expect(toGenerationTurns([])).toEqual([]);
  });
});
