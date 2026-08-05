import { describe, expect, it } from 'vitest';

import { appendTurn } from './conversation-log.ts';
import type { LoggedTurn } from './conversation-log.ts';

function turn(overrides: Partial<LoggedTurn> = {}): LoggedTurn {
  return {
    question: 'Is this text about my bank a scam?',
    answer: 'Yes. Do not click the link.',
    state: 'idle',
    errorMessage: null,
    ...overrides,
  };
}

describe('appendTurn', () => {
  it('keeps the newest turn last, so the conversation reads downwards', () => {
    const log = appendTurn(
      appendTurn([], turn({ question: 'first' })),
      turn({ question: 'second' }),
    );

    expect(log.map((t) => t.question)).toEqual(['first', 'second']);
  });

  it('records a stopped turn as stopped, keeping the partial answer', () => {
    const [logged] = appendTurn(
      [],
      turn({ answer: 'That message has ', state: 'stopped' }),
    );

    // The user chose this. It is not an error and the screen must not later
    // restyle it as one.
    expect(logged?.state).toBe('stopped');
    expect(logged?.answer).toBe('That message has ');
    expect(logged?.errorMessage).toBeNull();
  });

  it('records a failed turn with the sentence the user was shown', () => {
    const [logged] = appendTurn(
      [],
      turn({ answer: '', state: 'failed', errorMessage: 'Something went wrong.' }),
    );

    expect(logged?.state).toBe('failed');
    expect(logged?.errorMessage).toBe('Something went wrong.');
  });

  it('refuses a turn that is still in flight', () => {
    expect(appendTurn([], turn({ state: 'thinking' }))).toEqual([]);
    expect(appendTurn([], turn({ state: 'responding' }))).toEqual([]);
  });

  it('refuses a turn with no question, because nothing was asked', () => {
    expect(appendTurn([], turn({ question: '   ' }))).toEqual([]);
  });

  it('does not mutate the log it was given', () => {
    const original: LoggedTurn[] = [turn({ question: 'first' })];

    appendTurn(original, turn({ question: 'second' }));

    expect(original).toHaveLength(1);
  });
});
