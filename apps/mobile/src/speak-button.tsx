import { Pressable, StyleSheet, Text } from 'react-native';

import { theme } from './theme.ts';

export const SPEAK_LABEL = 'Speak instead';

export interface SpeakButtonProps {
  readonly onPress: () => void;
  readonly disabled: boolean;
}

/**
 * The third way to ask, on the resting screen (E1).
 *
 * A plain tap, and only a tap. `onPress` fires on release, so a hand resting on
 * the screen does not start a recording and a tremor does not end one early:
 * 03-senior-ux-principles rules out press-and-hold for exactly this audience.
 *
 * Full width, below the two photo buttons rather than beside them. E1 draws two
 * buttons in one row, but S4 legitimately split "Add a photo" into "Take a
 * photo" and "Choose a photo", each with a text label rather than an icon, and
 * three 60pt targets with readable labels do not fit one row at this font size.
 * Making them fit would mean shrinking the text or dropping the labels, and
 * both are worse than a second row. Reported rather than done quietly.
 */
export function SpeakButton({
  onPress,
  disabled,
}: SpeakButtonProps): React.JSX.Element {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={SPEAK_LABEL}
      accessibilityHint="Records your question and writes it down, so you can check it before sending"
      accessibilityState={{ disabled }}
    >
      <Text style={styles.label}>{SPEAK_LABEL}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    marginTop: theme.spacing(2),
    minHeight: theme.minimumTouchTarget,
    borderRadius: 14,
    backgroundColor: '#E4E6F6',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing(1),
    paddingVertical: theme.spacing(1.5),
  },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
  label: {
    fontSize: theme.minimumBodyFontSize,
    fontWeight: '600',
    color: theme.colors.accent,
    textAlign: 'center',
  },
});
