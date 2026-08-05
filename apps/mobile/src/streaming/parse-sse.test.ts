import { describe, expect, it } from 'vitest';

import { parseSse } from './parse-sse.ts';

function frame(type: string, payload: unknown): string {
  return `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
}

describe('parseSse', () => {
  it('reads a single complete frame', () => {
    const text = frame('stage', { type: 'stage', stage: 'thinking' });

    const { events, consumed } = parseSse(text, 0);

    expect(events).toEqual([{ type: 'stage', stage: 'thinking' }]);
    expect(consumed).toBe(text.length);
  });

  it('reads several frames in one pass', () => {
    const text =
      frame('stage', { type: 'stage', stage: 'thinking' }) +
      frame('stage', { type: 'stage', stage: 'responding' }) +
      frame('message.delta', { type: 'message.delta', text: 'That ' });

    const { events } = parseSse(text, 0);

    expect(events.map((e) => e.type)).toEqual([
      'stage',
      'stage',
      'message.delta',
    ]);
  });

  it('leaves a half-written frame unconsumed', () => {
    const complete = frame('stage', { type: 'stage', stage: 'thinking' });
    const text = `${complete}event: message.delta\ndata: {"type":"messa`;

    const { events, consumed } = parseSse(text, 0);

    expect(events).toHaveLength(1);
    expect(consumed).toBe(complete.length);
  });

  it('resumes from the offset without re-reading events', () => {
    const first = frame('stage', { type: 'stage', stage: 'thinking' });
    const second = frame('message.delta', {
      type: 'message.delta',
      text: 'hello',
    });

    const pass1 = parseSse(first, 0);
    const pass2 = parseSse(first + second, pass1.consumed);

    expect(pass1.events).toHaveLength(1);
    expect(pass2.events).toHaveLength(1);
    expect(pass2.events[0]).toEqual({ type: 'message.delta', text: 'hello' });
  });

  it('reassembles text delivered one character at a time', () => {
    const full =
      frame('stage', { type: 'stage', stage: 'responding' }) +
      frame('message.delta', { type: 'message.delta', text: 'a' }) +
      frame('message.delta', { type: 'message.delta', text: 'b' });

    let offset = 0;
    const seen: string[] = [];
    for (let i = 1; i <= full.length; i += 1) {
      const { events, consumed } = parseSse(full.slice(0, i), offset);
      offset = consumed;
      for (const event of events) {
        seen.push(event.type);
      }
    }

    expect(seen).toEqual(['stage', 'message.delta', 'message.delta']);
  });

  it('drops a frame whose data is not valid JSON rather than throwing', () => {
    const text = 'event: message.delta\ndata: {not json}\n\n';

    expect(() => parseSse(text, 0)).not.toThrow();
    expect(parseSse(text, 0).events).toHaveLength(0);
  });

  it('ignores an event name that is not part of the contract', () => {
    const text = frame('transcript', { type: 'transcript', text: 'nope' });

    expect(parseSse(text, 0).events).toHaveLength(0);
  });

  it('reads the terminal message.done with provenance and usage', () => {
    const done = {
      type: 'message.done',
      messageId: 'msg-1',
      state: 'completed',
      provenance: {
        origin: 'ai-generated',
        modelId: 'gemini-3.5-flash',
        provider: 'google',
      },
      usage: { inputTokens: 118, outputTokens: 27, thoughtTokens: 254 },
    };

    const { events } = parseSse(frame('message.done', done), 0);

    expect(events[0]).toEqual(done);
  });

  it('reads an error event', () => {
    const { events } = parseSse(
      frame('error', { type: 'error', error: 'ProviderUnavailable' }),
      0,
    );

    expect(events[0]).toEqual({ type: 'error', error: 'ProviderUnavailable' });
  });
});
