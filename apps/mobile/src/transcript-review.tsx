import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { theme } from './theme.ts';

export const TRANSCRIBING_HEADING = 'Writing down what you said';
export const CORRECT_HINT = 'Tap to correct';
export const SEND_LABEL = 'Send this';

export interface TranscriptReviewProps {
  readonly transcript: string;
  /** False while the recogniser is still working, true once it has finished. */
  readonly ready: boolean;
  readonly onChange: (value: string) => void;
  readonly onSend: () => void;
}

/**
 * E6, the transcript on screen before anything is sent (AC2).
 *
 * The transcript is editable in place, which is the point of the whole state:
 * 03-senior-ux-principles asks for the transcript to be visible so a
 * mis-transcription is correctable, and this audience is the one most likely to
 * be misheard. A word got wrong here is a wrong answer confidently given, so
 * the mistake is put in front of the person rather than answered silently.
 *
 * Nothing has left the phone at this point and nothing will until "Send this".
 */
export function TranscriptReview({
  transcript,
  ready,
  onChange,
  onSend,
}: TranscriptReviewProps): React.JSX.Element {
  return (
    <View style={styles.block}>
      <Text style={styles.heading} accessibilityRole="header">
        {TRANSCRIBING_HEADING}
      </Text>

      <View style={styles.box}>
        <TextInput
          style={styles.transcript}
          value={transcript}
          onChangeText={onChange}
          editable={ready}
          multiline
          accessibilityLabel="What you said, which you can correct"
        />
        {/* There is nothing to correct until the words are there. */}
        {ready ? <Text style={styles.hint}>{CORRECT_HINT}</Text> : null}
      </View>

      {/* Absent rather than disabled while the words are still arriving. A
          control that cannot be used yet is one more thing to work out; when
          there is nothing to send, there is nothing to send it with. */}
      {ready ? (
        <Pressable
          style={({ pressed }) => [
            styles.send,
            transcript.trim().length === 0 && styles.disabled,
            pressed && styles.pressed,
          ]}
          onPress={onSend}
          disabled={transcript.trim().length === 0}
          accessibilityRole="button"
          accessibilityLabel={SEND_LABEL}
          accessibilityState={{ disabled: transcript.trim().length === 0 }}
        >
          <Text style={styles.sendLabel}>{SEND_LABEL}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { paddingVertical: theme.spacing(2) },
  heading: {
    fontSize: 26,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: theme.spacing(2),
  },
  // The dashed edge E6 draws. It says "not finished yet, and yours to change",
  // which a solid box around finished text would not.
  box: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: theme.colors.accent,
    borderRadius: 16,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing(2),
  },
  transcript: {
    fontSize: theme.bodyFontSize,
    lineHeight: 28,
    color: theme.colors.text,
    minHeight: theme.minimumTouchTarget,
  },
  hint: {
    marginTop: theme.spacing(1),
    fontSize: theme.minimumBodyFontSize,
    fontWeight: '600',
    color: theme.colors.accent,
  },
  send: {
    marginTop: theme.spacing(3),
    minHeight: theme.minimumTouchTarget + 12,
    borderRadius: 16,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
  sendLabel: { fontSize: 22, fontWeight: '700', color: '#FFFFFF' },
});
