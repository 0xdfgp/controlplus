import { describe, expect, it } from 'vitest';

import { ImagePart } from '../content/image-part.ts';
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
  PHOTO_IN_HISTORY_NOTICE,
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

function photo(): ImagePart {
  return ImagePart.of({
    mediaType: 'image/jpeg',
    width: 1568,
    height: 1176,
    hash: 'a3f1b2c4d5e6',
  });
}

function fromUserWithPhoto(text: string): Message {
  return Message.fromUser({
    id: nextId(),
    conversationId,
    parts: text.length > 0 ? [photo(), TextPart.of(text)] : [photo()],
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

describe('an earlier photo in the window (ADR-023, ADR-024)', () => {
  it('sends no image bytes, because there are none to send', () => {
    const turns = toGenerationTurns([
      fromUserWithPhoto('What does this message on my screen mean?'),
      fromAssistant('It is a fake warning. Do not tap it.', 'completed'),
    ]);

    // The follow up costs what a text follow up costs. This is what ADR-023
    // meant by attachments in history being references rather than bytes, and
    // it is true here because the bytes were never stored at all.
    const everything = JSON.stringify(turns);
    expect(everything).not.toContain('base64');
    expect(everything).not.toContain('data');
    expect(everything).not.toContain('image/jpeg');
  });

  it('says a photo was there, rather than leaving a gap', () => {
    const turns = toGenerationTurns([
      fromUserWithPhoto('What does this message on my screen mean?'),
    ]);

    expect(turns).toHaveLength(1);
    expect(turns[0]?.text).toBe(
      `${PHOTO_IN_HISTORY_NOTICE}\n\nWhat does this message on my screen mean?`,
    );
  });

  it('keeps a photo-only turn instead of dropping it', () => {
    // The failure this guards against: an image-only message renders to no
    // text, so without the notice it would vanish from the window entirely and
    // "what should I do about it?" would become a question about nothing.
    const turns = toGenerationTurns([
      fromUserWithPhoto(''),
      fromAssistant('That is a scam.', 'completed'),
      fromUser('What should I do about it?'),
    ]);

    expect(turns.map((t) => t.author)).toEqual(['user', 'assistant', 'user']);
    expect(turns[0]?.text).toBe(PHOTO_IN_HISTORY_NOTICE);
  });

  it('tells the model the photo is gone rather than implying it can still see it', () => {
    // A model told there is an image it cannot find will describe one anyway.
    expect(PHOTO_IN_HISTORY_NOTICE).toContain('no longer available');
  });
});
