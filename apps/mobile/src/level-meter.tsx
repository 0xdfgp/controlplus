import { StyleSheet, View } from 'react-native';

import { theme } from './theme.ts';
import { levelToBars } from './voice.ts';

/** Five, as E4 draws. */
export const BAR_COUNT = 5;

/** The height of a bar at full loudness. */
const TALLEST_BAR = 56;

export interface LevelMeterProps {
  /** The volume the microphone last reported, in the recogniser's −2 to 10. */
  readonly level: number;
}

/**
 * The live level indicator E4 draws, and the whole of AC1.
 *
 * Every height here comes from a `volumechange` event the microphone produced.
 * Nothing moves on a timer, nothing eases, nothing decays: if no events arrive
 * the bars sit still at their resting height, which is the honest drawing of a
 * microphone that is open and hearing nothing.
 *
 * That rule is not decoration. S4 shipped an upload bar sitting at 0% claiming
 * a measurement nobody had taken, and 03-senior-ux-principles is explicit that
 * an animation driven by a clock keeps reassuring people after the thing it
 * describes has died. The bars moving is the evidence the microphone works;
 * that is only true while they are drawn from it.
 */
export function LevelMeter({ level }: LevelMeterProps): React.JSX.Element {
  const bars = levelToBars(level, BAR_COUNT);

  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Moving bars show that the microphone is hearing you"
    >
      {bars.map((height, index) => (
        <View
          key={index}
          style={[styles.bar, { height: Math.round(height * TALLEST_BAR) }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: theme.spacing(1),
    height: TALLEST_BAR,
    marginVertical: theme.spacing(3),
  },
  bar: {
    width: 12,
    borderRadius: 6,
    backgroundColor: theme.colors.accent,
  },
});
