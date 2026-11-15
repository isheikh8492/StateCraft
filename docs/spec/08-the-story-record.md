# The story record (proposed)

Status: **approved by the owner as written on 2026-11-14.** Step 1 of the order of building
is built; see "What has been built" at the end.

## What it is for

The owner's words: "the entire story in one place can help cheapen the calls, but more
importantly it also helps the logic easier. Now all actors have a way to be synced
together. The only problem is: what if there's info we don't want actors to know, as part
of scheming."

So it has three jobs:

1. **One place for the whole story.** Everything established about the world is held once,
   and every part of the game reads and writes it there.
2. **Cheaper calls.** A model call is given only the part of the story that concerns it.
3. **Secrets.** The record holds the whole truth. Nobody is handed the whole truth: each
   reader gets only what they know.

## What is wrong today

Each model job gathers its own context, by recency and by its own rule:

| Job | What it is sent now |
| --- | --- |
| A reaction | the last 6 events, the whole of each region's unrest |
| Wording a turn | the last 8 events, the economy, every group's mood |
| A story development | the story so far, the whole cast, the last 40 made-up names |
| An adviser's answer | the last 12 events, the whole cast, the last 60 made-up names, the conversation |

Three faults follow. A name made up 70 entries ago is forgotten. A call about Karachi
carries names from a Quetta story. And there is no notion of who knows what: a test game
printed "a covert meeting drew senior Taliban commanders" in the player's chronicle as
ordinary news.

## What the record holds

One kind of thing, an **entry**. Every entry has:

| Field | Meaning | Example |
| --- | --- | --- |
| `id` | Its own id | `e-214` |
| `kind` | `person`, `place`, `body`, `fact`, `story` | `fact` |
| `text` | What is established, in a sentence or two | "The PPP agreed to back the budget in return for a new canal authority for Sindh." |
| `about` | The ids it concerns: actors, regions, stories, other entries | `actor:ppp`, `region:sindh`, `story:r40-x2` |
| `since` | The day it became true | day 212 |
| `until` | The day it stopped being true, if it has | (none) |
| `knownTo` | Who knows it (see below) | `actor:ppp`, `office` |
| `from` | The event that established it | `r40-x2` |

The kinds:

- **person, place, body**: a card for anyone or anything given a name. "Interior Minister:
  Sardar Ahmed Zaman." Replaces today's list of made-up names.
- **fact**: something that is true or that happened and bears on later events: a deal, a
  promise, a threat, an appointment, who was at a meeting.
- **story**: one entry per running story holding a rolling summary of where it stands,
  rewritten when it develops, instead of the text of every step.

Events themselves stay where they are, in the ledger. An entry points at the event it came
from; it does not copy it.

Later, and only if the shelved agendas are taken up (see
`07-shelved-rich-events-and-agendas.md`), an actor's aims would be entries of a kind `aim`,
known only to that actor. Nothing else about this design would change.

## Where it lives

In the campaign's ledger, like everything else, as three new kinds of ledger event:

- `record.added`: a new entry.
- `record.revised`: an entry's text changed, or it stopped being true.
- `record.learned`: somebody came to know an entry.

Nothing is kept outside the ledger. That keeps what the ledger already gives: saving,
rewinding to any point, and branches all work on the record with no extra code, and a
rewind forgets exactly what was learned after that point.

## Who knows what

`knownTo` is one of:

- **`all`**: public. It was in the news.
- **a list of readers**: each an actor's id, or **`office`** for the player's own
  government (the player and their advisers).
- **an empty list**: known to nobody. Only the engine uses it, for instance the result of
  a throw of the dice before it is revealed.

The whole of secrecy is one rule, enforced in one place: **a reader is given an entry only
if `knownTo` is `all` or lists that reader.** The model writing as an actor cannot use what
that actor does not know, because it was never sent.

Who sets `knownTo` when an entry is made is the engine's decision, from the kind of event
it came from. A model never chooses who knows something.

