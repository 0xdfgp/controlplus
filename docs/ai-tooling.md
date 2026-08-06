# AI tools, and the three examples

## How the work was split

I used two agents with separate jobs. An architect running in a Claude Project
produced the decisions and the implementation briefs, and never wrote
application code. Its instructions forced two options per decision and one
question per message, and stopped it from deciding anything on my behalf. Every
closed decision became an ADR in docs/decisions/decision-log.md before any code
was written against it.

Claude Code did the implementation, one vertical slice per session against a
written brief. It made no design decisions. When a brief turned out to
presuppose something that was still open, it stopped and asked instead of
picking.

Keeping that split working needed two things. There is a CLAUDE.md at the
repository root with the layer rules, the domain vocabulary and the closed
decisions in one line each, capped at around sixty lines because longer files
get skimmed. And there are checks that do not depend on anyone reading
anything: dependency-cruiser inside npm test, a pre-write hook that blocks
forbidden imports into the domain, and ESLint rules for one class per file and
no any in domain code. The reasoning behind that pairing is that the agent is
non-deterministic, so writing a rule down lowers the chance of a violation
without ever removing it.

I also installed an agent harness (OMC) partway through, which added subagent
delegation and structured commit trailers. It created a problem I had not
anticipated: it grants direct write access to .claude/, which is where the
hooks live, so the checks ended up somewhere the agent can edit them. What I
have instead is a written rule that they are never modified plus my own reading
of the diff before each commit, and that is weaker than the hook it replaced.

## An AI suggestion I rejected

There were several, and they came in two kinds.

The first kind was the assistant reaching for whatever sounded most careful
without checking whether the saving was real. It proposed an in-memory store
instead of a database, keeping message content out of the logs entirely, and
deferring the Control+ context integration to a backlog note. Each of those
sounded like reasonable triage inside a tight box. Each one cost more than it
saved: a prototype that forgets everything on restart, a non-deterministic
product with no way to investigate a bad answer, and a support assistant that
cannot see the account data that would make its answers useful. I overruled all
three and they became ADR-003, ADR-004 and ADR-001.

The second kind took longer to notice. When I asked it to settle the
persistence tooling it proposed Kysely and named Prisma as the alternative.
Prisma loses on a single argument, that its generated model tends to become the
domain model, which this architecture will not accept. Drizzle was never
mentioned, even though it sits in the same category as Kysely on the point that
actually decided the question, and additionally generates migrations from a
declared schema, which was worth twenty or thirty minutes across the slices. I
found it by asking why Kysely rather than Drizzle.

Nothing it told me was false, and the option it recommended was defensible. The
problem was the framing: a real candidate presented against one that loses
immediately, so I could have made a correct choice inside a set of options that
was wrong. That is harder to catch than a bad fact, and the only defence I found
was asking what had been left out before choosing between what I was shown.

## A problem that testing or manual verification found

Four of them. The two that changed the most work:

Gemini bills thinking tokens outside input and output. A live call came back
with 22 input tokens, 20 output, and a total of 430. The 388 token gap was
reasoning. The Usage value object modelled input and output only, so every cost
figure the product produced would have been roughly a tenth of the real spend,
against a brief that asks specifically for enough tracking to estimate what a
conversation costs. It only surfaced because the adapter was run against the
real provider with a real key. The agent had offered a stubbed-only path as its
recommendation, and that path would have checked usage capture against fixtures
we had written ourselves, and passed.

While building cancellation, every turn was being recorded as stopped, and five
of the six new tests passed anyway. The route was watching request.raw for
close, and since Node 16 an IncomingMessage emits close as soon as its body has
been read, which for a small JSON POST is immediately. A partial answer written
at the first delta looks the same as a correctly stopped one, so the suite had
nothing to object to. The assertion that caught it was the one checking for an
absence, that a stopped turn carries no completion event. Afterwards both halves
were mutation-tested, and one of the assertions survived its mutation, so the
stub was changed to track whether it had drained.

A third one is a different kind of failure and worth mentioning. ADR-021 set a
parameter capping the model's reasoning budget, and recorded that it removed an
eighteen second silence and most of the token spend. Starting a later slice, the
agent found that the adapter had never sent it. The decision had existed in the
log and not in the build for several hours, and nothing in the test suite
asserts that a closed decision is actually wired up.

## An architectural decision I made personally

There are several in the log. The one I would point at is treating a safety
behaviour as product policy instead of as something bought with reasoning
tokens.

Live probes showed the model spending between 76 and 90 percent of its tokens
on reasoning, with 18 to 52 seconds of silence before any text appeared.
Capping the reasoning budget removed the silence and most of the cost at the
same time, which is a good outcome for two requirements at once. But in one run
out of seven, the capped model skipped the scam check and told the user
outright that a fake "storage almost full" popup was normal and that nobody was
trying to trick them. That popup is a real scam vector, and in this product a
confident wrong answer is what costs the user money.

The obvious response is to buy the check back by paying for the reasoning
again. I decided against it, because that would have left the check holding by
accident, dependent on how much thinking the configuration happened to
purchase. It moved into the versioned domain policy as an explicit rule with a
test covering it, which is where the behavioural rules were supposed to live
anyway.

A related one, also mine: what the user sees while the model is reasoning. The
assistant proposed dropping the reasoning text and using the thought deltas
purely as a progress signal. I set the requirement more precisely than that,
because neither the raw reasoning nor an empty wait is acceptable here. What
goes on screen has to be calibrated to reassure rather than alarm. In an
anti-scam product the model's intermediate thoughts about fraud are close to the
worst thing you could put in front of a frightened 78-year-old, and a slow
reader is quite likely to take them for the answer.
