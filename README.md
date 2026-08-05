# Control+

A conversational assistant for people aged 70 to 85. Many arrive frightened,
because they think someone is trying to cheat them.

This repository is at slice **S1: ask a typed question, get a streamed answer**.

## What works today

Type a question, watch the answer appear as it is written, and have the turn
recorded with the model and provider that produced it and what it cost in
tokens. Nothing else. See `docs/briefs/S1-alpine.md` for what is deliberately
absent and which slice it belongs to.

## Requirements

- Node 22 or newer (developed on 25.6.1)
- Docker, running
- Xcode, for the iOS build
- A Gemini API key

## Getting it running

```bash
# 1. Your provider key. The API refuses to start without it.
echo "GEMINI_API_KEY=your-key-here" > .env

# 2. Dependencies.
npm install

# 3. Postgres 16, and nothing else.
npm run db:up

# 4. Schema.
npm run db:migrate

# 5. The API, on http://localhost:3000
npm run api
```

Then, in a second terminal:

```bash
# The Expo development build. Not Expo Go.
npm run mobile
```

The first mobile run needs a native build: `npm run ios --workspace
@control-plus/mobile`. After that, `npm run mobile` attaches to it.

On the iOS Simulator the app reaches the API on `localhost`. On a physical
device it uses the host running Metro. Override either with
`EXPO_PUBLIC_API_URL`.

## Tests

```bash
npm test
```

That runs, in order: the layer boundary lint, ESLint, TypeScript across all
three workspaces, and the test suite.

The persistence and end-to-end suites talk to the real Postgres from
`docker-compose.yml` rather than a fake, so **`npm run db:up` is a prerequisite**.
They are not skipped when the database is missing; they fail, because a
persistence suite that passes without a database proves nothing.

The provider is stubbed everywhere in the suite. No test makes a network call.

### Configuration

| Variable | Default | Required |
|---|---|---|
| `GEMINI_API_KEY` | — | Yes. The API exits at startup without it. |
| `DATABASE_URL` | `postgres://controlplus:controlplus@localhost:5433/controlplus` | No |
| `GEMINI_MODEL` | `gemini-3.5-flash` | No |
| `PORT` | `3000` | No |
| `LOG_LEVEL` | `info` | No |

Configuration is validated at boot. A missing key fails at startup, not on the
first user request — the person this is built for should never be the one who
discovers the server was misconfigured.

## Layout

```
apps/api/src/domain/          entities, value objects, events, ports, policy
apps/api/src/application/     use cases
apps/api/src/infrastructure/  HTTP, Gemini, Postgres, logging, composition root
apps/mobile/                  Expo app, one screen
packages/contracts/           the request type and the SSE event union
```

`domain/` imports nothing from `application/` or `infrastructure/`. That is not
a convention, it is enforced: see below.

## The guard rails

Four files enforce the architecture, and they are not edited after S1:

- `.dependency-cruiser.js` — the layer rules, every one at error severity
- `eslint.config.mjs` — one class per file, 200 line cap on source, no `any`
  under `domain/`
- `.claude/settings.json` — hooks that block a forbidden import as it is typed
- `.claude/rules/` — the rules an agent reads before touching those paths

`npm run lint:boundaries` drives dependency-cruiser through its API rather than
its CLI, because the CLI refuses to run on odd-numbered Node releases. The rules
are unchanged; only the runner differs.

## API

`POST /conversations/:conversationId/messages`

```json
{ "question": "Is this text about my bank a scam?" }
```

Responds `text/event-stream`, one request per turn:

```
event: stage          data: {"type":"stage","stage":"thinking"}
event: stage          data: {"type":"stage","stage":"responding"}
event: message.delta  data: {"type":"message.delta","text":"That message "}
event: message.done   data: {"type":"message.done","messageId":"…","state":"completed",…}
```

On failure, `stage(thinking)` is followed by
`event: error  data: {"type":"error","error":"ProviderUnavailable"}`, and no
assistant message row is written.

The conversation id is generated on the device and the API creates the
conversation on first use, so a turn is a single request. That is what lets the
thinking label reach the screen inside 500ms of the tap.

## Logging

One structured line per turn, carrying conversation id, request id, latency,
token usage and error class. Message content passes through a redaction
function that **masks** emails, phone numbers and card-shaped digit sequences —
it never omits them. An operator needs to see that a card number was in the
question; that is often the whole story with a scam. Writing the number down
would copy the harm.
