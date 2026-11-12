# Architecture review

Reviewed Nov 11, 2026, covering all six tabs.

The core idea is sound and worth building: models propose, a deterministic engine decides, and every job has a fallback. The design around it has seven critical problems. Three of them are claims in the spec that are wrong as written, and I wrote them.

## Critical findings

| # | Finding | Why it matters | Fix |
| --- | --- | --- | --- |
| 1 | **Scope far exceeds one developer.** The spec describes 20 model jobs, about a dozen simulation systems, 195 countries, a map, a data pipeline, a test suite and a self-improvement loop. | This is the likeliest way the project fails: years of work with nothing playable. | Treat M0 and M1 as the product. Everything after is a hypothesis. Set a time limit on M0 and stop to reassess if it is missed. |
| 2 | **The history backtest cannot work as a gate.** M2 requires a 2015 start to match what happened through 2020. | Nobody can forecast politics and economies that well, and simple pull-to-trend equations certainly cannot. 2020 also contains a pandemic no model would produce. The gate either never passes or gets tuned until it passes by overfitting. | Test distributions, not paths: ranges, volatility and event frequencies must look like history. Feed known outside shocks in as scripted events. Tune on some countries and check on others. |
| 3 | **"Exact" counterfactuals are not exact.** The spec says replaying without a policy shows precisely what it caused. | Removing a policy changes what the model sees, so the model must be called again and answers differently. A random stream also shifts when one draw is removed, changing every later roll. | Give every dice roll its own seed, derived from the campaign seed and the roll's id, so removing one roll leaves the others unchanged. Describe the counterfactual as an estimate from several runs, with a spread. |
| 4 | **Turn length does change outcomes.** The spec says per-day rates make a 6-month jump equal to 180 one-day steps. | That holds only for the pure equations. One model judgment over six months is coarser than 180 daily ones and will produce different events. | State this plainly. Long jumps are lower resolution by design. Loosen the slicing test to a wide band. |
| 5 | **Blind adjudication leaks.** The judging model is not told who the player is, but its input separates `policies` from other actors' `moves`. | The model can tell which country is the human and favour it, which is the bias the rule exists to stop. | Put every actor's actions in one list with one shape. Pass compiled summaries, never the player's own wording. |
| 6 | **Persuasion is undefined, and the game may be unreadable.** Characters concede only when hidden pressure passes a hidden threshold. The spec never says what a conversation adds to pressure. The player sees no numbers, advisors shade the truth, intelligence errs and reports flatter. | If talk adds nothing, conversations are pointless. If the model decides how persuasive you were, agreeable models bring the pushover problem back. And with every source unreliable, a player cannot learn why anything worked or failed. | Conversation moves pressure only through typed levers backed by real state: an offer that costs you something, a threat you can carry out, information that is true, a favour owed. Add an assist setting, one dependable source early in the game, and an after-the-fact explanation of why a stance held or broke. |
| 7 | **Small local models will not carry this design.** Budgets assume an 8,000-token context and an 8 to 14 billion parameter model doing the judging. | A model that size is unlikely to pass the neutrality and rule-following tests for the judging role. The token budgets and local speed targets are my guesses, not measurements. | Measure in M0 before promising local play. Expect local-only play to lean on the rule-based fallbacks, and say so. Consider a higher minimum context. |

## Major findings

