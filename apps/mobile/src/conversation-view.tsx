import { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { AnswerView } from './answer-view.tsx';
import type { LoggedTurn } from './conversation-log.ts';
import { theme } from './theme.ts';
import { ThinkingIndicator } from './thinking-indicator.tsx';
import type { TurnState } from './turn-machine.ts';
import { UploadingView } from './uploading-view.tsx';

export interface ConversationViewProps {
  readonly history: readonly LoggedTurn[];
  readonly state: TurnState;
  /** The live turn's question. Empty when no turn is in flight or fresh. */
  readonly question: string;
  readonly answer: string;
  readonly errorMessage: string | null;
  readonly photoUri: string | null;
  readonly progress: number | null;
}

/**
 * The conversation, oldest at the top.
 *
 * Reading order is source order: for every turn, the question and then the
 * answer to it. A screen reader walks the same path an eye does, which is the
 * whole requirement — nothing is repositioned to look tidier than it reads.
 *
 * The scroll region ends at the newest turn and the input sits below it, outside
 * this component, so the way to ask again never moves.
 */
export function ConversationView({
  history,
  state,
  question,
  answer,
  errorMessage,
  photoUri,
  progress,
}: ConversationViewProps): React.JSX.Element {
  const scroll = useRef<ScrollView>(null);
  const hasLiveTurn = question.length > 0;
  const turnCount = history.length + (hasLiveTurn ? 1 : 0);

  /**
   * Scrolls when a turn is added, which is when a question is sent.
   *
   * Deliberately not on every delta: text sliding under someone's eyes while
   * they are reading it is the behaviour this audience finds hardest, and a
   * finished turn moving into the history does not change the count, so it does
   * not move the page either.
   */
  useEffect(() => {
    if (turnCount > 1) {
      scroll.current?.scrollToEnd({ animated: true });
    }
  }, [turnCount]);

  return (
    <ScrollView
      ref={scroll}
      style={styles.region}
      contentContainerStyle={styles.content}
      accessibilityLabel="Your conversation so far"
      // Without this a tap while the keyboard is up is spent closing the
      // keyboard and never reaches what was tapped, so the first press of any
      // button does nothing. "handled" gives both behaviours at once: a tap on
      // a control works, and a tap on empty space puts the keyboard away.
      keyboardShouldPersistTaps="handled"
      // Reading the answer is a reason to want the keyboard gone. Starting to
      // scroll says so without needing to aim at anything.
      keyboardDismissMode="on-drag"
    >
      {history.map((turn, index) => (
        <AnswerView
          key={`${index}-${turn.question}`}
          state={turn.state}
          question={turn.question}
          answer={turn.answer}
          errorMessage={turn.errorMessage}
          photoUri={turn.photoUri}
          live={false}
        />
      ))}

      {/* While the photo is still going out there is no turn to render yet:
          E5 is the whole screen, and the question appears with it once the
          upload finishes. */}
      {state === 'uploading' ? (
        <UploadingView photoUri={photoUri} progress={progress} />
      ) : null}

      {hasLiveTurn && state !== 'uploading' ? (
        <AnswerView
          state={state}
          question={question}
          answer={answer}
          errorMessage={errorMessage}
          photoUri={photoUri}
          live
        />
      ) : null}

      {state === 'thinking' ? <ThinkingIndicator /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  region: { flex: 1 },
  content: { paddingVertical: theme.spacing(2) },
});
