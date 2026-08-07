# Control+ companion

A conversational assistant for Control+, an anti-scam and device security
product for older adults in the US. Built in one working day.

An iOS and Android app where someone can ask a technology support question by
typing, by photo, or by voice, and get an answer that streams back and can be
stopped. Behind it a Node and TypeScript backend, hexagonal, with the layer
boundaries enforced by a build that fails when they are crossed.

## Running it

You need Node 20 or later, Docker, and an Xcode or Android toolchain if you
want to run the app on a device. Everything else installs with npm.

```
npm install
cp .env.example .env      # then fill in the keys, see below
npm run db:up             # Postgres 16 in Docker, nothing else
npm run db:migrate
npm run api               # backend on http://localhost:3000
npm run mobile            # Expo dev server, then press i for iOS
```

The app needs a development build. Expo Go will not do, because the camera and
the microphone use native modules. If you have not built it before,
`npx expo run:ios` from `apps/mobile` does it once, and after that
`npm run mobile` is enough.

### Environment

| Variable | What it is |
|---|---|
| `ANTHROPIC_API_KEY` | Required. The API fails at boot without it, or if it does not start with `sk-ant-`. |
| `ANTHROPIC_MODEL` | Optional. Defaults to `claude-sonnet-4-5`. |
| `DATABASE_URL` | Postgres connection string. The default in `.env.example` matches the Docker compose file. |
| `GEMINI_API_KEY` | Optional. The Gemini adapter is in the tree as a second implementation of the provider port, but it is not wired. |

A missing or malformed key fails at startup, with a message naming the
variable. It does not wait for the first user request. A well-formed but
revoked key cannot be detected without calling the provider, so that one fails
on the first question instead.

## Tests

```
npm test
```

That runs, in order: the boundary lint, ESLint, a typecheck across all three
workspaces, then the unit and integration suites. The database needs to be up,
because the persistence tests run against real Postgres.

The boundary lint is worth running on its own:

```
npm run lint:boundaries
```

It fails the build if anything under `domain/` imports from `application/` or
`infrastructure/`, or from a package outside its allowlist. The claim that this
codebase is hexagonal rests on that command.

## Layout

```
apps/api            the backend: domain, application, infrastructure
apps/mobile         the React Native app
apps/eval           the provider evaluation harness and its fixtures
packages/contracts  the HTTP and SSE types both sides import
docs/               everything written down
```

## The written parts

| | |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | How it is put together and why. The shorter read. |
| [`docs/decisions/decision-log.md`](docs/decisions/decision-log.md) | The full record. Every decision closed during the build, the ones reversed, the corrections I made to the assistant, and the problems verification found. |
| [`docs/provider-comparison.md`](docs/provider-comparison.md) | Four candidates over four fixture questions, with latency, tokens and cost, and a routing recommendation. |
| [`docs/production-readiness.md`](docs/production-readiness.md) | What would break if this shipped as it stands, and the order I would fix it in. |
| [`docs/left-out.md`](docs/left-out.md) | What was cut, why deferring it is safe, and what keeps the door open. |
| [`docs/ai-tooling.md`](docs/ai-tooling.md) | How the work was split between two agents, plus the three examples the brief asks for: a suggestion I rejected, a problem testing found, and a decision I made myself. |
| [`docs/extending.md`](docs/extending.md) | How video attachments and realtime voice would be added: one is additive, the other is a second product path. |
| [`docs/briefs/`](docs/briefs) | The implementation briefs. Every slice was written as a brief and executed against it, which is why they are in the repo rather than in a notebook. |

[`.claude/`](.claude) and the root [`CLAUDE.md`](CLAUDE.md) are the
instructions the coding agent ran under. They are committed deliberately.
[`docs/ai-tooling.md`](docs/ai-tooling.md) explains how the work was split
between an agent that made decisions and one that wrote code, and this is that
split in its actual form.

The evaluation results, including every answer and every judge verdict, are in
[`apps/eval/results/`](apps/eval/results) so any number in the comparison can
be checked.
