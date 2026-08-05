/**
 * The accessibility baseline, in one place so it cannot drift per screen.
 *
 * These values come from the brief, not from measuring the design PNGs. Where
 * they disagree with an image, these win.
 */
export const theme = {
  colors: {
    background: '#F4F5F9',
    surface: '#FFFFFF',
    text: '#12131A',
    muted: '#4A4D5C',
    accent: '#3B3FD8',
    border: '#C9CBD8',
    /**
     * The pale accent behind a secondary button, the disclosure pill and the
     * user's own words. Named here because four files had it written out by
     * hand, and the question bubble makes it five.
     */
    tint: '#E4E6F6',
  },
  /** 18pt is the floor for body text, not the target. */
  bodyFontSize: 20,
  minimumBodyFontSize: 18,
  headingFontSize: 30,
  /** 60x60pt minimum for anything tappable. */
  minimumTouchTarget: 60,
  spacing: (steps: number): number => steps * 8,
} as const;
