import { describe, expect, it } from 'vitest';

import { appendTurn, dropFailedTurn } from './conversation-log.ts';
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

describe('dropFailedTurn', () => {
  const failed = turn({
    question: 'Is this text about my bank a scam?',
    answer: '',
    state: 'failed',
    errorMessage: 'Something went wrong on our side.',
  });

  it('takes the failed attempt off, so the retry replaces it', () => {
    // Try again sends the same words again, so it is the same turn happening
    // twice rather than two turns. Three failures then read as one question and
    // one sentence, instead of the question repeating down the screen under three
    // identical apologies.
    const log = dropFailedTurn([turn({ question: 'earlier' }), failed]);

    expect(log.map((t) => t.question)).toEqual(['earlier']);
  });

  it('leaves a turn that finished or was stopped exactly where it is', () => {
    // The guarantee that matters. Retry is only reachable from `failed`, so the
    // last turn always is the failed one — which is the kind of thing that stays
    // true until something moves, and popping blindly would then eat an answer.
    expect(dropFailedTurn([turn()])).toHaveLength(1);
    expect(dropFailedTurn([turn({ state: 'stopped' })])).toHaveLength(1);
  });

  it('only ever drops the last turn, never an earlier failure', () => {
    // An older failure the person has since asked past is part of what happened.
    const log = dropFailedTurn([failed, turn({ question: 'answered since' })]);

    expect(log.map((t) => t.state)).toEqual(['failed', 'idle']);
  });

  it('has nothing to do with an empty conversation', () => {
    expect(dropFailedTurn([])).toEqual([]);
  });

  it('does not mutate the log it was given', () => {
    const original: LoggedTurn[] = [failed];

    dropFailedTurn(original);

    expect(original).toHaveLength(1);
  });
});
