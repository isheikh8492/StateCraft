# The goal

This file is a standing brief for an agent working on StateCraft without supervision. Read
it at the start of every session and after every context reset. It says what done means,
how to decide what to do next, and when to stop.

## Mission

Make StateCraft a better geopolitics simulator than WorldOS's *Modern Day 2026*, or at the
least its equal, and take it through every milestone on the roadmap (M0 to M4) to a
finished, tagged 1.0.

"Better" is not a feeling. It is the scorecard in `docs/research/scorecard.md`, which you
create in your first session and keep current (see "Research on yourself").

## Read first, every session

1. `docs/GOAL.md` (this file)
2. `docs/progress.md`: "Start here", then the tables
3. `docs/research/journal.md`: the last three entries (once it exists)
4. `docs/requirements.md` for the milestone you are in
5. The newest three files in `docs/decisions/`

## What must stay true

These are the reasons StateCraft can beat a game where a model is the rules engine. Do not
trade them away to go faster.

- **The engine and the dice decide; a model only words it.** A model never invents a number,
  a border, a vote or an outcome outside a range the engine set. If a feature seems to need
  a model to decide a fact, build the rule first.
- **Everything is recorded and replayable.** The ledger is append-only, every turn has a
  snapshot, and the same seed gives the same world.
- **It plays with no model, and on a local model.** Every model job has a fallback. The
  local model is the floor the game must stay playable on.
- **Waiting is the enemy.** At most two model calls before a turn commits. Measure, and
  record the measurements.
- **One country done properly beats thirty done thinly.** Depth of a country that is added
  must match the depth of the ones already there.

## The loop

Repeat until the stopping point. One pass of the loop is one coherent piece of work, small
enough to finish and verify in a session.

1. **Orient.** Read the files above. Run `npm run check`. If it fails, fixing it is the
   work.
2. **Play.** Play the game for real against the local model (see "The model"): at least one
   in-game month, through the real server and API, with varied orders, questions to the cast
   and at least one rewind. Save the transcript and the Inspector's numbers under
   `docs/research/sessions/`.
3. **Judge.** Score that session against the scorecard. Write a journal entry: what was
   dull, slow, wrong, confusing or impossible, with the evidence, and what a player would
   want next.
4. **Research.** When a question cannot be answered from the repo, look it up: what *Modern
   Day 2026* and games like it actually do (public pages, reviews, videos, forum posts),
   how good simulations model the thing you are about to build, and real-world data for
   scenario packs with sources recorded. Note sources in the journal. Never copy another
   game's text, data, art or code.
5. **Choose.** Pick the next piece of work by this order:
   a. anything that breaks a rule under "What must stay true";
   b. the open gate of the current milestone;
   c. the worst-scoring line on the scorecard that the current milestone can fix;
   d. the next unmet requirement of the current milestone in `docs/requirements.md`.
6. **Specify.** If it changes the design, update the spec and write a decision record
   before the code. Split coarse M2 to M4 requirements into testable ones when their
   milestone starts.
7. **Build and verify.** Write the fallback before the prompt. Add or extend an end-to-end
   test. Run it on the stand-in, then on the real local model. Look at it in a browser.
8. **Commit.** See "Committing".
9. **Record.** Update `docs/progress.md` in the same commit. Say plainly what is not
   verified.

## Research on yourself

Create these in the first session and keep them current.

- `docs/research/scorecard.md`: a table of capabilities, one row each, with columns for
  what *Modern Day 2026* does (with a source), what StateCraft does today (with a test or a
  session that shows it), and a verdict: behind, level or ahead. Start from the list below
  and add rows as research turns them up. A row is "ahead" only with evidence.
  - Countries playable, and how deeply each is modelled
  - Other nations acting on their own agendas
  - Diplomacy: talks, treaties, alliances, sanctions, being held to your word
  - War, territory and a map that shows it
  - Economy and trade between countries
  - Domestic politics: parties, legislature, courts, elections, coups, losing office
  - World-level conditions (energy prices, escalation, international bodies)
  - Consistency over a long game: no forgotten treaties, no invented borders
  - Freedom of action: how unusual an order can be and still get a sensible result
  - Speed of a turn, on a local model and a hosted one
  - Quality of the writing, and how much of it there is
  - Saves, rewind, branches, replay
  - Works offline, with no key, on a local model
  - Start dates and scenarios other than the present
