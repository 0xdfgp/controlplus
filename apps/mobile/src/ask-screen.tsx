import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConversationView } from './conversation-view.tsx';
import { PhotoButtons } from './photo-buttons.tsx';
import { PhotoPreview } from './photo-preview.tsx';
import { QuestionInput } from './question-input.tsx';
import { StopButton } from './stop-button.tsx';
import { SupportFooter } from './support-footer.tsx';
import { theme } from './theme.ts';
import { isInFlight } from './turn-machine.ts';
import { usePhoto } from './use-photo.ts';
import { useTurn } from './use-turn.ts';

export interface AskScreenProps {
  readonly baseUrl: string;
  readonly conversationId: string;
}

/**
 * The one screen. It reads the turn state machine and holds no state of its own
 * beyond the text being typed (ADR-022).
 *
 * Two shapes:
 *
 *   nothing asked yet    the question, centred, and the two photo buttons
 *   anything else        the conversation scrolling above, the input below
 *
 * That second shape is the implicit return ADR-022 asked for, now spread over a
 * conversation rather than a single answer: a finished turn leaves its words
 * where they are, earlier turns stay above it, and the way to ask again is
 * always the same control in the same place. No "ask another question", because
 * the input already is one.
 *
 * Deliberately absent, because the brief puts them in later slices: "Speak
 * instead" (S5) and the AI disclosure chip (S6). E1 draws them; they are not
 * built here.
 */
export function AskScreen({
  baseUrl,
  conversationId,
}: AskScreenProps): React.JSX.Element {
  const [draft, setDraft] = useState('');
  const turn = useTurn(baseUrl, conversationId);
  const photo = usePhoto();

  const send = (): void => {
    turn.ask(draft, photo.photo);
    setDraft('');
    photo.clear();
  };

  const started = turn.history.length > 0 || turn.question.length > 0;
  const canAsk = !isInFlight(turn.state);

  /**
   * The photo and the way to ask about it, wherever asking is possible.
   *
   * One block rather than two, because the first question and every follow up
   * offer exactly the same three ways to ask. E1 is explicit that none of them
   * is hidden behind a menu.
   */
  const composer = (placeholder: string): React.JSX.Element => (
    <View>
      {photo.photo === null ? null : (
        <PhotoPreview
          uri={photo.photo.uri}
          onRetake={photo.fromCamera}
          onRemove={photo.clear}
        />
      )}

      {photo.message === null ? null : (
        <Text style={styles.notice} accessibilityLiveRegion="polite">
          {photo.message}
        </Text>
      )}

      <QuestionInput
        draft={draft}
        placeholder={placeholder}
        onChange={setDraft}
        onSend={send}
      />

      {photo.photo === null ? (
        <PhotoButtons
          onCamera={photo.fromCamera}
          onLibrary={photo.fromLibrary}
          disabled={photo.busy}
        />
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* A plain View, and it has to stay one. Wrapping this in a Pressable
            to catch stray taps also claims the touch responder on touch-down —
            Pressability answers true to onStartShouldSetResponder — which
            cancels the touch to the native scroll view underneath. Taps keep
            working and scrolling stops dead, which is a horrible thing to hand
            someone reading an answer.

            Dismissing the keyboard is handled where the taps actually land:
            keyboardShouldPersistTaps on the two scroll regions below. */}
        <View style={styles.body}>
          {started ? (
            <ConversationView
              history={turn.history}
              state={turn.state}
              question={turn.question}
              answer={turn.answer}
              errorMessage={turn.errorMessage}
              photoUri={turn.photoUri}
              progress={turn.progress}
            />
          ) : (
            // Scrollable, because it can be taller than what is left above the
            // keyboard once a photo is attached. Centred while it fits, which
            // is what flexGrow with justifyContent gives.
            <ScrollView
              style={styles.first}
              contentContainerStyle={styles.firstContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
              <Text style={styles.heading}>What would you like help with?</Text>
              {composer('Type your question here')}
            </ScrollView>
          )}

          {turn.state === 'responding' ? (
            <StopButton onPress={turn.stop} />
          ) : null}

          {started && canAsk ? (
            <View style={styles.followUp}>{composer('Ask another question')}</View>
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
  first: { flex: 1 },
  // Centred when there is room, scrollable when there is not — which is the
  // case the moment a photo is attached and the keyboard is up.
  firstContent: { flexGrow: 1, justifyContent: 'center' },
  heading: {
    fontSize: theme.headingFontSize,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: theme.spacing(3),
  },
  // A refused permission or a photo that is too big. Same size and colour as
  // the answer text: it is a sentence to read, not damage to notice.
  notice: {
    fontSize: theme.minimumBodyFontSize,
    lineHeight: 26,
    color: theme.colors.text,
    marginBottom: theme.spacing(2),
  },
  // The divider E7 draws: the conversation above, the way to ask again below.
  followUp: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: theme.spacing(2),
  },
});
