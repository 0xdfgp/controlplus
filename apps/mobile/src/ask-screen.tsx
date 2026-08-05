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

import { Composer } from './composer.tsx';
import { ConversationView } from './conversation-view.tsx';
import { StopButton } from './stop-button.tsx';
import { SupportFooter } from './support-footer.tsx';
import { theme } from './theme.ts';
import { isInFlight, isVoiceTurn } from './turn-machine.ts';
import { usePhoto } from './use-photo.ts';
import { useTurn } from './use-turn.ts';
import { useVoice } from './use-voice.ts';
import { VoiceTurn } from './voice-turn.tsx';

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
 * Deliberately absent, because the brief puts it in a later slice: the AI
 * disclosure chip (S6). E1 draws it; it is not built here.
 */
export function AskScreen({
  baseUrl,
  conversationId,
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
  const canAsk = !isInFlight(turn.state);
  const speaking = isVoiceTurn(turn.state);
  const notice = voice.message ?? photo.message;

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
              {/* E4 and E6 are the whole screen for a first question. */}
              {speaking ? null : (
                <Text style={styles.heading}>What would you like help with?</Text>
              )}
              {speaking ? voicePanel : composer('Type your question here')}
            </ScrollView>
          )}

          {turn.state === 'responding' ? (
            <StopButton onPress={turn.stop} />
          ) : null}

          {/* A follow-up keeps the conversation visible above it. E4 and E6
              draw an empty screen because they draw a first question; a spoken
              follow-up must not blank the answer it is following up on. */}
          {started && speaking ? (
            <View style={styles.followUp}>{voicePanel}</View>
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
  // The divider E7 draws: the conversation above, the way to ask again below.
  followUp: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: theme.spacing(2),
  },
});
