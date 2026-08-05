import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { theme } from './theme.ts';

const DOTS = [0, 1, 2];

/**
 * The waiting state.
 *
 * The dots move continuously so the wait never reads as a frozen screen, even
 * though no answer text exists yet. Nothing else is on screen to compete with
 * the one message.
 */
export function ThinkingIndicator(): React.JSX.Element {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [progress]);

  return (
    <View
      style={styles.container}
      accessibilityRole="progressbar"
      accessibilityLabel="Thinking about your question"
      accessibilityLiveRegion="polite"
    >
      <View style={styles.dots}>
        {DOTS.map((index) => (
          <Animated.View
            key={index}
            style={[
              styles.dot,
              {
                opacity: progress.interpolate({
                  inputRange: [0, 0.33, 0.66, 1],
                  outputRange: dotRamp(index),
                }),
              },
            ]}
          />
        ))}
      </View>
      <Text style={styles.label}>Thinking about your question</Text>
    </View>
  );
}

/** Each dot peaks at a different point in the loop, so the row reads as motion. */
function dotRamp(index: number): number[] {
  const ramp = [0.3, 0.3, 0.3, 0.3];
  ramp[index] = 1;
  ramp[3] = index === 0 ? 1 : 0.3;
  return ramp;
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', flex: 1 },
  dots: { flexDirection: 'row', marginBottom: theme.spacing(2) },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginHorizontal: 5,
    backgroundColor: theme.colors.accent,
  },
  label: {
    fontSize: 24,
    fontWeight: '600',
    color: theme.colors.text,
    textAlign: 'center',
  },
});
