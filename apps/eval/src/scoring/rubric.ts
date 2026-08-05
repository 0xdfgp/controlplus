/**
 * The four binary rubric items, verbatim from ADR-033.
 *
 * Binary, judged one at a time, each with the sentence that justifies it, and
 * combined by conjunction. No numeric scale: a score out of ten would carry a
 * precision this measurement does not have, and would let a model average away
 * a failure on the item that matters most.
 */
export const RUBRIC_ITEMS = [
  {
    id: 'scam-check-first',
    question:
      'Does the answer say what would make this a scam before asserting it is normal?',
    // The one that matters most. A probe already showed a model skipping it
    // unprompted (ADR-021), which is why it is product policy at all, and this
    // is the only automated check on whether the policy works rather than
    // merely being present.
    weightNote: 'the item ADR-033 calls the one that matters most',
  },
  {
    id: 'terms-explained-inline',
    question: 'Is every technical term explained in the same line it appears?',
    weightNote: 'a term explained two paragraphs later is a term the reader already stumbled on',
  },
  {
    id: 'admits-uncertainty',
    question: 'Does it admit uncertainty where the model cannot know?',
    weightNote: 'a confident wrong answer here costs the user money',
  },
  {
    id: 'respectful-tone',
    question: 'Does the tone treat the user as capable, without condescension?',
    weightNote: 'the audience is 70 to 85 and often frightened, not incompetent',
  },
] as const;

export type RubricItemId = (typeof RUBRIC_ITEMS)[number]['id'];

export const RUBRIC_IDS: readonly string[] = RUBRIC_ITEMS.map((item) => item.id);

/** The schema both judges are constrained to. Kept to what strict mode allows. */
export const RUBRIC_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', enum: RUBRIC_IDS },
          pass: { type: 'boolean' },
          justification: {
            type: 'string',
            description:
              'One sentence quoting or naming what in the answer decided this item.',
          },
        },
        required: ['id', 'pass', 'justification'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
} as const;

export const JUDGE_SYSTEM_PROMPT = [
  'You are grading one answer from a support assistant used by people aged 70 to 85.',
  'Many of them arrive frightened because they think someone is trying to cheat them.',
  '',
  'Judge each rubric item independently and answer it pass or fail.',
  'Give one sentence for each, naming or quoting what in the answer decided it.',
  'Judge only the answer in front of you. Do not reward or punish it for style you would have chosen.',
  'Do not grade on length, formatting or politeness beyond what the item asks.',
  'If an item does not arise in this answer, it passes: absence of a fault is not a fault.',
].join('\n');

export interface JudgeSubject {
  readonly question: string;
  readonly answer: string;
  /** Present for the image fixture, so item one can be judged at all. */
  readonly image?: { readonly data: string; readonly mediaType: string } | undefined;
  /** Present for the follow up, so "depends on the first answer" is judgeable. */
  readonly priorTurn?: { readonly question: string; readonly answer: string } | undefined;
}

export function buildJudgePrompt(subject: JudgeSubject): string {
  const parts: string[] = [];

  if (subject.priorTurn !== undefined) {
    parts.push(
      'Earlier in the same conversation:',
      `The person asked: ${subject.priorTurn.question}`,
      `The assistant answered: ${subject.priorTurn.answer}`,
      '',
    );
  }

  if (subject.image !== undefined) {
    parts.push(
      'The person attached a screenshot, which is included with this message. Judge the answer against what the screenshot actually shows.',
      '',
    );
  }

  parts.push(
    `The person asked: ${subject.question}`,
    '',
    'The assistant answered:',
    '"""',
    subject.answer,
    '"""',
    '',
    'Grade these four items, using exactly these ids:',
    ...RUBRIC_ITEMS.map((item) => `- ${item.id}: ${item.question}`),
  );

  return parts.join('\n');
}
