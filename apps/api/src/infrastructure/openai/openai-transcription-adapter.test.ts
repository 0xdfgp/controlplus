import { describe, expect, it } from 'vitest';

import {
  CAPTURED_TRANSCRIPT,
  HAPPY_PATH_EVENTS,
  TRUNCATED_EVENTS,
} from '../../../test/__fixtures__/openai-transcription-events.ts';
import {
  CONTRACT_AUDIO,
  describeTranscriptionPortContract,
} from '../../../test/contracts/transcription-port.contract.ts';
import { ProviderUnavailable } from '../../domain/errors/provider-unavailable.ts';
import type { TranscriptionChunk } from '../../domain/ports/transcription-port.ts';
import { ModelId } from '../../domain/value-objects/model-id.ts';
import { OpenAITranscriptionAdapter } from './openai-transcription-adapter.ts';
import type {
  OpenAITranscriptionEvent,
  TranscriptionStream,
  TranscriptionStreamOpener,
  TranscriptionStreamRequest,
} from './transcription-stream.ts';

const DEFAULT_MODEL = ModelId.fromString('gpt-transcribe');

/** Replays recorded events and records whether the adapter released the stream. */
class RecordedStreamOpener implements TranscriptionStreamOpener {
  aborted = false;
  readonly requests: TranscriptionStreamRequest[] = [];

  constructor(
    private readonly events: readonly OpenAITranscriptionEvent[],
    private readonly failToOpen: Error | null = null,
  ) {}

  async open(request: TranscriptionStreamRequest): Promise<TranscriptionStream> {
    if (this.failToOpen !== null) {
      throw this.failToOpen;
    }
    this.requests.push(request);
    const events = this.events;

    async function* replay(): AsyncGenerator<OpenAITranscriptionEvent> {
      for (const event of events) {
        yield event;
      }
    }
    const iterator = replay();

    return {
      events: () => iterator,
      abort: async () => {
        this.aborted = true;
        await iterator.return(undefined);
      },
    };
  }
}

function adapterFor(events: readonly OpenAITranscriptionEvent[]) {
  const opener = new RecordedStreamOpener(events);
  return {
    opener,
    adapter: new OpenAITranscriptionAdapter(opener, DEFAULT_MODEL),
  };
}

// The shared contract, run against the OpenAI adapter over recorded fixtures.
let sharedOpener = new RecordedStreamOpener(HAPPY_PATH_EVENTS);

describeTranscriptionPortContract('OpenAITranscriptionAdapter', {
  happyPath: () => {
    sharedOpener = new RecordedStreamOpener(HAPPY_PATH_EVENTS);
    return new OpenAITranscriptionAdapter(sharedOpener, DEFAULT_MODEL);
  },
  expectedTranscript: CAPTURED_TRANSCRIPT,
  truncated: () =>
    new OpenAITranscriptionAdapter(
      new RecordedStreamOpener(TRUNCATED_EVENTS),
      DEFAULT_MODEL,
    ),
  failsToOpen: () =>
    new OpenAITranscriptionAdapter(
      new RecordedStreamOpener([], new Error('ENOTFOUND')),
      DEFAULT_MODEL,
    ),
  wasAborted: () => sharedOpener.aborted,
  reset: () => {
    sharedOpener.aborted = false;
  },
});

describe('OpenAITranscriptionAdapter, OpenAI specifics', () => {
  it('passes the audio to the provider unchanged, with its media type and name', async () => {
    const { opener, adapter } = adapterFor(HAPPY_PATH_EVENTS);

    for await (const _ of adapter.transcribe({ audio: CONTRACT_AUDIO })) {
      void _;
    }

    expect(opener.requests).toHaveLength(1);
    expect(opener.requests[0]).toEqual({
      model: 'gpt-transcribe',
      data: CONTRACT_AUDIO.data,
      mediaType: 'audio/wav',
      fileName: 'contract.wav',
    });
  });

  it('targets gpt-transcribe, not gpt-4o-transcribe', async () => {
    // ADR-017 named the current recommended model for new integrations and
    // said explicitly that the older one is not the starting point.
    const { opener, adapter } = adapterFor(HAPPY_PATH_EVENTS);

    for await (const _ of adapter.transcribe({ audio: CONTRACT_AUDIO })) {
      void _;
    }

    expect(opener.requests[0]?.model).toBe('gpt-transcribe');
  });

  it('ignores the duration the provider reports on the done event', async () => {
    // The capture carries usage { type: 'duration', seconds: 22 }, which the
    // SDK does not even declare. It stays out of the domain: duration is a
    // property of the file we supplied, so the caller measures it rather than
    // trusting the party doing the billing.
    const { adapter } = adapterFor(HAPPY_PATH_EVENTS);
    const chunks: TranscriptionChunk[] = [];

    for await (const chunk of adapter.transcribe({ audio: CONTRACT_AUDIO })) {
      chunks.push(chunk);
    }

    const completion = chunks.at(-1);
    if (completion?.kind !== 'completion') {
      throw new Error('expected a completion chunk');
    }
    expect(JSON.stringify(completion)).not.toContain('22');
    expect(JSON.stringify(completion)).not.toContain('duration');
  });

  it('falls back to the deltas when the done event carries no text', async () => {
    // Constructed rather than captured, and labelled as such: this covers a
    // defensive branch in the adapter, not a payload the provider has been
    // observed to send. A done event with an empty body must not erase a
    // transcript the user already watched arrive.
    const constructed = [
      { type: 'transcript.text.delta', delta: 'Hello ' },
      { type: 'transcript.text.delta', delta: 'there.' },
      { type: 'transcript.text.done', text: '' },
    ] as unknown as OpenAITranscriptionEvent[];

    const { adapter } = adapterFor(constructed);
    const chunks: TranscriptionChunk[] = [];
    for await (const chunk of adapter.transcribe({ audio: CONTRACT_AUDIO })) {
      chunks.push(chunk);
    }

    const completion = chunks.at(-1);
    if (completion?.kind !== 'completion') {
      throw new Error('expected a completion chunk');
    }
    expect(completion.transcript).toBe('Hello there.');
  });

  it('keeps the provider error as the cause without exposing it upstream', async () => {
    const opener = new RecordedStreamOpener([], new Error('insufficient_quota'));
    const adapter = new OpenAITranscriptionAdapter(opener, DEFAULT_MODEL);

    try {
      for await (const _ of adapter.transcribe({ audio: CONTRACT_AUDIO })) {
        void _;
      }
      throw new Error('expected ProviderUnavailable');
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderUnavailable);
      expect((error as ProviderUnavailable).message).not.toContain('quota');
      expect((error as ProviderUnavailable).cause).toBeDefined();
    }
  });
});
