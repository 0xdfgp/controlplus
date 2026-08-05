import { Modal, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { DisclosurePill } from './disclosure-pill.tsx';
import { SupportFooter } from './support-footer.tsx';
import { theme } from './theme.ts';

export const CHOICE_HEADING = 'Add a photo';
export const BACK_LABEL = 'Go back';

/** What the control that opens this screen says, and what it promises. */
export const ADD_PHOTO_LABEL = 'Add a photo';
export const ADD_PHOTO_HINT =
  'Opens a screen where you can take a photo or choose one you already have';

export interface PhotoChoiceProps {
  readonly visible: boolean;
  readonly onCamera: () => void;
  readonly onLibrary: () => void;
  readonly onBack: () => void;
}

/**
 * The second step of adding a photo: take one, or choose one already taken.
 *
 * A whole screen rather than an action sheet, and that is the requirement, not a
 * preference. An action sheet dismisses when you tap beside it and slides away
 * on a downward drag, and 03-senior-ux-principles rules out both: no hidden
 * gestures, and nothing that dismisses itself. Someone whose hand shakes should
 * not lose the screen by touching it in the wrong place.
 *
 * `presentationStyle="fullScreen"` with `transparent={false}` is what removes
 * the iOS swipe-to-dismiss that the default sheet presentation has. There is
 * exactly one way out and it is a labelled button.
 *
 * `onRequestClose` is the Android hardware back button, which the platform
 * requires be handled. It is a system control rather than a hidden gesture, and
 * a screen a person cannot leave is a worse outcome than the rule it looks like
 * it bends.
 *
 * The disclosure pill and the support line come with it, because this screen
 * covers the one that was carrying them and ADR-026 says persistent.
 */
export function PhotoChoice({
  visible,
  onCamera,
  onLibrary,
  onBack,
}: PhotoChoiceProps): React.JSX.Element {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      presentationStyle="fullScreen"
      onRequestClose={onBack}
    >
      {/* Nested on purpose. On Android a Modal is its own native window, and
          the insets measured for the window underneath do not describe it —
          which is how "Go back" ends up under the gesture bar. */}
      <SafeAreaProvider>
        <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
          {/* Scrollable so that at 200% font scaling the two options can grow
              to three lines each and "Go back" is still something a person can
              reach rather than something below the bottom of the screen. */}
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            <DisclosurePill />

            <Text style={styles.heading} accessibilityRole="header">
              {CHOICE_HEADING}
            </Text>

            <Option
              label="Take a photo"
              hint="Opens the camera so you can photograph what is on your screen or in front of you"
              onPress={onCamera}
            />
            <Option
              label="Choose a photo"
              hint="Opens your photos so you can pick one you have already taken"
              onPress={onLibrary}
            />

            <Pressable
              style={({ pressed }) => [styles.back, pressed && styles.pressed]}
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel={BACK_LABEL}
              accessibilityHint="Closes this and returns to your question without adding a photo"
            >
              <Text style={styles.backLabel}>{BACK_LABEL}</Text>
            </Pressable>
          </ScrollView>

          <SupportFooter />
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

/**
 * One of the two ways in, with the sentence that says what it does.
 *
 * The hint is on screen rather than only in the accessibility layer. "Choose a
 * photo" and "Take a photo" are close enough in wording that someone reading
 * quickly can pick the wrong one, and the cost of that is a camera opening when
 * they wanted their album.
 */
function Option({
  label,
  hint,
  onPress,
}: {
  readonly label: string;
  readonly hint: string;
  readonly onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      style={({ pressed }) => [styles.option, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
    >
      <Text style={styles.optionLabel}>{label}</Text>
      <Text style={styles.optionHint}>{hint}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  body: { flex: 1 },
  content: {
    paddingHorizontal: theme.spacing(3),
    paddingBottom: theme.spacing(3),
  },
  heading: {
    fontSize: theme.headingFontSize,
    fontWeight: '700',
    color: theme.colors.text,
    marginTop: theme.spacing(3),
    marginBottom: theme.spacing(3),
  },
  // Far larger than the 60pt floor. This screen exists to make one choice, so
  // the two things being chosen between get the room.
  option: {
    minHeight: theme.minimumTouchTarget + 40,
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: theme.colors.tint,
    padding: theme.spacing(2.5),
    marginBottom: theme.spacing(2),
  },
  optionLabel: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.accent,
  },
  optionHint: {
    marginTop: theme.spacing(1),
    fontSize: theme.minimumBodyFontSize,
    lineHeight: 26,
    color: theme.colors.muted,
  },
  // The way out, and deliberately not styled as the loudest thing here: the
  // point of the screen is the choice above it.
  back: {
    minHeight: theme.minimumTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: theme.colors.accent,
    paddingHorizontal: theme.spacing(2),
    paddingVertical: theme.spacing(1.5),
    marginTop: theme.spacing(2),
  },
  pressed: { opacity: 0.8 },
  backLabel: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.accent,
    textAlign: 'center',
  },
});
