# Research journal

Newest first. What was played, what was measured, what was learned, sources, what was
decided. Rules for this file are in `docs/GOAL.md`.

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
