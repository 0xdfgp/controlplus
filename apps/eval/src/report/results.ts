import type { Measurement } from '../measure/run-fixture.ts';
import type { JudgeOutcome } from '../scoring/judge.ts';
import type { LayerOneResult } from '../scoring/layer-one.ts';

export interface CellResult {
  readonly candidateId: string;
  readonly candidateLabel: string;
  readonly candidateFamily: string;
  readonly requestedModel: string;
  readonly fixtureId: string;
  readonly fixtureLabel: string;
  readonly question: string;
  readonly measurement: Measurement | null;
  /** Set when the candidate failed outright. The row is reported, not dropped. */
  readonly error: string | null;
  readonly layerOne: LayerOneResult | null;
  /** The cross-family judge whose verdict the headline uses (ADR-033). */
  readonly layerTwo: JudgeOutcome | null;
  /**
   * The other judge's verdict on the same answer.
   *
   * Recorded for every response and never used in the headline. It exists
   * because the two judges turned out to disagree systematically, and a table
   * that reported one verdict per row without showing that would attribute a
   * judge effect to the candidate. When this judge shares the candidate's
   * family it is a self-judgement and is marked as one.
   */
  readonly layerTwoSecondary: JudgeOutcome | null;
  readonly secondaryIsSelfJudged: boolean;
  /** Why the judge was not invoked, when it was not. */
  readonly judgeSkipped: string | null;
  readonly overallPassed: boolean;
}

export interface LedgerLine {
  readonly id: string;
  readonly description: string;
  readonly basis: string;
  readonly usd: number;
  readonly approximate?: boolean;
}

export interface TranscriptionRecord {
  readonly model: string;
  readonly provider: string;
  readonly transcript: string;
  readonly matchesScript: boolean;
  readonly audioSeconds: number;
  readonly audioBytes: number;
  readonly timeToFirstTokenMs: number | null;
  readonly totalMs: number;
}

export interface ImageRecord {
  readonly file: string;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  readonly mediaType: string;
}

export interface RunResults {
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly wallClockSeconds: number;
  readonly fixtureVersion: string;
  readonly pricingReadOn: string;
  readonly judgeAssignment: ReadonlyArray<{
    readonly candidateId: string;
    readonly judgeModel: string;
    readonly judgeFamily: string;
    readonly selfJudged: boolean;
    readonly secondaryJudgeModel: string;
    readonly secondaryIsSelfJudged: boolean;
  }>;
  readonly candidatePaths: ReadonlyArray<{
    readonly candidateId: string;
    readonly path: string;
  }>;
  readonly transcription: TranscriptionRecord;
  readonly image: ImageRecord;
  readonly cells: readonly CellResult[];
  readonly ledger: readonly LedgerLine[];
  readonly totalSpendUsd: number;
  readonly notes: readonly string[];
}
