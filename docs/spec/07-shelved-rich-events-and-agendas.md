# Rich events and agendas (shelved)

Status: **agreed with the owner on 2026-11-14, not built.** Set aside in favour of speed
and efficiency, which come first. Nothing here is in the game yet. When it is taken up, it
is built in the three steps at the end, each played on a real model and committed apart.

This records what the owner decided, in their words where they gave them, so that it is not
argued again.

## Every event is told in full

> "Every event matters!!"

- Every event in the chronicle gets a full written account, automatically. There is no limit
  of two a turn and no "Read the full account" link to press.
- That covers the news the engine draws, the cast's moves and its reactions, the
  developments of background stories, votes, court rulings, changes in unrest and control,
  and the events that say how an order went (took effect, stalled, backfired, voted down).
- Length by weight: about 500 words for a major event, 300 for a significant one, 150 for a
  small one.
- The line recording that the player gave an order stays one line: it is the player's own
  words. The figures published at dawn stay out of the chronicle.

## What an account is not

> "I don't want extra reports on my policies or orders. I want the events to be letting me
> know for that. I also don't need stupid state of play that needs to be folded into the
> Events that come in."

- No separate report on an order. How an order went is told by the events it causes.
- No "state of play" or summary card. What is going on in the world is understood from the
  events themselves, which is why they must be rich.

> "An event is something that is caused or is the cause of your policies or it may not be.
> Countries and people and entities have agendas."

- An account describes the event as it happened in the world. It is not told about the
  player's orders and does not point back to them. Whether an event came from something the
  player did, or from somebody pursuing an aim of their own, is for the player to read from
  the news.
- The writer is still given what it needs to stay consistent: names and places already on
  record, and what that actor has done before.

## Agendas

> "Agendas can change, you know. Sometimes entities cannot or don't want to pursue an
> agenda." "Agendas should be changeable at runtime."

- Every actor has aims of its own, two or three, that do not depend on the player.
- **They live in the running campaign, not in the scenario file.** They are created when a
  campaign starts and can be changed at any point during play. The scenario file says only
  who the actors are.
- An aim has a state: **pursuing**, **shelved** (still wanted, but it cannot or will not
  push now), **dropped**, or **achieved**.
- What changes an aim:
  - it cannot be pursued: the actor is too weak, by the engine's own measure of its
    strength, or what it cares about is out of reach;
  - it no longer wants it: a move that fell flat, a story that faded, a deal struck with
    the player;
  - things move on: an event opens a new aim;
  - it succeeded.
- **Who decides what.** The engine and the dice decide that an aim changes and which way,
  from what is on record. A model says what a new aim is, in a sentence; that sentence is
  stored, so the actor stays consistent. This is the project's first rule, unchanged.
- An actor's moves, and the stories it is behind, come from the aim it is pursuing, whether
  or not that has anything to do with the player. A shelved aim can come back.
- The player is never told an actor's aims. They are learned from what it does and says, and
  by asking advisers. This follows the owner's decision the same day to take out the list
  of running stories.
- With no model, each kind of actor has a plain built-in aim, so the game still runs.

## Waiting, once every event is rich

- The player is never blocked: the clock can be moved and questions asked while writing
  goes on.
- Nothing is dropped. Accounts queue and are all written, the most important and the most
  recent first. The player's next move no longer calls an account off.
- A card shows its plain line, marked as still being written, until its account arrives.

## What it costs

Measured on `openai/gpt-oss-20b` at about 18 tokens a second, 8,192 tokens of context:

- A 300-word account takes 25 to 30 seconds. A turn with eight events is 2,000 to 2,500
  words: three to five minutes of writing in the background.
- Creating aims for sixteen actors adds about a minute when a campaign starts.
- A larger context window lets more be written side by side, and would shorten this most.

This cost is why it is shelved: the owner's concern on the day was speed and efficiency.

## Not settled

Two questions were put and not answered. The plan above assumes yes to both.

- Whether a writing queue that runs minutes behind is acceptable.
- Whether the cast's short reactions become full accounts too.

## Order of building

1. Rich events: an account for every event, written as news about that event.
2. The queue that never blocks: importance and recency first, nothing dropped, cards marked
   while they are written.
3. Agendas: created at the start, changeable in play, driving moves and stories.
