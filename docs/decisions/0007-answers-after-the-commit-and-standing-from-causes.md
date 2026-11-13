# 0007. Answers after the commit, depth on demand, and standing from recorded causes

Date: 2026-11-12. Status: accepted.

## Context

Play-testing the first slice showed three problems. Turns were slow because writing ran before results appeared. Much of what was written (ministry reports, long entries, monthly summaries) was never read. And nothing answered the player: an order changed numbers and the world stayed silent.

## Decision

- **Only two model calls may run before a turn commits:** reading the boxes and judging the period. The commit shows the date, figures, map and outcomes at once.
- **The cast answers after the commit.** The engine decides who an order touches, from each actor's listed interests. Up to three answer in full, written side by side; the rest are named. An answer may be an action chosen from that kind of actor's short list, with effects inside the limits for events outside the catalogue, and may set up a later beat that keyed dice decide on its day.
- **Reactions change the world in a second, small commit** of their own, with its own snapshot. A move made while they are still arriving starts once they have landed, so the record keeps its order.
- **Depth is written on demand and saved once.** An event's one-line summary is its headline. The full account of an event or a reaction is written when the player opens it, stored in the ledger, and never regenerated. Ministry reports and monthly summaries are removed; policy milestones are events in built-in wording.
- **Standing moves only through recorded causes.** Each actor's standing is recomputed from the ledger: orders it likes or dislikes, undertakings given, kept or lapsed, and threats. A model can report that the player made an offer; the engine decides what it is worth and whether it was kept.
- **Unasked messages and advice use rules and built-in wording.** They cost no model call.
- **The player sets how much is written** (Brief, Standard, Rich), which scales reactions and full accounts.

## Consequences

- A turn's wait is the judge, plus the reader when orders were sent. A move of under a week with nothing ordered calls no model.
- Cancel works until results appear, not during the writing that follows.
- With no model, reactions and answers come from templates and read generically; this is where a real model matters most.
- An undertaking is judged kept by the kind of order issued, not by its specifics. Tightening this needs one model call when an undertaking falls due.
- The spec's fuller persuasion model (seven kinds of lever, trust, red lines) is not built; standing is its first, simpler form.
- Save files carry new kinds of event (reactions, opened entries, conversations), so the save-file format is now version 3.
