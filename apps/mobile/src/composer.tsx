import { StyleSheet, Text, View } from 'react-native';

import { PhotoButtons } from './photo-buttons.tsx';
import { PhotoPreview } from './photo-preview.tsx';
import { QuestionInput } from './question-input.tsx';
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
 * every follow-up offer exactly the same three: type, photograph, speak. E1 is
 * explicit that none of them is hidden behind a menu, so there is no decision
 * about which method to use before the person can even start.
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
        <View>
          <PhotoButtons
            onCamera={onCamera}
            onLibrary={onLibrary}
            disabled={busy}
          />
          <SpeakButton onPress={onSpeak} disabled={busy} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // A refused permission, a photo that is too big, or nothing heard. Same size
  // and colour as the answer text: it is a sentence to read, not damage to
  // notice.
  notice: {
    fontSize: theme.minimumBodyFontSize,
    lineHeight: 26,
    color: theme.colors.text,
    marginBottom: theme.spacing(2),
  },
});
