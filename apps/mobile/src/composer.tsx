import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  ADD_PHOTO_HINT,
  ADD_PHOTO_LABEL,
  PhotoChoice,
} from './photo-choice.tsx';
import { PhotoPreview } from './photo-preview.tsx';
import { QuestionInput } from './question-input.tsx';
import { SecondaryButton } from './secondary-button.tsx';
import { SpeakButton } from './speak-button.tsx';
import { theme } from './theme.ts';

export interface ComposerProps {
  readonly draft: string;
  readonly placeholder: string;
  /** Something to read: a refused permission, a photo too big, nothing heard. */
  readonly notice: string | null;
  readonly photoUri: string | null;
  readonly busy: boolean;
  readonly onChange: (value: string) => void;
  readonly onSend: () => void;
  /** Takes a photo, and retakes the attached one. The same act either way. */
  readonly onCamera: () => void;
  readonly onLibrary: () => void;
  readonly onRemovePhoto: () => void;
  readonly onSpeak: () => void;
}

/**
 * The three ways to ask, wherever asking is possible.
 *
 * One block rather than one per screen shape, because the first question and
 * every follow-up offer exactly the same three: type, photograph, speak. None is
 * hidden behind a menu, so there is no decision about which method to use before
 * the person can even start.
 *
 * Compact, and that is the point of S6. This block used to stack four
 * full-width controls and take roughly half the screen away from the
 * conversation above it. Adding a photo and speaking now share one row — which
 * is what E1 and E7 draw — and the block is about a third shorter for it.
 *
 * Send stays full width below the input rather than moving beside it. It is the
 * primary action, and a fixed-width button next to a field that grows is the
 * first thing to break when the OS font is scaled to 200%.
 *
 * Whether the photo chooser is open is held here rather than in the turn state
 * machine, which gains no states in this slice: a menu being open is a property
 * of this block, not of the turn. The chooser is rendered outside the row on
 * purpose — a Modal is laid out absolutely, and a row is not the place to find
 * out what that does to two buttons meant to be the same width.
 */
export function Composer({
  draft,
  placeholder,
  notice,
  photoUri,
  busy,
  onChange,
  onSend,
  onCamera,
  onLibrary,
  onRemovePhoto,
  onSpeak,
}: ComposerProps): React.JSX.Element {
  const [choosing, setChoosing] = useState(false);

  // Closed before the picker is launched: the camera and the album are
  // presented by the OS, and asking for one from under an open modal is how
  // they end up behind it.
  const pick = (launch: () => void) => (): void => {
    setChoosing(false);
    launch();
  };

  return (
    <View>
      {photoUri === null ? null : (
        <PhotoPreview
          uri={photoUri}
          onRetake={onCamera}
          onRemove={onRemovePhoto}
        />
      )}

      {notice === null ? null : (
        <Text style={styles.notice} accessibilityLiveRegion="polite">
          {notice}
        </Text>
      )}

      <QuestionInput
        draft={draft}
        placeholder={placeholder}
        onChange={onChange}
        onSend={onSend}
      />

      {/* Both ways of adding to a question, and neither once a photo is
          attached: speaking would clear it, and a control that quietly throws
          away what you just chose is worse than one that is not there. */}
      {photoUri === null ? (
        <View style={styles.row}>
          <SecondaryButton
            label={ADD_PHOTO_LABEL}
            hint={ADD_PHOTO_HINT}
            onPress={() => setChoosing(true)}
            disabled={busy}
          />
          <SpeakButton onPress={onSpeak} disabled={busy} />
        </View>
      ) : null}

      <PhotoChoice
        visible={choosing}
        onCamera={pick(onCamera)}
        onLibrary={pick(onLibrary)}
        onBack={() => setChoosing(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // A refused permission, a photo that is too big, or nothing heard. Quieter
  // than an answer, at the body floor rather than answer size: it is a sentence
  // to read on the way past, not the thing the screen is about.
  notice: {
    fontSize: theme.minimumBodyFontSize,
    lineHeight: 26,
    color: theme.colors.muted,
    marginBottom: theme.spacing(1.5),
  },
  row: {
    flexDirection: 'row',
    gap: theme.spacing(2),
    marginTop: theme.spacing(1.5),
  },
});
