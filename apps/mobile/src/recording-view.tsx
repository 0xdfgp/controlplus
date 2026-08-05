import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LevelMeter } from './level-meter.tsx';
import { theme } from './theme.ts';

export const LISTENING_HEADING = "I'm listening";
export const DONE_LABEL = "I'm done — send it";

export interface RecordingViewProps {
  readonly level: number;
  readonly onDone: () => void;
}

/**
 * E4, the recording state.
 *
 * One heading, the level meter, and one large control to finish. Nothing else
 * is on screen: 03-senior-ux-principles asks for one primary action, and
 * someone who is mid-sentence should not be choosing between buttons.
 *
 * Recording is already under way by the time this renders, and it was started
 * by a deliberate tap on "Speak instead". There is no press-and-hold anywhere
 * in this path — 03 rules it out for shaky hands, and the machine agrees: the
 * only event that starts a recording is the one that tap sends.
 */
export function RecordingView({
  level,
  onDone,
}: RecordingViewProps): React.JSX.Element {
  return (
    <View style={styles.block}>
      <Text style={styles.heading} accessibilityRole="header">
        {LISTENING_HEADING}
      </Text>

      <LevelMeter level={level} />

      <Pressable
        style={({ pressed }) => [styles.done, pressed && styles.pressed]}
        onPress={onDone}
        accessibilityRole="button"
        accessibilityLabel={DONE_LABEL}
        accessibilityHint="Stops recording and writes down what you said, so you can check it before sending"
      >
        <Text style={styles.doneLabel}>{DONE_LABEL}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { justifyContent: 'center', paddingVertical: theme.spacing(4) },
  heading: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.colors.text,
    textAlign: 'center',
  },
  done: {
    minHeight: theme.minimumTouchTarget + 12,
    borderRadius: 16,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing(2),
  },
  pressed: { opacity: 0.8 },
  doneLabel: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
});
