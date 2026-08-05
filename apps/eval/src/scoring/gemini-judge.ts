import { GoogleGenAI } from '@google/genai';

import type { Family } from '../runners/candidates.ts';
import type { Judge, JudgeOutcome, JudgeUsage } from './judge.ts';
import { allPassed, parseVerdicts } from './parse-verdicts.ts';
import { JUDGE_SYSTEM_PROMPT, RUBRIC_SCHEMA, buildJudgePrompt } from './rubric.ts';
import type { JudgeSubject } from './rubric.ts';

/**
 * The Gemini judge, used for the OpenAI candidate so that no run is self-judged.
 *
 * It exists because of arithmetic rather than preference: three families,
 * four candidates, and ADR-033's rule that the judge must not share a family
 * with the model under test. Without this the OpenAI row would be graded by
 * OpenAI, and any ranking claim involving it would be worthless.
 */
export class GeminiJudge implements Judge {
  readonly family: Family = 'google';

  constructor(
    private readonly client: GoogleGenAI,
    readonly model: string,
  ) {}

  static withApiKey(apiKey: string, model: string): GeminiJudge {
    return new GeminiJudge(new GoogleGenAI({ apiKey }), model);
  }

  async grade(subject: JudgeSubject): Promise<JudgeOutcome> {
    const blocks: unknown[] = [{ type: 'text', text: buildJudgePrompt(subject) }];
    if (subject.image !== undefined) {
      blocks.unshift({
        type: 'image',
        mime_type: subject.image.mediaType,
        data: subject.image.data,
      });
    }

    const interaction = await this.client.interactions.create({
      model: this.model,
      system_instruction: JUDGE_SYSTEM_PROMPT,
      input: [{ type: 'user_input', content: blocks }] as never,
      response_format: {
        // `type` is required and discriminates the response format union. The
        // API rejects the object without it, and the SDK's types do not make
        // that obvious from the call site.
        type: 'text',
        mime_type: 'application/json',
        schema: RUBRIC_SCHEMA as never,
      },
      // A grader answering four yes/no questions about text in front of it does
      // not need to deliberate at length, and ADR-021 measured what reasoning
      // costs on this provider.
      generation_config: { thinking_level: 'minimal' },
    });

    const verdicts = parseVerdicts(textOf(interaction));

    return {
      passed: allPassed(verdicts),
      verdicts,
      judgeModel: modelOf(interaction) ?? this.model,
      judgeFamily: this.family,
      usage: usageOf(interaction),
    };
  }
}

/**
 * The three reads the judge needs, done defensively.
 *
 * Not laziness: this build has now found four providers whose declared types
 * and deployed payloads disagree, so casting the whole response to a shape we
 * hope it has is the thing that has repeatedly gone wrong. Walking for the text
 * fails loudly if the shape moved, rather than silently reading undefined.
 */
function textOf(interaction: unknown): string {
  const output = (interaction as { output?: unknown }).output;
  if (typeof output === 'string') {
    return output;
  }
  const collected: string[] = [];
  collect(interaction, collected);
  if (collected.length === 0) {
    throw new Error('The Gemini judge returned no text output.');
  }
  return collected.join('');
}

function collect(node: unknown, into: string[]): void {
  if (Array.isArray(node)) {
    for (const child of node) {
      collect(child, into);
    }
    return;
  }
  if (typeof node !== 'object' || node === null) {
    return;
  }
  const record = node as Record<string, unknown>;
  if (record['type'] === 'text' && typeof record['text'] === 'string') {
    into.push(record['text']);
    return;
  }
  for (const key of ['output', 'content', 'steps', 'parts']) {
    if (key in record) {
      collect(record[key], into);
    }
  }
}

function modelOf(interaction: unknown): string | null {
  const model = (interaction as { model?: unknown }).model;
  return typeof model === 'string' && model.length > 0 ? model : null;
}

function usageOf(interaction: unknown): JudgeUsage {
  const usage = (interaction as { usage?: Record<string, unknown> }).usage ?? {};
  const read = (key: string): number =>
    typeof usage[key] === 'number' ? (usage[key] as number) : 0;
  return {
    input: read('total_input_tokens'),
    output: read('total_output_tokens'),
    reasoning: read('total_thought_tokens'),
  };
}
