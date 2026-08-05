import type { ServerResponse } from 'node:http';

import type { SseEvent } from '@control-plus/contracts';

/**
 * Writes the SSE event union to the wire (ADR-016).
 *
 * Buffering is the enemy here: the whole point of the screen is that an answer
 * appears while it is being written. The headers below turn off every layer
 * that would otherwise hold bytes back, and each event is flushed as it is
 * written.
 */
export class SseWriter {
  private closed = false;

  constructor(private readonly response: ServerResponse) {}

  open(): void {
    this.response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Nginx and friends buffer text/event-stream by default, which would
      // deliver the whole answer at once.
      'X-Accel-Buffering': 'no',
      // Compression buffers too. It is disabled for this route specifically.
      'Content-Encoding': 'identity',
    });
    this.flush();
  }

  send(event: SseEvent): void {
    if (this.closed) {
      return;
    }
    this.response.write(
      `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
    );
    this.flush();
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.response.end();
  }

  private flush(): void {
    // Node's compression and http layers expose flush() only sometimes; calling
    // it when present is what actually pushes the bytes out.
    const flushable = this.response as ServerResponse & {
      flush?: () => void;
    };
    flushable.flush?.();
  }
}
