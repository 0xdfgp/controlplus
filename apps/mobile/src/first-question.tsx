import { ScrollView, StyleSheet, Text } from 'react-native';

import { theme } from './theme.ts';

export const FIRST_QUESTION_HEADING = 'What would you like help with?';

export interface FirstQuestionProps {
  /** The composer, or the voice panel that replaces it while speaking. */
  readonly children: React.ReactNode;
  /** True while a question is being spoken, when the heading would be noise. */
  readonly speaking: boolean;
}

/**
 * The screen before anything has been asked: the invitation, and the ways to
 * accept it. E1, and E4 and E6 when the first question is a spoken one.
 *
 * Scrollable, because it can be taller than what is left above the keyboard
 * once a photo is attached. Centred while it fits, which is what flexGrow with
 * justifyContent gives — and it stops being centred exactly when being centred
 * would push the Send button out of reach, which is the case S4 found on the
 * device.
 *
 * Its own file rather than a branch inside the screen. The screen is at the
 * 200 line cap the ESLint guard rail sets, and a first-question layout is a
 * self-contained thing to lift out of it.
 */
export function FirstQuestion({
  children,
  speaking,
}: FirstQuestionProps): React.JSX.Element {
  return (
    <ScrollView
      style={styles.region}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      {speaking ? null : (
        <Text style={styles.heading} accessibilityRole="header">
          {FIRST_QUESTION_HEADING}
        </Text>
      )}
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  region: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center' },
  heading: {
    fontSize: theme.headingFontSize,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: theme.spacing(3),
  },
});
