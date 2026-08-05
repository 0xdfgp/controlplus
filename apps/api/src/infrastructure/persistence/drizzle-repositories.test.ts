import { afterAll, beforeAll, afterEach, describe, expect, it } from 'vitest';

import {
  deleteConversation,
  openTestDatabase,
} from '../../../test/support/test-database.ts';
import { isImagePart } from '../../domain/content/content-part.ts';
import { ImagePart } from '../../domain/content/image-part.ts';
import { TextPart } from '../../domain/content/text-part.ts';
import { Conversation } from '../../domain/entities/conversation.ts';
import { Message } from '../../domain/entities/message.ts';
import { ConversationId } from '../../domain/value-objects/conversation-id.ts';
import { MessageId } from '../../domain/value-objects/message-id.ts';
import { ModelId } from '../../domain/value-objects/model-id.ts';
import { Provenance } from '../../domain/value-objects/provenance.ts';
import { Usage } from '../../domain/value-objects/usage.ts';
import type { Database } from './database.ts';
import { DrizzleConversationRepository } from './drizzle-conversation-repository.ts';
import { DrizzleMessageRepository } from './drizzle-message-repository.ts';

let database: Database;
let conversations: DrizzleConversationRepository;
let messages: DrizzleMessageRepository;

const createdAt = new Date('2026-08-05T10:00:00.000Z');
let counter = 0;
const createdConversations: string[] = [];

function nextConversationId(): ConversationId {
  counter += 1;
  const id = ConversationId.fromString(`test-conv-${process.pid}-${counter}`);
  createdConversations.push(id.value);
  return id;
}

beforeAll(async () => {
  database = await openTestDatabase();
  conversations = new DrizzleConversationRepository(database.db);
  messages = new DrizzleMessageRepository(database.db);
});

afterEach(async () => {
  for (const id of createdConversations.splice(0)) {
    await deleteConversation(database, id);
  }
});

afterAll(async () => {
  await database.close();
});

describe('DrizzleConversationRepository', () => {
  it('round trips a conversation', async () => {
    const id = nextConversationId();
    await conversations.save(Conversation.start(id, createdAt));

    const found = await conversations.findById(id);

    expect(found?.id.value).toBe(id.value);
    expect(found?.startedAt.toISOString()).toBe(createdAt.toISOString());
  });

  it('returns null for a conversation that does not exist', async () => {
    const missing = ConversationId.fromString('test-conv-does-not-exist');

    expect(await conversations.findById(missing)).toBeNull();
  });
});

