---
paths:
  - apps/api/src/domain/**
  - apps/api/src/application/**
---

# Domain and application rules

These are closed decisions. They are not reopened inside an implementation
session. If one looks wrong, stop and say so.

## Dependency direction

- `domain/` imports nothing from `application/` or `infrastructure/`.
- `application/` imports `domain/` only.
- `infrastructure/` may import both.
- Ports are declared in `domain/ports` and implemented in `infrastructure/`.
- One composition root. Nothing else constructs an adapter.

## Forbidden under domain/

- No SDK, no `fetch`, no HTTP client.
- No `Date.now()` and no `new Date()`. Time arrives through the `Clock` port.
- No `crypto.randomUUID()`. Identity arrives through the `IdGenerator` port.
- No `any`.
- No external npm package. The domain is pure TypeScript.

## Shape

- One class per file. 200 line cap on source files.
- Adapters translate. Business rules never live in an adapter.
- Ports that stream return `AsyncIterable`. Cancellation is expressed by
  stopping iteration; no `AbortSignal` enters the domain.

## Vocabulary — use these names, invent no synonyms

`Conversation`, `Message`, `ContentPart` (`TextPart`, `ImagePart`,
`TranscriptPart`), `Provenance`, `Usage`, `TokenCount`, `ModelId`, `MessageId`,
`ConversationId`, `AnswerGeneration`, `TextGenerationPort`,
`TranscriptionPort`, `ConversationRepository`, `MessageRepository`, `Clock`,
`IdGenerator`.

Events: `MessageCompleted`, `GenerationFailed`.
Errors: `ConversationNotFound`, `ProviderUnavailable`.

## Invariants that must not be constructible around

- `Message` has a private constructor.
- `Message.fromAssistant` requires provenance, a terminal state and usage.
- `Message.fromUser` rejects both provenance and usage, and requires at least
  one content part.
- `Provenance` is set in the domain at construction, never by the HTTP layer.
- `Conversation` and `Message` are separate aggregates. A `Message` is written
  once when the turn closes, already complete or already stopped.
