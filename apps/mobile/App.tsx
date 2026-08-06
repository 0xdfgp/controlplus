import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AskScreen } from './src/ask-screen.tsx';
import { apiBaseUrl } from './src/config.ts';
import { newConversationId } from './src/conversation-id.ts';

export default function App(): React.JSX.Element {
  // Which conversation the app is in. Starting a new one is a new id and nothing
  // else: the API creates the conversation on first use, so there is no request
  // to make here and nothing on the server to tell. The previous conversation and
  // its messages stay where they are; they are only no longer on screen.
  const [conversationId, setConversationId] = useState(newConversationId);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {/* The key is the clearing, and it is deliberate. Changing it remounts the
          screen and every hook beneath it, so the conversation log, the answer
          buffer, the turn machine, the half-typed question, the attached photo
          and any sentence left over from the microphone all go at once — and a
          live request is cancelled on the way out. The alternative is a reset
          that several separate places have to remember to keep complete, where
          the next thing added is the thing that leaks into the new
          conversation. */}
      <AskScreen
        key={conversationId}
        baseUrl={apiBaseUrl()}
        conversationId={conversationId}
        onNewConversation={() => setConversationId(newConversationId())}
      />
    </SafeAreaProvider>
  );
}
