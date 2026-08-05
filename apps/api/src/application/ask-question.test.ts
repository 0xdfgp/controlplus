import { describe, expect, it } from 'vitest';

import {
  FakeClock,
  SequentialIdGenerator,
} from '../../test/fakes/fake-clock-and-ids.ts';
import {
  InMemoryConversationRepository,
  InMemoryMessageRepository,
} from '../../test/fakes/in-memory-repositories.ts';
import {
  completionChunk,
  FailingTextGeneration,
  ScriptedTextGeneration,
} from '../../test/fakes/scripted-text-generation.ts';
import { Conversation } from '../domain/entities/conversation.ts';
import { ProviderUnavailable } from '../domain/errors/provider-unavailable.ts';
import { ProductPolicy } from '../domain/policy/product-policy.ts';
import type { TextGenerationPort } from '../domain/ports/text-generation-port.ts';
import { AnswerGeneration } from '../domain/services/answer-generation.ts';
import { ConversationId } from '../domain/value-objects/conversation-id.ts';
import { ModelId } from '../domain/value-objects/model-id.ts';
import { Usage } from '../domain/value-objects/usage.ts';
import { AskQuestion } from './ask-question.ts';
import type { AskQuestionEvent } from './ask-question.ts';

const conversationId = ConversationId.fromString('conv-1');

function build(port: TextGenerationPort) {
  const conversations = new InMemoryConversationRepository();
  const messages = new InMemoryMessageRepository();
  const clock = new FakeClock();
  const ids = new SequentialIdGenerator();
  const answerGeneration = new AnswerGeneration(
    port,
    clock,
    ids,
    ProductPolicy.current(),
  );
  const useCase = new AskQuestion(
    conversations,
    messages,
    answerGeneration,
    clock,
    ids,
  );
  return { useCase, conversations, messages, clock };
}

async function collect(
  stream: AsyncIterable<AskQuestionEvent>,
): Promise<AskQuestionEvent[]> {
  const events: AskQuestionEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

describe('AskQuestion, happy path', () => {
  const port = () =>
    new ScriptedTextGeneration([
      { kind: 'text', text: 'That message ' },
      { kind: 'text', text: 'has two signs of a scam.' },
      completionChunk({
        usage: Usage.fromCounts(18, 42),
        modelId: ModelId.fromString('gemini-3.5-flash'),
      }),
    ]);

  it('streams deltas and then completes', async () => {
    const { useCase } = build(port());

    const events = await collect(
      useCase.execute({ conversationId, question: 'Is this a scam?' }),
    );

    expect(events.map((e) => e.kind)).toEqual(['delta', 'delta', 'completed']);
  });

  it('writes the assistant message exactly once, when the turn closes', async () => {
    const { useCase, messages } = build(port());

    await collect(
      useCase.execute({ conversationId, question: 'Is this a scam?' }),
    );

    expect(messages.assistantMessages()).toHaveLength(1);
    const assistant = messages.assistantMessages()[0];
    expect(assistant?.state).toBe('completed');
    expect(assistant?.text()).toBe('That message has two signs of a scam.');
    expect(assistant?.provenance?.modelId.value).toBe('gemini-3.5-flash');
    expect(assistant?.usage?.inputTokens.value).toBe(18);
    expect(assistant?.usage?.outputTokens.value).toBe(42);
  });

  it('records the user message too', async () => {
    const { useCase, messages } = build(port());

    await collect(
      useCase.execute({ conversationId, question: 'Is this a scam?' }),
    );

    expect(messages.userMessages()).toHaveLength(1);
    expect(messages.userMessages()[0]?.text()).toBe('Is this a scam?');
    expect(messages.userMessages()[0]?.provenance).toBeNull();
  });

  it('emits MessageCompleted for the assistant message', async () => {
    const { useCase, messages } = build(port());

    const events = await collect(
      useCase.execute({ conversationId, question: 'Is this a scam?' }),
    );
    const completed = events.at(-1);
    if (completed?.kind !== 'completed') {
      throw new Error('expected a completed event');
    }

    expect(completed.event.name).toBe('MessageCompleted');
    expect(completed.event.messageId.value).toBe(
      messages.assistantMessages()[0]?.id.value,
    );
  });

  it('starts the conversation when it does not exist yet', async () => {
    const { useCase, conversations } = build(port());

    await collect(useCase.execute({ conversationId, question: 'hello' }));

    expect(conversations.saved).toHaveLength(1);
    expect(conversations.saved[0]?.id.value).toBe('conv-1');
  });

  it('loads the conversation when it already exists', async () => {
    const { useCase, conversations, clock } = build(port());
    await conversations.save(Conversation.start(conversationId, clock.now()));

    await collect(useCase.execute({ conversationId, question: 'hello' }));

    expect(conversations.saved).toHaveLength(1);
  });
});

describe('AskQuestion, when the generation port throws', () => {
  const failing = () =>
    new FailingTextGeneration(new ProviderUnavailable('google'), [
      { kind: 'text', text: 'half an answ' },
    ]);

  it('emits GenerationFailed naming the domain error class', async () => {
    const { useCase } = build(failing());

    const events = await collect(
      useCase.execute({ conversationId, question: 'Is this a scam?' }),
    );
    const last = events.at(-1);
    if (last?.kind !== 'failed') {
      throw new Error('expected a failed event');
    }

    expect(last.event.name).toBe('GenerationFailed');
    expect(last.event.errorClass).toBe('ProviderUnavailable');
    expect(last.event.conversationId.value).toBe('conv-1');
  });

  it('writes no assistant message', async () => {
    const { useCase, messages } = build(failing());

    await collect(
      useCase.execute({ conversationId, question: 'Is this a scam?' }),
    );

    expect(messages.assistantMessages()).toHaveLength(0);
  });

  it('keeps the user message: they did ask', async () => {
    const { useCase, messages } = build(failing());

    await collect(
      useCase.execute({ conversationId, question: 'Is this a scam?' }),
    );

    expect(messages.userMessages()).toHaveLength(1);
  });

  it('does not throw at the caller', async () => {
    const { useCase } = build(failing());

    await expect(
      collect(useCase.execute({ conversationId, question: 'q' })),
    ).resolves.toBeInstanceOf(Array);
  });

  it('fails when the stream closes with no completion chunk', async () => {
    const { useCase, messages } = build(
      new ScriptedTextGeneration([{ kind: 'text', text: 'partial' }]),
    );

    const events = await collect(
      useCase.execute({ conversationId, question: 'q' }),
    );
    const last = events.at(-1);
    if (last?.kind !== 'failed') {
      throw new Error('expected a failed event');
    }

    expect(last.event.errorClass).toBe('ProviderUnavailable');
    expect(messages.assistantMessages()).toHaveLength(0);
  });
});
