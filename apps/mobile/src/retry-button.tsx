import { Pressable, StyleSheet, Text } from 'react-native';

import { theme } from './theme.ts';

export const RETRY_LABEL = 'Try again';

export interface RetryButtonProps {
  readonly onPress: () => void;
}

/**
 * The way forward from a failed answer, as E8 draws it.
 *
 * One large primary action with nothing competing: while it is on screen it
 * stands where the composer stands the rest of the time, and the composer is not
 * drawn. That is 03-senior-ux-principles twice over — one primary action visible
 * per screen, and "Failed: plain explanation and one large retry button" — and it
 * is the whole of what E8's caption means by "the only action on screen".
 *
 * Two words, and they say what happens rather than what went wrong. The sentence
 * above it has already said that much, in plain language with no code and no
 * provider name in it; someone frightened by a scam message should not have to
 * read a second explanation to find the way out of one.
 *
 * No glyph. Stop needs its square because it interrupts something; this button
 * repeats something, and there is no symbol for that anyone has to learn.
 */
export function RetryButton({ onPress }: RetryButtonProps): React.JSX.Element {
  return (
    <Pressable
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={RETRY_LABEL}
      accessibilityHint="Sends your question again. You do not need to type it or take the photo again."
    >
      <Text style={styles.label}>{RETRY_LABEL}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Full width and past the 60pt target, like Stop and Send: the two controls
  // this audience reaches for under pressure are the two they must not miss.
  // The height comes from padding and a minimum rather than a fixed number, so a
  // label at 200% OS font scaling makes the button taller instead of clipped.
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: theme.minimumTouchTarget,
    borderRadius: 14,
    backgroundColor: theme.colors.accent,
    paddingHorizontal: theme.spacing(2),
    paddingVertical: theme.spacing(1.5),
  },
  pressed: { opacity: 0.8 },
  label: {
    fontSize: theme.bodyFontSize,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
});