| Where the entry came from | Known to |
| --- | --- |
| News the engine drew; a vote; a court ruling; unrest changing | all |
| An actor's public move or statement | all |
| The player's order, once announced | all |
| A conversation between the player and an actor | that actor and `office` |
| What an adviser tells the player | `office` |
| A story stirring (its first development) | the actor behind it, and anyone named in it |
| A story building | all, unless it is a story of an armed group: then as stirring |
| A story breaking or fading | all |
| An actor's aims (if built) | that actor |

## How knowledge spreads

Decided by rules and dice, never by a model. Each makes a `record.learned` event.

- **Telling.** When an actor says something to the player in conversation, `office` learns
  it. When the player tells an actor something, that actor learns it.
- **Going public.** When a secret thing happens in the open, it becomes `all`.
- **Leaks.** A secret known to more than one reader has a small chance each day of
  reaching one more reader who has reason to care, and a smaller chance of going public.
  The more who know, the likelier.
- **Intelligence.** `office` has a chance each day of learning a secret that concerns a
  region or an actor it is watching. What it learns can be wrong: the record then holds a
  second entry, known to `office`, with different text, marked as mistaken so that the
  engine never treats it as true. The player is not told which reports are wrong.

## What the player sees

- The chronicle shows an event only if the entry it made is known to `all` or to `office`.
- A secret development is recorded and not shown. If it later leaks or is reported, a card
  appears then, dated then: "It emerged that ...".
- Advisers answer from what `office` knows. They do not know other actors' secrets, and say
  so if asked.
- Nothing on screen marks that something is hidden.

This is the same choice the owner made in taking out the list of running stories.

## How a call reads the record

One function, used by every job in place of each job's own gathering:

```
recordFor(reader, about, room) -> entries
```

- `reader`: who the call is written as (`actor:pti`, `office`), or `all` for news.
- `about`: the ids the call concerns: the actor, the region, the story, the order.
- `room`: how many tokens the entries may take.

It returns, in this order, until the room is used up:

1. entries about the same story;
2. entries about the same actors;
3. entries about the same region;
4. the most recent public entries, for general awareness.

Only entries the reader knows, and only those still true. It is a lookup by id: no model,
no search index. The engine already knows which actor, region and story each call is
about.

## How writing adds to the record

Models already declare the names they introduce before they write (decision 0014). That
list becomes entries. Two things are added by the game, not the model: `about`, from what
the call concerned; and `knownTo`, from the table above. A name already in the record is
used as it stands and not added again, as now.

A story's rolling summary is rewritten when the story develops, as part of the call that
already writes that development: one more short field, no extra call.

## What it should cost and save

Measured today on `openai/gpt-oss-20b`; the right-hand column is an estimate, not a
measurement.

| Job | Sent now (tokens) | Expected |
| --- | --- | --- |
| A reaction | 1,650 to 1,800 | about 1,300 |
| A story development | 1,150 | about 900 |
| Wording a turn | 1,950 | about 1,500 |
| An adviser's answer | 3,350 to 3,550 | about 1,800 |

- Reading the prompt is 12% of model time today, so the direct saving in time is small.
- The real gain is room: the model's 8,192-token window is shared between calls running
  together. Today one adviser's answer takes nearly half of it.
- Cost stops growing with the length of the game, because summaries are sent in place of
  history.
- It does nothing about the model's hidden thinking, which is a third of all output.

## Order of building

Each step is played on a real model and committed apart. Each leaves the game working.

1. **The record, with everything public.** Entries, the three ledger events, the index,
   `recordFor`. Today's list of names becomes entries. Every job reads through
   `recordFor`. No secrets yet. This is the step that makes calls cheaper.
2. **Who knows what.** `knownTo` set by the table; the one rule enforced in `recordFor`;
   the chronicle filtered. Secret developments stop appearing as news.
3. **Knowledge spreading.** Telling, going public, leaks, intelligence.

## How it would be tested

- For every model call made in a long test game, check that nothing in what was sent is an
  entry its reader does not know. This is the test that matters most.
- A secret story's first development does not appear in the player's chronicle; after a
  leak, it does.
- An adviser asked about another actor's secret does not have it in what it is sent.
- A name established early in a long game is still used when its subject comes up again.
- Rewinding to before something was learned forgets it.
- A saved game from before this change opens: its names become public entries.

## Risks

