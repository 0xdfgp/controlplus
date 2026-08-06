import { useCallback, useRef } from 'react';

import type { Photo } from './use-photo.ts';

/** A question as it was asked, and the picture that went with it. */
export interface LastAsk {
  readonly question: string;
  readonly photo: Photo | null;
}

export interface LastAskMemory {
  /** Called on every ask, whether it is a first attempt or a retry. */
  remember: (question: string, photo: Photo | null) => void;
  /** What Try again would send, or null when nothing has been asked yet. */
  read: () => LastAsk | null;
}

/**
 * What a retry needs, kept where a settled turn cannot clear it.
 *
 * A turn that ends puts its question in the conversation log and a uri for the
 * picture, which is everything the screen needs to draw it again and not enough
 * to send it again: the base64 the wire wants is in the Photo, and after a turn
 * settles the Photo is nowhere. Holding it here is the whole of "and if the
 * question carried a photo they do not re-take it".
 *
 * Its own hook for the reason `use-answer-buffer.ts` gives for itself: this is
 * not the turn, it is a thing remembered across turns, and the turn hook is
 * clearer for not owning it. A ref rather than state — nothing on screen changes
 * when it is written, and a render between the failure and the tap would be a
 * render nobody asked for.
 *
 * Never cleared. It is only read where `canRetry` is true, and every ask
 * overwrites it, so clearing it for tidiness could only lose the one thing it
 * exists to hold.
 */
export function useLastAsk(): LastAskMemory {
  const last = useRef<LastAsk | null>(null);

  return {
    remember: useCallback((question: string, photo: Photo | null) => {
      last.current = { question, photo };
    }, []),
    read: useCallback(() => last.current, []),
  };
}
