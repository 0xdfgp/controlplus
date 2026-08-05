import { SecondaryButton } from './secondary-button.tsx';

export const SPEAK_LABEL = 'Speak instead';

export interface SpeakButtonProps {
  readonly onPress: () => void;
  readonly disabled: boolean;
}

/**
 * The third way to ask, on the resting screen (E1).
 *
 * A plain tap, and only a tap. `onPress` fires on release, so a hand resting on
 * the screen does not start a recording and a tremor does not end one early:
 * 03-senior-ux-principles rules out press-and-hold for exactly this audience.
 *
 * Beside "Add a photo" rather than below it, which is what E1 and E7 both draw.
 * S4 had it on its own row because "Take a photo" and "Choose a photo" had
 * already used one; collapsing those two into one control gave the row back.
 */
export function SpeakButton({
  onPress,
  disabled,
}: SpeakButtonProps): React.JSX.Element {
  return (
    <SecondaryButton
      label={SPEAK_LABEL}
      hint="Records your question and writes it down, so you can check it before sending"
      onPress={onPress}
      disabled={disabled}
    />
  );
}
