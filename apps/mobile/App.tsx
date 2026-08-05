import { useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AskScreen } from './src/ask-screen.tsx';
import { apiBaseUrl } from './src/config.ts';
import { newConversationId } from './src/conversation-id.ts';

export default function App(): React.JSX.Element {
  // One conversation per app launch. History across turns is S3.
  const conversationId = useRef(newConversationId()).current;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AskScreen baseUrl={apiBaseUrl()} conversationId={conversationId} />
    </SafeAreaProvider>
  );
}
