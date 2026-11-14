# 0016. The cast devises its own moves, and the engine sizes them

Date: 2026-11-14. Status: accepted. Changes how decision 0009's moves and every answer to
an order are chosen; the fixed lists of decision 0008's reaction jobs remain only as the
wording used without a model.

## Context

Each kind of actor had a short hand-written list of things it could do, each with fixed
effects: an opposition party could "call street protests" and nothing else. A model picked
from the list and wrote the words. In the owner's own campaign Pakistan Tehreek-e-Insaf
answered five orders running by calling street protests. The owner asked for moves that are
not hardcoded.

The rule that must hold is the project's first: the engine and the dice decide what
changes; a model only words it.

## Decision

- **What an actor does is the model's to invent.** There is no list of moves. The model is
  told to think what this actor, with its people, money, seats, guns or pulpit, would do
  about this order now, and names the kind of move in a few words ("court petition").
- **The model says what the move presses on, never how hard.** It picks one to three things
  from the actor's reach, each with a direction, raise or lower. Reach is a list of parts of
  the world the engine already tracks (the government's support in a group of the public,
  unrest in a region or across the country, growth, prices), set per kind of actor in
  `REACH`. It limits what an actor can touch, not what it can do. An actor with nothing in
  reach, such as a foreign government, can only speak.
- **The engine sets the size.** An actor's strength runs from 0.2 to 1: from its kind, from
  its seats against a majority if it leads a bloc, and, for those who live off discontent,
  from how little the public likes the government. Each press is the limit for an effect
  outside the catalogue, times that strength, shared across the presses.
- **The dice decide whether it comes off**, with odds of 0.3 to 0.7 by strength. Every
  devised move has a follow-up some days later, in the model's words or the game's: one
  throw decides both which line is printed and whether the effects begin, on that day. A
  move that falls flat changes nothing and is reported as having fallen flat.
- **The kinds of move an actor has made lately are passed back** as those few words, so the
  next is something else unless escalation is what it would really do.
- **A follow-up may not speak for the player:** it says what the actor, its followers or
  the public did, never what the government decided.
- With no model, the built-in moves and their fixed effects are used as before.

## Consequences

- Measured on `openai/gpt-oss-20b` (`docs/research/sessions/2026-11-14-moves.md`): over
  four orders PTI made a statement, called a mass rally, boycotted parliament and marched
  in Karachi; the army redeployed troops; a provincial government set up a mediation
  council. No call was repaired or fell back.
- It is slower: the call that writes a turn's reactions took 42 to 63 seconds for three to
  five actors, because each now settles a move and a follow-up before its report.
- A local model still chooses oddly at times: an armed group "striking" over a sales tax.
  Reach bounds the damage, not the sense.
- Effects are still only those the engine tracks. A move cannot yet cost the government
  votes in the assembly or an actor its standing: neither is an effect target.
- The rule against speaking for the player in follow-ups was added after this session and
  has not been played on a real model.
