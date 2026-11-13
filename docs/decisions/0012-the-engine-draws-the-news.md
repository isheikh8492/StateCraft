# 0012. The engine draws the news; a model only words it

Date: 2026-11-12. Status: accepted. Supersedes the judge's part of decision 0009.

## Context

The judge wrote the country's own events free-hand. In three sessions on a real local model
it wrote monsoon floods in late November, had insurgents rally for a ceasefire they had just
rejected, put an armed group's attack in a province it does not fight in, repeated the same
protest month after month, and sized fourteen events in a row "significant". It was being
trusted with facts: what happened, where, when and how much it mattered.

## Decision

- **The engine draws what happens** (`packages/director/src/happenings.ts`). For each day of
  a period, keyed dice decide whether something of the world's own happens (about once a
  week) and which entry of a deck it is, weighted by the state of the country: the month,
  prices, unrest, fighting, crisis lines crossed. The entry fixes the kind of thing, how
  much it matters, and what it moves, inside the limits for effects outside the catalogue.
- **It involves the cast and keeps to the map.** An entry may call for a member of the cast
  of a given kind; one tied to a region acts in that region. Its cause is that actor.
- **It keeps to the calendar.** Weather and harvests are tied to months.
- **Nothing repeats within a period**, and events that matter are rationed: one, plus one
  for each fortnight.
- **An order stirs something among ordinary people** half the time, and always when it
  backfired: an event that cites the order, in the order's region.
- **The judge words each happening** in one sentence specific to the country, and decides
  nothing about it. Its reply is keyed by happening id. A line that is missing, invents a
  figure or passes judgment is replaced by the entry's plain line and never costs a second
  call. Only the first eight happenings of a period are worded; a long run keeps the plain
  line for the rest. With no model, the plain line is the news.
- A short move with nothing ordered still calls no model before it commits: its happenings
  use the plain line.

## Consequences

- Measured on `openai/gpt-oss-20b`, same month of play as before: the judge's output fell
  from about 545 tokens a turn to 184 and its time from 35 s to 14 s; a turn with orders
  took 17 s on average against 33 s; 19 of 19 calls answered first try
  (`docs/research/sessions/2026-11-12-month-2.md` against `2026-11-12-month-1.md`).
- The world can no longer be surprised by a model. Anything it does on its own must be an
  entry in the deck, so the deck is now content that needs growing, and it belongs in the
  scenario pack rather than in code once there is a second country.
- No event the world draws is "major". Grave events come from the engine's own rules
  (unrest, control, crisis lines) and from what the cast does.
- Turns saved before this keep the older day-by-day draw when they are run again.