- **A wrong `knownTo`** either leaks a secret or leaves an actor ignorant of something
  obvious. The table above is the only place it is decided, which makes it checkable.
- **A model can still invent.** A writer given only public entries cannot reveal a real
  secret, but it can make one up that happens to contradict a hidden entry. When the
  hidden entry comes out, the two disagree. The made-up one was recorded as public, so the
  record shows which came first; the engine's entry wins.
- **Too little context.** A call given only what concerns it may miss something a person
  would have known from the general news. Step 4 of the ordering above is there for that,
  and its share of the room can be tuned.

## For the owner to decide

1. **Is `office` one reader?** As written, the player and every adviser know the same
   things. The alternative is that an adviser can hold something back from the player.
2. **Can your intelligence be wrong?** As written, yes, and you are not told which reports
   are. The alternative is that what `office` learns is always true.
3. **Which stories start in secret?** As written, every story's first development is
   secret, and an armed group's second is too. The alternative is that only armed groups
   and the army act in secret, and parties and business act in the open.
4. **Should anything show that you are missing something?** As written, no.
5. **Build order.** As written, cheaper calls first, then secrets, then spreading. Secrets
   could come first if they matter more to you than cost.

## What has been built

**Step 1, the record with everything public (2026-11-14).** Entries, the three ledger
events, `recordFor`, and every writing job reading through it. Names a writer makes up are
filed under what the writing was about. What an actor does goes on record as a fact about
it. Each running story has one entry, rewritten as it develops by the call that writes the
development. A saved game from before opens with its names as public entries.

Measured on `openai/gpt-oss-20b` (`docs/research/sessions/2026-11-14-record.md`): an
adviser's answer was sent 2,630 to 2,980 tokens, against 3,350 to 3,550 before. That is
less than the 1,800 estimated above: the adviser's own instructions, which this does not
touch, are the larger part of what it is sent. Reactions, story developments and the
wording of a turn were about as before in a game three weeks old; their saving comes as a
game grows, since what they are sent no longer grows with it. A story development used a
name another piece of writing had put on record.

**Step 2, who knows what (2026-11-14).** An event can say who knows it happened, and the
one rule is enforced wherever events and entries are read: the player's view and chronicle
are given what `office` knows, news writers what everyone knows, an adviser what `office`
knows, any other actor what is public and what it is itself party to. An actor's story
begins out of sight: its first stirring is known only to whoever is behind it, an armed
group's second step too; how a story ends is public. A story's entry in the record is known
to whoever knows its latest development, and becomes public when the story comes into the
open. Names made up in a conversation are known to those who were in it. A secret event
does not stop the clock and gets no unasked account.

Tested without a real model (test "who knows what"): a secret about the army is sent to the
army's own calls, never to an adviser's or a rival's, nor to any call in a month of play;
learned by `office`, it is sent to the adviser and still not to a rival; made public, to
everyone. Not played on a real model: nothing in it depends on one.

**Step 3, knowledge spreading (2026-11-14).** Each day, while a secret is between two days
and six weeks old, there is a 4% chance the player's government hears of it and a 2%
chance it becomes public. What the government hears arrives as a card, "Intelligence
reported that ...", known to `office` alone; a quarter of such reports put the matter in
the wrong region, and nothing marks which. A leak arrives as a public card, "It emerged
that ...", and nothing more is heard of that secret. The secret event itself is never
shown. The story's entry in the record is learned by whoever the report reached, unless
the report was wrong. A report made before its subject was written up is given the written
text once it exists.

Played on `openai/gpt-oss-20b` (`docs/research/sessions/2026-11-14-secrets.md`): over nine
weeks, four first stirrings and an armed group's second step were kept from the player;
one intelligence report reached the government eighteen days after its subject.

Built differently from the design above, or not built:

- **Telling.** What an actor says to the player is known to the player's government, as
  designed. The other half, an actor learning what the player tells it, is not built: it
  needs the game to understand what was said.
- **Leaks to one more reader.** A leak goes public or not at all. It does not reach one
  further actor first.
- **Wrong intelligence** is a wrong card, not a second entry in the record. Advisers are
  given the card, so they repeat the mistake; the record itself is never made wrong.
- All the odds are placeholders until calibration.
