import type { GenerationTurn } from '../../../api/src/domain/ports/text-generation-port.ts';
import type { CellResult } from '../report/results.ts';
import type { Candidate } from '../runners/candidates.ts';
import type { JudgePair } from '../run-evaluation.ts';
import type { Fixture } from '../fixtures/load-fixtures.ts';
import type { JudgeOutcome } from '../scoring/judge.ts';
import { scoreLayerOne } from '../scoring/layer-one.ts';
import { runFixture } from './run-fixture.ts';

export interface CellInput {
  readonly candidate: Candidate;
  readonly fixture: Fixture;
  readonly question: string;
  readonly history: readonly GenerationTurn[];
  readonly image: { readonly data: string; readonly mediaType: string; readonly width: number; readonly height: number } | undefined;
  readonly judges: JudgePair | undefined;
  readonly candidateFamily: string;
  readonly priorTurn: { readonly question: string; readonly answer: string } | undefined;
}

/** Runs one candidate against one fixture, then scores it in two layers. */
export async function runCell(input: CellInput): Promise<CellResult> {
  const base = {
    candidateId: input.candidate.id,
    candidateLabel: input.candidate.label,
    candidateFamily: input.candidate.family,
    requestedModel: input.candidate.requestedModel,
    fixtureId: input.fixture.id,
    fixtureLabel: input.fixture.label,
    question: input.question,
  };

  let measurement;
  try {
    measurement = await runFixture({
      port: input.candidate.port,
      question: input.question,
      history: input.history,
      image: input.image,
    });
  } catch (error) {
    return {
      ...base,
      measurement: null,
      error: error instanceof Error ? error.message : String(error),
      layerOne: null,
      layerTwo: null,
      layerTwoSecondary: null,
      secondaryIsSelfJudged: false,
      judgeSkipped: 'the candidate did not answer',
      overallPassed: false,
    };
  }

  const layerOne = scoreLayerOne(measurement.answer);
  const unjudged = {
    ...base,
    measurement,
    error: null,
    layerOne,
    layerTwo: null,
    layerTwoSecondary: null,
    secondaryIsSelfJudged: false,
    overallPassed: false,
  };

  // ADR-033: a layer one failure fails the case without invoking a judge.
  if (!layerOne.passed) {
    return { ...unjudged, judgeSkipped: 'layer one failed' };
  }
  if (input.judges === undefined) {
    return { ...unjudged, judgeSkipped: 'no judge configured' };
  }

  const subject = {
    question: input.question,
    answer: measurement.answer,
    image: input.image,
    priorTurn: input.priorTurn,
  };

  let layerTwo: JudgeOutcome | null = null;
  let judgeSkipped: string | null = null;
  try {
    layerTwo = await input.judges.primary.grade(subject);
  } catch (error) {
    judgeSkipped = `the judge failed: ${error instanceof Error ? error.message : String(error)}`;
  }

  // The secondary judge never affects the verdict, so its failure is not
  // allowed to fail the row either.
  let layerTwoSecondary: JudgeOutcome | null;
  try {
    layerTwoSecondary = await input.judges.secondary.grade(subject);
  } catch {
    layerTwoSecondary = null;
  }

  return {
    ...base,
    measurement,
    error: null,
    layerOne,
    layerTwo,
    layerTwoSecondary,
    secondaryIsSelfJudged: input.judges.secondary.family === input.candidateFamily,
    judgeSkipped,
    overallPassed: layerOne.passed && layerTwo !== null && layerTwo.passed,
  };
}
