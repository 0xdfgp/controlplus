import type { CellResult, RunResults } from './results.ts';

const usd = (value: number): string =>
  value >= 0.01 ? `$${value.toFixed(4)}` : `$${value.toFixed(5)}`;

const ms = (value: number | null): string =>
  value === null ? '—' : `${(value / 1000).toFixed(2)}s`;

const tick = (passed: boolean): string => (passed ? 'pass' : 'FAIL');

function layerOneCell(cell: CellResult): string {
  if (cell.layerOne === null) {
    return '—';
  }
  if (cell.layerOne.passed) {
    return 'pass';
  }
  const failed = cell.layerOne.checks.filter((c) => !c.passed).map((c) => c.id);
  return `FAIL (${failed.join(', ')})`;
}

function layerTwoCell(cell: CellResult): string {
  if (cell.layerTwo === null) {
    return cell.judgeSkipped === null ? '—' : `not run (${cell.judgeSkipped})`;
  }
  if (cell.layerTwo.passed) {
    return 'pass';
  }
  const failed = cell.layerTwo.verdicts.filter((v) => !v.pass).map((v) => v.id);
  return `FAIL (${failed.join(', ')})`;
}

function secondJudgeCell(cell: CellResult): string {
  if (cell.layerTwoSecondary === null) {
    return '—';
  }
  const mark = cell.layerTwoSecondary.passed ? 'pass' : 'FAIL';
  return cell.secondaryIsSelfJudged ? `${mark} (self-judged)` : mark;
}

function resultsTable(results: RunResults): string {
  const header =
    '| Candidate | Question | First token | Total | In | Out | Reasoning | Cost | Layer 1 | Layer 2 | 2nd judge | Overall |\n' +
    '| --- | --- | --: | --: | --: | --: | --: | --: | --- | --- | --- | --- |';

  const rows = results.cells.map((cell) => {
    if (cell.measurement === null) {
      return `| ${cell.candidateLabel} | ${cell.fixtureLabel} | — | — | — | — | — | — | — | — | — | ERROR: ${cell.error ?? 'unknown'} |`;
    }
    const m = cell.measurement;
    return [
      '',
      cell.candidateLabel,
      cell.fixtureLabel,
      ms(m.timeToFirstTokenMs),
      ms(m.totalMs),
      String(m.tokens.input),
      String(m.tokens.output),
      String(m.tokens.reasoning),
      m.cost === null ? 'unpriced' : usd(m.cost.totalUsd),
      layerOneCell(cell),
      layerTwoCell(cell),
      secondJudgeCell(cell),
      tick(cell.overallPassed),
      '',
    ].join(' | ').trim();
  });

  return [header, ...rows].join('\n');
}

/**
 * How often the two judges agreed on the same answer.
 *
 * The single most important number for deciding how much weight the layer two
 * column can carry. If they disagree often, a row's verdict is telling you as
 * much about which judge graded it as about the candidate.
 */
function agreementLine(results: RunResults): string {
  const both = results.cells.filter(
    (c) => c.layerTwo !== null && c.layerTwoSecondary !== null,
  );
  if (both.length === 0) {
    return 'No answer was graded by both judges, so judge agreement was not measured.';
  }
  const agreed = both.filter(
    (c) => c.layerTwo?.passed === c.layerTwoSecondary?.passed,
  ).length;
  const percent = ((agreed / both.length) * 100).toFixed(0);
  return (
    `The two judges agreed on the overall pass or fail of ${agreed} of ${both.length} answers (${percent}%). ` +
    'Where they disagree, the layer two column reflects the cross-family judge and the difference is a judge effect, not a candidate one.'
  );
}

function summaryTable(results: RunResults): string {
  const byCandidate = new Map<string, CellResult[]>();
  for (const cell of results.cells) {
    byCandidate.set(cell.candidateId, [
      ...(byCandidate.get(cell.candidateId) ?? []),
      cell,
    ]);
  }

  const header =
    '| Candidate | Answered as | Passed | Median first token | Total tokens | Total cost |\n' +
    '| --- | --- | --: | --: | --: | --: |';

  const rows = [...byCandidate.values()].map((cells) => {
    const measured = cells.filter((c) => c.measurement !== null);
    const firstTokens = measured
      .map((c) => c.measurement?.timeToFirstTokenMs ?? null)
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b);
    const median =
      firstTokens.length === 0
        ? null
        : (firstTokens[Math.floor((firstTokens.length - 1) / 2)] ?? null);
    const tokens = measured.reduce((sum, c) => sum + (c.measurement?.tokens.total ?? 0), 0);
    const cost = measured.reduce((sum, c) => sum + (c.measurement?.cost?.totalUsd ?? 0), 0);
    const answeredAs = measured[0]?.measurement?.reportedModel ?? '—';

    return `| ${cells[0]?.candidateLabel ?? ''} | \`${answeredAs}\` | ${cells.filter((c) => c.overallPassed).length}/${cells.length} | ${ms(median)} | ${tokens} | ${usd(cost)} |`;
  });

  return [header, ...rows].join('\n');
}

function ledgerTable(results: RunResults): string {
  const header = '| Ledger line | Basis | Cost |\n| --- | --- | --: |';
  const rows = results.ledger.map(
    (line) =>
      `| ${line.description} | ${line.basis} | ${usd(line.usd)}${line.approximate === true ? ' (approx)' : ''} |`,
  );
  return [header, ...rows, `| **Total** |  | **${usd(results.totalSpendUsd)}** |`].join('\n');
}

function judgeTable(results: RunResults): string {
  const header =
    '| Candidate | Judged by (headline) | Family | Self-judged | Second judge | Self-judged |\n' +
    '| --- | --- | --- | --- | --- | --- |';
  const rows = results.judgeAssignment.map(
    (a) =>
      `| ${a.candidateId} | \`${a.judgeModel}\` | ${a.judgeFamily} | ${a.selfJudged ? 'YES' : 'no'} | ` +
      `\`${a.secondaryJudgeModel}\` | ${a.secondaryIsSelfJudged ? 'yes, excluded from the headline' : 'no'} |`,
  );
  return [header, ...rows, '', agreementLine(results)].join('\n');
}

export function renderMarkdown(results: RunResults): string {
  return [
    '# Provider evaluation (D18, ADR-033)',
    '',
    `Run ${results.startedAt} to ${results.finishedAt}, ${results.wallClockSeconds.toFixed(0)}s wall clock.`,
    `Fixtures version ${results.fixtureVersion}. Prices read from each provider's own pricing page on ${results.pricingReadOn}.`,
    '',
    '## Results',
    '',
    resultsTable(results),
    '',
    '## Per candidate',
    '',
    summaryTable(results),
    '',
    '## Judges',
    '',
    judgeTable(results),
    '',
    '## Spend',
    '',
    ledgerTable(results),
    '',
    '## How to read this',
    '',
    ...results.notes.map((note) => `- ${note}`),
    '',
  ].join('\n');
}
