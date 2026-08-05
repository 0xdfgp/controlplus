# S3: Ask a follow up

## Context
S1 and S2 ship a single question and answer with cancellation. This slice
adds conversation context so a follow up works without repeating what was
already said. That is MLP criterion 4 and what makes this an assistant
rather than a search box. Constrained by ADR-012, ADR-013 and ADR-022.

## Story
As a senior user, I want to ask "and how do I do that on my phone?" after an
answer, so that I do not have to explain my situation again.

## In scope
- The repository gains a query returning the last N messages of a
  conversation, ordered, where N is a named constant in the domain.
- AnswerGeneration assembles the request from that history plus the product
  policy, in the order the provider expects.
- Stopped messages are included in history as what they are: partial answers,
  not complete ones.
- The screen shows the conversation as a sequence: previous questions and
  answers scroll above, the input stays below.
- Accessibility: the scroll region has a sensible reading order and the newest
  answer is announced to a screen reader.

## Out of scope
- Summarisation or any token-based window. The bound is a message count.
- Image and voice parts in history. S4 and S5.
- Persisting or restoring conversations across app launches. Not in scope.
- Conversation cost totals. S7.
- User context from Control+. S8.

## Acceptance criteria
1. Given an answered question, when the user asks a follow up that refers to
   the previous answer without restating it, then the answer is coherent with
   the first.
2. Given a conversation longer than N messages, when a turn is sent, then only
   the last N are included and the request does not grow unbounded.
3. Given a stopped partial in history, when a follow up is sent, then the
   partial is included and marked as incomplete rather than presented as a
   finished answer.
4. Given several turns, when the screen is inspected, then earlier questions
   and answers remain visible and readable at 18pt with the input reachable.
5. Failure path: given the repository is unavailable when history is loaded,
   then the user sees a plain sentence and no partial context is silently
   sent.

## Tests required
- Application: the use case assembles history in order and respects the bound.
- Application: a stopped message is included and marked.
- Domain: the assembled request contains the product policy and the history in
  the expected order.
- E2E: two turns over real HTTP with a stubbed provider, asserting the second
  request carries the first exchange.

## Done when
The acceptance criteria pass, npm test is green including lint:boundaries,
and a follow up has been asked once on a real device.

## Size
Report the actual time.