| # | Finding | Why it matters | Fix |
| --- | --- | --- | --- |
| 8 | **Characters are trusted to report their own lies.** `actor.reply` must list anything untrue it said, and a second model pass checks its statements against what it knows. | Small models will not reliably declare lies, and the checking pass is itself a fallible judgment that adds delay and false rejections. | Treat `untrue` as a hint, not a guarantee. Decide deception in the engine where possible: the engine tells the character "you will misstate X", so the truth is known before the words are written. |
| 9 | **Extraction errors become canon.** Promises and facts are pulled from free conversation by a model, then protected by the rule that recorded facts cannot be contradicted. | One misread sentence becomes a permanent "fact" that the game then defends against correction. | Make agreements explicit objects: a character proposes terms, and both sides confirm them. Give extracted facts a confidence level. Keep the memory correction tool prominent. |
| 10 | **Too many overlapping stores.** Trust lives as a number in a relationship record, as text in an actor's memory and again in their beliefs. Facts, commitments, memories and state overlap similarly. | Copies drift apart. A character can "remember" trusting you while the number says otherwise. | One rule: structured records are the truth, and all text memory is regenerated from them. Numbers win every disagreement. |
| 11 | **Saves cannot survive rule changes.** The save is a log of events replayed through the engine. | After an update changes a rule, replaying old events gives a different world. Event logs are also hard to migrate. | Pin each campaign to the engine version it started on. Snapshots, not replay, are the source of truth when loading. Moving a campaign to new rules carries the latest snapshot forward and says so. |
| 12 | **A snapshot at every resolution will not scale.** With hourly play and thousands of regions and actors, full snapshots add up to gigabytes. | Slow saves and huge files. | Snapshot daily or monthly and store changes in between. Rewinding to a beat replays from the nearest snapshot. |
| 13 | **Cost was never modelled.** From M1 every line of conversation is two model calls. From M2 each resolution adds one call per active country, and crisis tempo means many resolutions. | On a hosted model a long session could use several hundred thousand tokens or more. Nobody has estimated it. | Build a cost meter in M0. Set a token budget per resolution that the Director must fit, by activating fewer actors. |
| 14 | **The clock is the least proven design.** Events, beats, tempos, delayed replies and live calls all interact. What happens when a deadline falls during a live call is unspecified. | It is the part of the interface players touch constantly, and it is complex enough to feel broken. | M0 uses plain manual advance, which is right. Prototype the full clock on its own in M1 before building on it. |
| 15 | **The map's data does not exist in open form.** Movement "obeys terrain, roads, ports and supply", and units come from an order of battle. | Travel-cost networks and force structures for the whole world are a large data project. Open sources for armies are thin. | Start with region adjacency and flat travel times. Model forces as aggregate strength per region, not named units, until data proves available. |
| 16 | **Real people: the spec contradicts itself.** Personas for real people are to come from the public record, not invented private lives. But colour events include affairs and family matters for public figures, and personas give real leaders scores for ruthlessness and honesty plus hidden motives. | Invented private scandal about a real, living person is the clearest defamation risk in the project. Trait scores for real leaders are editorial judgments that will be disputed. | Private-life events apply only to fictional characters. For real people, generate events about public conduct only. Publish how trait values are derived, and let a pack ship titles in place of names. |
| 17 | **Maps and data carry legal exposure.** The game redistributes boundary data, shows disputed borders and bundles datasets with varied licences. | Some countries restrict how their borders may be shown, and some datasets forbid redistribution. An Apache-licensed repository cannot include data whose terms conflict. | Review each dataset's licence before the pipeline is built. Keep data packs in a separate repository under their own licences. Get legal advice before a public release; this review is not that. |
| 18 | **The local server is unprotected.** It listens on localhost and holds API keys. Nothing in the spec covers access control. | Any web page open in the browser can send requests to a localhost server. Without checks, a hostile page could drive the game or spend the player's model credit. | Bind to 127.0.0.1 only, require a random session token on every request, check the Origin header, and never return keys to the browser. |
| 19 | **The model test suite assumes labour that does not exist.** Judge rubrics need human-labelled examples, and paired tests need many runs per model. | One developer cannot label hundreds of examples, and full runs cost real money. | Start with code-checked tests only. Add judged tests one at a time, each with a small labelled set. |
| 20 | **No tooling to see inside a resolution.** A debug view is mentioned once. | Every tuning decision depends on seeing the prompt, the output, what failed validation and what the engine did. Without it, iteration is guesswork. | Make a resolution inspector an M0 deliverable: every call, its input, output, checks and cost, on one page. |
| 21 | **SQLite access pattern is unspecified.** The chosen library is synchronous, and the design also uses worker threads. | Synchronous database calls on the main thread stall the live connection to the UI. Several threads writing causes lock errors. | One dedicated database worker owns all writes. Also evaluate Node's built-in SQLite module, which would remove a native dependency that complicates installs on Windows. |

## What is sound

- **Models propose, the engine decides.** This is the right foundation, and it is why a model can be swapped without corrupting a world.
- **Typed jobs with fallbacks.** The game can run end to end with no model, which makes it testable and keeps a failed call from stopping play.
- **One ledger with visibility.** Tracking who knows what in one place is the correct way to keep conversations consistent.
- **The engine supplies what a character may concede.** Putting the limit in the input, not the instructions, is the strongest defence against agreeable models, subject to finding 6.
- **A stand-in model for end-to-end tests.** Cheap, repeatable, and it exercises failure paths.
- **Local server plus browser.** The right platform for local models and private keys.
- **TypeScript throughout.** Still correct. Nothing in this review argues for another language.

## What to cut or postpone

None of these should take any design or build time before M2 has passed its gate:

- The third-party widget kit and its sandbox
- Fine-tuning small models, community scorecards and the automatic prompt-improvement loop
- Historical scenario packs
- Starting positions below minister
- Custom measures and the other four loosenings, beyond leaving their empty slots
- The desktop app
- Full sections on war, covert action and the authoritarian path. They are designed well enough to wait.

## A wider point about the process

Six tabs were written in one evening and nothing has been run. Many "decisions" in the spec are untested guesses written with more confidence than they have earned, including numbers I supplied. The earlier throwaway prototype showed one warning sign: random play almost never lost, so even the simple version had no resistance. The spec should be read as a set of hypotheses, and M0 exists to start testing them.

## Fix list before M0 starts

These change M0's code or data shapes, so they are cheaper now than later:

**Status:** all ten items below were applied to the spec on 11 November 2026, together with the conversation levers, the assist settings, explicit agreements and the local-model caveat from the M1 list. Engine-decided deception (finding 8) and real measurements on local and hosted models (finding 7) remain open.

- [ ] Seed every dice roll from the campaign seed plus the roll's id (finding 3)
- [ ] One action list with one shape for all actors in `turn.adjudicate`; summaries only (finding 5)
- [ ] Pin each campaign to an engine version; snapshots are the source of truth; snapshot on a schedule (findings 11, 12)
- [ ] One database worker; evaluate Node's built-in SQLite (finding 21)
- [ ] Session token, Origin check and 127.0.0.1 binding on the server (finding 18)
- [ ] Resolution inspector and cost meter as M0 deliverables (findings 13, 20)
- [ ] Structured records are the truth; text memory is derived (finding 10)
- [ ] Correct the spec: counterfactuals are estimates; long jumps are lower resolution; the M2 gate tests distributions (findings 2, 3, 4)
- [ ] Correct the spec: private-life events are for fictional characters only (finding 16)
- [ ] Set a time limit for M0 and write down what happens if it is missed (finding 1)

Fix before M1 starts:

- [ ] Define the typed levers through which conversation moves pressure, and the assist setting (finding 6)
- [ ] Explicit agreement objects; engine-decided deception (findings 8, 9)
- [ ] Measure real token use and speed on one local and one hosted model, and reset the budgets and targets (finding 7)
