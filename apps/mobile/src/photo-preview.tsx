import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from './theme.ts';

export interface PhotoPreviewProps {
  readonly uri: string;
  readonly onRetake: () => void;
  readonly onRemove: () => void;
}

/**
 * The photo, while the question about it is being typed.
 *
 * It stays on screen for two reasons. It is the retake: someone who can see
 * that the picture is blurry fixes it before sending rather than after being
 * told. And it is what the question is about, so writing "what does this say?"
 * makes sense with the thing in view.
 *
 * A thumbnail beside its controls rather than a full-width picture. Shown large
 * it took 300pt of a screen that has 416pt above the keyboard, which pushed the
 * Send button out of reach exactly when a photo was attached — the one case
 * this slice exists for. Small enough to check, small enough to leave room for
 * the thing you press next.
 *
 * Both controls are words, not an X in a corner. A small icon on a photo is the
 * hardest kind of target to hit with unsteady hands, and the least obvious.
 */
export function PhotoPreview({
  uri,
  onRetake,
  onRemove,
}: PhotoPreviewProps): React.JSX.Element {
  return (
    <View style={styles.block}>
      <Image
        source={{ uri }}
        style={styles.photo}
        resizeMode="cover"
        accessibilityLabel="The photo you are about to send"
      />

      <View style={styles.column}>
        <Text style={styles.caption}>This photo will go with your question.</Text>

        <View style={styles.row}>
          <Pressable
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}
            onPress={onRetake}
            accessibilityRole="button"
            accessibilityLabel="Use a different photo"
            accessibilityHint="Opens the camera again so you can take another one"
          >
            <Text style={styles.actionLabel}>Different photo</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}
            onPress={onRemove}
            accessibilityRole="button"
            accessibilityLabel="Send without a photo"
            accessibilityHint="Removes the photo and sends only your question"
          >
            <Text style={styles.actionLabel}>Remove it</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing(2),
    marginBottom: theme.spacing(2),
  },
  photo: {
    width: 96,
    height: 96,
    borderRadius: 12,
    backgroundColor: theme.colors.tint,
  },
  column: { flex: 1 },
  caption: {
    fontSize: theme.minimumBodyFontSize,
    color: theme.colors.muted,
    marginBottom: theme.spacing(0.5),
  },
  row: { flexDirection: 'row', gap: theme.spacing(2) },
  // Still the full 60pt target, laid out beside the picture rather than under
  // it: the height comes from the touch target, not from the text.
  action: {
    flex: 1,
    minHeight: theme.minimumTouchTarget,
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
  actionLabel: {
    fontSize: theme.minimumBodyFontSize,
    fontWeight: '600',
    color: theme.colors.accent,
  },
});
