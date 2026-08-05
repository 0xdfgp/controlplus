import type { AskQuestionRequest, SseEvent } from '@control-plus/contracts';

import { parseSse } from './parse-sse.ts';

export interface AskQuestionStreamHandlers {
  onEvent: (event: SseEvent) => void;
  /** Transport-level failure: no connection, or the server never answered. */
  onTransportError: () => void;
  onClose: () => void;
}

export interface AskQuestionStreamOptions {
  readonly baseUrl: string;
  readonly conversationId: string;
  readonly question: string;
}

/**
 * Consumes the turn's SSE stream over XHR.
 *
 * EventSource is not native in React Native, and Hermes does not implement
 * ReadableStream on fetch, so neither of the obvious approaches works. XHR does:
 * `responseText` grows as bytes arrive, and readyState 3 (LOADING) fires
 * repeatedly while it does.
 *
 * The consequence is that we re-read a growing string rather than receiving
 * chunks, which is why the parser takes an offset and why it is a pure function
 * tested separately.
 *
 * Returns a cancel function. It is not wired to any UI in this slice — stop is
 * S2 — but the transport already supports abandoning a turn.
 */
export function askQuestionStream(
  options: AskQuestionStreamOptions,
  handlers: AskQuestionStreamHandlers,
): () => void {
  const xhr = new XMLHttpRequest();
  let offset = 0;
  let finished = false;

  const drain = (): void => {
    const { events, consumed } = parseSse(xhr.responseText, offset);
    offset = consumed;
    for (const event of events) {
      handlers.onEvent(event);
    }
  };

  const finish = (): void => {
    if (finished) {
      return;
    }
    finished = true;
    handlers.onClose();
  };

  xhr.open('POST', `${options.baseUrl}/conversations/${options.conversationId}/messages`);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.setRequestHeader('Accept', 'text/event-stream');

  xhr.onreadystatechange = (): void => {
    if (xhr.readyState === 3) {
      drain();
      return;
    }
    if (xhr.readyState === 4) {
      // The last frames can land with the final state change rather than with a
      // LOADING tick, so drain once more before closing.
      drain();
      if (xhr.status === 0 || xhr.status >= 400) {
        handlers.onTransportError();
      }
      finish();
    }
  };

  xhr.onerror = (): void => {
    handlers.onTransportError();
    finish();
  };

  xhr.ontimeout = (): void => {
    handlers.onTransportError();
    finish();
  };

  const body: AskQuestionRequest = { question: options.question };
  xhr.send(JSON.stringify(body));

  return () => {
    if (!finished) {
      finished = true;
      xhr.abort();
    }
  };
}
