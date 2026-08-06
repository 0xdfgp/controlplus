import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { SseEvent } from '@control-plus/contracts';

import { askQuestionStream } from './ask-question-stream.ts';

/**
 * The other half of the gap.
 *
 * The server can deliver deltas separated in time and the screen still show
 * nothing until the end, if the client only reads the body once the request
 * completes. That is invisible to any assertion about the event sequence, so
 * this asserts the render path runs repeatedly while the response is still
 * open.
 *
 * React Native grows `responseText` rather than handing over discrete chunks,
 * so the fake below models exactly that: a string that gets longer, with a
 * readystatechange 3 after each growth.
 */
const READY_LOADING = 3;
const READY_DONE = 4;

function frame(type: string, payload: unknown): string {
  return `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
}

class FakeXhr {
  static last: FakeXhr | null = null;

  readyState = 0;
  status = 200;
  responseText = '';
  onreadystatechange: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  aborted = false;
  sentBody: string | null = null;

  constructor() {
    FakeXhr.last = this;
  }

  open(): void {
    this.readyState = 1;
  }

  setRequestHeader(): void {}

  send(body: string): void {
    this.sentBody = body;
  }

  /**
   * Abort the way React Native actually does it.
   *
   * Copied behaviour, not invention: RN's XMLHttpRequest.abort() calls
   * `_reset()` — which sets `status` to 0 and blanks the response — and then
   * `setReadyState(DONE)`, which dispatches `readystatechange` synchronously,
   * from inside the abort call itself. See
   * node_modules/react-native/Libraries/Network/XMLHttpRequest.js:654-672.
   *
   * A fake that only sets a flag makes the interesting case unreachable.
   */
  abort(): void {
    this.aborted = true;
    this.status = 0;
    this.responseText = '';
    this.readyState = READY_DONE;
    this.onreadystatechange?.();
  }

  /** Grow the body the way RN does, then tick LOADING. */
  deliver(text: string): void {
    this.responseText += text;
    this.readyState = READY_LOADING;
    this.onreadystatechange?.();
  }

  complete(): void {
    this.readyState = READY_DONE;
    this.onreadystatechange?.();
  }
}

const originalXhr = globalThis.XMLHttpRequest;

beforeEach(() => {
  (globalThis as { XMLHttpRequest: unknown }).XMLHttpRequest = FakeXhr;
});

afterEach(() => {
  (globalThis as { XMLHttpRequest: unknown }).XMLHttpRequest = originalXhr;
  FakeXhr.last = null;
});

interface Started {
  events: SseEvent[];
  closed: boolean[];
  /** One entry per onTransportError call. */
  errors: boolean[];
  cancel: () => void;
  xhr: FakeXhr;
}

function start(): Started {
  const events: SseEvent[] = [];
  const closed: boolean[] = [];
  const errors: boolean[] = [];
  const cancel = askQuestionStream(
    {
      baseUrl: 'http://localhost:3000',
      conversationId: 'conv-1',
      question: 'Is this a scam?',
    },
    {
      onEvent: (event) => events.push(event),
      onTransportError: () => errors.push(true),
      onClose: () => closed.push(true),
    },
  );
  const xhr = FakeXhr.last;
  if (xhr === null) {
    throw new Error('the stream did not construct an XMLHttpRequest');
  }
  return { events, closed, errors, cancel, xhr };
}

describe('askQuestionStream renders progressively', () => {
  it('emits events while the response is still open, not only at close', () => {
    const { events, xhr } = start();

    xhr.deliver(frame('stage', { type: 'stage', stage: 'thinking' }));
    const afterFirst = events.length;

    xhr.deliver(frame('stage', { type: 'stage', stage: 'responding' }));
    xhr.deliver(frame('message.delta', { type: 'message.delta', text: 'That ' }));
    const beforeClose = events.length;

    xhr.complete();

    // The assertion that matters: work happened before readyState 4.
    expect(afterFirst).toBe(1);
    expect(beforeClose).toBe(3);
    expect(beforeClose).toBeGreaterThan(1);
  });

  it('delivers each delta as it lands rather than batching them', () => {
    const { events, xhr } = start();
    const countsAfterEachDelivery: number[] = [];

    xhr.deliver(frame('stage', { type: 'stage', stage: 'responding' }));
    countsAfterEachDelivery.push(events.length);

    for (const text of ['That ', 'message ', 'is a scam.']) {
      xhr.deliver(frame('message.delta', { type: 'message.delta', text }));
      countsAfterEachDelivery.push(events.length);
    }

    // Strictly increasing: every delivery produced an event. A client that
    // only parsed on completion would give [0,0,0,0].
    expect(countsAfterEachDelivery).toEqual([1, 2, 3, 4]);
  });

  it('never re-emits an event it has already delivered', () => {
    const { events, xhr } = start();

    xhr.deliver(frame('message.delta', { type: 'message.delta', text: 'a' }));
    xhr.deliver(frame('message.delta', { type: 'message.delta', text: 'b' }));
    xhr.complete();

    const texts = events
      .filter((e) => e.type === 'message.delta')
      .map((e) => e.text);
    expect(texts).toEqual(['a', 'b']);
  });

  it('handles a frame split across two deliveries', () => {
    const { events, xhr } = start();
    const whole = frame('message.delta', {
      type: 'message.delta',
      text: 'split',
    });
    const cut = Math.floor(whole.length / 2);

    xhr.deliver(whole.slice(0, cut));
    expect(events).toHaveLength(0); // half a frame is not an event yet

    xhr.deliver(whole.slice(cut));
    expect(events).toHaveLength(1);
  });

  it('closes once, after the final drain', () => {
    const { events, closed, xhr } = start();

    xhr.deliver(frame('stage', { type: 'stage', stage: 'thinking' }));
    xhr.complete();

    expect(closed).toEqual([true]);
    expect(events).toHaveLength(1);
  });
});

/**
 * Stopping is not failing.
 *
 * The user tapping Stop is this cancel function, and RN's abort re-enters our
 * own readystatechange handler with status 0 before it returns — which is
 * indistinguishable from a connection that died, unless the transport
 * remembers that it was the one that closed the socket. It has to, because
 * everything downstream hangs off the difference: a turn reported as a
 * transport failure gets the failure sentence and a Try again button, in place
 * of E7's neutral Stopped label over the partial answer the user chose to keep.
 */
describe('askQuestionStream cancellation', () => {
  it('reports no transport error when the caller cancels', () => {
    const { errors, cancel, xhr } = start();

    xhr.deliver(frame('stage', { type: 'stage', stage: 'responding' }));
    xhr.deliver(frame('message.delta', { type: 'message.delta', text: 'That ' }));

    cancel();

    expect(xhr.aborted).toBe(true);
    // The caller asked for this. Telling it something went wrong is the bug.
    expect(errors).toEqual([]);
  });

  it('keeps the words that arrived before the cancel', () => {
    const { events, cancel, xhr } = start();

    xhr.deliver(frame('stage', { type: 'stage', stage: 'responding' }));
    xhr.deliver(frame('message.delta', { type: 'message.delta', text: 'That ' }));
    xhr.deliver(frame('message.delta', { type: 'message.delta', text: 'message ' }));

    cancel();

    const texts = events
      .filter((event) => event.type === 'message.delta')
      .map((event) => event.text);
    expect(texts).toEqual(['That ', 'message ']);
  });

  it('stays silent when a dead connection is reported after a cancel', () => {
    const { errors, closed, cancel, xhr } = start();

    xhr.deliver(frame('message.delta', { type: 'message.delta', text: 'a' }));
    cancel();

    // Some platforms follow the abort with an error of their own. The turn is
    // already over; it must not be reopened as a fault.
    xhr.onerror?.();
    xhr.ontimeout?.();

    expect(errors).toEqual([]);
    expect(closed).toEqual([]);
  });
});
