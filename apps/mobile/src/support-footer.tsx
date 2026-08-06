import { StyleSheet, Text, View } from 'react-native';

import { theme } from './theme.ts';

/**
 * The published support number. Real, and not the 555-range placeholder the
 * design mockups carry, which ADR-026 said must never ship.
 */
export const SUPPORT_NUMBER = '+1 878 226 9119';

/**
 * The support line, now with the number on it.
 *
 * ADR-026 withheld the number until a real one existed, and named its own
 * condition for showing one: "Control+ publishes a support number that can be
 * shown". That condition is met, so this is the decision being carried out rather
 * than reopened.
 *
 * Still text, and still routes nothing. There is no human escalation in this
 * build (ADR-002); this exists so a frightened person can see that a way to reach
 * the company exists at all. Making it dial would turn a statement into a control,
 * which is a different decision from printing a number.
 *
 * At the 18pt body floor rather than above it, because it is the quietest thing
 * on the screen and should look like it. One line, which is what forced the
 * wording: "Contact Control+ support: " plus the number is 41 characters and does
 * not fit across 345pt at 18pt, and it wrapped with the last four digits alone on
 * a line of their own — a phone number broken in half is worse than a shorter
 * sentence. The company is still named and the number is still whole.
 */
export function SupportFooter(): React.JSX.Element {
  return (
    <View style={styles.container}>
      <Text style={styles.text} accessibilityRole="text">
        Control+ support: {SUPPORT_NUMBER}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    paddingTop: theme.spacing(1),
    paddingBottom: theme.spacing(0.5),
    // Narrower than the body's own margin, so the line has 361pt to sit in rather
    // than 345. The sentence measures roughly 302pt at 18pt, and the slack is
    // there because a wrapped phone number is the thing being avoided.
    paddingHorizontal: theme.spacing(2),
    alignItems: 'center',
  },
  text: {
    fontSize: theme.minimumBodyFontSize,
    lineHeight: 24,
    fontWeight: '600',
    color: theme.colors.accent,
    textAlign: 'center',
  },
});
