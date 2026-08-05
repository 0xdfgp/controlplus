import type { Family } from '../runners/candidates.ts';
import type { RubricVerdict } from './parse-verdicts.ts';
import type { JudgeSubject } from './rubric.ts';

export interface JudgeUsage {
  readonly input: number;
  readonly output: number;
  readonly reasoning: number;
}

export interface JudgeOutcome {
  /** True only if all four rubric items passed (ADR-033). Conjunction, never an average. */
  readonly passed: boolean;
  readonly verdicts: readonly RubricVerdict[];
  /** The judge model that actually answered, dated snapshot and all. */
  readonly judgeModel: string;
  readonly judgeFamily: Family;
  readonly usage: JudgeUsage;
}

/**
 * Layer two of ADR-033.
 *
 * Two implementations exist so that no candidate is graded by its own family.
 * The interface is what makes that swap possible without the calling code
 * knowing which judge it holds.
 */
export interface Judge {
  readonly family: Family;
  readonly model: string;
  grade(subject: JudgeSubject): Promise<JudgeOutcome>;
}
