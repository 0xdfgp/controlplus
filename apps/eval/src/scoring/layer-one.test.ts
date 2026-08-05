import { describe, expect, it } from 'vitest';

import { scoreLayerOne } from './layer-one.ts';

const checkFor = (answer: string, id: string) => {
  const check = scoreLayerOne(answer).checks.find((c) => c.id === id);
  if (check === undefined) {
    throw new Error(`no check ${id}`);
  }
  return check;
};

describe('layer one: markdown', () => {
  it.each([
    ['heading', '# What to do\nTurn the phone off.'],
    ['deeper heading', '### Steps\nTurn the phone off.'],
    ['bold', 'This is a **scam**. Do not call back.'],
    ['underscore bold', 'This is a __scam__. Do not call back.'],
    ['horizontal rule', 'It is a scam.\n\n---\n\nDo not call back.'],
    ['asterisk rule', 'It is a scam.\n\n***\n\nDo not call back.'],
  ])('fails on %s', (_label, answer) => {
    expect(checkFor(answer, 'no-markdown').passed).toBe(false);
  });

  it('passes plain prose that happens to contain punctuation', () => {
    const answer =
      'That message is a scam. A real warning never asks for a code.\n' +
      'The dash in 1-800 numbers is not a heading.';
    expect(checkFor(answer, 'no-markdown').passed).toBe(true);
  });

  it('does not read arithmetic as bold', () => {
    expect(checkFor('Multiply 2 * 3 * 4 to get 24.', 'no-markdown').passed).toBe(true);
  });
});

describe('layer one: belittling words', () => {
  it.each(['simply', 'Just', 'obviously'])('fails on %s', (word) => {
    const check = checkFor(`You ${word} tap the button.`, 'no-belittling-words');
    expect(check.passed).toBe(false);
    expect(check.evidence).toContain(word.toLowerCase());
  });

  it('does not fire on a longer word that contains one', () => {
    // "justify" and "adjust" contain "just". A substring match here would fail
    // answers that did nothing wrong.
    const check = checkFor(
      'Adjust the setting, and justify nothing to the caller.',
      'no-belittling-words',
    );
    expect(check.passed).toBe(true);
  });
});

describe('layer one: numbered steps', () => {
  it('passes numbered steps written as plain lines', () => {
    const answer = 'Do this:\n1. Turn the phone off.\n2. Turn it back on.\n3. Try again.';
    const check = checkFor(answer, 'numbered-steps');
    expect(check.passed).toBe(true);
    expect(check.notApplicable).toBeUndefined();
  });

  it('fails a bulleted procedure', () => {
    const answer = 'Do this:\n- Turn the phone off.\n- Turn it back on.';
    const check = checkFor(answer, 'numbered-steps');
    expect(check.passed).toBe(false);
    expect(check.evidence.length).toBeGreaterThan(0);
  });

  it('reports not applicable, and passes, when there is no procedure', () => {
    // The rule is about how steps are written, not that every answer must have
    // steps. Demanding them everywhere would fail correct answers.
    const check = checkFor(
      'That message is a scam. Nobody from your bank will ask for a code.',
      'numbered-steps',
    );
    expect(check.passed).toBe(true);
    expect(check.notApplicable).toBe(true);
  });

  it('does not treat a single stray line as a list', () => {
    const check = checkFor('It is a scam.\n- and nothing else follows', 'numbered-steps');
    expect(check.notApplicable).toBe(true);
  });
});

describe('layer one: truncation', () => {
  it('passes an answer that ends on a full stop', () => {
    expect(checkFor('Do not call the number back.', 'not-truncated').passed).toBe(true);
  });

  it('fails an answer cut off mid-sentence', () => {
    const check = checkFor('Turn the phone off and then open the settings and', 'not-truncated');
    expect(check.passed).toBe(false);
    expect(check.evidence[0]).toContain('ends:');
  });

  it('fails an empty answer', () => {
    expect(checkFor('   ', 'not-truncated').passed).toBe(false);
  });

  it('passes an answer that ends on a short list label', () => {
    // The false positive from the first live run. This answer is finished; it
    // just ends on an example label rather than a sentence. Failing it also
    // skipped the judge for that cell (ADR-033), so the mistake deleted data
    // rather than merely mislabelling it.
    const answer =
      'Here is what the screen might say.\n\nPhotos 40 GB\n\nApps 25 GB\n\nMessages 10 GB';
    expect(checkFor(answer, 'not-truncated').passed).toBe(true);
  });

  it('still fails a long final line with no ending', () => {
    // What a severed sentence actually looks like, which is the case ADR-032
    // recorded: cut off inside a numbered list at the token cap.
    const answer =
      'Here is what to do.\n\n5. Open Settings and then scroll all the way down until you see';
    expect(checkFor(answer, 'not-truncated').passed).toBe(false);
  });

  it('accepts a question mark or a closing quote as an ending', () => {
    expect(checkFor('Would you like me to go through it again?', 'not-truncated').passed).toBe(true);
    expect(checkFor('He said "your account is frozen."', 'not-truncated').passed).toBe(true);
  });
});

describe('layer one: overall', () => {
  it('passes only when every check passes', () => {
    const clean =
      'That message is a scam. A real warning from Apple never asks for a code.\n' +
      'Here is what to do.\n1. Do not tap the button.\n2. Close the page.\n' +
      'It is not your fault.';
    expect(scoreLayerOne(clean).passed).toBe(true);
  });

  it('fails the whole answer when one check fails', () => {
    const withMarkdown = '## What to do\nDo not tap the button.';
    const result = scoreLayerOne(withMarkdown);
    expect(result.passed).toBe(false);
    expect(result.checks.filter((c) => !c.passed)).toHaveLength(1);
  });

  it('reports all four checks every time, so a run can be read back', () => {
    const result = scoreLayerOne('It is a scam.');
    expect(result.checks.map((c) => c.id).sort()).toEqual([
      'no-belittling-words',
      'no-markdown',
      'not-truncated',
      'numbered-steps',
    ]);
  });
});
