# 02. Architecture Principles

Binding rules for this codebase. When a proposal conflicts with something here, the assistant says so before presenting options.

This file is written for me. The agent-facing version is CLAUDE.md in the repo: shorter, imperative, no rationale. Keep them consistent, and when this file changes, say whether CLAUDE.md needs the same change.

## Backend: hexagonal + DDD

### Layer rules

```
domain/          entities, value objects, aggregates, domain events,
                 domain services, port interfaces (outbound)
application/     use cases, orchestration, transactions, inbound ports
infrastructure/  HTTP, SDK adapters, persistence, clock, ids, config
```

- Dependencies point inwards only. `domain` imports nothing from `application` or `infrastructure`. `application` imports `domain` only.
- No SDK, framework or Node built in imports inside `domain`. No `fetch`, no `Date.now()`, no `crypto.randomUUID()`. Time and identity arrive through ports.
- Ports are declared where they are needed (domain or application) and implemented in infrastructure. The interface belongs to the caller. It does not belong to the vendor.
- Adapters are dumb translators. Business rules never live in an adapter.
- One composition root wires everything. Nothing else does `new SomethingAdapter()`.
- The ORM or query builder does not leak past infrastructure. No entity carries a decorator from a persistence library.

### Enforcement

The code is written by an agent that will import an SDK into the domain when it is convenient, with a persuasive justification. Convention will not hold for two days.

- A dependency rule (dependency-cruiser or eslint-plugin-boundaries) fails the build on any inward violation. It runs in CI and in the pre-commit path.
- The rule gets written in the first slice. Retrofitting it at the end defeats the point.
- The write up says the boundaries are enforced by a failing test instead of by discipline. That is a stronger claim and a checkable one.

### Domain modelling

Model the language of the problem, not the shape of the API response. Conversation, Message, Attachment, Transcript, UsageRecord and Provenance are candidates. The provider's `ChatCompletionChunk` is not a domain concept.

Identify the aggregate root and its invariants explicitly. Whatever holds the conversation together is the consistency boundary. Use value objects for anything with rules: MessageId, MediaType, TokenCount, Money, ModelId. Primitive obsession is a smell we do not ship. Invariants live in constructors and factory methods, so that an invalid object cannot be constructed at all.

Domain events for anything the rest of the system reacts to: message completed, usage recorded, generation cancelled, provider failed over.

Every assistant message carries provenance. That it was AI-generated, which model produced it, and which provider. Set in the domain when the message completes. The HTTP layer does not stamp it on.

The assistant's behavioural rules (tone for senior users, scam handling, AI disclosure when asked) are product policy. They live in the domain, versioned. Not scattered across adapters, and not hardcoded in a prompt string next to an SDK call.

Anemic entities with all the logic in a service layer means the DDD claim in the write up is untrue. Do not do that.

### Ports likely to matter here

Raw material for the port boundary decision. Not a decided list.

- Text generation / streaming completion
- Speech to text
- Image understanding (may or may not be separate from text generation)
- Conversation repository
- Attachment storage
- Usage and cost ledger
- Pricing catalogue
- User context (Control+ account data, stub adapter in the prototype)
- Clock, IdGenerator

### Errors

- Domain errors are typed and meaningful: `ConversationNotFound`, `AttachmentTooLarge`, `ProviderUnavailable`, `UserContextUnavailable`. No strings, and no raw SDK errors escaping upwards.
- The HTTP layer maps domain errors to status codes. The domain does not know what a 429 is.
- Every provider failure mode gets a named domain equivalent. Otherwise fallback logic ends up string matching on vendor messages.

### Persistence

- A real database with migrations, running on Docker locally. Migrations are part of the deliverable and run on a clean machine without manual steps.
- The repository port is defined by the application's needs. The table shape does not define it.
- In-memory implementations exist as test doubles for application-layer tests. They are never a runtime path and are never wired in the composition root.
- Database calls are an external dependency like any other: timeouts, a bounded pool, and defined behaviour when the database is unreachable mid-conversation.

### Testing

- Domain: pure unit tests, fast, nothing to mock.
- Application: use cases against in-memory fakes of the ports. No Docker, no database. These are the tests that prove behaviour.
- Adapters: thin contract tests against recorded fixtures. One shared contract suite that every provider adapter must pass is worth more than per adapter tests. The persistence adapter gets the same treatment against a real database.
- One end to end happy path over real HTTP with a stubbed provider.
- Do not chase coverage. Cover cancellation, context assembly, usage accounting, redaction, failure and fallback. Those are what the reviewer will poke at.

## Mobile: React Native

- TypeScript strict. Typed API client shared with, or generated from, the backend contract.
- Feature based folder structure. Screens stay thin: they render state and dispatch intent, and do nothing else.
- Business logic lives in hooks or a small client side service layer, testable without rendering.
- Server state in a query library, UI state local. Do not put streaming tokens in a global store, it will thrash.
- Streaming rendering must not re render the whole tree per token. Batch or buffer. Test on a low end device, because the target user does not have a new phone.
- Explicit state machine for the conversation turn: idle, recording, uploading, transcribing, waiting, streaming, cancelled, failed. The UI reads that machine. Ad hoc booleans produce impossible states, and impossible states are exactly what confuses a senior user.
- Cancellation wired end to end: user taps stop, request aborts, server aborts the provider stream, partial message persists as partial.
- Every network call has a timeout and a visible failure state with a retry affordance. No silent failures, no infinite spinners.
- Both platforms are targeted. iOS is the primary and is verified end to end. Audio capture is the one place where the platforms genuinely diverge (formats, permission flows, denial handling), so it gets explicit attention on both.
- Accessibility props are not optional here. See `03-senior-ux-principles.md`.
- Permissions (microphone, camera, photo library) requested in context, with a plain explanation, and denial handled gracefully.

## Cross cutting

- Config validated at boot. A missing API key fails loudly at startup, before the first user request.
- Structured logging with a conversation id and a request id, carrying latency, token usage, error class and the message content itself after a redaction pass. Excluding content entirely would make a non-deterministic system impossible to operate, so the rule is mask, not omit.
- Redaction runs at a single, testable boundary. Where that boundary sits (a domain policy over marked value objects, or a formatter in infrastructure) is D15 and is still open.
- Usage accounting is a first class domain concern. It is not a log line to grep later.
- Every external call: timeout, bounded retry with backoff on the right error classes only, and a circuit or fallback path.
- Secrets never reach the client. The app talks to our backend, never to a provider directly.
