import { describe, expect, it } from 'vitest';

import { isInFlight, transition } from './turn-machine.ts';
import type { TurnEvent, TurnState } from './turn-machine.ts';

const STATES: readonly TurnState[] = [
  'idle',
  'thinking',
  'responding',
  'stopped',
  'failed',
];

const EVENTS: readonly TurnEvent[] = [
  'ask',
  'responding',
  'completed',
  'stop',
  'fail',
];

/** Every edge the machine is allowed to have. Anything absent is impossible. */
const LEGAL: readonly [TurnState, TurnEvent, TurnState][] = [
  ['idle', 'ask', 'thinking'],
  ['thinking', 'responding', 'responding'],
  ['thinking', 'completed', 'idle'],
  ['thinking', 'fail', 'failed'],
  ['responding', 'completed', 'idle'],
  ['responding', 'stop', 'stopped'],
  ['responding', 'fail', 'failed'],
  ['stopped', 'ask', 'thinking'],
  ['failed', 'ask', 'thinking'],
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
  });
});

describe('isInFlight', () => {
  it('is true exactly while the server still owes an answer', () => {
    expect(STATES.filter(isInFlight)).toEqual(['thinking', 'responding']);
  });
});