- `docs/research/journal.md`: dated entries, newest first. Each has what was played, what
  was measured, what was learned, sources, and what was decided.
- `docs/research/sessions/`: transcripts and numbers from play sessions.

Every fifth pass of the loop, do a pass that is only research and play, no building:
replay an old save on the current build, play a full in-game year, re-score every row, and
re-order the work if the scorecard says so.

## Milestones and gates

The roadmap in `README.md` and `docs/spec/00-overview.md` is the plan. Work through it in
order. A milestone is finished when every one of its requirements in
`docs/requirements.md` is met or formally withdrawn with a decision record, and its gate has
passed with the evidence written into `docs/progress.md`.

| Milestone | Gate |
| --- | --- |
| M0 First slice | A one-year term plays end to end on the local model. Record fallback rate, time per turn, tokens. |
| M1 People | No concessions below the threshold in 200 attempts, on the local model. |
| M2 The world | 25 countries in depth; a 2015 start looks like 2015 to 2020. |
| M3 Conflict | Story and map agree in every replayed turn. |
| M4 Breadth | A new country pack ships without code changes. |

On top of the roadmap, parity needs these, which the roadmap does not name. Add them to the
spec and requirements when M2 starts:

- World-level conditions that every country feels (energy prices, an escalation level).
- Each country acting on a private agenda that the player does not see.
- A judge with memory of the whole campaign, not the last eight events.
- Territory that changes hands by the engine's rules, drawn on the map from recorded
  operations.

If a gate cannot be passed after three serious attempts, do not fake it and do not loop
forever. Write a decision record with the evidence, cut or change the scope so that an
honest gate exists, and move on. The spec already says: cut scope, do not extend.

## The model

LM Studio serves an OpenAI-compatible API at `http://localhost:1234/v1`. Ask it which models
are loaded (`GET /v1/models`) and use what is there; do not download models. If it is not
running, do the work that needs no model, mark model-dependent evidence as missing in
`docs/progress.md`, and say so in the journal. Never write a measurement you did not take.

Hosted providers need keys in `.env`. Do not create accounts, ask for keys, or spend money.

## Committing

- Work on `master` directly. No feature branches, no pull requests.
- Commit only when `npm run check` passes in full. One coherent change per commit, with the
  docs for it in the same commit.
- Push to `origin master` after each green commit, so the work is backed up.
- Never force-push, never rewrite history, never skip hooks, never delete or weaken a test
  to get to green. A test that is wrong is fixed with a reason in the commit message.
- Never commit `.env`, anything under `data/`, or a campaign file.

## Limits

- Stay inside this repository. Do not change system settings or install global software.
  Project dependencies may be added when a decision record justifies each one.
- Real-world facts in scenario packs carry sources (see the Pakistan pack's `SOURCES.md`),
  and the game's fiction labels stay on everything said by a real person or body.
- Sending anything outside the machine is limited to: pushing to `origin`, and reading
  public web pages for research.
- If something needs the owner (a key, a purchase, a choice between two designs with no way
  to tell which is better), write it at the top of `docs/progress.md` under "Waiting on the
  player", pick the option that is easiest to reverse, and keep going.

## The stopping point

Stop, and say so, when all of these hold:

1. M0 to M4 are each finished as defined above, with evidence in `docs/progress.md`.
2. Every row of the scorecard is "level" or "ahead" with evidence, or has a decision record
   explaining why StateCraft chooses not to compete on it.
3. A full in-game term has been played on the local model on the final build, and the
   transcript is in `docs/research/sessions/`.
4. `npm run check` passes on a clean clone.
5. `docs/FINAL.md` exists: what was built, the final scorecard, the measured numbers, what
   was cut and why, and what a next version should do.
6. The version is 1.0.0 and the commit is tagged `v1.0.0` and pushed.

Until then, the answer to "is there more to do?" is in the loop.
