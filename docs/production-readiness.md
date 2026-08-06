# Production readiness

Built in one working day. It runs, it persists to a real database with
migrations, it has tests on the behaviour that matters, and the layer
boundaries are enforced by a build that fails rather than by discipline. It is
not production ready, and this is what would need to happen first.

## What is actually there

Postgres with migrations on Docker, one migration per slice. Streaming with
cancellation wired from the tap through to the provider stream. Usage captured
per message, including thinking tokens. Structured logs with a redaction pass.
Timeouts and retry classes on every external call, with each degraded path
named rather than left implicit. Product policy in the domain, with tests on
the two rules that carry safety weight.

## What would break

Conversation content sits at rest with no retention policy, no access control
beyond the database credentials, and no field-level encryption. For a product
handling US consumer data in an anti-scam context this is the first thing I
would fix rather than the last.

Redaction catches structured identifiers only. Card numbers, emails and phone
numbers are matchable, but a sentence like "the man said my account at my bank
was frozen" is not, and in this product that kind of sentence is most of what
is sensitive. Masking narrows what a log leaks without doing much about the
conversation itself.

A partial answer is lost if the process dies or the user loses connectivity
mid-stream, because the row is written when the turn closes. Cancellation is
fine, since stopping also closes the turn and the partial gets written with
whatever it had. Losing the network is the case that loses the text. The fix is
inserting the row at stream start with a streaming state and updating it on a
throttle, which is around half an hour of work.

There is no authentication and there are no accounts, which the exercise
explicitly did not require, so the user context port takes an identifier and
trusts it. None of that survives contact with real users.

Images are not persisted. The message keeps media type, dimensions and a hash,
so a conversation cannot be reconstructed from the database, and a follow up
about the same photo re-sends it and pays for it again. Production wants object
storage behind an attachment port.

The prices are the published figures as of August 2026, sitting in a domain
catalogue. They produce an estimate rather than anything tied to real billing,
and they will go stale.

Behavioural verification is manual. There are tests that the scam check and the
disclosure rule appear in the assembled prompt, and no test that the model
obeys either of them. Of everything on this list that is the gap I would close
first once real traffic exists, since it is the one where being wrong costs the
user money rather than costing us tidiness.

Interface verification is manual too, and this one I found the hard way. There
is no React test renderer in the project, so no test has ever rendered a
screen. Three interface defects shipped with a green suite during the image
slice and only appeared once the app was running on a phone: a turn that hung
waiting for an upload event React Native never emits, a composer that
overflowed behind the keyboard, and a scrolling regression introduced by the
fix for the second one. Application and domain behaviour is covered well and
the interface is covered by nobody, which for a product whose whole argument
is that the screen works for someone of 80 is the wrong half to leave open.

Monitoring stops at structured logs. No tracing, no dashboards, no alerting, no
evaluation pipeline built from real conversations. The logs carry enough to
build all of that, which is why they were kept, but none of it is built.

Rate limiting is not implemented, so nothing sits between a client and the
provider bill.

## Order I would work in

1. Retention policy and access control on stored conversations.
2. The second provider adapter wired, so that a provider outage is not our
   outage.
3. Partial answers surviving a dropped connection.
4. An evaluation set built from real conversations, scored specifically for
   whether the scam check happened.
5. Tracing and alerting over the fields the logs already carry.

## A note on how this is worded

I have avoided saying the prototype is compliant with anything. Data protection
compliance needs a lawful basis, data subject rights, retention, processor
agreements and transfer mechanisms, none of which exist here. The claim I can
actually make is narrower: it was designed with the applicable obligations in
mind, disclosure and provenance marking are implemented as two separate things,
and the gaps above were identified during the build rather than found
afterwards by someone else.
