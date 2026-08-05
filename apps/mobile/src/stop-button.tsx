import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from './theme.ts';

export const STOP_LABEL = 'Stop';

export interface StopButtonProps {
  readonly onPress: () => void;
}

/**
 * The Stop control, as E3 draws it.
 *
 * The only action on screen while an answer is arriving, and sized for that: it
 * spans the width and clears the 60pt touch target, so a shaking hand or a poor
 * aim still lands on it.
 *
 * The square is paired with the word, never used alone. A glyph on its own asks
 * the reader to know a convention, and 03 says the label carries the meaning.
 */
export function StopButton({ onPress }: StopButtonProps): React.JSX.Element {
  return (
    <Pressable
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Stop this answer"
    >
      <View style={styles.glyph} />
      <Text style={styles.label}>{STOP_LABEL}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: theme.minimumTouchTarget,
    borderRadius: 14,
    backgroundColor: theme.colors.accent,
    marginTop: theme.spacing(2),
  },
  pressed: { opacity: 0.8 },
  glyph: {
    width: 20,
    height: 20,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    marginRight: theme.spacing(1.5),
  },
  label: { fontSize: 22, fontWeight: '700', color: '#FFFFFF' },
});
