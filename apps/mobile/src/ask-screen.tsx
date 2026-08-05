import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RespondingState } from './responding-state.tsx';
import { SupportFooter } from './support-footer.tsx';
import { theme } from './theme.ts';
import { ThinkingIndicator } from './thinking-indicator.tsx';
import { useTurn } from './use-turn.ts';

export interface AskScreenProps {
  readonly baseUrl: string;
  readonly conversationId: string;
}

/**
 * The one screen. Three states: idle, thinking, responding.
 *
 * Deliberately absent, because the brief puts them in later slices: the Stop
 * button (S2), "Add a photo" (S4), "Speak instead" (S5) and the AI disclosure
 * chip (S6). They appear in the design mockups; they are not built here.
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

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.body}>
          {turn.state === 'idle' ? (
            <IdleState
              draft={draft}
              onChange={setDraft}
              onSend={send}
            />
          ) : null}

          {turn.state === 'thinking' ? <ThinkingIndicator /> : null}

          {turn.state === 'responding' ? (
            <RespondingState
              question={turn.question}
              answer={turn.answer}
              errorMessage={turn.errorMessage}
            />
          ) : null}
        </View>

        <SupportFooter />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function IdleState({
  draft,
  onChange,
  onSend,
}: {
  draft: string;
  onChange: (value: string) => void;
  onSend: () => void;
}): React.JSX.Element {
  const canSend = draft.trim().length > 0;

  return (
    <View style={styles.idle}>
      <Text style={styles.heading}>What would you like help with?</Text>

      <TextInput
        style={styles.input}
        value={draft}
        onChangeText={onChange}
        placeholder="Type your question here"
        placeholderTextColor={theme.colors.muted}
        accessibilityLabel="Your question"
        multiline
        returnKeyType="send"
        onSubmitEditing={onSend}
      />

      <Pressable
        style={({ pressed }) => [
          styles.sendButton,
          !canSend && styles.sendButtonDisabled,
          pressed && canSend && styles.sendButtonPressed,
        ]}
        onPress={onSend}
        disabled={!canSend}
        accessibilityRole="button"
        accessibilityLabel="Send your question"
        accessibilityState={{ disabled: !canSend }}
      >
        <Text style={styles.sendLabel}>Send</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  body: { flex: 1, paddingHorizontal: theme.spacing(3) },
  idle: { flex: 1, justifyContent: 'center' },
  heading: {
    fontSize: theme.headingFontSize,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: theme.spacing(3),
  },
  input: {
    minHeight: theme.minimumTouchTarget,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: theme.spacing(2),
    paddingVertical: theme.spacing(2),
    fontSize: theme.bodyFontSize,
    color: theme.colors.text,
  },
  sendButton: {
    marginTop: theme.spacing(2),
    minHeight: theme.minimumTouchTarget,
    borderRadius: 14,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: { opacity: 0.45 },
  sendButtonPressed: { opacity: 0.8 },
  sendLabel: { fontSize: 22, fontWeight: '700', color: '#FFFFFF' },
});
