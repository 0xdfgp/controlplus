import { Image, StyleSheet, Text, View } from 'react-native';

import { theme } from './theme.ts';

export interface UploadingViewProps {
  readonly photoUri: string | null;
  /**
   * How much has left the phone, 0 to 1, or null when nothing is measuring it.
   *
   * Real, not a timer, and absent rather than zero when the platform reports
   * nothing at all.
   */
  readonly progress: number | null;
}

export const UPLOADING_HEADING = 'Sending your photo';

/** Said whether or not there is a number to show, because it is true either way. */
export const UPLOADING_CAPTION =
  'This can take a moment on a slow connection.';

/**
 * E5, the uploading state.
 *
 * A photo can take real time to leave the phone on a slow connection, and a
 * screen with no sign of progress reads as broken. The percentage and the
 * filling bar make the wait itself the evidence that something is happening.
 *
 * Every number here comes from the upload. Nothing on this screen moves on a
 * timer: 03-senior-ux-principles rules that out, and the reasoning is recorded
 * in the decision log — an animation driven by a clock keeps going after the
 * connection has died, and a screen that lies to a frightened person is worse
 * than one that is honest about waiting.
 */
export function UploadingView({
  photoUri,
  progress,
}: UploadingViewProps): React.JSX.Element {
  const percent =
    progress === null
      ? null
      : Math.round(Math.min(1, Math.max(0, progress)) * 100);

  return (
    <View style={styles.block}>
      <Text style={styles.heading} accessibilityRole="header">
        {UPLOADING_HEADING}
      </Text>

      {photoUri === null ? null : (
        <Image
          source={{ uri: photoUri }}
          style={styles.photo}
          resizeMode="contain"
          accessibilityLabel="The photo you are sending"
        />
      )}

      {/* No bar without a measurement. An empty track sitting at 0% for the
          whole upload is not a quieter version of progress, it is a screen
          claiming to know something it does not. */}
      {percent === null ? null : (
        <View
          style={styles.track}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: percent }}
        >
          <View style={[styles.fill, { width: `${percent}%` }]} />
        </View>
      )}

      <Text style={styles.caption} accessibilityLiveRegion="polite">
        {percent === null
          ? UPLOADING_CAPTION
          : `${percent}% — this can take a moment on a slow connection`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { alignItems: 'center', paddingVertical: theme.spacing(3) },
  heading: {
    fontSize: 26,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: theme.spacing(2),
    textAlign: 'center',
  },
  photo: {
    width: 180,
    height: 180,
    borderRadius: 14,
    backgroundColor: '#E4E6F6',
    marginBottom: theme.spacing(3),
  },
  track: {
    width: '100%',
    height: 14,
    borderRadius: 7,
    backgroundColor: theme.colors.border,
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: theme.colors.accent },
  caption: {
    marginTop: theme.spacing(1.5),
    fontSize: theme.minimumBodyFontSize,
    color: theme.colors.muted,
    textAlign: 'center',
  },
});
