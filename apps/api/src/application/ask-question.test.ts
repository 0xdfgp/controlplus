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
import { isImagePart } from '../domain/content/content-part.ts';
import { Conversation } from '../domain/entities/conversation.ts';
import { ProviderUnavailable } from '../domain/errors/provider-unavailable.ts';
import { MAX_ATTACHMENT_BYTES } from '../domain/policy/attachment-policy.ts';
import {
  CONTEXT_WINDOW_MESSAGES,
  PHOTO_IN_HISTORY_NOTICE,
  STOPPED_ANSWER_NOTICE,
} from '../domain/policy/conversation-context.ts';
import { ProductPolicy } from '../domain/policy/product-policy.ts';
import type { TextGenerationPort } from '../domain/ports/text-generation-port.ts';
import { AnswerGeneration } from '../domain/services/answer-generation.ts';
import { ConversationId } from '../domain/value-objects/conversation-id.ts';
import { ModelId } from '../domain/value-objects/model-id.ts';
import { Usage } from '../domain/value-objects/usage.ts';
import { AskQuestion } from './ask-question.ts';
import type { AskQuestionEvent } from './ask-question.ts';

const conversationId = ConversationId.fromString('conv-1');

/** A photo as it reaches the use case: already decoded, counted and hashed. */
const photo = {
  data: 'iVBORw0KGgoAAAANSUhEUg-pretend-this-is-a-resized-jpeg',
  mediaType: 'image/jpeg',
  width: 1568,
  height: 1176,
  hash: 'a3f1b2c4d5e6f70819',
  byteSize: 482_113,
};

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

