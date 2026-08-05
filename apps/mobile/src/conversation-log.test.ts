import { describe, expect, it } from 'vitest';

import { appendTurn } from './conversation-log.ts';
import type { LoggedTurn } from './conversation-log.ts';

function turn(overrides: Partial<LoggedTurn> = {}): LoggedTurn {
  return {
    question: 'Is this text about my bank a scam?',
    answer: 'Yes. Do not click the link.',
    state: 'idle',
    errorMessage: null,
    photoUri: null,
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
    // A photo still on its way out has not happened yet either.
    expect(appendTurn([], turn({ state: 'uploading' }))).toEqual([]);
  });

  it('keeps the photo with the turn it was sent with', () => {
    const [logged] = appendTurn(
      [],
      turn({ photoUri: 'file:///tmp/resized-photo.jpg' }),
    );

    // The server keeps no bytes (ADR-024), so this local file is the only copy
    // and it is what puts the photo back above its answer in the conversation.
    expect(logged?.photoUri).toBe('file:///tmp/resized-photo.jpg');
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
