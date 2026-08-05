import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { GenerationTurn } from '../../api/src/domain/ports/text-generation-port.ts';
import { loadFixtures, loadImage } from './fixtures/load-fixtures.ts';
import { renderMarkdown } from './report/write-markdown.ts';
import type { CellResult, LedgerLine, RunResults } from './report/results.ts';
import {
  candidateLedgerLine,
  judgeLedgerLine,
  transcriptionLedgerLine,
  ttsLedgerLine,
} from './report/spend.ts';
import { buildJudges, transcribeVoiceFixture } from './run-evaluation.ts';
import { runCell } from './measure/run-cell.ts';
import { buildCandidates } from './runners/candidates.ts';
import { RESULT_NOTES } from './report/notes.ts';

const RESULTS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../results',
);
const PRICING_READ_ON = '2026-08-05';

async function main(): Promise<void> {
  const startedAt = new Date();
  const start = process.hrtime.bigint();

  const set = loadFixtures();
  const candidates = buildCandidates();
  const judges = buildJudges();

  const imageFixture = set.fixtures.find((f) => f.kind === 'image');
  const voiceFixture = set.fixtures.find((f) => f.kind === 'voice');
  if (imageFixture === undefined || voiceFixture === undefined) {
    throw new Error('The fixture set needs both an image and a voice question.');
  }

  // Fail before spending anything if the screenshot is outside ADR-024's bounds.
  const image = loadImage(imageFixture.attachment);
  process.stdout.write(
    `Screenshot ${imageFixture.attachment}: ${image.width}x${image.height}, ${image.bytes} bytes\n`,
  );

  process.stdout.write('Transcribing the voice fixture...\n');
  const { record: transcription, seconds } = await transcribeVoiceFixture(
    voiceFixture.audio,
    voiceFixture.script,
  );
  process.stdout.write(
    `  ${transcription.audioSeconds.toFixed(1)}s of audio, first text at ` +
      `${((transcription.timeToFirstTokenMs ?? 0) / 1000).toFixed(2)}s, ` +
      `matches the script: ${String(transcription.matchesScript)}\n`,
  );

  const cells: CellResult[] = [];

  for (const candidate of candidates) {
    // Sequential on purpose. Concurrent requests to the same provider contend
    // for the same connection and rate limit, and a time-to-first-token
    // measured under self-inflicted load is not the number anyone wants.
    const answers = new Map<string, string>();

    for (const fixture of set.fixtures) {
      const question =
        fixture.kind === 'voice' ? transcription.transcript : fixture.question;

      let history: readonly GenerationTurn[] = [];
      let priorTurn: { question: string; answer: string } | undefined;

      if (fixture.kind === 'follow-up') {
        const priorAnswer = answers.get(fixture.dependsOn);
        const prior = set.fixtures.find((f) => f.id === fixture.dependsOn);
        if (priorAnswer === undefined || prior === undefined || prior.kind !== 'text') {
          process.stdout.write(
            `  ${candidate.id} / ${fixture.id}: skipped, the turn it depends on produced no answer\n`,
          );
          continue;
        }
        // The follow-up is answerable only with the previous turn in view, and
        // the previous turn is this candidate's own answer. That is what makes
        // it a follow-up rather than a fourth independent question.
        history = [
          { author: 'user', text: prior.question },
          { author: 'assistant', text: priorAnswer },
        ];
        priorTurn = { question: prior.question, answer: priorAnswer };
      }

      process.stdout.write(`  ${candidate.id} / ${fixture.id}... `);
      const cell = await runCell({
        candidate,
        fixture,
        question,
        history,
        image: fixture.kind === 'image' ? image : undefined,
        judges: judges.get(candidate.id),
        candidateFamily: candidate.family,
        priorTurn,
      });
      cells.push(cell);

      if (cell.measurement !== null) {
        answers.set(fixture.id, cell.measurement.answer);
        process.stdout.write(
          `${(cell.measurement.totalMs / 1000).toFixed(1)}s, ` +
            `${cell.overallPassed ? 'pass' : 'FAIL'}\n`,
        );
      } else {
        process.stdout.write(`ERROR: ${cell.error ?? 'unknown'}\n`);
      }
    }
  }

  const finishedAt = new Date();
  const ledger: LedgerLine[] = [
    candidateLedgerLine(cells),
    judgeLedgerLine([
      ...cells.map((c) => c.layerTwo),
      ...cells.map((c) => c.layerTwoSecondary),
    ].filter((v): v is NonNullable<typeof v> => v !== null)),
    transcriptionLedgerLine(seconds),
    ttsLedgerLine(voiceFixture.script.length),
  ];

  const results: RunResults = {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    wallClockSeconds: Number(process.hrtime.bigint() - start) / 1_000_000_000,
    fixtureVersion: set.version,
    pricingReadOn: PRICING_READ_ON,
    judgeAssignment: candidates.map((candidate) => {
      const pair = judges.get(candidate.id);
      return {
        candidateId: candidate.id,
        judgeModel: pair?.primary.model ?? 'none',
        judgeFamily: pair?.primary.family ?? 'none',
        selfJudged: pair?.primary.family === candidate.family,
        secondaryJudgeModel: pair?.secondary.model ?? 'none',
        secondaryIsSelfJudged: pair?.secondary.family === candidate.family,
      };
    }),
    candidatePaths: candidates.map((c) => ({ candidateId: c.id, path: c.path })),
    transcription,
    image: { ...image, file: imageFixture.attachment },
    cells,
    ledger,
    totalSpendUsd: ledger.reduce((sum, line) => sum + line.usd, 0),
    notes: RESULT_NOTES,
  };

  mkdirSync(RESULTS_DIR, { recursive: true });
  const stamp = startedAt.toISOString().replace(/[:.]/g, '-');
  const jsonPath = path.join(RESULTS_DIR, `run-${stamp}.json`);
  const markdownPath = path.join(RESULTS_DIR, `run-${stamp}.md`);

  writeFileSync(jsonPath, `${JSON.stringify(results, null, 2)}\n`);
  writeFileSync(markdownPath, renderMarkdown(results));

  process.stdout.write(
    `\nWrote ${jsonPath}\nWrote ${markdownPath}\n` +
      `Total spend $${results.totalSpendUsd.toFixed(4)} over ${results.wallClockSeconds.toFixed(0)}s\n`,
  );
}

await main();
