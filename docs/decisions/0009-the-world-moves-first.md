# 0009. The world moves first

Date: 2026-11-12. Status: accepted.

## Context

Play-testing after decision 0007 showed the opposite fault to the one it fixed. Every order
was now answered, but almost nothing happened that was not an answer. The cast spoke only
when an order touched it. The judge was told that continuity is the default, to write few
events and none when nothing notable would happen, and was allowed one significant event in
45 days. The fixed deck that fills quiet days is mostly colour and is switched off whenever
the judge runs. A player who sent orders every few days saw a world that only ever reacted.

## Decision

- **Members of the cast act unprompted.** As a turn of a day or more ends, the dice decide
  whether somebody moves first: a one-in-four chance for each day that passed, and a second
  mover in a turn of a week or more (always, in a turn of a month or more). At most two a
  turn.
- **The engine decides who, and why; a model decides what.** A rule in the engine
  (`restless`) weighs each actor's reason to act from the state of the country and its
  standing toward the player: an armed group fighting for a contested region, an opposition
  facing an unpopular government, a coalition partner grown wary, business under high
  inflation, a lender when a crisis line is crossed. Keyed dice pick among them by weight. The
  chosen actor's reason is given to the model, which writes the move as news. With no model,
  a template for that kind of actor is used.
- **A move is bounded like a reaction.** It may be a statement or one of the actor's listed
  actions, with the same effects, and may set up a later beat that the dice settle. Nobody
  answering an order in the same turn, or who moved in the last fortnight, is chosen.
- **A move is recorded as an event of its own** (`move`), significant by definition, caused
  by `actor:<id>` rather than by an order, and filed in the chronicle under dealings with
  that actor.
- **Moves ride in the call that already exists.** They are extra items in `turn.reactions`,
  each with a `motive` in place of an `order`, so on a local model a turn's answers and its
  unprompted moves are still one call. A turn with nothing ordered now makes that call when
  somebody moves.
- **The judge is told to write the world's own events:** about one for each week judged, at
  least one significant event in any period of a week or more, and things done by parties,
  courts, provinces, markets and neighbours without reference to the government. The budget
  rises to one significant event a fortnight (from one in 45 days) and one major event in any
  period of two weeks or more (from 30 days). A significant event no longer has to cite an
  earlier event; a major one still does, and still gets a second opinion.

## Consequences

- A short move with nothing ordered is still instant, since nothing is read or judged before
  it commits, but it may now be followed by one model call. "Short moves call no model" is
  no longer true of what follows the commit.
- The world is now a different one for the same seed than before this change, and a turn of
  20 days is not the same history as the first 20 days of a turn of 60: moves happen as a
  turn ends. Rewinding to a date inside a turn therefore ends the turn on that date and runs
  its aftermath there, which gives the same moves as stopping the clock on that day would
  have.
- A more eventful judge costs more output tokens on the one call a turn waits for.
- Still not built: actors with traits, private motives and plots; moves that reach the
  player's inbox as a demand to answer; "to next major event" stopping on a move, since
  moves are written after the turn commits.