describe('DrizzleMessageRepository', () => {
  it('round trips an assistant message through jsonb, invariants intact', async () => {
    const conversationId = nextConversationId();
    await conversations.save(Conversation.start(conversationId, createdAt));

    const original = Message.fromAssistant({
      id: MessageId.fromString(`test-msg-a-${counter}`),
      conversationId,
      parts: [TextPart.of('That message has two signs of a scam.')],
      createdAt,
      provenance: Provenance.aiGenerated(
        ModelId.fromString('gemini-3.5-flash'),
        'google',
      ),
      usage: Usage.fromCounts(118, 27, 254),
      state: 'completed',
    });

    await messages.save(original);
    const [restored] = await messages.findByConversation(conversationId);

    expect(restored?.author).toBe('assistant');
    expect(restored?.text()).toBe('That message has two signs of a scam.');
    expect(restored?.provenance?.origin).toBe('ai-generated');
    expect(restored?.provenance?.modelId.value).toBe('gemini-3.5-flash');
    expect(restored?.provenance?.provider).toBe('google');
    expect(restored?.usage?.inputTokens.value).toBe(118);
    expect(restored?.usage?.outputTokens.value).toBe(27);
    expect(restored?.usage?.thoughtTokens.value).toBe(254);
    expect(restored?.usage?.totalTokens().value).toBe(399);
    expect(restored?.state).toBe('completed');
  });

  it('stores all three token counts in the jsonb column', async () => {
    const conversationId = nextConversationId();
    await conversations.save(Conversation.start(conversationId, createdAt));

    await messages.save(
      Message.fromAssistant({
        id: MessageId.fromString(`test-msg-usage-${counter}`),
        conversationId,
        parts: [TextPart.of('answer')],
        createdAt,
        provenance: Provenance.aiGenerated(
          ModelId.fromString('gemini-3.5-flash'),
          'google',
        ),
        usage: Usage.fromCounts(22, 20, 388),
        state: 'completed',
      }),
    );

    const row = await database.pool.query<{
      usage: { inputTokens: number; outputTokens: number; thoughtTokens: number };
    }>('SELECT usage FROM messages WHERE conversation_id = $1', [
      conversationId.value,
    ]);

    expect(row.rows[0]?.usage).toEqual({
      inputTokens: 22,
      outputTokens: 20,
      thoughtTokens: 388,
    });
  });

  it('reads a row written before ADR-020 back with zero thinking tokens', async () => {
    const conversationId = nextConversationId();
    await conversations.save(Conversation.start(conversationId, createdAt));

    // The exact shape S1 wrote: usage with two fields and no thoughtTokens.
    await database.pool.query(
      `INSERT INTO messages (id, conversation_id, author, parts, created_at, provenance, usage, state)
       VALUES ($1, $2, 'assistant', $3::jsonb, now(), $4::jsonb, $5::jsonb, 'completed')`,
      [
        `test-msg-legacy-${counter}`,
        conversationId.value,
        JSON.stringify([{ kind: 'text', text: 'an answer from S1' }]),
        JSON.stringify({
          origin: 'ai-generated',
          modelId: 'gemini-3.5-flash',
          provider: 'google',
        }),
        JSON.stringify({ inputTokens: 180, outputTokens: 172 }),
      ],
    );

    const [restored] = await messages.findByConversation(conversationId);

    expect(restored?.usage?.thoughtTokens.value).toBe(0);
    // Nothing else changed.
    expect(restored?.usage?.inputTokens.value).toBe(180);
    expect(restored?.usage?.outputTokens.value).toBe(172);
    expect(restored?.text()).toBe('an answer from S1');
    expect(restored?.provenance?.modelId.value).toBe('gemini-3.5-flash');
    expect(restored?.state).toBe('completed');
  });

  it('round trips a user message with no provenance or usage', async () => {
    const conversationId = nextConversationId();
    await conversations.save(Conversation.start(conversationId, createdAt));

    await messages.save(
      Message.fromUser({
        id: MessageId.fromString(`test-msg-u-${counter}`),
        conversationId,
        parts: [TextPart.of('Is this text about my bank a scam?')],
        createdAt,
      }),
    );

    const [restored] = await messages.findByConversation(conversationId);

    expect(restored?.author).toBe('user');
    expect(restored?.text()).toBe('Is this text about my bank a scam?');
    expect(restored?.provenance).toBeNull();
    expect(restored?.usage).toBeNull();
    expect(restored?.state).toBeNull();
  });

  it('preserves several content parts in order', async () => {
    const conversationId = nextConversationId();
    await conversations.save(Conversation.start(conversationId, createdAt));

    await messages.save(
      Message.fromUser({
        id: MessageId.fromString(`test-msg-p-${counter}`),
        conversationId,
        parts: [TextPart.of('first '), TextPart.of('second')],
        createdAt,
      }),
    );

    const [restored] = await messages.findByConversation(conversationId);

    expect(restored?.parts).toHaveLength(2);
    expect(restored?.text()).toBe('first second');
  });

  it('round trips a photo through jsonb, with no bytes in the row (AC3)', async () => {
    const conversationId = nextConversationId();
    await conversations.save(Conversation.start(conversationId, createdAt));

    const base64 = 'LzlqLzRBQVFTa1pKUmdBQkFRQUFBUUFCQUFELw==';
    await messages.save(
      Message.fromUser({
        id: MessageId.fromString(`test-msg-img-${counter}`),
        conversationId,
        parts: [
          ImagePart.of({
            mediaType: 'image/jpeg',
            width: 1568,
            height: 1176,
            hash: 'a3f1b2c4d5e6f70819',
          }),
          TextPart.of('What does this message on my screen mean?'),
        ],
        createdAt,
      }),
    );

    const [restored] = await messages.findByConversation(conversationId);

    expect(restored?.parts).toHaveLength(2);
    const image = restored?.parts[0];
    if (image === undefined || !isImagePart(image)) {
      throw new Error('expected an image part first');
    }
    expect(image.mediaType).toBe('image/jpeg');
    expect(image.width).toBe(1568);
    expect(image.height).toBe(1176);
    expect(image.hash).toBe('a3f1b2c4d5e6f70819');
    expect(restored?.text()).toBe('What does this message on my screen mean?');

    // The column itself, not the mapped object. ADR-024 says the bytes are not
    // persisted, and this is the assertion that stays true only while that
    // holds: no migration protects a jsonb payload shape, so this test is the
    // protection (ADR-010's amendment).
    const row = await database.pool.query<{ parts: unknown }>(
      'SELECT parts FROM messages WHERE conversation_id = $1',
      [conversationId.value],
    );
    const stored = JSON.stringify(row.rows[0]?.parts);
    expect(stored).not.toContain(base64);
    expect(stored).not.toContain('data');
    expect(row.rows[0]?.parts).toEqual([
      {
        kind: 'image',
        mediaType: 'image/jpeg',
        width: 1568,
        height: 1176,
        hash: 'a3f1b2c4d5e6f70819',
      },
      { kind: 'text', text: 'What does this message on my screen mean?' },
    ]);
  });

  it('refuses a stored image part that has drifted out of shape', async () => {
    const conversationId = nextConversationId();
    await conversations.save(Conversation.start(conversationId, createdAt));

    // Rehydration goes through the same factory as a fresh part, so a row
    // missing its hash fails here rather than becoming a reference to nothing.
    await database.pool.query(
      `INSERT INTO messages (id, conversation_id, author, parts, created_at, provenance, usage, state)
       VALUES ($1, $2, 'user', $3::jsonb, now(), NULL, NULL, NULL)`,
      [
        `test-msg-img-bad-${counter}`,
        conversationId.value,
        JSON.stringify([
          { kind: 'image', mediaType: 'image/jpeg', width: 1568, height: 1176 },
        ]),
      ],
    );

    await expect(messages.findByConversation(conversationId)).rejects.toThrow(
      /Unsupported stored content part/,
    );
  });

  it('returns messages oldest first', async () => {
    const conversationId = nextConversationId();
    await conversations.save(Conversation.start(conversationId, createdAt));

    await messages.save(
      Message.fromUser({
        id: MessageId.fromString(`test-msg-o1-${counter}`),
        conversationId,
        parts: [TextPart.of('question')],
        createdAt,
      }),
    );
    await messages.save(
      Message.fromAssistant({
        id: MessageId.fromString(`test-msg-o2-${counter}`),
        conversationId,
        parts: [TextPart.of('answer')],
        createdAt: new Date(createdAt.getTime() + 1000),
        provenance: Provenance.aiGenerated(
          ModelId.fromString('gemini-3.5-flash'),
          'google',
        ),
        usage: Usage.fromCounts(1, 2),
        state: 'completed',
      }),
    );

    const restored = await messages.findByConversation(conversationId);

    expect(restored.map((m) => m.author)).toEqual(['user', 'assistant']);
  });

  it('returns the last N messages oldest first, and no more', async () => {
    const conversationId = nextConversationId();
    await conversations.save(Conversation.start(conversationId, createdAt));

    for (let index = 0; index < 8; index += 1) {
      await messages.save(
        Message.fromUser({
          id: MessageId.fromString(`test-msg-w${index}-${counter}`),
          conversationId,
          parts: [TextPart.of(`question ${index}`)],
          createdAt: new Date(createdAt.getTime() + index * 1000),
        }),
      );
    }

    const recent = await messages.findRecentByConversation(conversationId, 3);

    expect(recent.map((m) => m.text())).toEqual([
      'question 5',
      'question 6',
      'question 7',
    ]);
  });

  it('orders a question and its answer written in the same millisecond', async () => {
    const conversationId = nextConversationId();
    await conversations.save(Conversation.start(conversationId, createdAt));

    // The reason the seq column exists. created_at is a JS Date, so a turn that
    // closes inside a millisecond gives both rows the same timestamp and no
    // timestamp ordering can separate them.
    await messages.save(
      Message.fromUser({
        id: MessageId.fromString(`test-msg-tie-u-${counter}`),
        conversationId,
        parts: [TextPart.of('Is this a scam?')],
        createdAt,
      }),
    );
    await messages.save(
      Message.fromAssistant({
        id: MessageId.fromString(`test-msg-tie-a-${counter}`),
        conversationId,
        parts: [TextPart.of('Yes. Do not click the link.')],
        createdAt,
        provenance: Provenance.aiGenerated(
          ModelId.fromString('gemini-3.5-flash'),
          'google',
        ),
        usage: Usage.fromCounts(1, 2, 3),
        state: 'completed',
      }),
    );

    const recent = await messages.findRecentByConversation(conversationId, 10);

    expect(recent.map((m) => m.author)).toEqual(['user', 'assistant']);
    expect(recent.map((m) => m.text())).toEqual([
      'Is this a scam?',
      'Yes. Do not click the link.',
    ]);
  });

  it('returns everything when the conversation is shorter than the window', async () => {
    const conversationId = nextConversationId();
    await conversations.save(Conversation.start(conversationId, createdAt));

    await messages.save(
      Message.fromUser({
        id: MessageId.fromString(`test-msg-short-${counter}`),
        conversationId,
        parts: [TextPart.of('only question')],
        createdAt,
      }),
    );

    const recent = await messages.findRecentByConversation(conversationId, 10);

    expect(recent.map((m) => m.text())).toEqual(['only question']);
  });

  it('returns nothing for a conversation with no messages', async () => {
    const conversationId = nextConversationId();
    await conversations.save(Conversation.start(conversationId, createdAt));

    expect(await messages.findRecentByConversation(conversationId, 10)).toEqual(
      [],
    );
  });

  it('refuses a second write of the same message id', async () => {
    const conversationId = nextConversationId();
    await conversations.save(Conversation.start(conversationId, createdAt));

    const message = Message.fromUser({
      id: MessageId.fromString(`test-msg-dup-${counter}`),
      conversationId,
      parts: [TextPart.of('written once')],
      createdAt,
    });

    await messages.save(message);

    // A Message is written once, when the turn closes. A second write is a bug
    // in the caller, and the primary key says so rather than overwriting an
    // answer somebody already read.
    await expect(messages.save(message)).rejects.toThrow();
  });

  it('lets the database refuse an assistant row with no provenance', async () => {
    const conversationId = nextConversationId();
    await conversations.save(Conversation.start(conversationId, createdAt));

    await expect(
      database.pool.query(
        `INSERT INTO messages (id, conversation_id, author, parts, created_at, provenance, usage, state)
         VALUES ($1, $2, 'assistant', '[]'::jsonb, now(), NULL, NULL, 'completed')`,
        [`test-msg-bad-${counter}`, conversationId.value],
      ),
    ).rejects.toThrow(/messages_assistant_is_attributed/);
  });
});
