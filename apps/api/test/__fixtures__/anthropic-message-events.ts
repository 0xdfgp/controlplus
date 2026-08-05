import type { AnthropicEvent } from '../../src/infrastructure/anthropic/message-stream.ts';

/**
 * Recorded Anthropic Messages API stream events.
 *
 * Captured from live `messages.create({stream: true})` calls against
 * claude-sonnet-4-5 on 2026-08-05 and trimmed to the events that matter here.
 * The envelopes are verbatim. What was varied, and only this: the answer text
 * and token counts, so both adapters answer the shared contract's questions;
 * the model name in the two provenance fixtures; and the stop_reason in the
 * refusal fixture.
 *
 * THE CAST IS THE POINT, not laziness. These payloads do not satisfy the SDK's
 * own TypeScript types, because the deployed API sends less than the types
 * declare. Verified live on every event in this file:
 *
 *   message_start.message      omits `container`
 *   message_start...usage      omits `output_tokens_details`, `server_tool_use`;
 *                              sends `cache_creation` as an object and
 *                              `inference_geo: "not_available"` as a string
 *   message_delta.delta        omits `container`
 *   message_delta.usage        omits `output_tokens_details`, `server_tool_use`
 *   content_block (text)       omits `citations`
 *
 * Writing these fixtures to satisfy the compiler instead would mean testing the
 * adapter against a payload the provider never sends, which is the exact
 * failure ADR-020 was found by: a fixture-only path that passed against a shape
 * we had invented ourselves. The same trap is already recorded for Gemini — the
 * SDK types run ahead of the deployed API, and only a live call tells you which.
 */

const CAPTURED_MODEL = 'claude-sonnet-4-5-20250929';

/** message_start exactly as the wire sends it, at a given model and input count. */
function opened(model: string, inputTokens: number): unknown {
  return {
    type: 'message_start',
    message: {
      model,
      id: 'msg_011CdjyNm4L3WN79uPNfdJMW',
      type: 'message',
      role: 'assistant',
      content: [],
      stop_reason: null,
      stop_sequence: null,
      stop_details: null,
      usage: {
        input_tokens: inputTokens,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation: {
          ephemeral_5m_input_tokens: 0,
          ephemeral_1h_input_tokens: 0,
        },
        output_tokens: 1,
        service_tier: 'standard',
        inference_geo: 'not_available',
      },
    },
  };
}

const TEXT_BLOCK_START = {
  type: 'content_block_start',
  index: 0,
  content_block: { type: 'text', text: '' },
};

const BLOCK_STOP = { type: 'content_block_stop', index: 0 };

function text(value: string): unknown {
  return {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'text_delta', text: value },
  };
}

function closed(outputTokens: number, stopReason: string): unknown[] {
  return [
    {
      type: 'message_delta',
      delta: { stop_reason: stopReason, stop_sequence: null, stop_details: null },
      usage: {
        input_tokens: 342,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        output_tokens: outputTokens,
      },
    },
    { type: 'message_stop' },
  ];
}

/** Three text runs, then a clean end_turn. 118 in / 27 out, no reasoning count. */
export const HAPPY_PATH_EVENTS = [
  opened(CAPTURED_MODEL, 118),
  TEXT_BLOCK_START,
  text('That message has two signs of a scam: '),
  text('it asks you to click a link right away, '),
  text('and it tries to make you feel rushed.'),
  BLOCK_STOP,
  ...closed(27, 'end_turn'),
] as unknown as readonly AnthropicEvent[];

/**
 * The same shape at different counts.
 *
 * On Anthropic this is not a distinct case — every turn reports no separate
 * reasoning count — and that sameness is the point the contract is making.
 */
export const NO_THOUGHT_TOKENS_EVENTS = [
  opened(CAPTURED_MODEL, 31),
  TEXT_BLOCK_START,
  text('You are not in trouble. That message is a fake.'),
  BLOCK_STOP,
  ...closed(12, 'end_turn'),
] as unknown as readonly AnthropicEvent[];

/**
 * A turn where the model thinks before answering. Thoughts are not the answer.
 *
 * Captured with thinking enabled, which the product path does not request. Kept
 * because the adapter must not start streaming reasoning at a frightened person
 * the day someone turns it on — and because a signature_delta carries no text
 * at all, so a translator keying on anything but the delta type would emit
 * `undefined` into the answer. Note the real payload puts thinking at index 0
 * and the answer at index 1; the adapter reads the delta type, not the index.
 */
export const THINKING_EVENTS = [
  opened(CAPTURED_MODEL, 31),
  {
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'thinking', thinking: '', signature: '' },
  },
  {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'thinking_delta', thinking: 'This is a classic phishing pattern.' },
  },
  {
    type: 'content_block_delta',
    index: 0,
    delta: {
      type: 'signature_delta',
      signature: 'EsIGCpQBCBAYAipA+gV/cSdwC3hROPxDCx7sK44hMd25gLCoEBy8Ed4JjC0N3CVLSaVOpwe0',
    },
  },
  { type: 'content_block_stop', index: 0 },
  { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'Yes. ' } },
  {
    type: 'content_block_delta',
    index: 1,
    delta: { type: 'text_delta', text: 'That is a scam.' },
  },
  { type: 'content_block_stop', index: 1 },
  ...closed(12, 'end_turn'),
] as unknown as readonly AnthropicEvent[];

/**
 * The provider declined.
 *
 * stop_reason varied from the captured end_turn: a refusal could not be
 * provoked without sending the kind of request this product exists to protect
 * people from. Everything around it is the captured envelope.
 */
export const REFUSAL_EVENTS = [
  opened(CAPTURED_MODEL, 31),
  TEXT_BLOCK_START,
  BLOCK_STOP,
  ...closed(0, 'refusal'),
] as unknown as readonly AnthropicEvent[];

/**
 * A degraded stream that reported no counts.
 *
 * Boundary values on the captured envelope. The point is that the adapter
 * records zero rather than refusing an answer the user has already read.
 */
export const NO_USAGE_EVENTS = [
  opened(CAPTURED_MODEL, 0),
  TEXT_BLOCK_START,
  text('That is a scam.'),
  BLOCK_STOP,
  ...closed(0, 'end_turn'),
] as unknown as readonly AnthropicEvent[];

/** The provider named no model, so provenance falls back to the one we asked for. */
export const NO_MODEL_EVENTS = [
  opened('', 118),
  TEXT_BLOCK_START,
  text('That is a scam.'),
  BLOCK_STOP,
  ...closed(27, 'end_turn'),
] as unknown as readonly AnthropicEvent[];

/**
 * The provider answered on a dated snapshot rather than the alias we asked for.
 *
 * Not hypothetical: this is what every live call actually did. We ask for
 * claude-sonnet-4-5 and the wire reports claude-sonnet-4-5-20250929, so this is
 * the ordinary case and the alias is the exception.
 */
export const SUBSTITUTED_MODEL_EVENTS = [
  opened(CAPTURED_MODEL, 118),
  TEXT_BLOCK_START,
  text('That is a scam.'),
  BLOCK_STOP,
  ...closed(27, 'end_turn'),
] as unknown as readonly AnthropicEvent[];

/**
 * How far a stream gets before the provider fails.
 *
 * The failure itself is not a frame: the SDK turns a mid-stream `error` event
 * into a thrown APIError before the adapter sees it, so the recorded opener
 * throws rather than yielding.
 */
export const EVENTS_BEFORE_ERROR = [
  opened(CAPTURED_MODEL, 118),
  TEXT_BLOCK_START,
] as unknown as readonly AnthropicEvent[];
