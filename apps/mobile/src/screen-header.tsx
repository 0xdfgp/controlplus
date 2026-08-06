import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DisclosurePill } from './disclosure-pill.tsx';
import { theme } from './theme.ts';

/**
 * What the button says, and what it says to a screen reader.
 *
 * The two differ, and that is the deliberate part. The disclosure pill next to it
 * is 281pt wide on a 393pt screen, so at the 18pt body floor there is room for
 * about three characters beside it — and the alternative to three characters was
 * a second row, which is what this replaced. "New" on its own does not say new
 * what, so the full sentence is what is announced, the same trade
 * `disclosure-pill.tsx` makes when it reads out more than it draws.
 */
export const NEW_CONVERSATION_LABEL = 'New';
export const NEW_CONVERSATION_ANNOUNCED = 'Start a new conversation';

export interface ScreenHeaderProps {
  /**
   * Starts a fresh conversation, or null when that is not on offer: nothing has
   * been asked yet, or a turn is under way.
   *
   * Null rather than a disabled flag, deliberately. A control this audience can
   * press to no effect reads as an app that has broken, and the brief requires
   * that starting a new conversation not be reachable by accident while an
   * answer is arriving — a control that is not drawn cannot be hit at all.
   */
  readonly onNewConversation: (() => void) | null;
}

/**
 * The row above everything: what you are talking to, and the way to start again.
 *
 * Its own file rather than a branch inside the screen, for the reason
 * `first-question.tsx` records: the screen sits at the 200 line cap the ESLint
 * guard rail sets, and a header row is a self-contained thing to lift out of it.
 *
 * Starting again is put here, at the top, because of where it must not be. It
 * clears the screen, so a stray tap costs the person the answer they were
 * reading; the input and Send are at the bottom, which is where a thumb rests
 * and where every deliberate action on this screen already happens. This is the
 * furthest point from all of it, and it never moves.
 *
 * A word rather than an icon, because 03 does not let an icon carry a meaning on
 * its own. The word is three letters, which is what fits beside the pill, and the
 * accessible label carries the whole sentence instead.
 */
export function ScreenHeader({
  onNewConversation,
}: ScreenHeaderProps): React.JSX.Element {
  return (
    <View style={styles.row}>
      <DisclosurePill />

      {onNewConversation === null ? null : (
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          onPress={onNewConversation}
          accessibilityRole="button"
          accessibilityLabel={NEW_CONVERSATION_ANNOUNCED}
          accessibilityHint="Clears this conversation and starts a new one. What you have asked so far is kept, it is no longer on screen."
        >
          <Text style={styles.label}>{NEW_CONVERSATION_LABEL}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // One row, both packed to the left, with the far end of it left empty. That
  // empty corner is the point: the top right is where floating things live, and
  // the development client parks its own menu bubble at exactly x 328 to 376 on a
  // 393pt screen. A control under it is a control that cannot be pressed, and
  // "only in development" is not a good enough reason to ship a layout that has a
  // dead button in one of the two places this runs.
  //
  // There was nowhere else on this row to put it. The pill measures 253pt of the
  // 345pt available, so the gap between its edge and that bubble is 51pt — less
  // than the word plus the padding a shaking hand needs.
  //
  // row-reverse rather than reordering the children, so what a screen reader
  // reads is still the disclosure first and the utility button second. On an
  // anti-scam product, what you are talking to is heard before the furniture.
  row: {
    flexDirection: 'row-reverse',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: theme.spacing(1),
  },
  // Outlined rather than filled, and that is deliberate next to the pill. The
  // pill is a statement and says in its own file that its dot exists to stop it
  // reading as a button; a second filled shape of the same size would undo that,
  // where a border says "this one you press" without shouting it.
  //
  // The 60pt rule applies even though it looks like text, and the padding is what
  // is actually aimed at — which matters most here, because the word is three
  // letters long.
  button: {
    flexShrink: 0,
    minHeight: theme.minimumTouchTarget,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing(1.5),
    borderWidth: 1,
    borderColor: theme.colors.accent,
    borderRadius: 14,
  },
  pressed: { opacity: 0.6 },
  label: {
    fontSize: theme.minimumBodyFontSize,
    fontWeight: '600',
    color: theme.colors.accent,
  },
});
