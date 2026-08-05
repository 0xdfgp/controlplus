import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnswerView } from './answer-view.tsx';
import { QuestionInput } from './question-input.tsx';
import { StopButton } from './stop-button.tsx';
import { SupportFooter } from './support-footer.tsx';
import { theme } from './theme.ts';
import { ThinkingIndicator } from './thinking-indicator.tsx';
import { isInFlight } from './turn-machine.ts';
import { useTurn } from './use-turn.ts';

export interface AskScreenProps {
  readonly baseUrl: string;
  readonly conversationId: string;
}

/**
 * The one screen. It reads the turn state machine and holds no state of its own
 * beyond the text being typed (ADR-022).
 *
 * Four shapes, from five states:
 *
 *   idle, nothing asked yet  the question, and nothing else
 *   thinking                 the waiting indicator, alone
 *   responding               the answer as it builds, and Stop
 *   idle / stopped / failed  the answer, and the input ready below it
 *
 * That last row is the implicit return: a finished turn leaves its answer where
 * it is and puts the way to ask again underneath. No "ask another question"
 * control, because the input already is one.
 *
 * Deliberately absent, because the brief puts them in later slices: "Add a
 * photo" (S4), "Speak instead" (S5) and the AI disclosure chip (S6). E7 draws
 * them; they are not built here.
 */
export function AskScreen({
  baseUrl,
  conversationId,
}: AskScreenProps): React.JSX.Element {
  const [draft, setDraft] = useState('');
  const turn = useTurn(baseUrl, conversationId);

  const send = (): void => {
    turn.ask(draft);
    setDraft('');
  };

  const hasAnswered = turn.question.length > 0;
  const canAsk = !isInFlight(turn.state);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.body}>
          {turn.state === 'thinking' ? <ThinkingIndicator /> : null}

          {canAsk && !hasAnswered ? (
            <View style={styles.first}>
              <Text style={styles.heading}>What would you like help with?</Text>
              <QuestionInput
                draft={draft}
                placeholder="Type your question here"
                onChange={setDraft}
                onSend={send}
              />
            </View>
          ) : null}

          {hasAnswered && turn.state !== 'thinking' ? (
            <AnswerView
              state={turn.state}
              question={turn.question}
              answer={turn.answer}
              errorMessage={turn.errorMessage}
            />
          ) : null}

          {turn.state === 'responding' ? (
            <StopButton onPress={turn.stop} />
          ) : null}

          {canAsk && hasAnswered ? (
            <View style={styles.followUp}>
              <QuestionInput
                draft={draft}
                placeholder="Ask another question"
                onChange={setDraft}
                onSend={send}
              />
            </View>
          ) : null}
        </View>

        <SupportFooter />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  body: { flex: 1, paddingHorizontal: theme.spacing(3) },
  first: { flex: 1, justifyContent: 'center' },
  heading: {
    fontSize: theme.headingFontSize,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: theme.spacing(3),
  },
  // The divider E7 draws: the answer above, the way to ask again below.
  followUp: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: theme.spacing(2),
  },
});
