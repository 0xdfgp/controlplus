# S6: Know what you are talking to, and give the conversation room

## Context
All three input modes work. Verified on device, the screen is crowded: the
input controls take roughly half of it, an error message carries the same
visual weight as an answer, and there is no visual separation between what
the user asked and what came back. The AI disclosure indicator the design
shows in every state was never built. Constrained by ADR-002, ADR-022,
ADR-026 and the state table in 03-senior-ux-principles.md.

## Story
As a senior user, I want the conversation to be the thing on screen and the
controls to stay out of the way, so that I can read the answer without
hunting for it.

## In scope

Disclosure
- The persistent "AI assistant, not a person" indicator, in every state, as
  e1.png to e8.png show it: a small pill at the top, not a banner.
- An accessible label so a screen reader announces it.
- This is ADR-026's interface half. The domain half already ships: the
  policy rule answering "are you a person" and its test exist.

The conversation area
- Question and answer are visually distinguishable. The user's question reads
  as theirs, the answer as the assistant's. Bubbles or an equivalent, at 18pt
  body text with generous spacing.
- The conversation gets the majority of the screen. The composer is a
  compact area at the bottom, not half the view.

Input controls
- "Take a photo" and "Choose a photo" collapse into one "Add a photo"
  control. Tapping it presents the two options.
- That second step must be a full screen or a dialog with two large labelled
  options and an obvious way back. Not an action sheet that dismisses on a
  tap outside, and no gesture: 03 forbids hidden gestures and anything that
  dismisses itself.

Failure and notice states
- A failure message is visually lighter than an answer, not heavier. It reads
  as information rather than as the main event.
- The same applies to the "I did not hear anything" notice and the "Stopped"
  marker, which are notices and not failures.

The support contact
- Stays. It is ADR-002 and ADR-026: there is no human escalation in this
  build, and the link exists so a frightened person can see that a way to
  reach the company exists.
- Make it smaller and keep it in the footer. Do not remove it.

## Out of scope
- Any change under apps/api.
- The turn state machine. It gains no states here.
- Conversation history across app launches.
- Anything from S7, S8, S9, S10, S11 or S12.
- A settings screen. The gear icon visible in the screenshots is not part of
  this slice.

## Acceptance criteria
1. Given any state, when the screen is inspected, then the AI indicator is
   visible and a screen reader announces it.
2. Given a conversation with two or more turns, when the screen is
   inspected, then questions and answers are visually distinct and the
   conversation occupies most of the screen.
3. Given the idle state, when the user taps "Add a photo", then two large
   labelled options appear with an obvious way back, and nothing dismisses
   by tapping outside or by a gesture.
4. Given a failure or a notice, when it appears, then it is visually lighter
   than an answer and does not read as the main content.
5. Given OS font scaling at 200%, when any state is shown, then the layout
   does not break and no control becomes unreachable.
6. Given any state, when the screen is inspected, then the support contact
   is present in the footer.

## Technical notes
- Touch targets stay at 60x60pt minimum. Making the composer compact must
  not make anything smaller than that.
- Body text stays at 18pt minimum.
- Contrast stays at WCAG AA minimum.
- Every icon keeps a text label.
- This project has no React test renderer, so the suite will not catch what
  matters here. Say what you could not verify.

## Tests required
- No new backend tests. If the suite changes under apps/api, stop and tell me.
- The existing suite stays green.

## Done when
The acceptance criteria pass, npm test is green including lint:boundaries,
and every state has been seen on a real device at default and at 200% font
scaling.

## Size
Report the actual time.