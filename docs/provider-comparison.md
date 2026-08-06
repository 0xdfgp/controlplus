# Provider comparison and recommendation

Four candidates, four fixture questions each, run sequentially on 5 August
2026. The full run is in the harness results file; this is what I take from it.

The candidates are Anthropic claude-sonnet-4-5, Anthropic claude-opus-5,
Google gemini-3.5-flash and OpenAI gpt-5.5. The fixtures are a written support
question, a screenshot of a scam warning, a voice question, and a follow up
that depends on the first answer.

## What the numbers say

| | First token (median) | Tokens across 4 turns | Cost across 4 turns |
|---|---:|---:|---:|
| claude-sonnet-4-5 | 1.00s | 4,217 | $0.0203 |
| gpt-5.5 | 2.52s | 4,612 | $0.0522 |
| claude-opus-5 | 2.96s | 6,868 | $0.0817 |
| gemini-3.5-flash | 7.86s | 3,759 | $0.0111 |

First token is the first chunk of visible answer text, not the first event on
the stream. It is what the person actually waits for, and for this product it
matters more than total time. Someone of 80 reading slowly will not notice
that an answer took nine seconds to finish. They will notice eight seconds of
nothing.

That single column separates the candidates more than anything else. Gemini is
the cheapest by a wide margin and starts writing nearly eight times slower
than Sonnet. Cost per conversation is fractions of a cent either way, so
buying seven seconds of silence to save a cent and a half is not a trade this
product should take.

## What the quality measurement is worth

Fifteen of sixteen answers failed the rubric, and the two judges agreed on the
overall verdict of only seven of sixteen. Both of those numbers are worth
reading carefully before anyone draws a conclusion from the pass column.

A 44% agreement rate on binary verdicts is close to what two coin flips would
produce. When a rubric fails almost every candidate on almost every question,
the usual explanation is the rubric rather than the models. The two items
driving most of the failures, whether every technical term is explained in the
same line and whether the answer admits uncertainty, are also the two most
open to interpretation, which is consistent with the judges disagreeing.

So the quality half of this comparison is not a ranking. What it is, is a
working two-layer harness with a measured disagreement rate rather than an
assumed one, which is the thing ADR-033 asked for and the reason it asked for
calibration against human labels before trusting a score.

One item is worth pulling out of the noise. The scam check, whether the answer
says what would make something a scam before reassuring the person, failed in
five of sixteen. That item is the least subjective of the four, since either
the sentence is there or it is not, and it is the one this product cannot get
wrong. It is also the exact behaviour that probes found a model skipping
unprompted, which is why the rule lives in versioned domain policy rather than
being left to the model.

## Recommendation

**Default text conversations: claude-sonnet-4-5.** It reaches first token in a
second, which is two and a half times faster than the next candidate, and it
costs a third of what OpenAI does across the same four turns. For a product
whose first non-negotiable rule is that no second of waiting is unexplained,
that column decides it.

**Harder questions: claude-opus-5.** It produces substantially longer and more
structured answers, and on an earlier probe it performed the scam check
unprompted where Sonnet did not. It costs four times as much and starts three
times slower, so it belongs behind a routing decision rather than on the
default path. The routing signal itself is not built; today the model is
wired in the composition root.

**Image analysis: whichever model is already answering.** All four read the
screenshot correctly. An image costs around 1,350 to 1,800 input tokens
depending on the provider, paid once because history carries a reference
rather than the bytes. There is no case here for routing images to a different
provider than the text they arrive with.

**Voice transcription: OpenAI gpt-transcribe.** It is the only candidate with a
dedicated transcription path, and it costs $0.0045 per minute of audio, which
is negligible next to generation. In the product itself, voice is transcribed
on the device and never uploaded, so this path exists for the evaluation and
as the documented production alternative if on-device quality proves uneven
across platforms.

**Future realtime voice: not an extension of any of this.** It needs a
bidirectional transport and no intermediate text step, which is a different
architecture rather than another adapter. OpenAI and Google both ship realtime
models; the decision would be taken then, against requirements that do not
exist yet.

**Fallback: per capability, before the first text chunk.** Generation and
transcription have different implementations and different failure modes, so
one provider's fallback is not the other's. Fallback runs only before any text
has reached the client, because switching mid-answer produces one answer in
two voices and makes the provenance record untrue.

## Caveats worth stating

The audio row was measured on synthetic speech generated from a committed
script, not on a recorded voice. It is a fair measure of latency, cost and
integration effort for the transcription hop, and it says nothing about
recognition accuracy on an older voice, which is exactly where quality is
known to diverge.

Costs are estimates against published prices read on the day of the run,
priced in three parts because providers bill in three parts. They are a
snapshot and not an integration with billing.

Anthropic bills reasoning inside output tokens and reports no separate count,
so its reasoning column is zero rather than small. Gemini reports thinking
separately. OpenAI reports it inside output tokens and the harness subtracts
it so the columns sum to the provider's own total.

With three model families and four candidates, no single judge can grade all
four without grading its own family. Three candidates share the OpenAI judge
and the OpenAI candidate is judged by Gemini, so the OpenAI row is not graded
by the same instrument as the other three.

Candidates ran sequentially rather than concurrently, because latency measured
under self-inflicted load is not a number anyone wants.

## What I would do next

Calibrate the rubric against hand labels and rewrite the two items that
produced most of the judge disagreement. Until that happens the pass column is
a signal that the harness runs, not a ranking of the models.
