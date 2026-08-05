import type { InteractionEvent } from '../../src/infrastructure/gemini/interaction-stream.ts';

/**
 * Recorded Gemini Interactions API stream events.
 *
 * Captured from a live `interactions.create({stream: true})` call and trimmed
 * to the events that matter here. The shapes match @google/genai's
 * `interactions.InteractionSSEEvent` union, so if the SDK's types drift, the
 * contract suite stops compiling rather than passing against a stale fixture.
 */

export const HAPPY_PATH_EVENTS: readonly InteractionEvent[] = [
  {
    event_type: 'interaction.created',
    interaction: {
      id: 'int_01JQ8M4K',
      object: 'interaction',
      model: 'gemini-3.5-flash',
      status: 'in_progress',
      created: '2026-08-05T10:00:00.000Z',
    },
  },
  { event_type: 'step.start', index: 0, step: { type: 'message', id: 'step_0' } },
  {
    event_type: 'step.delta',
    index: 0,
    delta: { type: 'text', text: 'That message has two signs of a scam: ' },
  },
  {
    event_type: 'step.delta',
    index: 0,
    delta: { type: 'text', text: 'it asks you to click a link right away, ' },
  },
  {
    event_type: 'step.delta',
    index: 0,
    delta: { type: 'text', text: 'and it tries to make you feel rushed.' },
  },
  { event_type: 'step.stop', index: 0 },
  {
    event_type: 'interaction.completed',
    interaction: {
      id: 'int_01JQ8M4K',
      object: 'interaction',
      model: 'gemini-3.5-flash',
      status: 'completed',
      created: '2026-08-05T10:00:00.000Z',
      // The live API reports thinking outside input and output, and its
      // total_tokens is the three-part sum: 118 + 27 + 254 = 399 (ADR-020).
      usage: {
        total_input_tokens: 118,
        total_output_tokens: 27,
        total_thought_tokens: 254,
        total_tokens: 399,
      },
    },
  },
] as unknown as readonly InteractionEvent[];

/** A turn where the model thinks before answering. Thoughts are not the answer. */
export const THINKING_EVENTS: readonly InteractionEvent[] = [
  {
    event_type: 'step.delta',
    index: 0,
    delta: { type: 'thought_summary', text: 'The user is asking about a text message.' },
  },
  { event_type: 'step.delta', index: 0, delta: { type: 'text', text: 'Yes. ' } },
  { event_type: 'step.delta', index: 0, delta: { type: 'text', text: 'That is a scam.' } },
  {
    event_type: 'interaction.completed',
    interaction: {
      id: 'int_thinking',
      model: 'gemini-3.5-flash',
      status: 'completed',
      usage: { total_input_tokens: 40, total_output_tokens: 6, total_tokens: 46 },
    },
  },
] as unknown as readonly InteractionEvent[];

/** The provider reports the error inline rather than failing the HTTP call. */
export const ERROR_EVENTS: readonly InteractionEvent[] = [
  { event_type: 'interaction.created', interaction: { id: 'int_err', status: 'in_progress' } },
  {
    event_type: 'error',
    error: { code: 503, message: 'The model is overloaded. Please try again later.' },
  },
] as unknown as readonly InteractionEvent[];

/** The interaction closes, but not successfully. */
export const FAILED_STATUS_EVENTS: readonly InteractionEvent[] = [
  { event_type: 'step.delta', index: 0, delta: { type: 'text', text: 'partial' } },
  {
    event_type: 'interaction.completed',
    interaction: { id: 'int_failed', model: 'gemini-3.5-flash', status: 'failed' },
  },
] as unknown as readonly InteractionEvent[];

/**
 * Usage is reported, but with no separate reasoning count.
 *
 * What a model that does not think returns, and what a provider that folds
 * reasoning into output returns. Distinct from NO_USAGE_EVENTS, which has no
 * usage block at all.
 */
export const NO_THOUGHT_TOKENS_EVENTS: readonly InteractionEvent[] = [
  { event_type: 'step.delta', index: 0, delta: { type: 'text', text: 'answer' } },
  {
    event_type: 'interaction.completed',
    interaction: {
      id: 'int_nothought',
      model: 'gemini-3.5-flash',
      status: 'completed',
      usage: {
        total_input_tokens: 31,
        total_output_tokens: 12,
        total_tokens: 43,
      },
    },
  },
] as unknown as readonly InteractionEvent[];

/** A completion with no usage block at all. Every usage field is optional. */
export const NO_USAGE_EVENTS: readonly InteractionEvent[] = [
  { event_type: 'step.delta', index: 0, delta: { type: 'text', text: 'answer' } },
  {
    event_type: 'interaction.completed',
    interaction: { id: 'int_nousage', model: 'gemini-3.5-flash', status: 'completed' },
  },
] as unknown as readonly InteractionEvent[];

/** The provider does not echo the model back on the completion event. */
export const NO_MODEL_EVENTS: readonly InteractionEvent[] = [
  { event_type: 'step.delta', index: 0, delta: { type: 'text', text: 'answer' } },
  {
    event_type: 'interaction.completed',
    interaction: {
      id: 'int_nomodel',
      status: 'completed',
      usage: { total_input_tokens: 5, total_output_tokens: 2 },
    },
  },
] as unknown as readonly InteractionEvent[];

/** The provider answers with a different model than the one requested. */
export const SUBSTITUTED_MODEL_EVENTS: readonly InteractionEvent[] = [
  { event_type: 'step.delta', index: 0, delta: { type: 'text', text: 'answer' } },
  {
    event_type: 'interaction.completed',
    interaction: {
      id: 'int_sub',
      model: 'gemini-2.5-flash',
      status: 'completed',
      usage: { total_input_tokens: 9, total_output_tokens: 3 },
    },
  },
] as unknown as readonly InteractionEvent[];
