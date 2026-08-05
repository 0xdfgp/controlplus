import OpenAI from 'openai';

import type { Family } from '../runners/candidates.ts';
import type { Judge, JudgeOutcome } from './judge.ts';
import { allPassed, parseVerdicts } from './parse-verdicts.ts';
import { JUDGE_SYSTEM_PROMPT, RUBRIC_SCHEMA, buildJudgePrompt } from './rubric.ts';
import type { JudgeSubject } from './rubric.ts';

/**
 * The OpenAI judge, used for every candidate that is not itself OpenAI.
 *
 * Structured output rather than "reply in JSON": ADR-033 asked for a schema
 * because a judge free to write prose around its verdicts is a judge whose
 * output has to be parsed by guessing, and verbosity bias is one of the things
 * the schema is there to suppress.
 */
export class OpenAIJudge implements Judge {
  readonly family: Family = 'openai';

  constructor(
    private readonly client: OpenAI,
    readonly model: string,
  ) {}

  static withApiKey(apiKey: string, model: string): OpenAIJudge {
    return new OpenAIJudge(new OpenAI({ apiKey }), model);
  }

  async grade(subject: JudgeSubject): Promise<JudgeOutcome> {
    const content: OpenAI.Responses.ResponseInputContent[] = [
      { type: 'input_text', text: buildJudgePrompt(subject) },
    ];
    if (subject.image !== undefined) {
      // The judge sees the screenshot too. The first rubric item asks whether
      // the answer said what would make this a scam, and that cannot be graded
      // without knowing what was actually on the screen.
      content.push({
        type: 'input_image',
        detail: 'auto',
        image_url: `data:${subject.image.mediaType};base64,${subject.image.data}`,
      });
    }

    const response = await this.client.responses.create({
      model: this.model,
      instructions: JUDGE_SYSTEM_PROMPT,
      input: [{ role: 'user', content }],
      text: {
        format: {
          type: 'json_schema',
          name: 'rubric_verdicts',
          strict: true,
          schema: RUBRIC_SCHEMA,
        },
      },
    });

    const verdicts = parseVerdicts(response.output_text);
    const usage = response.usage;
    // Reasoning is inside output_tokens on this provider, so it is subtracted
    // out for the same reason as in the candidate runner: otherwise the judge's
    // own spend is counted twice in the ledger.
    const reasoning = usage?.output_tokens_details?.reasoning_tokens ?? 0;

    return {
      passed: allPassed(verdicts),
      verdicts,
      judgeModel: response.model,
      judgeFamily: this.family,
      usage: {
        input: usage?.input_tokens ?? 0,
        output: Math.max((usage?.output_tokens ?? 0) - reasoning, 0),
        reasoning,
      },
    };
  }
}
