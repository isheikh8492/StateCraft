# Research journal

Newest first. What was played, what was measured, what was learned, sources, what was
decided. Rules for this file are in `docs/GOAL.md`.

## 2026-11-12, pass 2: how an order lands

**Built.** Keyed dice decide whether an order goes as intended, in part, stalls or backfires;
the judge is told and writes why (decision record 0011). A dropped connection to the model
server is tried once more before the call is given up: an intermittent test failure turned
out to be exactly that, a stale socket sending a whole answer to built-in wording.

**Played.** Eight orders over a month on `openai/gpt-oss-20b`, from `plans/landings.json`.
Transcript: `sessions/2026-11-12-landings.md`.

**Measured.** 9 calls, all answered first try, none repaired, none fell back. A turn with
orders took 46 s on average and 57 s at worst (three orders at a time, so more to read and
judge than in the earlier sessions).

**Learned.**

1. *Landings vary now.* Five in part and one backfired among the six that went ahead. The
   backfired tax cut got its own news line and a sentence of cause from the judge.
2. *The reader threw away two clear orders.* "Open talks with tribal elders in Balochistan"
   and "Nationalise the three largest private banks" came back as too vague, with a question
   about how to implement them, and were blocked. In the first month the same nationalisation
   order went through. Whether an order is clear cannot be left to the model.
3. *"To next major event" stops properly now* (eight days, on an attack), but the event that
   stopped it had the Baloch Liberation Army shelling a checkpoint in Skardu, which is in
   Gilgit-Baltistan. The judge's free-hand events are still the weakest writing in the game.
4. *The judge's note sometimes argues with the landing:* "Subsidy cut stalled by cabinet
   delay, but subsidy reduced" for an order that went in part.

**Decided.**

- Fixed now: the game's own reader has the last word on vagueness. If the keyword rules can
  read an order, or it is a full sentence, it goes ahead.
- Next: events of the world's own drawn by the engine from the cast and the state of the
  country, in place of the judge's free-hand lines (seen wrong in all three sessions: out of
  season, contradicting a reaction, in the wrong province); then ways to lose office.

## 2026-11-12, pass 1 continued: a year and a half on a real model, and the M0 gate

**Played.** Eighteen in-game months on `openai/gpt-oss-20b`, on the build with the month's
fixes, from `plans/year-1.json`: 12 orders, 7 questions, 4 full accounts, moves from an hour
to a month and one "to next major event", and a rewind. No step failed. Transcript and
numbers: `sessions/2026-11-12-year-1.md` and `.json`.

**Measured.**

| | |
| --- | --- |
| Model calls | 69 |
| First try / second try / fell back | 65 / 3 / 1 |
| Held to the schema | 69 of 69 |
| Put right locally | 13 |
| Wait for a turn with orders | 37 s on average, 78 s at worst |
| Time to first token / generation speed | 3.6 s / 19.6 tokens a second |
| Tokens in / out / thinking | 99,363 / 20,901 / 6,047 |
| Events recorded / unprompted moves | 199 / 26 |

Second tries fell from 4 in 21 calls to 3 in 69. The judge needed none in 17 turns; in the
month it needed 2 in 5.

**The M0 gate is passed:** a term of more than a year played end to end on a local model.

**Learned.**

1. *Every order landed "partial".* All twelve. The judge is told that most large changes
   land partially and never picks anything else. Nothing ever goes as intended, stalls or
   backfires, so issuing an order has no suspense.
2. *"To next major event" ran for five and a half months.* It looked only at what the engine
   did after the day's planned events, so nothing the judge or the cast did could stop it.
3. *A second opinion ran on 14 of 17 judged turns* at 6.7 s each, as a third call before the
   commit.
4. *Follow-ups lost their subject.* A later beat is printed weeks afterwards as news of its
   own, and several read "It may intensify insurgent activities" or "They launch
   coordinated ambushes".
5. *The judge's events repeat and flatten.* Fourteen in a row sized "significant"; "Sindh
   farmers protest over wheat prices" and "a brief riot in Islamabad central market" came
   back almost word for word the next month. With the budget raised, "significant" stopped
   meaning anything.
6. *The order reader still wasted calls:* twice it left the region off an order that named
   one, and once it filed a card in two places three times running and fell back.
7. *Notes for the record carried invented figures:* "Development spending cut by 19% of GDP"
   for an order to cut it by a fifth.
8. *A year has no stakes.* The army warned of "a more decisive intervention" and the
   opposition demanded the Prime Minister's dismissal, and neither can happen. There is no
   way to lose.
9. *A reply mislabelled as a threat:* the Finance Minister was asked a plain question and the
   model filed a "threat" lever, which costs standing. Seen once; watch for it.

**Decided.**

