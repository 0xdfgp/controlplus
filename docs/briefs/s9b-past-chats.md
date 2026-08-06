# S9b: Past conversations

## Context
Conversations persist and nothing surfaces them. After S9a a user can start a
fresh thread and the previous one is in the database with no way back to it.
Constrained by ADR-013 and 03-senior-ux-principles.md.

## Story
As a senior user, I want to find the answer I was given yesterday, so that I
do not have to ask the same question again.

## In scope
- An endpoint listing conversations for the identifier, most recent first,
  with enough to show each one: when it was, and the first question asked.
- A screen listing them. Each row is a 60x60pt target minimum, 18pt text, and
  reads as a question rather than as a timestamp.
- Tapping a row opens that conversation with its messages, scrollable and
  read only.
- One obvious way back to the current conversation.
- Empty state: plain words saying there are no earlier conversations yet.

## Out of scope
- Continuing an old conversation. Opening one is read only. Asking a follow
  up on an old thread is a separate decision about what the context window
  does across a gap in time.
- Deleting, renaming, searching or exporting.
- Cross-device sync. There are no accounts.
- Pagination beyond a sensible limit on the list.

## Acceptance criteria
1. Given several past conversations, when the list is opened, then they
   appear newest first, each showing the first question asked.
2. Given a past conversation, when it is opened, then its messages appear in
   order and it is clear that it is not the current thread.
3. Given a past conversation is open, when the user goes back, then they
   return to the current conversation with its state intact.
4. Given no past conversations, when the list is opened, then a plain
   sentence says so.
5. Given OS font scaling at 200%, when the list is shown, then rows do not
   truncate the question into meaninglessness.

## Technical notes
- Read only. Nothing here writes.
- The repository gains a list query. Bound it.
- This adds navigation to a product that had none, so the way back has to be
  obvious and must not be a gesture. 03 forbids hidden gestures.

## Tests required
- Application: the list query returns conversations newest first and
  respects its bound.
- E2E: the list endpoint over real HTTP.
- The existing suite stays green.

## Done when
The acceptance criteria pass, npm test is green including lint:boundaries,
and the list has been opened on a real device.

## Size
Report the actual time. My estimate is the largest remaining piece of work,
because it is the first screen in this product that is not the conversation.