import type {
  AskQuestionRequest,
  ImagePayload,
  SseEvent,
} from '@control-plus/contracts';

import { parseSse } from './parse-sse.ts';

export interface AskQuestionStreamHandlers {
  onEvent: (event: SseEvent) => void;
  /** Transport-level failure: no connection, or the server never answered. */
  onTransportError: () => void;
  onClose: () => void;
  /**
   * How much of the request has left the phone, from 0 to 1.
   *
   * Real progress from the upload itself, not a timer. 03-senior-ux-principles
   * forbids client-side time-based motion for exactly this reason: an animation
   * on a timer keeps moving after the connection has died, and a screen that
   * lies to a frightened person is worse than one that is honest about waiting.
   *
   * Called for every request, photo or not. A one-line question completes in
   * one event and nothing renders it.
   */
  onUploadProgress?: (fraction: number) => void;
}

export interface AskQuestionStreamOptions {
  readonly baseUrl: string;
  readonly conversationId: string;
  readonly question: string;
  /** The photo, already resized and encoded on the device (ADR-024). */
  readonly image?: ImagePayload | undefined;
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

  // XHR is what makes this measurable at all: `fetch` in Hermes reports nothing
  // about a request body on its way out, and the upload is the part of a photo
  // turn that actually takes time on a slow connection.
  //
  // It is the percentage and nothing else. React Native dispatches `progress`
  // on `upload` and never dispatches anything else there — there is no upload
  // `load` event to hang the end of the upload on, and whether the platform
  // reports progress at all is not guaranteed. So the caller is told what has
  // gone out when someone says, and works out that the upload finished from the
  // server's first event instead.
  const onUploadProgress = handlers.onUploadProgress;
  if (onUploadProgress !== undefined) {
    xhr.upload.onprogress = (event): void => {
      if (event.lengthComputable && event.total > 0) {
        onUploadProgress(Math.min(1, event.loaded / event.total));
      }
    };
  }

  const body: AskQuestionRequest =
    options.image === undefined
      ? { question: options.question }
      : { question: options.question, image: options.image };
  xhr.send(JSON.stringify(body));

  return () => {
    if (!finished) {
      finished = true;
      xhr.abort();
    }
  };
}
