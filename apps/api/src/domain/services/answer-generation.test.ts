import { describe, expect, it } from 'vitest';

import { Conversation } from '../entities/conversation.ts';
import { ProviderUnavailable } from '../errors/provider-unavailable.ts';
import { ProductPolicy } from '../policy/product-policy.ts';
import type { Clock } from '../ports/clock.ts';
import type { IdGenerator } from '../ports/id-generator.ts';
import type {
  GenerationChunk,
  GenerationRequest,
  TextGenerationPort,
} from '../ports/text-generation-port.ts';
import { ConversationId } from '../value-objects/conversation-id.ts';
import { MessageId } from '../value-objects/message-id.ts';
import { ModelId } from '../value-objects/model-id.ts';
import { Usage } from '../value-objects/usage.ts';
import { AnswerGeneration } from './answer-generation.ts';
import type { AnswerGenerationEvent } from './answer-generation.ts';

const now = new Date('2026-08-05T10:00:00.000Z');

const clock: Clock = { now: () => now };

const idGenerator: IdGenerator = {
  nextConversationId: () => ConversationId.fromString('conv-generated'),
  nextMessageId: () => MessageId.fromString('msg-generated'),
};

const started: GenerationChunk = {
  kind: 'started',
  modelId: ModelId.fromString('gemini-3.5-flash'),
  provider: 'google',
};

class ScriptedTextGeneration implements TextGenerationPort {
  seenRequests: GenerationRequest[] = [];
  released = false;

  constructor(private readonly chunks: readonly GenerationChunk[]) {}

  async *generate(request: GenerationRequest): AsyncIterable<GenerationChunk> {
    this.seenRequests.push(request);
    try {
      // Every adapter opens with one, so the fake does too.
      yield started;
      for (const chunk of this.chunks) {
        yield chunk;
      }
    } finally {
      // What a real adapter turns into aborting the provider stream.
      this.released = true;
    }
  }
}

const completion: GenerationChunk = {
  kind: 'completion',
  usage: Usage.fromCounts(18, 42),
  modelId: ModelId.fromString('gemini-3.5-flash'),
  provider: 'google',
};

function conversation(): Conversation {
  return Conversation.start(ConversationId.fromString('conv-1'), now);
}

function subject(port: TextGenerationPort): AnswerGeneration {
  return new AnswerGeneration(port, clock, idGenerator, ProductPolicy.current());
}

async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of stream) {
    items.push(item);
  }
  return items;
}

describe('AnswerGeneration', () => {
  it('yields a delta per text chunk, then the completed message', async () => {
    const port = new ScriptedTextGeneration([
      { kind: 'text', text: 'That message ' },
      { kind: 'text', text: 'has two signs of a scam.' },
      completion,
    ]);

    const events = await collect(subject(port).run(conversation(), 'Is this a scam?'));

    expect(events.map((e) => e.kind)).toEqual(['delta', 'delta', 'completed']);
    const last = events.at(-1);
    if (last?.kind !== 'completed') {
      throw new Error('expected the last event to be the completed message');
    }
    expect(last.message.text()).toBe('That message has two signs of a scam.');
  });

  it('names the model and provider from the completion chunk in provenance', async () => {
    const port = new ScriptedTextGeneration([
      { kind: 'text', text: 'answer' },
      {
        kind: 'completion',
        usage: Usage.fromCounts(7, 9),
        // Deliberately not the configured default: provenance must record what
        // actually produced the answer, not what we asked for.
        modelId: ModelId.fromString('gemini-2.5-flash'),
        provider: 'google',
      },
    ]);

    const events = await collect(subject(port).run(conversation(), 'question'));
    const last = events.at(-1);
    if (last?.kind !== 'completed') {
      throw new Error('expected the last event to be the completed message');
    }

    expect(last.message.provenance?.origin).toBe('ai-generated');
    expect(last.message.provenance?.modelId.value).toBe('gemini-2.5-flash');
    expect(last.message.provenance?.provider).toBe('google');
    expect(last.message.usage?.inputTokens.value).toBe(7);
    expect(last.message.usage?.outputTokens.value).toBe(9);
    expect(last.message.state).toBe('completed');
  });

  it('raises MessageCompleted for the message it built', async () => {
    const port = new ScriptedTextGeneration([
      { kind: 'text', text: 'answer' },
      completion,
    ]);

    const events = await collect(subject(port).run(conversation(), 'question'));
    const last = events.at(-1);
    if (last?.kind !== 'completed') {
      throw new Error('expected the last event to be the completed message');
    }

    expect(last.event.name).toBe('MessageCompleted');
    expect(last.event.messageId.value).toBe(last.message.id.value);
    expect(last.event.conversationId.value).toBe('conv-1');
  });

  it('sends the product policy and the question to the port', async () => {
    const port = new ScriptedTextGeneration([completion]);

    await collect(subject(port).run(conversation(), 'Is this text a scam?'));

    expect(port.seenRequests).toHaveLength(1);
    expect(port.seenRequests[0]?.question).toBe('Is this text a scam?');
    expect(port.seenRequests[0]?.policy.version).toBe(
      ProductPolicy.current().version,
    );
  });

  it('fails when the stream closes without a completion chunk', async () => {
    const port = new ScriptedTextGeneration([{ kind: 'text', text: 'half an ' }]);

    await expect(
      collect(subject(port).run(conversation(), 'question')),
    ).rejects.toBeInstanceOf(ProviderUnavailable);
  });

  it('does not use the started chunk for a completed message', async () => {
    const port = new ScriptedTextGeneration([
      { kind: 'text', text: 'answer' },
      {
        kind: 'completion',
        usage: Usage.fromCounts(7, 9),
        modelId: ModelId.fromString('gemini-2.5-flash'),
        provider: 'google',
      },
    ]);

    const events = await collect(subject(port).run(conversation(), 'question'));
    const last = events.at(-1);
    if (last?.kind !== 'completed') {
      throw new Error('expected the last event to be the completed message');
    }

    // The started chunk names gemini-3.5-flash. A turn that finished knows
    // better than that, and must say what actually answered.
    expect(last.message.provenance?.modelId.value).toBe('gemini-2.5-flash');
  });

  it('yields no delta for the started chunk: it is not answer text', async () => {
    const port = new ScriptedTextGeneration([completion]);

    const events = await collect(subject(port).run(conversation(), 'question'));

    expect(events.map((e) => e.kind)).toEqual(['completed']);
  });

  it('does not persist anything: it only yields', async () => {
    // AnswerGeneration is constructed with no repository at all, which is the
    // strongest statement of "it does not persist" the type system can make.
    const port = new ScriptedTextGeneration([completion]);
    const generation = subject(port);

    expect(Reflect.ownKeys(generation)).not.toContain('messageRepository');
    expect(Reflect.ownKeys(generation)).not.toContain('conversationRepository');
  });
});

