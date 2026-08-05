import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from './theme.ts';

export interface PhotoButtonsProps {
  readonly onCamera: () => void;
  readonly onLibrary: () => void;
  readonly disabled: boolean;
}

/**
 * The two ways to add a photo, both on the resting screen (E1).
 *
 * Not one "Add a photo" button opening a menu. E1 puts every way to ask in
 * front of the person at once, so there is no decision about which method to
 * use before they can even start, and no second tap to discover what the first
 * one does.
 *
 * Each carries a text label rather than an icon alone: an icon is a guess about
 * shared visual vocabulary, and this audience did not grow up with these ones.
 */
export function PhotoButtons({
  onCamera,
  onLibrary,
  disabled,
}: PhotoButtonsProps): React.JSX.Element {
  return (
    <View style={styles.row}>
      <PhotoButton
        label="Take a photo"
        hint="Opens the camera so you can photograph what is on your screen or in front of you"
        onPress={onCamera}
        disabled={disabled}
      />
      <PhotoButton
        label="Choose a photo"
        hint="Opens your photos so you can pick one you already have"
        onPress={onLibrary}
        disabled={disabled}
      />
    </View>
  );
}

function PhotoButton({
  label,
  hint,
  onPress,
  disabled,
}: {
  readonly label: string;
  readonly hint: string;
  readonly onPress: () => void;
  readonly disabled: boolean;
}): React.JSX.Element {
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
  row: { flexDirection: 'row', gap: theme.spacing(2), marginTop: theme.spacing(2) },
  button: {
    flex: 1,
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
