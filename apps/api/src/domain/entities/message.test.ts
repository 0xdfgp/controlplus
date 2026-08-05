import { describe, expect, it } from 'vitest';

import { TextPart } from '../content/text-part.ts';
import { ConversationId } from '../value-objects/conversation-id.ts';
import { MessageId } from '../value-objects/message-id.ts';
import { ModelId } from '../value-objects/model-id.ts';
import { Provenance } from '../value-objects/provenance.ts';
import { Usage } from '../value-objects/usage.ts';
import { Message } from './message.ts';

const conversationId = ConversationId.fromString('conv-1');
const messageId = MessageId.fromString('msg-1');
const createdAt = new Date('2026-08-05T10:00:00.000Z');
const provenance = Provenance.aiGenerated(
  ModelId.fromString('gemini-3.5-flash'),
  'google',
);
const usage = Usage.fromCounts(12, 34, 56);

describe('Message.fromUser', () => {
  it('builds a user message from at least one content part', () => {
    const message = Message.fromUser({
      id: messageId,
      conversationId,
      parts: [TextPart.of('Is this text about my bank a scam?')],
      createdAt,
    });

    expect(message.author).toBe('user');
    expect(message.text()).toBe('Is this text about my bank a scam?');
  });

  it('rejects a message with no content parts', () => {
    expect(() =>
      Message.fromUser({ id: messageId, conversationId, parts: [], createdAt }),
    ).toThrow(/at least one content part/);
  });

  it('rejects provenance: a user message is not machine generated', () => {
    expect(() =>
      Message.fromUser({
        id: messageId,
        conversationId,
        parts: [TextPart.of('hello')],
        createdAt,
        // A row coming back from the database is not checked by the compiler,
        // so the runtime guard has to hold on its own.
        provenance,
      } as unknown as Parameters<typeof Message.fromUser>[0]),
    ).toThrow(/rejects provenance/);
  });

  it('rejects usage: a user message has no generation usage', () => {
    expect(() =>
      Message.fromUser({
        id: messageId,
        conversationId,
        parts: [TextPart.of('hello')],
        createdAt,
        usage,
      } as unknown as Parameters<typeof Message.fromUser>[0]),
    ).toThrow(/rejects usage/);
  });

  it('carries no provenance, usage or terminal state', () => {
    const message = Message.fromUser({
      id: messageId,
      conversationId,
      parts: [TextPart.of('hello')],
      createdAt,
    });

    expect(message.provenance).toBeNull();
    expect(message.usage).toBeNull();
    expect(message.state).toBeNull();
  });
});

describe('Message.fromAssistant', () => {
  const complete = {
    id: messageId,
    conversationId,
    parts: [TextPart.of('That message has two signs of a scam.')],
    createdAt,
    provenance,
    usage,
    state: 'completed',
  } as const;

  it('builds an assistant message with provenance, usage and a terminal state', () => {
    const message = Message.fromAssistant(complete);

    expect(message.author).toBe('assistant');
    expect(message.isFromAssistant()).toBe(true);
    expect(message.provenance?.origin).toBe('ai-generated');
    expect(message.provenance?.modelId.value).toBe('gemini-3.5-flash');
    expect(message.provenance?.provider).toBe('google');
    expect(message.usage?.inputTokens.value).toBe(12);
    expect(message.usage?.outputTokens.value).toBe(34);
    expect(message.usage?.thoughtTokens.value).toBe(56);
    expect(message.state).toBe('completed');
  });

  it('stores thinking tokens billed outside input and output', () => {
    const message = Message.fromAssistant({
      ...complete,
      usage: Usage.fromCounts(22, 20, 388),
    });

    expect(message.usage?.thoughtTokens.value).toBe(388);
    // The numbers from the live call that produced ADR-020: the provider's own
    // total was 430, and a two-part sum would have reported 42.
    expect(message.usage?.totalTokens().value).toBe(430);
  });

  it('accepts a turn that reported no thinking tokens', () => {
    const message = Message.fromAssistant({
      ...complete,
      usage: Usage.fromCounts(10, 5),
    });

    expect(message.usage?.thoughtTokens.value).toBe(0);
    expect(message.usage?.totalTokens().value).toBe(15);
  });

  it('rejects construction without provenance', () => {
    const { provenance: _omitted, ...withoutProvenance } = complete;

    expect(() =>
      Message.fromAssistant(
        withoutProvenance as unknown as Parameters<
          typeof Message.fromAssistant
        >[0],
      ),
    ).toThrow(/requires provenance/);
  });

  it('rejects construction without usage', () => {
    const { usage: _omitted, ...withoutUsage } = complete;

    expect(() =>
      Message.fromAssistant(
        withoutUsage as unknown as Parameters<typeof Message.fromAssistant>[0],
      ),
    ).toThrow(/requires usage/);
  });

  it('rejects construction without a terminal state', () => {
    const { state: _omitted, ...withoutState } = complete;

    expect(() =>
      Message.fromAssistant(
        withoutState as unknown as Parameters<typeof Message.fromAssistant>[0],
      ),
    ).toThrow(/requires a terminal state/);
  });

  it('rejects a state that is not terminal', () => {
    expect(() =>
      Message.fromAssistant({
        ...complete,
        state: 'streaming',
      } as unknown as Parameters<typeof Message.fromAssistant>[0]),
    ).toThrow(/requires a terminal state/);
  });

  it('records a turn that produced no text but still spent tokens', () => {
    const message = Message.fromAssistant({ ...complete, parts: [] });

    expect(message.text()).toBe('');
    expect(message.usage?.totalTokens().value).toBe(102);
  });
});

describe('Message content', () => {
  it('does not alias the caller’s parts array', () => {
    const parts = [TextPart.of('one')];
    const message = Message.fromUser({
      id: messageId,
      conversationId,
      parts,
      createdAt,
    });

    parts.push(TextPart.of(' two'));

    expect(message.text()).toBe('one');
  });
});