/**
 * Cancellation, as ADR-012 expresses it: the consumer stops iterating.
 *
 * `stopAfterFirstDelta` is what the use case does for real — take some events,
 * then close the generator and read what it hands back on the way out.
 */
async function stopAfterFirstDelta(
  generation: AsyncGenerator<AnswerGenerationEvent, void, undefined>,
): Promise<AnswerGenerationEvent | null> {
  await generation.next();
  const closing = await generation.return(undefined);
  return closing.done === true ? null : closing.value;
}

describe('AnswerGeneration, when the consumer stops iterating', () => {
  const port = () =>
    new ScriptedTextGeneration([
      { kind: 'text', text: 'That message has ' },
      { kind: 'text', text: 'two signs of a scam.' },
      completion,
    ]);

  it('hands back the partial answer as a stopped message', async () => {
    const stopped = await stopAfterFirstDelta(
      subject(port()).run(conversation(), 'Is this a scam?'),
    );

    if (stopped?.kind !== 'completed') {
      throw new Error('expected a message on the way out');
    }
    expect(stopped.message.state).toBe('stopped');
    expect(stopped.message.text()).toBe('That message has ');
  });

  it('attributes it from the started chunk, since no completion arrived', async () => {
    const stopped = await stopAfterFirstDelta(
      subject(port()).run(conversation(), 'question'),
    );

    if (stopped?.kind !== 'completed') {
      throw new Error('expected a message on the way out');
    }
    expect(stopped.message.provenance?.origin).toBe('ai-generated');
    expect(stopped.message.provenance?.modelId.value).toBe('gemini-3.5-flash');
    expect(stopped.message.provenance?.provider).toBe('google');
  });

  it('records zero usage, because that is what the provider reported', async () => {
    const stopped = await stopAfterFirstDelta(
      subject(port()).run(conversation(), 'question'),
    );

    if (stopped?.kind !== 'completed') {
      throw new Error('expected a message on the way out');
    }
    // Not an estimate of what the stopped turn cost. The provider reports usage
    // only when the interaction completes, and this one never did.
    expect(stopped.message.usage?.inputTokens.value).toBe(0);
    expect(stopped.message.usage?.outputTokens.value).toBe(0);
    expect(stopped.message.usage?.thoughtTokens.value).toBe(0);
  });

  it('raises MessageCompleted carrying the stopped terminal state', async () => {
    const stopped = await stopAfterFirstDelta(
      subject(port()).run(conversation(), 'question'),
    );

    if (stopped?.kind !== 'completed') {
      throw new Error('expected a message on the way out');
    }
    // ADR-015 rejected a separate MessageStopped: stopped is a terminal state
    // that MessageCompleted already carries.
    expect(stopped.event.name).toBe('MessageCompleted');
    expect(stopped.event.state).toBe('stopped');
  });

  it('releases the port stream', async () => {
    const scripted = port();

    await stopAfterFirstDelta(
      subject(scripted).run(conversation(), 'question'),
    );

    expect(scripted.released).toBe(true);
  });

  it('keeps an empty answer rather than inventing one, when stopped before any text', async () => {
    const generation = subject(port()).run(conversation(), 'question');
    const closing = await generation.return(undefined);

    // Nothing was iterated, so the port never opened and nothing named a
    // provider. There is no turn to attribute and nothing is handed back.
    expect(closing.done).toBe(true);
  });

  it('hands nothing back once the turn has already completed', async () => {
    const generation = subject(port()).run(conversation(), 'question');
    await collect(generation);

    const closing = await generation.return(undefined);

    // Otherwise the use case would write the turn twice, once completed and
    // once stopped.
    expect(closing.done).toBe(true);
  });

  it('hands nothing back when the turn failed: a failure is not a stop', async () => {
    const failing = new ScriptedTextGeneration([{ kind: 'text', text: 'half' }]);
    const generation = subject(failing).run(conversation(), 'question');

    await generation.next();
    await expect(generation.next()).rejects.toBeInstanceOf(ProviderUnavailable);
    const closing = await generation.return(undefined);

    expect(closing.done).toBe(true);
  });
});
