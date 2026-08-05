import { StyleSheet, Text, View } from 'react-native';

import { theme } from './theme.ts';

export const DISCLOSURE_LABEL = 'AI assistant, not a person';

/**
 * The persistent disclosure, as E1 to E8 all draw it (ADR-026).
 *
 * A pill at the top of every state, not a banner and not a first-screen notice.
 * 03-senior-ux-principles is explicit about why it persists: a user of 80
 * forgets mid-conversation what they are talking to, and forgets it hardest
 * when the answers are good. It is also the interface half of a legal
 * obligation, so it cannot be the thing that scrolls away.
 *
 * Not tappable, so the 60pt touch target does not apply and there is nothing
 * here to press by accident. It is a statement, not a control.
 *
 * The dot carries no meaning on its own — the words next to it do all the work,
 * which is 03's rule that an icon is never alone. Its only job is to stop the
 * pill reading as a button.
 *
 * The screen reader gets a sentence rather than the fragment on screen. "AI
 * assistant, not a person" read aloud out of context is ambiguous; the label
 * says who it is about.
 */
export function DisclosurePill(): React.JSX.Element {
  return (
    <View
      style={styles.pill}
      accessibilityRole="text"
      accessibilityLabel="You are talking to an AI assistant, not a person"
    >
      <View style={styles.dot} />
      <Text style={styles.label}>{DISCLOSURE_LABEL}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Shrink-wrapped rather than full width: a pill is what the design draws and
  // a full-width bar is the banner it says not to build. flex-start also means
  // that at 200% font scaling the pill grows around its text instead of the
  // text being clipped by a fixed shape.
  pill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '100%',
    // Its own breathing room, the same wherever it is used. Both places that
    // draw it want it at the top with the screen starting below.
    marginTop: theme.spacing(1),
    marginBottom: theme.spacing(2),
    backgroundColor: theme.colors.tint,
    borderRadius: 20,
    paddingHorizontal: theme.spacing(1.5),
    paddingVertical: theme.spacing(1),
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.accent,
    marginRight: theme.spacing(1),
  },
  // flexShrink so the words wrap to a second line inside the pill rather than
  // running off the edge of the screen when the OS font is scaled up.
  label: {
    flexShrink: 1,
    fontSize: theme.minimumBodyFontSize,
    fontWeight: '600',
    color: theme.colors.accent,
  },
});
