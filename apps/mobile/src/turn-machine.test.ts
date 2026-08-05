import { describe, expect, it } from 'vitest';

import { isInFlight, transition } from './turn-machine.ts';
import type { TurnEvent, TurnState } from './turn-machine.ts';

const STATES: readonly TurnState[] = [
  'idle',
  'uploading',
  'thinking',
  'responding',
  'stopped',
  'failed',
];

const EVENTS: readonly TurnEvent[] = [
  'ask',
  'upload',
  'sent',
  'responding',
  'completed',
  'stop',
  'fail',
];

/** Every edge the machine is allowed to have. Anything absent is impossible. */
const LEGAL: readonly [TurnState, TurnEvent, TurnState][] = [
  ['idle', 'ask', 'thinking'],
  ['idle', 'upload', 'uploading'],
  ['uploading', 'sent', 'thinking'],
  ['uploading', 'fail', 'failed'],
  ['thinking', 'responding', 'responding'],
  ['thinking', 'completed', 'idle'],
  ['thinking', 'fail', 'failed'],
  ['responding', 'completed', 'idle'],
  ['responding', 'stop', 'stopped'],
  ['responding', 'fail', 'failed'],
  ['stopped', 'ask', 'thinking'],
  ['stopped', 'upload', 'uploading'],
  ['failed', 'ask', 'thinking'],
  ['failed', 'upload', 'uploading'],
];

describe('the turn state machine, legal transitions', () => {
  it.each(LEGAL)('%s + %s -> %s', (from, event, to) => {
    expect(transition(from, event)).toBe(to);
  });

  it('returns to idle when a turn completes, so the input comes back', () => {
    // ADR-022's implicit return. The answer stays on screen; there is no
    // "ask another question" control, because the input already is one.
    expect(transition('responding', 'completed')).toBe('idle');
  });

  it('reaches thinking again from every terminal state', () => {
    for (const terminal of ['idle', 'stopped', 'failed'] as const) {
      expect(transition(terminal, 'ask')).toBe('thinking');
    }
  });
});

describe('the turn state machine, impossible transitions', () => {
  const legalKeys = new Set(LEGAL.map(([from, event]) => `${from}+${event}`));

  const impossible = STATES.flatMap((state) =>
    EVENTS.filter((event) => !legalKeys.has(`${state}+${event}`)).map(
      (event): [TurnState, TurnEvent] => [state, event],
    ),
  );

  it.each(impossible)('rejects %s + %s', (from, event) => {
    expect(transition(from, event)).toBeNull();
  });

  it('covers every pair, so a new event cannot slip through untested', () => {
    expect(impossible.length + LEGAL.length).toBe(STATES.length * EVENTS.length);
  });

  it('will not send a second question over a live answer', () => {
    expect(transition('responding', 'ask')).toBeNull();
    expect(transition('thinking', 'ask')).toBeNull();
  });

  it('will not turn a stopped turn into a failed one', () => {
    // Stopping closes the connection, so a transport error follows almost every
    // stop. E7 says the partial answer is not styled as a fault, and this is
    // what keeps that true.
    expect(transition('stopped', 'fail')).toBeNull();
  });

  it('offers no stop outside the responding state', () => {
    // E2 draws thinking with no Stop control, and E7 with none either. The
    // machine agrees rather than relying on the screen to hide the button.
    expect(transition('thinking', 'stop')).toBeNull();
    expect(transition('idle', 'stop')).toBeNull();
    expect(transition('stopped', 'stop')).toBeNull();
    expect(transition('failed', 'stop')).toBeNull();
    // E5 draws none either, and there is nothing at the provider to stop: the
    // request has not arrived yet.
    expect(transition('uploading', 'stop')).toBeNull();
  });
});

describe('sending a photo (E5)', () => {
  it('goes through uploading, then waits like any other turn', () => {
    expect(transition('idle', 'upload')).toBe('uploading');
    expect(transition('uploading', 'sent')).toBe('thinking');
  });

  it('takes a bare question straight to thinking', () => {
    // A progress bar that finishes instantly is noise, so one line of text does
    // not get one.
    expect(transition('idle', 'ask')).toBe('thinking');
  });

  it('will not send a second question over a photo still going out', () => {
    expect(transition('uploading', 'ask')).toBeNull();
    expect(transition('uploading', 'upload')).toBeNull();
  });

  it('lets a photo follow a finished, stopped or failed turn', () => {
    expect(transition('stopped', 'upload')).toBe('uploading');
    expect(transition('failed', 'upload')).toBe('uploading');
  });

  it('ends no turn from uploading, so something must move it on first', () => {
    // The trap this slice fell into on a real device. A photo turn that never
    // left uploading refused every event that ends a turn, so the answer came
    // back, was thrown away by the machine, and the screen stayed on "Sending
    // your photo" forever.
    //
    // The machine is right to refuse these — a turn cannot finish while its
    // question is still going out. What was wrong was leaving `sent` to upload
    // progress, which is optional on the platform and never arrived. It is
    // driven by the server's first event now, which is the thing that actually
    // proves the photo landed.
    expect(transition('uploading', 'completed')).toBeNull();
    expect(transition('uploading', 'responding')).toBeNull();
    expect(transition('uploading', 'stop')).toBeNull();
    // The two ways out, and neither depends on a byte counter.
    expect(transition('uploading', 'sent')).toBe('thinking');
    expect(transition('uploading', 'fail')).toBe('failed');
  });

  it('cannot report an upload finished when none was under way', () => {
    expect(transition('idle', 'sent')).toBeNull();
    expect(transition('thinking', 'sent')).toBeNull();
    expect(transition('responding', 'sent')).toBeNull();
  });
});

describe('isInFlight', () => {
  it('is true exactly while a turn is under way', () => {
    // Uploading counts: the input must not accept a second question while a
    // photo is still leaving the phone.
    expect(STATES.filter(isInFlight)).toEqual([
      'uploading',
      'thinking',
      'responding',
    ]);
  });
});
