# 0015. Accounts are written unasked for events that matter, and never speak for the player

Date: 2026-11-13. Status: accepted. Extends decision 0014 to full accounts; changes
"Depth is written when you ask for it" in the overview spec.

## Context

From the owner, comparing chronicles side by side with Modern Day 2026: theirs carries a
dateline, a sequence of what happened, figures and quotes on every entry of note; ours was
one line an event, with a longer piece only for whoever clicked "Read the full account",
and that piece was held to the rule against inventing anything.

Decision 0007 made depth something you ask for, because writing ran before results
appeared. Since then the writing has moved off to one side: nothing the player waits for is
held up by it.

## Decision

- **A full account follows decision 0014.** It may make up texture: the hall, the road, the
  spokesman, the size of the crowd, what an official said where that fits what the record
  shows the actor did. It declares the names it introduces before it writes, and they are
  stored and reused. The event itself, its figures, the state of the country and what else
  happened are still not its to invent.
- **It is a scene, not a restatement:** a dateline in bold with the place, date and hour, the
  sequence, the people present by office and name, and where things stood when it ended. Up
  to 120, 300 or 500 words by how much the event matters, scaled by the Detail setting.
- **Events that matter get theirs without being asked for.** After a turn, off to one side,
  up to two events of that turn sized significant or major have their accounts written,
  after the news has been worded. Lesser entries keep "Read the full account". With no
  model nothing is written unasked: the built-in wording would add nothing to the headline.
- **An account never speaks for the player.** It may not have the head of government or
  their own office say, do, order, visit or decide anything that the record does not show.
  The writer is told so, the player's advisers are left out of the list of people it is
  given, and a sentence that names the player or their office anyway is taken out. What the
  record itself says the player did may be reported.

## Consequences

- Measured on `openai/gpt-oss-20b` (`docs/research/sessions/2026-11-13-accounts.md`): one
  account of 464 words took 67 seconds to write in the background. On a model that answers
  one request at a time it queues behind the cast's answers and the wording of the news, so
  an account can arrive a minute or two after its event.
- The first account written this way had the Prime Minister convene his cabinet, and the
  second had his Principal Secretary promise a crowd a review of the tax. That is why the
  last rule is enforced in code and not left to the instructions.
- Taking a sentence out can leave a heading with nothing under it. That is the lesser harm.
- An account is written from what is known when it is written. One written ahead of its
  event's hour knows nothing that happens later that day.
- More is now made up that is not recorded: a small model declares only some of the names
  it uses.
