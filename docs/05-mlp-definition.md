# 05. What Minimum Lovable Means Here

The trap in a two day exercise is building a thin demo that touches every requirement badly. The opposite trap is polishing one flow and shipping nothing else. This file is the tiebreaker.

## The bar

A senior user should be able to open the app, ask for help in the way that suits them, and get an answer that is clear, quick enough, and never leaves them wondering what is happening. If that is true, the prototype is lovable even with half the feature list missing.

Concretely:

1. **The wait is never ambiguous.** Every second of latency is accounted for by something on screen that a non technical person understands.
2. **Answers are readable.** Big text, short sentences, steps numbered. Streaming arrives at a pace a slow reader can follow, not in one dump.
3. **Nothing is unrecoverable.** Every failure has a plain explanation and one obvious way forward.
4. **Follow ups work.** Asking "and how do I do that on my phone?" after the first answer works without repeating context. That is what makes it an assistant and not a search box.
5. **Stop actually stops.** Immediately, visibly, with the partial answer preserved.
6. **The user knows what they are talking to.** Cheap to build, and for this audience it is the difference between trust and suspicion.

If a cut threatens any of those six, it is not a cut.

## Cut heuristics

First test for any proposed cut: how many minutes does it actually save? If the answer is under an hour, it is not a cut, it is work. Three of the six pre-kickoff decisions were reversals of cuts that saved nothing worth having.

Cut freely:

- Anything only a second user would need (accounts, profiles, sync, history across devices).
- Anything operational instead of user facing (dashboards, admin, analytics UI).
- Provider integration breadth beyond what the comparison requires.
- Anything the brief explicitly says is not required.

Cut carefully, with a backlog entry and a note in the write up:

- The monitoring stack beyond structured logs and redaction.
- Retry and fallback sophistication beyond one working fallback path.
- Offline behaviour beyond a clear "you appear to be offline" state.

Do not cut:

- Streaming with visible cancellation.
- Conversation context for follow ups.
- All three input modes working end to end, since the brief names them.
- Usage and cost accounting, explicitly asked for and cheap to do properly.
- The state visibility in `03-senior-ux-principles.md`.
- AI disclosure and provenance marking (ADR-006).
- Real persistence with migrations (ADR-003).
- Structured logs with redaction (ADR-004). Observability is a property of the system, not a feature to be traded.
- The Control+ user context port with its stub adapter (ADR-001). What can be trimmed is how much the prompt does with the context, never whether the seam exists.
- Accessibility basics: text size, target size, contrast, labels.

## The "explain it later" rule

A capability with a named port and a stub adapter reads as design. The same capability with no seam reads as an omission. The user context port is the clearest example in this build. There is no Control+ API to call, so the adapter returns sample data, but the contract is concrete and defensible.

The rule has a limit, and ADR-003 is where I found it. "Port plus README paragraph" is a good answer when the real implementation is genuinely out of reach. It is a bad answer when the real implementation takes forty minutes. Ask which case you are in before reaching for the stub.

## Time budget sanity check

Two working days is roughly 16 hours, and the write up, the recording and the provider comparison are real deliverables that eat several of them. Assume something like:

- Setup, skeleton, wiring: 2h
- Backend domain, use cases, tests: 3h
- Provider adapters and streaming: 3h
- Mobile app and state machine: 4h
- Provider evaluation and comparison: 2h
- Write up, README, recording: 2h

Roughly 1.75h is already committed by the six pre-kickoff decisions: the context port, the persistence adapter and migrations, Docker setup, and provenance metadata. That came out of the setup and backend lines, so the domain modelling has less room than the table suggests.

That leaves no slack, which is the point. When the assistant proposes an option costing more than its share of this budget, it must say so.