describe('AskQuestion, when the caller stops consuming the turn', () => {
  const port = () =>
    new ScriptedTextGeneration([
      { kind: 'text', text: 'That message has ' },
      { kind: 'text', text: 'two signs of a scam.' },
      completionChunk(),
    ]);

  /** What the route does when the client disconnects: take some, then leave. */
  async function askAndWalkAway(
    stream: AsyncIterable<AskQuestionEvent>,
  ): Promise<void> {
    for await (const event of stream) {
      if (event.kind === 'delta') {
        break;
      }
    }
  }

  it('writes the partial answer once, marked as stopped', async () => {
    const { useCase, messages } = build(port());

    await askAndWalkAway(
      useCase.execute({ conversationId, question: 'Is this a scam?' }),
    );

    expect(messages.assistantMessages()).toHaveLength(1);
    const assistant = messages.assistantMessages()[0];
    expect(assistant?.state).toBe('stopped');
    expect(assistant?.text()).toBe('That message has ');
  });

  it('attributes the stopped message and gives it usage', async () => {
    const { useCase, messages } = build(port());

    await askAndWalkAway(
      useCase.execute({ conversationId, question: 'Is this a scam?' }),
    );

    const assistant = messages.assistantMessages()[0];
    expect(assistant?.provenance?.origin).toBe('ai-generated');
    expect(assistant?.provenance?.modelId.value).toBe('gemini-3.5-flash');
    expect(assistant?.usage?.totalTokens().value).toBe(0);
  });

  it('keeps the user message: they did ask', async () => {
    const { useCase, messages } = build(port());

    await askAndWalkAway(
      useCase.execute({ conversationId, question: 'Is this a scam?' }),
    );

    expect(messages.userMessages()).toHaveLength(1);
  });

  it('stops iterating the port, which is what releases the provider stream', async () => {
    const scripted = port();
    const { useCase } = build(scripted);

    await askAndWalkAway(
      useCase.execute({ conversationId, question: 'Is this a scam?' }),
    );

    expect(scripted.released).toBe(true);
  });

  it('writes one row, not two, when the turn completed before the caller left', async () => {
    const { useCase, messages } = build(port());

    const stream = useCase.execute({ conversationId, question: 'q' });
    await collect(stream);
    // Closing an already finished turn must not produce a second, stopped row.
    await stream.return(undefined);

    expect(messages.assistantMessages()).toHaveLength(1);
    expect(messages.assistantMessages()[0]?.state).toBe('completed');
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

describe('AskQuestion, assembling the conversation so far', () => {
  const port = () =>
    new ScriptedTextGeneration([
      { kind: 'text', text: 'On your phone, ' },
      { kind: 'text', text: 'open Settings.' },
      completionChunk(),
    ]);

  async function ask(
    useCase: AskQuestion,
    question: string,
  ): Promise<void> {
    await collect(useCase.execute({ conversationId, question }));
  }

  it('sends the previous exchange with a follow up, oldest first', async () => {
    const scripted = port();
    const { useCase } = build(scripted);

    await ask(useCase, 'Is this text about my bank a scam?');
    await ask(useCase, 'And how do I do that on my phone?');

    expect(scripted.seenRequests).toHaveLength(2);
    expect(scripted.seenRequests[1]?.history.map((t) => t.text)).toEqual([
      'Is this text about my bank a scam?',
      'On your phone, open Settings.',
    ]);
    expect(scripted.seenRequests[1]?.history.map((t) => t.author)).toEqual([
      'user',
      'assistant',
    ]);
  });

  it('sends no history with the first question of a conversation', async () => {
    const scripted = port();
    const { useCase } = build(scripted);

    await ask(useCase, 'Is this a scam?');

    expect(scripted.seenRequests[0]?.history).toEqual([]);
  });

  it('does not put the question in the history as well as in the request', async () => {
    const scripted = port();
    const { useCase } = build(scripted);

    await ask(useCase, 'first question');
    await ask(useCase, 'second question');

    const second = scripted.seenRequests[1];
    expect(second?.question).toBe('second question');
    expect(second?.history.map((t) => t.text)).not.toContain('second question');
  });

  it('sends only the last N messages, however long the conversation runs', async () => {
    const scripted = port();
    const { useCase, messages } = build(scripted);

    // Comfortably past the window, so the assertion is about the bound rather
    // than about a conversation that happens to be short.
    for (let turn = 0; turn < CONTEXT_WINDOW_MESSAGES; turn += 1) {
      await ask(useCase, `question ${turn}`);
    }

    const last = scripted.seenRequests.at(-1);
    expect(messages.saved.length).toBeGreaterThan(CONTEXT_WINDOW_MESSAGES);
    expect(last?.history).toHaveLength(CONTEXT_WINDOW_MESSAGES);
    // The oldest questions have fallen out of the window; the newest are in it.
    expect(last?.history.map((t) => t.text)).not.toContain('question 0');
    expect(last?.history.map((t) => t.text)).toContain(
      `question ${CONTEXT_WINDOW_MESSAGES - 2}`,
    );
  });

  it('includes a stopped answer, marked as unfinished', async () => {
    const scripted = new ScriptedTextGeneration([
      { kind: 'text', text: 'That message has ' },
      { kind: 'text', text: 'two signs of a scam.' },
      completionChunk(),
    ]);
    const { useCase, messages } = build(scripted);

    // Stop the first turn partway: the route walking away is what a tap on
    // Stop looks like from here.
    for await (const event of useCase.execute({
      conversationId,
      question: 'Is this a scam?',
    })) {
      if (event.kind === 'delta') {
        break;
      }
    }
    expect(messages.assistantMessages()[0]?.state).toBe('stopped');

    await collect(
      useCase.execute({ conversationId, question: 'Carry on please.' }),
    );

    const followUp = scripted.seenRequests.at(-1);
    const assistantTurn = followUp?.history.find(
      (t) => t.author === 'assistant',
    );
    expect(assistantTurn?.text).toContain('That message has ');
    expect(assistantTurn?.text).toContain(STOPPED_ANSWER_NOTICE);
  });
});

describe('AskQuestion, a turn carrying a photo (ADR-024)', () => {
  const port = () =>
    new ScriptedTextGeneration([
      { kind: 'text', text: 'That is a fake warning. ' },
      { kind: 'text', text: 'Do not tap it.' },
      completionChunk(),
    ]);

  it('carries the image to the port with this turn', async () => {
    const scripted = port();
    const { useCase } = build(scripted);

    await collect(
      useCase.execute({
        conversationId,
        question: 'What does this message on my screen mean?',
        image: photo,
      }),
    );

    const sent = scripted.seenRequests[0]?.image;
    expect(sent?.data).toBe(photo.data);
    expect(sent?.mediaType).toBe('image/jpeg');
    expect(sent?.width).toBe(1568);
    expect(sent?.height).toBe(1176);
  });

  it('sends no image at all on a turn that has none', async () => {
    const scripted = port();
    const { useCase } = build(scripted);

    await collect(useCase.execute({ conversationId, question: 'Is this a scam?' }));

    expect(scripted.seenRequests[0]?.image).toBeUndefined();
  });

  it('writes the user message as an ImagePart and the question, in that order', async () => {
    const { useCase, messages } = build(port());

    await collect(
      useCase.execute({
        conversationId,
        question: 'What does this message on my screen mean?',
        image: photo,
      }),
    );

    const user = messages.userMessages()[0];
    expect(user?.parts).toHaveLength(2);
    const first = user?.parts[0];
    if (first === undefined || !isImagePart(first)) {
      throw new Error('expected an image part first');
    }
    expect(first.mediaType).toBe('image/jpeg');
    expect(first.width).toBe(1568);
    expect(first.height).toBe(1176);
    expect(first.hash).toBe(photo.hash);
    expect(user?.text()).toBe('What does this message on my screen mean?');
  });

  it('keeps no bytes in what is written', async () => {
    const { useCase, messages } = build(port());

    await collect(
      useCase.execute({ conversationId, question: 'What is this?', image: photo }),
    );

    // ADR-024. The image travelled to the provider inside this turn and what is
    // left behind references it.
    expect(JSON.stringify(messages.saved)).not.toContain(photo.data);
  });
});

describe('AskQuestion, a follow up after a photo turn (AC6)', () => {
  const port = () =>
    new ScriptedTextGeneration([
      { kind: 'text', text: 'Delete the message.' },
      completionChunk(),
    ]);

  it('does not resend the bytes, because the Message holds a reference', async () => {
    const scripted = port();
    const { useCase } = build(scripted);

    await collect(
      useCase.execute({
        conversationId,
        question: 'What does this message on my screen mean?',
        image: photo,
      }),
    );
    await collect(
      useCase.execute({ conversationId, question: 'What should I do about it?' }),
    );

    const followUp = scripted.seenRequests[1];
    expect(followUp?.image).toBeUndefined();
    // The whole request, not just the image field: a follow up about a photo
    // costs what a text follow up costs (ADR-023).
    expect(JSON.stringify(followUp)).not.toContain(photo.data);
  });

  it('still tells the model a photo was part of that question', async () => {
    const scripted = port();
    const { useCase } = build(scripted);

    await collect(
      useCase.execute({
        conversationId,
        question: 'What does this message on my screen mean?',
        image: photo,
      }),
    );
    await collect(
      useCase.execute({ conversationId, question: 'What should I do about it?' }),
    );

    const earlier = scripted.seenRequests[1]?.history[0];
    expect(earlier?.author).toBe('user');
    expect(earlier?.text).toContain(PHOTO_IN_HISTORY_NOTICE);
    expect(earlier?.text).toContain('What does this message on my screen mean?');
  });
});

describe('AskQuestion, a photo over the limit (AC4)', () => {
  const port = () => new ScriptedTextGeneration([completionChunk()]);

  const oversized = { ...photo, byteSize: MAX_ATTACHMENT_BYTES + 1 };

  it('fails the turn naming AttachmentTooLarge', async () => {
    const { useCase } = build(port());

    const events = await collect(
      useCase.execute({
        conversationId,
        question: 'What is this?',
        image: oversized,
      }),
    );

    expect(events.map((e) => e.kind)).toEqual(['failed']);
    const failed = events[0];
    if (failed?.kind !== 'failed') {
      throw new Error('expected a failed event');
    }
    expect(failed.event.errorClass).toBe('AttachmentTooLarge');
    expect(failed.event.conversationId.value).toBe('conv-1');
  });

  it('never reaches the provider', async () => {
    const scripted = port();
    const { useCase } = build(scripted);

    await collect(
      useCase.execute({
        conversationId,
        question: 'What is this?',
        image: oversized,
      }),
    );

    expect(scripted.seenRequests).toHaveLength(0);
  });

  it('writes nothing at all: a photo that cannot be sent is not a turn', async () => {
    const { useCase, messages, conversations } = build(port());

    await collect(
      useCase.execute({
        conversationId,
        question: 'What is this?',
        image: oversized,
      }),
    );

    expect(messages.saved).toHaveLength(0);
    expect(conversations.saved).toHaveLength(0);
  });
});

describe('AskQuestion, when the history cannot be read', () => {
  function buildFailing() {
    const scripted = new ScriptedTextGeneration([completionChunk()]);
    const built = build(scripted);
    built.messages.historyFailure = new Error('connection terminated');
    return { ...built, scripted };
  }

  it('fails the turn rather than answering with no context', async () => {
    const { useCase } = buildFailing();

    const events = await collect(
      useCase.execute({ conversationId, question: 'And on my phone?' }),
    );

    expect(events.map((e) => e.kind)).toEqual(['failed']);
    const failed = events[0];
    if (failed?.kind !== 'failed') {
      throw new Error('expected a failed event');
    }
    expect(failed.event.name).toBe('GenerationFailed');
    expect(failed.event.conversationId.value).toBe('conv-1');
  });

  it('never reaches the provider, so no half-contextual answer is generated', async () => {
    const { useCase, scripted } = buildFailing();

    await collect(
      useCase.execute({ conversationId, question: 'And on my phone?' }),
    );

    // The failure that would be worse than this one: a follow up answered
    // confidently with no idea what it is following.
    expect(scripted.seenRequests).toHaveLength(0);
  });

  it('writes nothing at all for the turn', async () => {
    const { useCase, messages } = buildFailing();

    await collect(
      useCase.execute({ conversationId, question: 'And on my phone?' }),
    );

    expect(messages.saved).toHaveLength(0);
  });
});
