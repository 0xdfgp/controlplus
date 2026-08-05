import { redact } from './redact.ts';

/**
 * What the turn's photo was, if it had one (ADR-024).
 *
 * Media type and dimensions only. The bytes are never logged and neither is the
 * hash: this exists so an operator reading a turn with an unusual input token
 * count can see that a picture was in it, which is the one thing about the
 * image that changes how the line reads.
 */
export interface TurnLogImage {
  readonly mediaType: string;
  readonly width: number;
  readonly height: number;
}

export interface TurnLogFields {
  readonly conversationId: string;
  readonly requestId: string;
  readonly latencyMs: number;
  readonly question: string;
  readonly image: TurnLogImage | null;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  /** Billed outside input and output (ADR-020), so logged separately. */
  readonly thoughtTokens: number | null;
  /**
   * How the turn ended, or null if it failed and has no terminal state.
   *
   * 'stopped' is the operator's evidence that the client left and the provider
   * stream was released rather than left running to be billed for.
   */
  readonly terminalState: 'completed' | 'stopped' | null;
  readonly errorClass: string | null;
}

export type LogSink = (line: string) => void;

/**
 * Writes exactly one structured line per turn (ADR-004).
 *
 * One line, not one per event: a turn is the unit an operator reasons about,
 * and a stream of deltas in the log would bury it.
 *
 * Message content goes through the redaction function on the way in. It is
 * masked, never omitted — see redact.ts for why that distinction matters here.
 *
 * Full field coverage across every use case is S11.
 */
export class TurnLogger {
  constructor(
    private readonly sink: LogSink,
    private readonly enabled: boolean = true,
  ) {}

  static toStdout(enabled: boolean): TurnLogger {
    return new TurnLogger((line) => process.stdout.write(`${line}\n`), enabled);
  }

  record(fields: TurnLogFields): void {
    if (!this.enabled) {
      return;
    }
    this.sink(
      JSON.stringify({
        event: 'turn.completed',
        conversationId: fields.conversationId,
        requestId: fields.requestId,
        latencyMs: fields.latencyMs,
        inputTokens: fields.inputTokens,
        outputTokens: fields.outputTokens,
        thoughtTokens: fields.thoughtTokens,
        terminalState: fields.terminalState,
        errorClass: fields.errorClass,
        image: fields.image,
        question: redact(fields.question),
      }),
    );
  }
}
