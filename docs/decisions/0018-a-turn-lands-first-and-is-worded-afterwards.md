# 0018. A turn lands first and is worded afterwards

Date: 2026-11-14. Status: accepted. Supersedes the part of decision 0011 that left the size
of an order's effects to the judge, and the part of decision 0008 that had the turn wait
for the reading and judging calls. Decision 0010 (no second opinion) stands.

## Context

A turn with orders waited for two model calls before anything happened: one to read the
boxes and one to judge the period. On `openai/gpt-oss-20b` at about 18 tokens a second that
was 37 to 56 seconds of nothing. The owner: "the model calls are really slow".

By then the judge decided very little. The dice already said how each order landed
(decision 0011) and the engine already drew the period's events (decision 0012). What was
left to the model was a number inside an allowed range for each effect, and the wording.

## Decision

- **The judge is not asked before the turn commits.** How far an order moves each thing is
  decided by keyed dice inside the part of its range that its landing allows. The news
  stands in the engine's plain lines and each order's note in a plain one.
- **After the commit, off to one side, a model words the turn.** The judge is told how each
  order landed and what it moved, with nothing left to choose, and writes the note; it
  writes the news as it already did for quiet turns. The lines replace the plain ones as
  they arrive. A turn with nothing to word makes no call.
- **This wording is not called off by the player's next move.** Only unasked full accounts
  are: they are long, and their entries keep a link to have them written on request.
- **A box the game's own reader places in the catalogue is not sent to a model to be read.**
  A box it cannot place still is, and that turn waits for the reading.
- The Inspector reads a turn's calls again as they arrive, since most now follow the turn.

## Consequences

- Measured on `openai/gpt-oss-20b` (`docs/research/sessions/2026-11-14-standing.md`): three
  turns with catalogue orders committed in 0.1 s each; one whose order had to be read by a
  model took 16 s. Before: 37 to 56 s.
- Everything a turn sets going was written 66 to 129 s after it landed, all of it side by
  side in the background. The cast's answers arrive later than they did, because the
  wording now shares the model with them.
- The player reads plain lines first and sees them change. On a fast model the change is
  quick; on a slow one a line may be read plain.
- The game's reader is keyword-based. An order phrased unusually but containing a catalogue
  keyword is read without a model and may be read wrongly.
- A model no longer has any say in a number. That closes the last place where one could
  move the world, and removes the judge's occasional out-of-range value and its repair.
