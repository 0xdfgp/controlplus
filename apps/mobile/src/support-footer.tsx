import { StyleSheet, Text, View } from 'react-native';

import { theme } from './theme.ts';

/**
 * The support line.
 *
 * Text only, with no phone number. The number in the design mockups is in the
 * 555 range, which is a placeholder, and shipping a placeholder number to
 * someone who has just been frightened by a scam would be its own small harm.
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
    paddingTop: theme.spacing(2),
    paddingBottom: theme.spacing(1),
    alignItems: 'center',
  },
  text: {
    fontSize: theme.bodyFontSize,
    fontWeight: '600',
    color: theme.colors.accent,
  },
});
