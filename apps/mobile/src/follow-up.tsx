import { StyleSheet, View } from 'react-native';

import { theme } from './theme.ts';

export interface FollowUpProps {
  /** The composer, the transcript being checked, or Try again. One of them. */
  readonly children: React.ReactNode;
}

/**
 * The band below the conversation: whatever the way forward currently is.
 *
 * The divider E7 draws — the conversation above, the way to move on below. It
 * holds one thing at a time, and there being one region rather than three is what
 * makes that structural: the composer, a spoken question being checked, and Try
 * again cannot appear beside each other, because there is nowhere for a second
 * one to go. E8 asks for exactly that on a failed turn, and 03's "one primary
 * action visible per screen" asks for it on every other.
 *
 * flexShrink 0 keeps the promise that the conversation gets the screen and this
 * band takes only what it needs. The conversation above is flex 1, so it is the
 * thing that gives way when the OS font is scaled up and these controls grow —
 * rather than the controls being squeezed until a button is unreachable.
 *
 * Its own file rather than a style on the screen, for the reason
 * `first-question.tsx` records: the screen sits at the 200 line cap the ESLint
 * guard rail sets, and a band with its own layout rules is a self-contained thing
 * to lift out of it.
 */
export function FollowUp({ children }: FollowUpProps): React.JSX.Element {
  return <View style={styles.band}>{children}</View>;
}

const styles = StyleSheet.create({
  // Padding on both sides of the band, not just the top. Without the bottom, the
  // last control here sits flush against the support line's hairline and the two
  // read as one crowded block — which is what it did on the device.
  band: {
    flexShrink: 0,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: theme.spacing(1.5),
    paddingBottom: theme.spacing(1.5),
  },
});
