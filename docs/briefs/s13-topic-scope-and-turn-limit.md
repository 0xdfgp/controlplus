# S13: Stay on the topic, and put a ceiling on a conversation

## Context
The product policy carries five blocks of rules and none of them says what the
assistant is for. Asked for a poem it writes one, on a paid provider call, and
no conversation has a limit on what it can spend. Constrained by ADR-021,
ADR-024, ADR-026, ADR-028, ADR-032 and ADR-034.

## Story
As the person paying for this, I want the assistant to answer what it is for and
say so plainly when a question is something else, so that it is not used as a
general chatbot; and as a senior user, I want a question about my phone or a
message I was sent answered without being turned away.

## In scope

### Product policy
- A sixth block in `CURRENT_SYSTEM_PROMPT` naming what is on topic: scams and
  fraud, money and account safety, and everyday help with the person's own
  phone, computer and accounts.
- How the refusal is said: one or two sentences, warm, no lecture, no long
  apology, and it ends by saying what the assistant can help with.
- The safety valve: when unsure, answer. A question about a message, a call, an
  email, a payment, a password or an account is always the assistant's to
  answer.
- The policy version bumps.

### Domain
- `turn-limit-policy.ts`: `MAX_MESSAGES_PER_CONVERSATION` and a pure
  `assertWithinTurnLimit`, shaped like `attachment-policy.ts`.
- `ConversationTurnLimitReached`, a typed domain error.
- `MessageRepository` gains `countByConversation`.

### Application
- `AskQuestion` asserts the limit before the history is read and before the user
  message is written, so a refused turn writes nothing and calls no provider.

### Infrastructure
- The Drizzle repository counts in SQL rather than by reading rows.
- The new class is added to the route's known error classes.

### Contracts
- `StreamErrorClass` gains `ConversationTurnLimitReached`.

### Mobile
- A sentence for the new class, telling the person to start a new conversation.
- "Try again" is not offered for it. Retrying cannot succeed, and a control that
  does nothing reads as a broken app to this audience.

## Out of scope
- A fifth eval rubric item. The rubric in `apps/eval/src/scoring/rubric.ts` is
  verbatim from ADR-033; adding an item amends that decision and changes the
  pass criteria of every existing case. It is the natural follow-up and it is
  not this slice.
- Authentication, per-caller rate limiting, per-IP budgets. ADR-034 records that
  the cap binds a conversation and not a caller, and that this is what would fix
  it.
- Any pre-generation classifier or moderation model. ADR-034 rejected it.
- Showing a running cost or a remaining-turns count. That is S7.
- Changing what happens at the provider when it refuses. That path already ends
  in `ProviderUnavailable` and is untouched.

## Acceptance criteria
1. Given a question about a recipe, a poem or the news, when it is asked, then
   the answer is a short refusal in plain text that says what the assistant can
   help with instead.
2. Given a question about the person's own phone — "why is my phone so slow" —
   when it is asked, then it is answered and not refused.
3. Given a message the person was sent that they have not called a scam, when it
   is asked about, then it is answered and the scam check still happens first.
4. Given a conversation at the message limit, when another question is asked,
   then no message is written, no provider call is made, and the stream carries
   one error event naming the new class.
5. Given that error reaches the app, when the failure is drawn, then the person
   reads a plain sentence pointing them at a new conversation and is not offered
   "Try again".

## Technical notes
- The limit check goes where the attachment check goes and for the same reason:
  before anything is written, so a turn that cannot happen leaves no trace.
- `countByConversation` is a `count`, not a `findByConversation().length`. The
  point of the bound is that a long conversation is never read into memory.
- `use-turn.ts` and `ask-screen.tsx` are both at or near the 200 line ESLint cap,
  which is a guard rail and is not to be edited. Expect an extraction.

## Tests required
- Domain: the new policy at the limit and one over it. The new prompt block by
  its sentences, including the safety valve line by name, and the new version.
- Application: a conversation at the cap yields `failed` carrying the new class,
  writes no message, and never calls the `TextGenerationPort`. One under the cap
  still answers.
- No new E2E. `.claude/rules/testing.md` scopes E2E to the happy path.
- The existing suite stays green.

## Done when
The acceptance criteria pass, `npm test` is green including `lint:boundaries`,
the live probes are recorded in ADR-034 including any that failed, and no guard
rail file appears in the diff.

## Size
Report the actual time. My estimate is small: one policy block, one pure rule,
one repository method and one sentence on the client. The risk is not the size,
it is criterion 3 — a guard that refuses a frightened person is worse than no
guard, so the probe for it is the one that decides whether this ships.
