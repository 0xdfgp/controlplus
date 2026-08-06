import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Composer } from './composer.tsx';
import { ConversationView } from './conversation-view.tsx';
import { FirstQuestion } from './first-question.tsx';
import { FollowUp } from './follow-up.tsx';
import { RetryButton } from './retry-button.tsx';
import { ScreenHeader } from './screen-header.tsx';
import { StopButton } from './stop-button.tsx';
import { SupportFooter } from './support-footer.tsx';
import { theme } from './theme.ts';
import { canRetry, isInFlight, isVoiceTurn } from './turn-machine.ts';
import { usePhoto } from './use-photo.ts';
import { useTurn } from './use-turn.ts';
import { useVoice } from './use-voice.ts';
import { VoiceTurn } from './voice-turn.tsx';

export interface AskScreenProps {
  readonly baseUrl: string;
  readonly conversationId: string;
  /** Starts a fresh conversation. Owned above, which is where the id is. */
  readonly onNewConversation: () => void;
}

/**
 * The one screen. It reads the turn state machine and holds no state of its own
 * beyond the text being typed (ADR-022).
 *
 * Two shapes:
 *
 *   nothing asked yet    the question, centred, and the three ways to ask
 *   anything else        the conversation scrolling above, the input below
 *
 * That second shape is the implicit return ADR-022 asked for: a finished turn
 * leaves its words where they are, earlier turns stay above it, and the way to
 * ask again is always the same control in the same place. No "ask another
 * question", because the input already is one. A spoken question replaces the
 * composer while it is under way and nothing else — the conversation, if there
 * is one, stays exactly where it was.
 *
 * A failed turn is the one exception to "the input is below". There it gives its
 * place up to Try again — E8: one action, nothing beside it, nothing retyped.
 *
 * Two things sit outside every shape, above and below everything: the header
 * carrying the AI disclosure, and the support line. Neither is inside a branch,
 * and that is the whole of how ADR-026's "persistent across every state" is kept
 * true — there is no state in which the code could draw the screen without them.
 */
export function AskScreen({
  baseUrl,
  conversationId,
  onNewConversation,
}: AskScreenProps): React.JSX.Element {
  const [draft, setDraft] = useState('');
  const turn = useTurn(baseUrl, conversationId);
  const photo = usePhoto();

  // The transcript becomes the draft, so "Send this" and Send are the same act
  // on the same words. Nothing heard and a refused microphone both end the
  // voice turn the same way: back to idle, with a sentence below the input.
  const voice = useVoice({
    onTranscript: (transcript) => {
      setDraft(transcript);
      turn.transcribed();
    },
    onNothingHeard: turn.discard,
    onProblem: turn.discard,
  });

  const send = (): void => {
    turn.ask(draft, photo.photo);
    setDraft('');
    photo.clear();
    voice.clearMessage();
  };

  const speak = (): void => {
    setDraft('');
    turn.speak();
    voice.start();
  };

  const done = (): void => {
    turn.transcribe();
    voice.finish();
  };

  const started = turn.history.length > 0 || turn.question.length > 0;
  const inFlight = isInFlight(turn.state);
  const failed = canRetry(turn.state);
  const speaking = isVoiceTurn(turn.state);
  const notice = voice.message ?? photo.message;
  // Nothing to clear before the first question, and nothing on offer mid-turn,
  // which is what keeps it out of reach from the responding state.
  const newConversation = started && !inFlight ? onNewConversation : null;

  const composer = (placeholder: string): React.JSX.Element => (
    <Composer
      draft={draft}
      placeholder={placeholder}
      notice={notice}
      photoUri={photo.photo?.uri ?? null}
      busy={photo.busy}
      onChange={setDraft}
      onSend={send}
      onCamera={photo.fromCamera}
      onLibrary={photo.fromLibrary}
      onRemovePhoto={photo.clear}
      onSpeak={speak}
    />
  );

  const voicePanel = (
    <VoiceTurn
      state={turn.state}
      level={voice.level}
      transcript={draft}
      onDone={done}
      onChange={setDraft}
      onSend={send}
    />
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
            someone reading an answer. Dismissing the keyboard is handled where
            the taps land: keyboardShouldPersistTaps on the scroll regions. */}
        <View style={styles.body}>
          <ScreenHeader onNewConversation={newConversation} />

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
            // E4 and E6 are the whole screen for a first question.
            <FirstQuestion speaking={speaking}>
              {speaking ? voicePanel : composer('Type your question here')}
            </FirstQuestion>
          )}

          {turn.state === 'responding' ? (
            <StopButton onPress={turn.stop} />
          ) : null}

          {/* A spoken follow-up keeps the conversation above it, unlike E4 and
              E6, which are empty because they draw a first question. */}
          {started && (speaking || !inFlight) ? (
            <FollowUp>
              {speaking ? (
                voicePanel
              ) : failed ? (
                <RetryButton onPress={turn.retry} />
              ) : (
                composer('Ask another question')
              )}
            </FollowUp>
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
});
