import { Pressable, StyleSheet, Text } from 'react-native';

import { theme } from './theme.ts';

export interface SecondaryButtonProps {
  readonly label: string;
  readonly hint: string;
  readonly onPress: () => void;
  readonly disabled: boolean;
}

/**
 * A way to ask that is not the primary one: adding a photo, or speaking.
 *
 * One component because the two sit side by side in a single row, and two
 * buttons of the same rank that do not look the same are one more thing to work
 * out. E1 and E7 both draw them as a matched pair.
 *
 * The label is words, never an icon alone (03-senior-ux-principles). The height
 * comes from a 60pt minimum and from padding rather than from a fixed number, so
 * a label that wraps at 200% OS font scaling makes the button taller instead of
 * being clipped by it.
 */
export function SecondaryButton({
  label,
  hint,
  onPress,
  disabled,
}: SecondaryButtonProps): React.JSX.Element {
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
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled }}
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flex: 1,
    minHeight: theme.minimumTouchTarget,
    borderRadius: 14,
    backgroundColor: theme.colors.tint,
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
