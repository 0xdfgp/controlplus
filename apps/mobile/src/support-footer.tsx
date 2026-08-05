import { StyleSheet, Text, View } from 'react-native';

import { theme } from './theme.ts';

/**
 * The support line.
 *
 * Text only, with no phone number. The number in the design mockups is in the
 * 555 range, which is a placeholder, and shipping a placeholder number to
 * someone who has just been frightened by a scam would be its own small harm.
 *
 * It stays, and that is a decision rather than an oversight. There is no human
 * escalation in this build (ADR-002) and this line routes nothing; it exists so
 * that a frightened person can see that a way to reach the company exists at all
 * (ADR-026). S6 makes it smaller, at the 18pt body floor rather than above it,
 * because it is the quietest thing on the screen and should look like it. It
 * does not make it optional.
 */
export function SupportFooter(): React.JSX.Element {
  return (
    <View style={styles.container}>
      <Text style={styles.text} accessibilityRole="text">
        Contact Control+ support
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    paddingTop: theme.spacing(1.5),
    paddingBottom: theme.spacing(0.5),
    paddingHorizontal: theme.spacing(3),
    alignItems: 'center',
  },
  text: {
    fontSize: theme.minimumBodyFontSize,
    fontWeight: '600',
    color: theme.colors.accent,
    textAlign: 'center',
  },
});
