import { AnthropicTextGenerationAdapter } from '../../../api/src/infrastructure/anthropic/anthropic-text-generation-adapter.ts';
import { AnthropicMessageStreamOpener } from '../../../api/src/infrastructure/anthropic/message-stream.ts';
import { GeminiTextGenerationAdapter } from '../../../api/src/infrastructure/gemini/gemini-text-generation-adapter.ts';
import { GeminiInteractionStreamOpener } from '../../../api/src/infrastructure/gemini/interaction-stream.ts';
import type { TextGenerationPort } from '../../../api/src/domain/ports/text-generation-port.ts';
import { ModelId } from '../../../api/src/domain/value-objects/model-id.ts';
import { optionalEnv, requireEnv } from '../config.ts';
import { OpenAIRunner } from './openai-runner.ts';

/** The model families, which is what the cross-family judge rule is about. */
export type Family = 'anthropic' | 'google' | 'openai';

export interface Candidate {
  readonly id: string;
  readonly label: string;
  readonly family: Family;
  /** The identifier we ask for. What answered is recorded per run. */
  readonly requestedModel: string;
  readonly port: TextGenerationPort;
  /** Where this candidate's request was built, for the report to be honest about. */
  readonly path: string;
}

/**
 * The four candidates, three of them through the shipped adapters.
 *
 * The two Anthropic entries differ only in ModelId and share everything else,
 * including the opener's max_tokens of 2048 and its deliberate absence of a
 * `thinking` parameter. That is the product path as wired today, and running the
 * evaluation through anything else would measure a configuration the product
 * does not have.
 *
 * Worth knowing when reading the Opus 5 rows: Opus 5 thinks by default when no
 * `thinking` parameter is sent, and max_tokens caps thinking and answer text
 * together. If those rows come back truncated, that is a finding about the
 * shipped configuration rather than about the model, and the report says so
 * rather than letting a cap read as a quality result.
 */
export function buildCandidates(): readonly Candidate[] {
  const anthropicKey = requireEnv('ANTHROPIC_API_KEY');
  const geminiKey = requireEnv('GEMINI_API_KEY');
  const openaiKey = requireEnv('OPENAI_API_KEY');

  const sonnet = optionalEnv('EVAL_ANTHROPIC_SONNET', 'claude-sonnet-4-5');
  const opus = optionalEnv('EVAL_ANTHROPIC_OPUS', 'claude-opus-5');
  const gemini = optionalEnv('EVAL_GEMINI_MODEL', 'gemini-3.5-flash');
  const openai = optionalEnv('EVAL_OPENAI_MODEL', 'gpt-5.5');

  const anthropicOpener = AnthropicMessageStreamOpener.withApiKey(anthropicKey);
  const geminiOpener = GeminiInteractionStreamOpener.withApiKey(geminiKey);

  return [
    {
      id: 'anthropic-sonnet-4-5',
      label: `Anthropic ${sonnet}`,
      family: 'anthropic',
      requestedModel: sonnet,
      port: new AnthropicTextGenerationAdapter(
        anthropicOpener,
        ModelId.fromString(sonnet),
      ),
      path: 'shipped AnthropicTextGenerationAdapter, the wired product path (ADR-032)',
    },
    {
      id: 'anthropic-opus-5',
      label: `Anthropic ${opus}`,
      family: 'anthropic',
      requestedModel: opus,
      port: new AnthropicTextGenerationAdapter(
        anthropicOpener,
        ModelId.fromString(opus),
      ),
      path: 'shipped AnthropicTextGenerationAdapter, same opener and max_tokens as the wired path',
    },
    {
      id: 'gemini',
      label: `Google ${gemini}`,
      family: 'google',
      requestedModel: gemini,
      port: new GeminiTextGenerationAdapter(
        geminiOpener,
        ModelId.fromString(gemini),
      ),
      path: 'shipped GeminiTextGenerationAdapter, including thinking_level minimal (ADR-021) and the image path added for this evaluation',
    },
    {
      id: 'openai',
      label: `OpenAI ${openai}`,
      family: 'openai',
      requestedModel: openai,
      port: OpenAIRunner.withApiKey(openaiKey, openai),
      path: 'thin harness runner over the Responses API; no OpenAI adapter exists under apps/api and this evaluation does not create one',
    },
  ];
}
