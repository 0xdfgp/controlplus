/**
 * The SSE event union for a turn (ADR-016). Hand written, imported by the API
 * and the app so both sides drift together or not at all.
 *
 * Sequence on the happy path:
 *   stage(thinking) -> stage(responding) -> message.delta* -> message.done
 * Sequence on the failure path:
 *   stage(thinking) -> error
 *
 * There are no transcript events. Transcription happens on the device
 * (ADR-018), so audio never reaches this stream.
 */

/** What the screen should be showing. Three states only in this slice. */
export type Stage = 'thinking' | 'responding';

/**
 * How a turn ended. A Message is written once, already in one of these states
 * (ADR-013). Only 'completed' is emitted in this slice; 'stopped' arrives with
 * cancellation in S2.
 */
export type TerminalState = 'completed' | 'stopped';

/** Records that an answer was machine generated, and by what. */
export interface ProvenancePayload {
  readonly origin: 'ai-generated';
  readonly modelId: string;
  readonly provider: string;
}

/**
 * Token counts for the turn, as reported by the provider on completion.
 *
 * thoughtTokens is separate because providers bill it separately (ADR-020),
 * and zero when the provider reports no separate reasoning count.
 */
export interface UsagePayload {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly thoughtTokens: number;
}

/** The domain error classes the stream is allowed to name. */
export type StreamErrorClass = 'ProviderUnavailable' | 'ConversationNotFound';

export interface StageEvent {
  readonly type: 'stage';
  readonly stage: Stage;
}

export interface MessageDeltaEvent {
  readonly type: 'message.delta';
  readonly text: string;
}

export interface MessageDoneEvent {
  readonly type: 'message.done';
  readonly messageId: string;
  readonly state: TerminalState;
  readonly provenance: ProvenancePayload;
  readonly usage: UsagePayload;
}

/**
 * The error class is named so the app can branch on it. The sentence the user
 * reads is chosen by the app, never taken from provider text.
 */
export interface StreamErrorEvent {
  readonly type: 'error';
  readonly error: StreamErrorClass;
}

export type SseEvent =
  | StageEvent
  | MessageDeltaEvent
  | MessageDoneEvent
  | StreamErrorEvent;

/** The `event:` field name carried on the wire for each event. */
export const SSE_EVENT_NAMES = [
  'stage',
  'message.delta',
  'message.done',
  'error',
] as const;

export type SseEventName = (typeof SSE_EVENT_NAMES)[number];

export function isSseEventName(value: string): value is SseEventName {
  return (SSE_EVENT_NAMES as readonly string[]).includes(value);
}
