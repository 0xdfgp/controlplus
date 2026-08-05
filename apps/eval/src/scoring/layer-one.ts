export interface LayerOneCheck {
  readonly id: string;
  readonly question: string;
  readonly passed: boolean;
  /** What in the answer decided it. Empty when nothing was found, which passes. */
  readonly evidence: readonly string[];
  /** True when the answer gave this check nothing to judge. Does not fail. */
  readonly notApplicable?: boolean;
}

export interface LayerOneResult {
  readonly passed: boolean;
  readonly checks: readonly LayerOneCheck[];
}

const MARKDOWN_PATTERNS: ReadonlyArray<readonly [label: string, pattern: RegExp]> = [
  ['heading', /^\s{0,3}#{1,6}\s+\S/gm],
  ['bold', /\*\*[^*\n]+\*\*|__[^_\n]+__/g],
  ['horizontal rule', /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/gm],
];

/** ADR-033 names these three. The product policy forbids the first two outright. */
const FORBIDDEN_WORDS = /\b(simply|just|obviously)\b/gi;

const NUMBERED_LINE = /^\s*\d+[.)]\s+\S/;
const BULLET_LINE = /^\s*([-*•]|\d+\s*[-–]|[a-z][.)])\s+\S/i;

/**
 * Layer one of ADR-033: deterministic checks, in code, no model involved.
 *
 * A failure here fails the case and the judge is not invoked, which ADR-033
 * states outright. That is not only a saving: these are the properties the
 * product policy already commits to in writing, so a model that breaks one has
 * broken a rule rather than shown a preference, and asking a judge to weigh it
 * would be asking whether the rule matters.
 */
export function scoreLayerOne(answer: string): LayerOneResult {
  const checks = [
    markdownCheck(answer),
    forbiddenWordsCheck(answer),
    numberedStepsCheck(answer),
    truncationCheck(answer),
  ];
  return { passed: checks.every((check) => check.passed), checks };
}

function markdownCheck(answer: string): LayerOneCheck {
  const evidence: string[] = [];
  for (const [label, pattern] of MARKDOWN_PATTERNS) {
    const found = answer.match(new RegExp(pattern.source, pattern.flags));
    if (found !== null && found.length > 0) {
      evidence.push(`${label}: ${found.slice(0, 3).map(trim).join(' | ')}`);
    }
  }
  return {
    id: 'no-markdown',
    // On a phone screen for someone of 80, markdown renders as literal hashes
    // and asterisks. The policy turns it off explicitly because both Anthropic
    // models emit it by default (ADR-032).
    question: 'Is the answer free of markdown headings, bold and horizontal rules?',
    passed: evidence.length === 0,
    evidence,
  };
}

function forbiddenWordsCheck(answer: string): LayerOneCheck {
  const found = answer.match(FORBIDDEN_WORDS) ?? [];
  return {
    id: 'no-belittling-words',
    // "Simply" and "just" tell someone that what they found hard is easy.
    question: 'Does the answer avoid the words simply, just and obviously?',
    passed: found.length === 0,
    evidence: found.map((word) => word.toLowerCase()),
  };
}

/**
 * Whether procedural steps are numbered.
 *
 * A list is detected when two or more lines look like list items. Only then is
 * numbering required. Answers with no procedure report not applicable and pass:
 * a detector that demanded numbered steps everywhere would fail the answers
 * that correctly have none, and this layer must not invent a rule the policy
 * does not contain.
 */
function numberedStepsCheck(answer: string): LayerOneCheck {
  const lines = answer.split('\n');
  const listLines = lines.filter(
    (line) => NUMBERED_LINE.test(line) || BULLET_LINE.test(line),
  );

  if (listLines.length < 2) {
    return {
      id: 'numbered-steps',
      question: 'When the answer lists steps, are they numbered?',
      passed: true,
      evidence: [],
      notApplicable: true,
    };
  }

  const unnumbered = listLines.filter((line) => !NUMBERED_LINE.test(line));
  return {
    id: 'numbered-steps',
    question: 'When the answer lists steps, are they numbered?',
    passed: unnumbered.length === 0,
    evidence: unnumbered.slice(0, 3).map(trim),
  };
}

const TERMINAL_PUNCTUATION = /[.!?:"')\]]$/;

/** A trailing line this short is a label or a list item, not a severed sentence. */
const LABEL_LINE_MAX_WORDS = 6;

/**
 * Whether the answer stops mid-sentence.
 *
 * ADR-032 recorded a live call cutting off inside a numbered list, which for
 * someone following steps on a phone is worse than no answer: they act on half
 * a procedure. Terminal punctuation is the signal available from this side of
 * the port, since the port deliberately does not carry a provider stop reason.
 *
 * Missing punctuation alone is not enough, and the first version of this check
 * got that wrong. An answer that ended "Photos 40 GB / Apps 25 GB / Messages 10
 * GB" was failed as truncated when it was a finished answer ending on a short
 * example label, and because a layer one failure skips the judge (ADR-033),
 * that mistake silently deleted a whole cell's layer two data rather than just
 * marking it. So a final line short enough to be a label or a list item passes,
 * and a long unpunctuated final line — which is what a severed sentence looks
 * like — still fails.
 *
 * The honest limit: this is a heuristic over text, not a provider stop reason.
 * It cannot distinguish a model that chose to end on a fragment from one that
 * was cut off at a token cap.
 */
function truncationCheck(answer: string): LayerOneCheck {
  const trimmed = answer.trim();
  if (trimmed.length === 0) {
    return {
      id: 'not-truncated',
      question: 'Does the answer end on a finished sentence?',
      passed: false,
      evidence: ['the answer was empty'],
    };
  }

  if (TERMINAL_PUNCTUATION.test(trimmed)) {
    return {
      id: 'not-truncated',
      question: 'Does the answer end on a finished sentence?',
      passed: true,
      evidence: [],
    };
  }

  const lastLine = trimmed.split('\n').at(-1)?.trim() ?? '';
  const isLabel = lastLine.split(/\s+/).filter((w) => w.length > 0).length <= LABEL_LINE_MAX_WORDS;

  return {
    id: 'not-truncated',
    question: 'Does the answer end on a finished sentence?',
    passed: isLabel,
    evidence: isLabel ? [] : [`ends: ${trim(trimmed.slice(-60))}`],
  };
}

const trim = (value: string): string => value.trim().replace(/\s+/g, ' ');
