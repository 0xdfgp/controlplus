import { ScrollView, StyleSheet, Text } from 'react-native';

import { theme } from './theme.ts';

/**
 * Shown only in the gap between the state changing and the first words landing.
 *
 * Plain language, present tense, and it names the wait rather than describing
 * machinery.
 */
export const RESPONDING_LABEL = 'Your answer is starting';

export interface RespondingStateProps {
  readonly question: string;
  readonly answer: string;
  readonly errorMessage: string | null;
}

/**
 * The responding state.
 *
 * 03's state table gives Responding as "Text appearing progressively", with no
 * label of its own. Once words are arriving they are the strongest possible
 * signal that the assistant is answering, and a label above them would compete
 * with the one thing the person came here to read — 03 asks for one primary
 * thing per screen.
 *
 * So the label covers only the gap before the first delta and gets out of the
 * way as soon as there is something to read. The echoed question stays, as E3
 * shows, so a slow reader never loses track of what was asked.
 *
 * Screen reader users are told the state changed either way: for them, text
 * arriving silently is not a signal at all.
 */
export function RespondingState({
  question,
  answer,
  errorMessage,
}: RespondingStateProps): React.JSX.Element {
  const hasText = answer.length > 0;
  const failed = errorMessage !== null;

  return (
    <ScrollView
      style={styles.answerArea}
      contentContainerStyle={styles.answerContent}
    >
      {!hasText && !failed ? (
        <Text style={styles.stateLabel} accessibilityLiveRegion="polite">
          {RESPONDING_LABEL}
        </Text>
      ) : null}

      <Text style={styles.question}>You asked: “{question}”</Text>

      {failed ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {errorMessage}
        </Text>
      ) : (
        <Text style={styles.answer} accessibilityLiveRegion="polite">
          {answer}
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  answerArea: { flex: 1 },
  answerContent: { paddingVertical: theme.spacing(2) },
  stateLabel: {
    fontSize: 24,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing(2),
  },
  question: {
    fontSize: theme.minimumBodyFontSize,
    fontStyle: 'italic',
    color: theme.colors.muted,
    marginBottom: theme.spacing(2),
  },
  answer: { fontSize: 22, lineHeight: 32, color: theme.colors.text },
  error: { fontSize: 22, lineHeight: 32, color: theme.colors.text },
});
