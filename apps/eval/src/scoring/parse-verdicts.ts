import { RUBRIC_IDS, RUBRIC_ITEMS } from './rubric.ts';

export interface RubricVerdict {
  readonly id: string;
  readonly question: string;
  readonly pass: boolean;
  readonly justification: string;
}

/**
 * Turns a judge's structured reply into four verdicts, or refuses it.
 *
 * Structured output constrains the shape, it does not guarantee the content:
 * a judge can still return three items, or the same item twice, or an id that
 * is not in the rubric. A missing item silently treated as a pass would turn a
 * judge failure into a candidate success, which is the one direction this must
 * never fail in. So anything short of exactly the four rubric ids is an error
 * and the run says so.
 */
export function parseVerdicts(payload: string): readonly RubricVerdict[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch (cause) {
    throw new Error('The judge did not return JSON.', { cause });
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('items' in parsed) ||
    !Array.isArray((parsed as { items: unknown[] }).items)
  ) {
    throw new Error('The judge returned JSON without an items array.');
  }

  const byId = new Map<string, RubricVerdict>();
  for (const raw of (parsed as { items: unknown[] }).items) {
    if (typeof raw !== 'object' || raw === null) {
      continue;
    }
    const item = raw as { id?: unknown; pass?: unknown; justification?: unknown };
    if (typeof item.id !== 'string' || typeof item.pass !== 'boolean') {
      continue;
    }
    const known = RUBRIC_ITEMS.find((candidate) => candidate.id === item.id);
    if (known === undefined || byId.has(item.id)) {
      continue;
    }
    byId.set(item.id, {
      id: item.id,
      question: known.question,
      pass: item.pass,
      justification:
        typeof item.justification === 'string' ? item.justification.trim() : '',
    });
  }

  const missing = RUBRIC_IDS.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    throw new Error(`The judge did not grade: ${missing.join(', ')}.`);
  }

  return RUBRIC_IDS.map((id) => {
    const verdict = byId.get(id);
    if (verdict === undefined) {
      throw new Error(`missing verdict for ${id}`);
    }
    return verdict;
  });
}

/** A response passes only if all four items pass (ADR-033). Conjunction, never an average. */
export function allPassed(verdicts: readonly RubricVerdict[]): boolean {
  return verdicts.length === RUBRIC_IDS.length && verdicts.every((v) => v.pass);
}
