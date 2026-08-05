# 03. Senior User Principles

The target user is an older adult asking for help with technology, usually while already frustrated. These principles constrain architecture, they are not a design afterthought. A choice that makes the backend elegant and the wait ambiguous is the wrong choice.

## The user in your head

Around 70 to 85. Possibly reduced near vision, reduced fine motor precision, slower reading speed. Low confidence with technology and a real fear of breaking something or being scammed. Has been burned by interfaces that changed under them. Will read silence as failure and a spinner as "it is broken again".

They do not want a chatbot experience. They want the equivalent of a patient grandchild who explains things once, clearly, without making them feel stupid.

## Interface rules

- Minimum 18pt body text, scaling with the OS font setting to at least 200% without breaking layout.
- Touch targets 60x60pt or larger, generously spaced. Missed taps on a small stop button are a real failure mode.
- Contrast at WCAG AA minimum, AAA for body text where it costs nothing.
- One primary action visible per screen. Two buttons of equal weight is one too many.
- Plain language everywhere, including errors. "Something went wrong on our side. Tap to try again." Never a code, never "unexpected error", never a stack of jargon.
- No time based UI. No toasts that disappear before they can be read, nothing auto dismissing.
- No hidden gestures. Swipe to do anything important will not be discovered.
- Icons always paired with a text label.
- Full screen reader support, sensible reading order, labelled controls. Some users will already have VoiceOver or TalkBack on.

## Knowing what they are talking to

A product requirement and a legal one. Details and sources in `07-product-context.md`.

- Say it is an AI at the first point of contact, in plain words and large type. Not in a terms page, not in grey 11pt.
- Keep a light but persistent indicator afterwards. A user of 80 forgets mid conversation what they are talking to, especially when the answers are good.
- If the user asks whether they are talking to a person, the answer is no, unambiguously. That is a rule in the domain prompt policy and a test case, not a hope.
- Show the published Control+ support contact as a static, always visible link. This is not a handoff and does not route anything: no escalation flow is in scope. It exists so a frightened user can always see that a way to reach the company exists.
- Never imply the assistant is a Control+ employee, and never adopt a human name that would suggest it.

## State visibility

The brief calls this out directly: the interface must be clear about whether the assistant is listening, uploading, processing, responding or has hit a problem. That is a state machine, driven by real events from the backend, not by optimistic guesses on the client.

Each state needs a plain language label, not only a visual:

| State | What the user sees |
|---|---|
| Idle | A clear invitation to ask, with the three input options visible |
| Recording | "I'm listening" plus a live level indicator so they know the mic works |
| Uploading | "Sending your photo" with progress, because their connection may be slow |
| Transcribing | "Writing down what you said" |
| Thinking | "Thinking about your question" with movement so it does not look frozen |
| Responding | Text appearing progressively, plus a large obvious Stop |
| Cancelled | Partial answer stays visible, clearly marked as stopped |
| Failed | Plain explanation and one large retry button |

Design implication: if a pipeline step can take more than a second or two, the backend should surface it as a distinct event rather than letting the client sit on a generic spinner. That shapes the streaming protocol decision. Do not settle the transport before deciding what the user needs to be told.

## Answer quality rules

The system prompt does real work here and belongs in the domain layer, versioned.

- Short sentences. One instruction per line. Numbered steps for anything procedural.
- Assume no jargon. If a technical term is unavoidable, define it in the same breath.
- Never condescending. No "simply", no "just", no "obviously".
- Lead with reassurance when the user is anxious: their device is probably fine and this is fixable.
- Ask one clarifying question at most, and only when the answer would otherwise be wrong.
- Anything involving money, passwords, one time codes, remote access or bank details gets a careful protective response and a nudge to check with someone they trust. See the scam section in `07-product-context.md`.
- Say clearly when the assistant cannot see enough to help, and ask for a photo instead of guessing.
- Admit uncertainty out loud. A confident wrong answer to this user costs them money.

## Personalised context

The assistant can see some Control+ account context (D6). Used well, it is the difference between a generic bot and something that feels like it knows the user. Used badly, it is unsettling.

- Bring context in when it changes the answer, not to prove it is there. "I can see your last scan was clean, so this is probably not a virus" is useful. Reciting their plan name is not.
- Never reveal context the user did not raise, especially about other people on the account.
- If the context is stale or missing, say so plainly rather than guessing.

## Voice and photo specifics

- Recording starts on an explicit tap, not a hold gesture. Press and hold is unreliable for shaky hands.
- Show the transcript before or alongside the answer, so a mis-transcription is visible and correctable.
- Photo capture needs a retake option and a readability check. A blurry screenshot should produce "I can't quite read that, could you take it again?" rather than a confident wrong answer.
- Expect large uncropped screenshots and slow uploads. Downscale on device before sending.
