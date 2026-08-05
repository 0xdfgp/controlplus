import { RecordingView } from './recording-view.tsx';
import { TranscriptReview } from './transcript-review.tsx';
import type { TurnState } from './turn-machine.ts';

export interface VoiceTurnProps {
  readonly state: TurnState;
  readonly level: number;
  /** The words so far, which are the draft the person is about to send. */
  readonly transcript: string;
  readonly onDone: () => void;
  readonly onChange: (value: string) => void;
  readonly onSend: () => void;
}

/**
 * Whichever part of a spoken question is happening now: E4, then E6.
 *
 * One component so the screen asks one question — is a voice turn under way —
 * rather than branching on three states in the middle of its layout. Anything
 * that is not a voice state draws nothing, which is what makes it safe to put
 * in the screen unconditionally.
 */
export function VoiceTurn({
  state,
  level,
  transcript,
  onDone,
  onChange,
  onSend,
}: VoiceTurnProps): React.JSX.Element | null {
  if (state === 'recording') {
    return <RecordingView level={level} onDone={onDone} />;
  }

  if (state === 'transcribing' || state === 'reviewing') {
    return (
      <TranscriptReview
        transcript={transcript}
        // The words are only there to correct once the recogniser has finished.
        ready={state === 'reviewing'}
        onChange={onChange}
        onSend={onSend}
      />
    );
  }

  return null;
}
