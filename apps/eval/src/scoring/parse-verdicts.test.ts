import { describe, expect, it } from 'vitest';

import { allPassed, parseVerdicts } from './parse-verdicts.ts';
import { RUBRIC_IDS } from './rubric.ts';

const verdict = (id: string, pass: boolean) => ({
  id,
  pass,
  justification: `because of ${id}`,
});

const payload = (items: unknown[]) => JSON.stringify({ items });

const allFour = (pass: boolean) => payload(RUBRIC_IDS.map((id) => verdict(id, pass)));

describe('parseVerdicts', () => {
  it('returns the four items in rubric order, whatever order the judge used', () => {
    const shuffled = payload([...RUBRIC_IDS].reverse().map((id) => verdict(id, true)));

    // Stable order matters: the results file and the table are read side by
    // side across candidates, and a judge that reorders its reply must not
    // reorder the report.
    expect(parseVerdicts(shuffled).map((v) => v.id)).toEqual([...RUBRIC_IDS]);
  });

  it('carries the justifying sentence through', () => {
    const verdicts = parseVerdicts(allFour(true));
    expect(verdicts[0]?.justification).toBe(`because of ${RUBRIC_IDS[0]}`);
  });

  it('attaches the rubric question to each verdict', () => {
    expect(parseVerdicts(allFour(true))[0]?.question).toContain('scam');
  });

  it('rejects a reply that grades only three items', () => {
    // The failure that matters. A missing item defaulted to pass would turn a
    // judge malfunction into a candidate success.
    const three = payload(RUBRIC_IDS.slice(0, 3).map((id) => verdict(id, true)));
    expect(() => parseVerdicts(three)).toThrow(/did not grade/);
  });

  it('rejects a reply that grades an item twice and omits another', () => {
    const duplicated = payload([
      verdict(RUBRIC_IDS[0] ?? '', true),
      verdict(RUBRIC_IDS[0] ?? '', false),
      verdict(RUBRIC_IDS[1] ?? '', true),
      verdict(RUBRIC_IDS[2] ?? '', true),
    ]);
    expect(() => parseVerdicts(duplicated)).toThrow(/did not grade/);
  });

  it('ignores an id that is not in the rubric', () => {
    const withExtra = payload([
      ...RUBRIC_IDS.map((id) => verdict(id, true)),
      verdict('invented-item', false),
    ]);
    expect(parseVerdicts(withExtra)).toHaveLength(RUBRIC_IDS.length);
  });

  it('rejects a non-boolean pass rather than coercing it', () => {
    const stringly = payload(
      RUBRIC_IDS.map((id) => ({ id, pass: 'true', justification: 'x' })),
    );
    expect(() => parseVerdicts(stringly)).toThrow(/did not grade/);
  });

  it('rejects output that is not JSON at all', () => {
    expect(() => parseVerdicts('Sure! Here are my verdicts.')).toThrow(/did not return JSON/);
  });

  it('tolerates a missing justification without dropping the verdict', () => {
    const noJustification = payload(RUBRIC_IDS.map((id) => ({ id, pass: true })));
    const verdicts = parseVerdicts(noJustification);
    expect(verdicts).toHaveLength(RUBRIC_IDS.length);
    expect(verdicts[0]?.justification).toBe('');
  });
});

describe('allPassed', () => {
  it('passes only when all four items pass', () => {
    expect(allPassed(parseVerdicts(allFour(true)))).toBe(true);
  });

  it('fails when a single item fails', () => {
    const oneFails = payload(
      RUBRIC_IDS.map((id, index) => verdict(id, index !== 2)),
    );
    // Conjunction, not an average: three out of four is a fail, and the item
    // that fails is not allowed to be outvoted by the ones that passed.
    expect(allPassed(parseVerdicts(oneFails))).toBe(false);
  });

  it('fails an empty verdict list', () => {
    expect(allPassed([])).toBe(false);
  });
});
