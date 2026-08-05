---
paths:
  - apps/api/**
  - packages/contracts/**
  - "**/*.test.ts"
---

# Testing rules

Outside-in. `npm test` includes `npm run lint:boundaries`.

## What each layer gets

- **Domain**: pure unit tests. Nothing to mock — the domain has no
  dependencies. Test the invariants, especially the ones that must not be
  constructible around.
- **Application**: use cases against in-memory fakes of every port. Assert the
  writes and the emitted domain events, not the internals.
- **Adapters**: one shared contract suite per port, run against recorded
  fixtures. A second adapter for the same port must pass the same suite
  unchanged.
- **Persistence**: against a real Postgres, not a fake. Assert the round trip.
- **E2E**: happy path only, real HTTP, stubbed provider.

## Not evidence of completion

These are blockers, not passes:

- `test.skip`, `test.only`, `describe.skip`, `it.todo`.
- A test whose assertions are commented out or reduced to `expect(true)`.
- A stub or placeholder left where an implementation belongs.
- A `TODO` comment standing in for an unimplemented branch.

If something cannot be implemented, report it as a blocker. Do not ship a
green suite that tests nothing.

## Fixtures

Recorded provider responses live under `__fixtures__/`. They are captured
from the real provider once and then committed. Do not hand-write a fixture
that the provider would never emit — the point is to catch the shape drifting.
