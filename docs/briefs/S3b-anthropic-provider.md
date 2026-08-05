# S3b: Anthropic as the integrated provider

## Context
ADR-032 supersedes ADR-017. Neither Gemini nor OpenAI is usable with the
credentials available, and Anthropic works. This replaces the wired provider
and closes two pieces of debt that ADR-021 and ADR-032 depend on.
Constrained by ADR-012, ADR-014, ADR-021, ADR-026, ADR-028 and ADR-032.

## Story
As the operator, I want the assistant running on a provider whose key
actually works, so that the prototype can be demonstrated and evaluated.

## In scope

Adapter
- A TextGenerationPort adapter for Anthropic, passing the shared contract
  suite unchanged. Streaming, chunk normalisation, a started chunk carrying
  model and provider on stream open, and usage on completion.
- Model claude-sonnet-4-5 on the default path.
- Provider errors arrive as typed SDK exceptions. Map them to the existing
  domain error classes. No provider text reaches the user.
- The composition root wires Anthropic. The Gemini adapter stays in the tree
  and is not deleted: it is the second implementation of the port and the
  write up refers to it.
- Config: the Anthropic key is validated at boot per ADR-029.

Product policy
- The scam check test that ADR-021 calls non-optional and that does not
  exist. It asserts the rule is present in the assembled prompt. Note in the
  brief that this tests the prompt and not the model's obedience.
- The "are you a person" rule and its test, per ADR-026. Check whether it
  exists before writing it.
- A new policy rule: answers are plain text. No markdown headings, no bold,
  no horizontal rules. Numbered steps as plain numbered lines. Both Anthropic
  models emit markdown by default and on a phone screen for someone of 80
  that is noise.
- max_tokens must not truncate an answer mid-sentence. A live call at 700
  cut off inside a list. Pick a value that does not, and say what you picked.

## Out of scope
- Image input. S4.
- Voice. S5.
- Provider fallback and the second adapter being wired. S10.
- The evaluation harness. S12.
- Any change to the port, the aggregate, the transport or the state machine.
- Deleting or rewriting the Gemini adapter.

## Acceptance criteria
1. Given the app is running, when a question is sent, then an answer streams
   back from Anthropic and the stored message records provenance naming the
   model and provider.
2. Given a completed turn, when usage is inspected, then input and output
   tokens are recorded. Anthropic reports no separate reasoning count, so
   thoughtTokens is zero.
3. Given the assembled prompt, when the policy tests run, then the scam check
   rule and the "are you a person" rule are both present.
4. Given a live answer to "My iPhone says storage almost full", when the text
   is inspected, then it contains no markdown headings, no bold markers, and
   is not truncated mid-sentence.
5. Failure path: given ANTHROPIC_API_KEY is missing, empty, or does not
   start with sk-ant-, when the API starts, then it fails at boot with a
   plain message naming the variable. A well-formed but revoked key is only
   detectable by calling the API and fails on the first request instead.

## Tests required
- Adapter contract: the shared TextGenerationPort suite, unchanged, passing
  against the Anthropic adapter.
- Domain: the two policy rules are present in the assembled prompt.
- The existing suite stays green.

## Done when
The acceptance criteria pass, npm test is green including lint:boundaries,
and a question has been answered on a real device.

## Size
Report the actual time.