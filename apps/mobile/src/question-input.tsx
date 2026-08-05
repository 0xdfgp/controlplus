import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { theme } from './theme.ts';

export interface QuestionInputProps {
  readonly draft: string;
  readonly placeholder: string;
  readonly onChange: (value: string) => void;
  readonly onSend: () => void;
}

/**
 * The way to ask, wherever asking is possible.
 *
 * One component rather than two, because the control that starts the first
 * question and the control that follows a finished answer are the same control.
 * E7 puts it directly below the previous answer with nothing ceremonial in
 * between: the input is the way back, so there is no "ask another question"
 * button to find (ADR-022).
 */
export function QuestionInput({
  draft,
  placeholder,
  onChange,
  onSend,
}: QuestionInputProps): React.JSX.Element {
  const canSend = draft.trim().length > 0;

  return (
    <View>
      <TextInput
        style={styles.input}
        value={draft}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.muted}
        accessibilityLabel="Your question"
        multiline
        returnKeyType="send"
        onSubmitEditing={onSend}
      />

      <Pressable
        style={({ pressed }) => [
          styles.sendButton,
          !canSend && styles.sendButtonDisabled,
          pressed && canSend && styles.sendButtonPressed,
        ]}
        onPress={onSend}
        disabled={!canSend}
        accessibilityRole="button"
        accessibilityLabel="Send your question"
        accessibilityState={{ disabled: !canSend }}
      >
        <Text style={styles.sendLabel}>Send</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: theme.minimumTouchTarget,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: theme.spacing(2),
    paddingVertical: theme.spacing(2),
    fontSize: theme.bodyFontSize,
    color: theme.colors.text,
  },
  sendButton: {
    marginTop: theme.spacing(2),
    minHeight: theme.minimumTouchTarget,
    borderRadius: 14,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: { opacity: 0.45 },
  sendButtonPressed: { opacity: 0.8 },
  sendLabel: { fontSize: 22, fontWeight: '700', color: '#FFFFFF' },
});
