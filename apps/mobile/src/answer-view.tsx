import { Image, StyleSheet, Text, View } from 'react-native';

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
 * chose this, so it is not a warning and it is not an apology. A notice rather
 * than a failure, and lighter than the answer it sits above.
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
  /** The photo that went with the question, if there was one. */
  readonly photoUri?: string | null;
}

/**
 * One turn: what was asked, and what came back.
 *
 * The two are told apart by shape rather than by a label. The question sits in
 * a filled bubble against the right edge and the answer in a card against the
 * left, so a page of several turns reads as an exchange at a glance instead of
 * as one column of text in which the reader works out whose words are whose.
 *
 * The visible "You asked:" prefix is gone, because the bubble now says it. It
 * survives in the accessibility label, since a screen reader cannot see a
 * bubble and would otherwise hear two sentences with nothing between them.
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
  photoUri = null,
}: AnswerViewProps): React.JSX.Element {
  const failed = errorMessage !== null && state === 'failed';
  const waiting = state === 'responding' && answer.length === 0 && !failed;
  const announce = live ? 'polite' : 'none';

  return (
    <View style={styles.turn}>
      {photoUri === null ? null : (
        <Image
          source={{ uri: photoUri }}
          style={styles.photo}
          resizeMode="contain"
          // Above the question and the answer, in the order it happened: the
          // photo went first. A screen reader walks the same path an eye does.
          accessibilityLabel="The photo you sent with this question"
        />
      )}

      <View style={styles.questionRow}>
        <View style={styles.questionBubble}>
          <Text
            style={styles.questionText}
            accessibilityLabel={`You asked: ${question}`}
          >
            {question}
          </Text>
        </View>
      </View>

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

      {failed ? (
        <Text style={styles.error} accessibilityLiveRegion={announce}>
          {errorMessage}
        </Text>
      ) : null}

      {/* No card until there are words to put in one. An answer that has not
          started yet, and a turn stopped before its first delta, would
          otherwise draw an empty box where the answer is about to be. */}
      {!failed && answer.length > 0 ? (
        <View style={styles.answerCard}>
          <Text style={styles.answer} accessibilityLiveRegion={announce}>
            {answer}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Turns are separated by space rather than by a rule. A conversation of
  // boxed-off exchanges reads as a form; this reads as a page. Three steps and
  // not five: at five the gap did more work than the words.
  turn: { marginBottom: theme.spacing(3) },
  // Against the right edge, which is the one thing on this screen that is: it
  // is what makes the question read as the user's own without a label saying so.
  questionRow: { alignItems: 'flex-end' },
  questionBubble: {
    maxWidth: '85%',
    backgroundColor: theme.colors.tint,
    borderRadius: 18,
    borderBottomRightRadius: 4,
    paddingHorizontal: theme.spacing(2),
    paddingVertical: theme.spacing(1.5),
  },
  questionText: {
    fontSize: theme.bodyFontSize,
    lineHeight: 28,
    color: theme.colors.text,
  },
  stateLabel: {
    fontSize: 22,
    fontWeight: '600',
    color: theme.colors.text,
    marginTop: theme.spacing(2),
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
    marginTop: theme.spacing(2),
    marginBottom: theme.spacing(1),
  },
  photo: {
    width: '100%',
    height: 220,
    borderRadius: 14,
    backgroundColor: theme.colors.tint,
    marginBottom: theme.spacing(2),
  },
  // The answer is the thing on the screen: its own surface, the widest block and
  // the largest text — 20pt, above 03's floor and scaling with the OS setting.
  answerCard: {
    marginTop: theme.spacing(1.5),
    marginRight: theme.spacing(3),
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    paddingHorizontal: theme.spacing(2),
    paddingVertical: theme.spacing(1.5),
  },
  answer: { fontSize: theme.bodyFontSize, lineHeight: 28, color: theme.colors.text },
  // Lighter than an answer, by three things at once: the body floor rather than
  // answer size, the muted colour rather than full black, and no card behind it.
  // A turn that failed is information about the turn; it is not the answer, and
  // it should not be the heaviest thing a frightened person sees.
  error: {
    marginTop: theme.spacing(2),
    fontSize: theme.minimumBodyFontSize,
    lineHeight: 26,
    color: theme.colors.muted,
  },
});
