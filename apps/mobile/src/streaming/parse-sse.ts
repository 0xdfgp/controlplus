import { isSseEventName } from '@control-plus/contracts';
import type { SseEvent } from '@control-plus/contracts';

export interface SseParseResult {
  /** Complete events found in what has arrived so far. */
  readonly events: SseEvent[];
  /** Bytes consumed. The caller keeps this so it never re-parses an event. */
  readonly consumed: number;
}

/**
 * Parses SSE frames out of a growing response body.
 *
 * React Native's XHR does not hand back discrete chunks: `responseText` simply
 * grows. So this takes the whole text and an offset, and returns the events
 * completed since that offset. Keeping it a pure function is what makes the
 * awkward part of the transport testable without a device.
 *
 * A trailing partial frame is deliberately left unconsumed: a delta that
 * arrived half-written is not an event yet.
 */
export function parseSse(text: string, offset: number): SseParseResult {
  const pending = text.slice(offset);
  const events: SseEvent[] = [];
  let consumed = offset;
  let searchFrom = 0;

  while (true) {
    const separator = pending.indexOf('\n\n', searchFrom);
    if (separator === -1) {
      break;
    }

    const frame = pending.slice(searchFrom, separator);
    searchFrom = separator + 2;
    consumed = offset + searchFrom;

    const event = parseFrame(frame);
    if (event !== null) {
      events.push(event);
    }
  }

  return { events, consumed };
}

function parseFrame(frame: string): SseEvent | null {
  let name: string | null = null;
  const dataLines: string[] = [];

  for (const line of frame.split('\n')) {
    if (line.startsWith('event: ')) {
      name = line.slice('event: '.length).trim();
      continue;
    }
    if (line.startsWith('data: ')) {
      dataLines.push(line.slice('data: '.length));
    }
  }

  if (name === null || !isSseEventName(name) || dataLines.length === 0) {
    return null;
  }

  try {
    return JSON.parse(dataLines.join('\n')) as SseEvent;
  } catch {
    // A frame we cannot read is dropped rather than crashing the screen. The
    // person is waiting on an answer, not on our parser.
    return null;
  }
}
