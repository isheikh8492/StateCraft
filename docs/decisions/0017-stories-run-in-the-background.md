# 0017. Stories run in the background

Date: 2026-11-14. Status: accepted. Builds on decisions 0009 (the world moves first), 0012
(the engine draws the news), 0016 (the cast devises its moves) and on calls to a local
model running side by side.

## Context

What the player or the cast did produced one answer and, at most, one follow-up line. Then
it was over. The owner asked for actions that "cook things in the background": consequences
that develop over days and weeks while play goes on.

## Decision

- **A story opens** from every move an actor makes, and from every order of the player's
  that is large or outside the catalogue. Nothing new is stored: a story is the move or
  order that opened it, plus every later event that names it as a cause (`story:<id>`).
- **The engine carries it forward by dice.** Each day an open story has a chance to
  develop: 10%, rising to 22% where its region is in insurgency, and halved where the
  player has given an order in that region since it began. At least three days pass between
  two developments of one story.
- **Three developments and it is over:** it stirs (read in passing), it builds (news), and
  then it either breaks (major news, which stops the clock) or fades. Whether it breaks is
  another throw: 60%, or 30% where the player has acted on it.
- **What it does to the country is the engine's:** unrest where it plays out rises as it
  builds and breaks and falls as it fades, inside the limits for anything outside the
  catalogue.
- **A model says what each development looked like**, off to one side, as a line or two of
  news that follows from how the story began and what has happened in it since: a meeting,
  a rumour, a convoy, a deal. Developments of one story are written in order, each reading
  the last; different stories are written side by side. It may not speak for the player or
  resolve a story the engine has not ended. With no model the engine's plain line stands.
- **This writing is not called off when the player moves**, unlike unasked accounts: it is
  short, and it is the consequence of what the player did.
- **Six stories at most** are carried at once, the newest; one with no development in
  sixty days is over.

## Consequences

- Measured on `openai/gpt-oss-20b` (`docs/research/sessions/2026-11-14-stories.md`): over
  six weeks three stories ran. An armed group's raid went from a covert meeting to a convoy
  setting out to a depot stormed; an opposition march went from two planning meetings to a
  collapse. Eight developments were written, 21 to 36 seconds each, side by side, none
  repaired.
- The model stated the date in some lines although told not to, and reused a venue
  ("Frontier Corps Outpost 12") across a story where a new one would read better.
- A story's effects are on unrest only. It cannot yet move votes, standing or money.
- The player is not shown a list of open stories, only their developments in the chronicle.
- Follow-ups from decision 0016 still run beside stories: a move can have both a follow-up
  line and a story.
- The odds are placeholders until calibration.