- Fixed now: "to next major event" stops on anything notable that day; no second opinion
  before the commit (decision record 0010); a follow-up is given its subject back and the
  writer is told how it will be printed; a card filed twice keeps its policy; a region named
  in the order is used; a note with invented figures is replaced with plain wording; an
  account's undeclared figure is taken out instead of asked for again.
- Next, in this order: the dice decide how an order lands and the model words it (finding
  1); freedom of action (the catalogue and novel orders); ways to lose office (finding 8);
  events of the world's own drawn by the engine (finding 5).

## 2026-11-12, pass 1: the first month on a real model

**Played.** One in-game month as Prime Minister of Pakistan on `openai/gpt-oss-20b` in LM
Studio (MXFP4, 8,192-token context loaded), through the real server and API with
`scripts/play.mjs`: five orders, two questions to the cast with one undertaking given, two
full accounts opened, a one-hour move, and a rewind onto a new branch. Transcript and numbers:
`sessions/2026-11-12-month-1.md` and `.json`.

**Measured.**

| | |
| --- | --- |
| Model calls | 21 |
| Answered first try / after a second try / fell back to built-in wording | 17 / 4 / 0 |
| Held to the JSON schema by the server | 21 of 21 |
| Mistakes put right locally | 3 |
| Wait for a turn with orders | 33 s on average, 71 s at worst |
| Wait until every reaction had arrived | 57 s on average |
| Time to first token | 4.4 s on average |
| Generation speed | 19.3 tokens a second |
| Tokens in / out / spent thinking | 37,201 / 7,425 / 2,325 |
| Unprompted moves by the cast | 5 in the month |

The spec's target for a local model is first results in 30 seconds. The average is just over
it and the worst case is more than double.

**Learned.**

1. *It works.* Nothing from decisions 0008 and 0009 had met a real model before this. The
   schema was enforced on every call, streaming and timings worked, the one-call reactions
   worked, and no call fell back.
2. *Every slow turn was a repair, and three of the four repairs were avoidable.* Twice the
   judge wrote a "major" event when the budget allowed none, and the whole judgment was asked
   for again (47 s and 54 s against about 22 s). Once a single invented figure in one of five
   reactions threw away all five (53 s). Once an invented figure in an answer cost a second
   call.
3. *The same party answered twice in one turn* when two orders touched it, saying much the
   same thing both times.
4. *The judge's own events are the weakest writing in the game.* One generic line each
   ("A small protest erupts in Karachi"), one out of season ("heavy monsoon floods" in late
   November), one that contradicted a reaction in the same turn (insurgents rallying for a
   ceasefire they had just rejected).
5. *Freedom of action is narrow.* "Nationalise the three largest private banks" became
   `novel` with "modest economic impact". "Ban all opposition rallies in the capital" became a
   security operation in Islamabad. The catalogue has about ten instruments; anything else
   gets small bounded effects and no specific consequences.
6. *The unprompted moves read well.* The business lobby threatening a shutdown over
   inflation, the lender warning on targets, the army distancing itself, the armed groups
   announcing attacks: each was specific to the state of the country.
7. *A full account of what somebody said was a footnote* (about 50 words) because the entry
   was sized "minor".
8. *The warm-up call was cut off at 16 tokens* by a model that thinks first, so it proved
   nothing about the schema.
9. *A second opinion on a major event adds 8 to 13 seconds before the turn commits.* With
   major events allowed more often since decision 0009, that is now a regular cost.

**Researched.** The other game's own page (<https://worldos.cc/worlds/modern-day-2026>). What
it states: any of about 238 nations and territories is playable; every other country is run
by an AI government; since v6 other countries act every turn (coups, elections, civil wars,
border wars, alliances) and a time skip reports what they did, never taking the player's own
territory; apps for free-form input, story cards, a zoomable territory map acted on region by
region, a clock to fast-forward, private and group chats with any character, and cutscenes;
it is kept current to the month; the map is wrong often enough that players are given a
wrench tool to fix it; it is metered in "Zaps" with a daily free allowance and subscriptions;
rated 4.3 from 128 ratings. What it does not state: how anything is calculated, how long a
turn takes, which model it uses, or how it remembers. A web search for reviews found nothing
about it (results were all for an unrelated commercial game). The scorecard was written from
this.

**Decided.**

- Fixed in this pass: over-budget events are taken down a size locally and "major" is not
  offered when the budget is zero; a sentence resting on an invented figure is taken out
  locally; nobody answers twice in one turn; the judge is told to keep to the calendar; what
  somebody said gets a full paragraph's account; the warm-up has room to answer.
- Next, in order: play the year for the M0 gate on the fixed build; then the two things the
  scorecard says a player notices most that M1 can fix: freedom of action (a wider catalogue,
  and novel orders with consequences that fit what was ordered), and ways to lose office.
- Left for later, noted: the judge's events need more than a prompt fix. They should be
  drawn from the cast and the state of the country by the engine, as unprompted moves are,
  rather than written free-hand. Whether to keep a second opinion before the commit.
