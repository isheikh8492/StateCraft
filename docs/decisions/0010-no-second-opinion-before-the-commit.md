# 0010. No second opinion before the commit

Date: 2026-11-12. Status: accepted. Withdraws REQ-JOB-12.

## Context

The judge's major events were sent to a second model call, `turn.review`, before a turn
committed, and dropped if that call doubted them. Decision 0009 allowed a major event in any
period of two weeks or more. In the first year played on a real local model
(`docs/research/sessions/2026-11-12-year-1.md`) the review then ran on 14 of 17 judged
turns and cost 6.7 seconds each on average, as a third call before the commit. The spec
allows two.

## Decision

- `turn.review` is no longer called. The job stays in the code, unused, until something
  needs a second opinion after the commit.
- What holds a grave event in check is the engine, not a second model: "major" is not
  offered in the schema when the budget allows none, an event over the budget is taken down
  a size, a major event with no cited cause is taken down to significant, and an event's
  effects are bounded however it is sized.
- REQ-JOB-12 is withdrawn.

## Consequences

- A judged turn makes two calls before it commits again, in every case.
- An implausible major event that cites a real cause is no longer caught. It can state
  nothing the engine did not allow, so the damage is to the story, not to the world. If play
  shows it matters, the place to fix it is the source of events (see the journal: events
  drawn by the engine from the cast and the state of the country, as unprompted moves are),
  not a third call.
