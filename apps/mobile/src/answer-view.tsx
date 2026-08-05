import { StyleSheet, Text, View } from 'react-native';

import { theme } from './theme.ts';
import type { TurnState } from './turn-machine.ts';

/**
 * Shown only in the gap between the state changing and the first words landing.
 *
 * Plain language, present tense, and it names the wait rather than describing
 * machinery.
 */
export const RESPONDING_LABEL = 'Your answer is starting';

/**
 * The stopped marker from E7.
 *
 * One word, small and neutral. It says what happened and nothing more: the user
 * chose this, so it is not a warning and it is not an apology.
 */
export const STOPPED_LABEL = 'Stopped';

export interface AnswerViewProps {
  readonly state: TurnState;
  readonly question: string;
  readonly answer: string;
  readonly errorMessage: string | null;
  /**
   * Whether this is the turn happening now.
   *
   * Only the newest turn announces itself. Every past answer being a live
   * region would mean a screen reader re-reading the whole conversation each
   * time anything on the screen changed, which is worse than silence.
   */
  readonly live: boolean;
}

/**
 * One turn: what was asked, and what came back.
 *
 * One component rather than one per state, because the words on screen do not
 * move when the turn ends. E7 is explicit about it: a stopped answer keeps the
 * same text colour and the same layout as a live one, and gains only the small
 * label above it. The same component draws a turn that finished several
 * questions ago, so nothing shifts as it scrolls up either.
 *
 * Screen reader users are told the newest state changed: for them, text
 * arriving silently is not a signal at all.
 */
export function AnswerView({
  state,
  question,
  answer,
  errorMessage,
  live,
}: AnswerViewProps): React.JSX.Element {
  const failed = errorMessage !== null && state === 'failed';
  const waiting = state === 'responding' && answer.length === 0 && !failed;
  const announce = live ? 'polite' : 'none';

  return (
    <View style={styles.turn}>
      {waiting ? (
        <Text style={styles.stateLabel} accessibilityLiveRegion={announce}>
          {RESPONDING_LABEL}
        </Text>
      ) : null}

      {state === 'stopped' ? (
        <Text style={styles.stoppedLabel} accessibilityLiveRegion={announce}>
          {STOPPED_LABEL}
        </Text>
      ) : null}

      <Text style={styles.question}>You asked: “{question}”</Text>

      {failed ? (
        <Text style={styles.error} accessibilityLiveRegion={announce}>
          {errorMessage}
        </Text>
      ) : (
        <Text style={styles.answer} accessibilityLiveRegion={announce}>
          {answer}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Turns are separated by space rather than by a rule. A conversation of
  // boxed-off exchanges reads as a form; this reads as a page.
  turn: { marginBottom: theme.spacing(4) },
  stateLabel: {
    fontSize: 24,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing(2),
  },
  stoppedLabel: {
    alignSelf: 'flex-start',
    fontSize: theme.minimumBodyFontSize,
    fontWeight: '600',
    color: theme.colors.muted,
    backgroundColor: theme.colors.border,
    borderRadius: 12,
    overflow: 'hidden',
    paddingHorizontal: theme.spacing(1.5),
    paddingVertical: theme.spacing(0.5),
    marginBottom: theme.spacing(2),
  },
  question: {
    fontSize: theme.minimumBodyFontSize,
    fontStyle: 'italic',
    color: theme.colors.muted,
    marginBottom: theme.spacing(2),
  },
  // Same size, same colour as the answer. A failure is a sentence, not a state
  // the eye should read as damage.
  answer: { fontSize: 22, lineHeight: 32, color: theme.colors.text },
  error: { fontSize: 22, lineHeight: 32, color: theme.colors.text },
});
