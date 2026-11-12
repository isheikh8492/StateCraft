# StateCraft requirements

Numbered requirements extracted from the specification in [`spec/`](spec/README.md), as of 2026-11-11 (spec v0.2).

## How to read this file

- **ID.** `REQ-<area>-<number>`. IDs are permanent. A dropped requirement is marked withdrawn, never renumbered.
- **MS.** The milestone in which the requirement must first hold: M0 to M4 (see the roadmap in `spec/00-overview.md`).
- **Source.** The spec file and section it comes from. O = `00-overview`, J = `01-model-jobs`, E = `02-engine-rules`, P = `03-player-and-world`, W = `04-world-systems`, T = `05-model-tests`, R = `06-architecture-review`.
- **Verified by.** How we know it holds:
  - `E2E`: an end-to-end test drives the UI against the real server
  - `INV`: an engine invariant test
  - `GOLD`: the seeded golden run
  - `BENCH`: a test in the model test suite
  - `CHECK`: a validator in code that runs on every model output
  - `REVIEW`: inspection of code, data or design
  - `MANUAL`: checked by hand before a release
- **Wording.** "Must" is binding. Numbers marked (target) are design targets to be measured in M0, not commitments.

Requirements for M0 and M1 are written to be testable as they stand. Requirements for M2 to M4 are coarser and will be split when their milestone starts.

## 1. Platform and operations (PLAT)

| ID          | Requirement                                                                                                                                          | MS  | Source                      | Verified by |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --- | --------------------------- | ----------- |
| REQ-PLAT-01 | The game must run as a local server with a browser UI, started by one command.                                                                       | M0  | O Platform                  | E2E         |
| REQ-PLAT-02 | All server, engine, protocol and UI code must be TypeScript in strict mode.                                                                          | M0  | O Platform; O Engineering   | REVIEW      |
| REQ-PLAT-03 | The repository must be an npm workspace with the packages `protocol`, `engine`, `ledger`, `models`, `director`, `server`, `web` (see decision 0001). | M0  | O Platform                  | REVIEW      |
| REQ-PLAT-04 | Every shape that crosses a boundary (model job, API route, save file, event) must be defined once as a Zod schema in `protocol`.                     | M0  | O Engineering               | REVIEW      |
| REQ-PLAT-05 | The engine package must perform no I/O, read no clock, and use no randomness other than the seeded generator passed to it.                           | M0  | O Engineering; E Principles | INV, REVIEW |
| REQ-PLAT-06 | Engine, pathfinding and resolution work must run off the main thread.                                                                                | M0  | O Platform                  | REVIEW      |
| REQ-PLAT-07 | One dedicated worker must own all writes to the database.                                                                                            | M0  | O Platform; R 21            | REVIEW      |
| REQ-PLAT-08 | The game must run with no telemetry by default.                                                                                                      | M0  | O Cross-cutting             | REVIEW      |
| REQ-PLAT-09 | Every pull request must pass type-check, lint and the end-to-end suite in continuous integration before merging.                                     | M0  | O Engineering               | REVIEW      |
| REQ-PLAT-10 | The code must be licensed Apache-2.0; scenario data keeps each source's own licence.                                                                 | M0  | O Summary                   | REVIEW      |
| REQ-PLAT-11 | A desktop build must wrap the same server without changes to game code.                                                                              | M4  | O Platform                  | MANUAL      |

## 2. Security (SEC)

| ID         | Requirement                                                                                                                  | MS  | Source                         | Verified by |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------- | --- | ------------------------------ | ----------- |
| REQ-SEC-01 | The server must bind to 127.0.0.1 only.                                                                                      | M0  | O Platform; R 18               | E2E         |
| REQ-SEC-02 | Every request must carry a random session token created at start-up; requests without it must be rejected.                   | M0  | O Platform; R 18               | E2E         |
| REQ-SEC-03 | The server must reject requests whose Origin is not the page it served.                                                      | M0  | O Platform; R 18               | E2E         |
| REQ-SEC-04 | API keys must never be sent to the browser, written to a save file, or committed to the repository.                          | M0  | O Platform; O Saves            | E2E, REVIEW |
| REQ-SEC-05 | Player text placed in a prompt must be marked as quoted input, and instructions inside it must not change a job's behaviour. | M1  | O Cross-cutting; J actor.reply | BENCH       |
| REQ-SEC-06 | Scenario and content packs must be data only, validated against the schema, and must contain no executable code.             | M2  | O Cross-cutting                | CHECK       |
| REQ-SEC-07 | Third-party widgets must run sandboxed, read only events their player may see, and write only through declared actions.      | M4  | O Widgets                      | E2E         |

## 3. Ledger, saves and time travel (DATA)

| ID          | Requirement                                                                                                                                                 | MS  | Source                       | Verified by |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ---------------------------- | ----------- |
| REQ-DATA-01 | Every change to the world must be recorded as an append-only event with its time, actor, visibility and causes.                                             | M0  | O Architecture; E Principles | INV         |
| REQ-DATA-02 | A campaign must be stored as a single SQLite file.                                                                                                          | M0  | O Saves                      | E2E         |
| REQ-DATA-03 | The game must save after every committed event, so a crash loses at most the reply in flight.                                                               | M0  | O Saves                      | E2E         |
| REQ-DATA-04 | Full snapshots must be taken on a schedule (daily in game time), with only changes stored in between.                                                       | M0  | O Saves; R 12                | INV         |
| REQ-DATA-05 | The player must be able to rewind to any past date, which creates a new branch and deletes nothing.                                                         | M0  | O Saves                      | E2E         |
| REQ-DATA-06 | Rewinding must also rewind the map, the chronicle and all widget content.                                                                                   | M0  | O Saves; O Live map          | E2E         |
| REQ-DATA-07 | Replaying a branch must rebuild the same state from recorded model replies without calling a model.                                                         | M0  | O Saves; O Model harness     | GOLD        |
| REQ-DATA-08 | Each campaign must be pinned to the engine version it started on; loading must read the latest snapshot and must not replay old events through newer rules. | M0  | O Saves; R 11                | INV         |
| REQ-DATA-09 | Every save must record its schema version; a save from a newer version must refuse to open.                                                                 | M0  | O Saves                      | INV         |
| REQ-DATA-10 | Each dice roll must be seeded from the campaign seed and the roll's own id, so adding or removing a roll does not change any other.                         | M0  | E Principles; R 3            | INV         |
| REQ-DATA-11 | Structured records must be the source of truth; text memory must be derived from them, and a number wins any disagreement with a memory.                    | M1  | E Memory; R 10               | REVIEW      |

## 4. Engine (ENG)

| ID         | Requirement                                                                                                                                                                           | MS  | Source                      | Verified by |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | --------------------------- | ----------- |
| REQ-ENG-01 | Only the engine may change a number in the world state.                                                                                                                               | M0  | E Principles; J Who decides | REVIEW, INV |
| REQ-ENG-02 | Uncertain outcomes must be decided by an engine dice roll; a model may supply only a multiplier inside a band.                                                                        | M0  | E Principles                | CHECK       |
| REQ-ENG-03 | Every variable must drift toward a trend, and every actor must keep its current stance, unless a recorded cause moves it.                                                             | M0  | E Principles                | GOLD        |
| REQ-ENG-04 | Every rule must be written as a per-day rate.                                                                                                                                         | M0  | E Principles                | INV         |
| REQ-ENG-05 | Every state change must store the ids of the events that caused it; a change with no cause must be rejected.                                                                          | M0  | E Principles                | CHECK       |
| REQ-ENG-06 | The budget system must track GDP, growth, inflation, unemployment, revenue, spending, debt, interest rate and reserves, updated daily.                                                | M0  | E Four systems              | GOLD        |
| REQ-ENG-07 | Money must be conserved: a policy slate whose spending has no funding source must be rejected.                                                                                        | M0  | E Four systems              | INV         |
| REQ-ENG-08 | Approval must be tracked per group and summed by population share, and must move over months, not days.                                                                               | M0  | E Four systems              | GOLD        |
| REQ-ENG-09 | National approval must stay inside a band set by the country's committed supporters and opponents; it can never reach 100.                                                            | M0  | E Four systems              | INV         |
| REQ-ENG-10 | Unrest must be tracked per region with the stages calm, protest, riot and insurgency, with hysteresis between stages and spread to neighbours.                                        | M0  | E Four systems              | GOLD        |
| REQ-ENG-11 | Each region must have exactly one controller and a status of held, contested or occupied.                                                                                             | M0  | E Four systems              | INV         |
| REQ-ENG-12 | Each policy instrument must have a catalogue entry listing the variables it may touch, the allowed range of each effect, and its delay.                                               | M0  | E Four systems              | REVIEW      |
| REQ-ENG-13 | A policy must pass through the stages announced, enacted, implemented and felt, with lead times set by its instrument and the state's capacity.                                       | M0  | O Policy desk               | GOLD        |
| REQ-ENG-14 | A policy must be checked against the powers and procedures of the player's office before it is resolved.                                                                              | M0  | O Government structure      | E2E         |
| REQ-ENG-15 | Crossing a crisis threshold (for example reserves under three months of imports) must raise a threshold event.                                                                        | M0  | E Four systems              | INV         |
| REQ-ENG-16 | Every stance must have a pressure value and a threshold; a stance may change only when pressure exceeds the threshold.                                                                | M1  | E Status quo                | INV         |
| REQ-ENG-17 | The threshold must rise with the number of veto players and with how long the stance has stood; red lines must have an unreachable threshold.                                         | M1  | E Status quo                | INV         |
| REQ-ENG-18 | Losses must weigh about twice as much as equal gains in every reaction.                                                                                                               | M1  | E Status quo                | INV         |
| REQ-ENG-19 | The political capital cost of a policy must grow with the square of its distance from current policy.                                                                                 | M1  | E Status quo                | INV         |
| REQ-ENG-20 | Rare events must start from historical yearly base rates; pressure may multiply the rate only within a fixed band.                                                                    | M1  | E Status quo                | BENCH       |
| REQ-ENG-21 | The player must be able to push only a limited number of major initiatives at full force per period.                                                                                  | M1  | O Policy desk               | INV         |
| REQ-ENG-22 | The engine must allow groups, parties, factions, organisations, people, issues and regions to be created, split, merged and retired during play, subject to conservation rules.       | M2  | E Reshapes                  | INV         |
| REQ-ENG-23 | A new approval group's members must come out of existing groups so that the population total is unchanged.                                                                            | M2  | E Reshapes                  | INV         |
| REQ-ENG-24 | Running statistics must be compared with historical ranges, and pull toward the trend must strengthen when they leave those ranges.                                                   | M2  | E Guardrails                | BENCH       |
| REQ-ENG-25 | The calibration test must check ranges, volatility and event frequencies against 2015 to 2020, with known outside shocks scripted in; it must not require reproducing history's path. | M2  | E Calibration; R 2          | BENCH       |

## 5. Model harness (HARN)

| ID          | Requirement                                                                                                                                                     | MS                            | Source          | Verified by |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | --------------- | ----------- |
| REQ-HARN-01 | All model calls must go through one internal interface with adapters for the OpenAI-compatible, Anthropic and Gemini wire formats.                              | M0 (two adapters), M2 (third) | O Model harness | E2E         |
| REQ-HARN-02 | Local model servers (Ollama, LM Studio, llama.cpp, vLLM) must work through the OpenAI-compatible adapter.                                                       | M0                            | O Model harness | MANUAL      |
| REQ-HARN-03 | The harness must probe each configured model and store its capabilities: context size, structured output, tool calling, JSON mode, streaming, safe concurrency. | M0                            | O Model harness | E2E         |
| REQ-HARN-04 | The harness must use the strongest output strategy a model supports, falling back to prompt-and-extract.                                                        | M0                            | O Model harness | E2E         |
| REQ-HARN-05 | Every model output must be parsed and validated against its schema; on failure the harness must attempt up to two repairs, then use the job's fallback.         | M0                            | O Model harness | E2E         |
| REQ-HARN-06 | Failures must be classified (network, rate limit, context overflow, invalid output, refusal, timeout) and each handled as specified.                            | M0                            | O Model harness | E2E         |
| REQ-HARN-07 | A refusal must never block a resolution: the harness must step down the content level, reroute, then use fixed wording, and mark the entry.                     | M0                            | O Model harness | E2E         |
| REQ-HARN-08 | The player must be able to assign each role (adjudicator, actor, extractor, narrator) to any configured model.                                                  | M0                            | O Model harness | E2E         |
| REQ-HARN-09 | Every call must be recorded with its job, version, model, strategy, prompt hash, raw reply, tokens, cost and latency.                                           | M0                            | O Model harness | E2E         |
| REQ-HARN-10 | Prompts must put fixed text first and changing text last, so providers can cache the prefix.                                                                    | M0                            | J Conventions   | REVIEW      |
| REQ-HARN-11 | Narration prompts must state the real context honestly; the game must not attempt to evade a provider's rules.                                                  | M0                            | O Model harness | REVIEW      |

## 6. Model jobs (JOB)

| ID         | Requirement                                                                                                                                                                        | MS  | Source                          | Verified by   |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------------------------------- | ------------- |
| REQ-JOB-01 | Every job must return one JSON object that starts with a `why` field and refers to actors, regions, policies and events by id only.                                                | M0  | J Conventions                   | CHECK         |
| REQ-JOB-02 | An output containing an unknown id must fail validation.                                                                                                                           | M0  | J Conventions                   | CHECK         |
| REQ-JOB-03 | Any figure in model-written text must appear in that job's input, or, for the chronicle only, be declared as a detail figure (REQ-JOB-24). | M0  | J Conventions                   | CHECK         |
| REQ-JOB-04 | Every job must define a fallback that needs no model, and the game must be playable end to end on fallbacks alone.                                                                 | M0  | J Conventions; J How to build   | E2E           |
| REQ-JOB-05 | Every job output must accept an optional `extensions` object, which must be logged and never applied.                                                                              | M0  | E Open by design; J Conventions | CHECK         |
| REQ-JOB-06 | **Withdrawn.** Boxes are not read back and the game asks no follow-up questions. | M0  | J policy.read                   | CHECK, E2E    |
| REQ-JOB-07 | `policy.compile` must account for every input box exactly once across policies, duplicates, conflicts and needs-detail.                                                            | M0  | J policy.compile; O Policy desk | CHECK         |
| REQ-JOB-08 | `policy.compile` must merge fragments, fold duplicates, split boxes with several ideas, flag conflicts, and flag boxes that break one of the player's commitments.                 | M0  | O Policy desk                   | BENCH, E2E    |
| REQ-JOB-09 | `turn.adjudicate` must receive every actor's actions in one list with one shape, as summaries, with nothing identifying the human player.                                          | M0  | J turn.adjudicate; R 5          | REVIEW, BENCH |
| REQ-JOB-10 | `turn.adjudicate` must return exactly one outcome per action, with every effect on an allowed variable and inside its allowed range.                                               | M0  | J turn.adjudicate               | CHECK         |
| REQ-JOB-11 | Events of size major and significant proposed in one resolution must stay within the surprise budget.                                                                              | M0  | J turn.adjudicate; E Guardrails | CHECK         |
| REQ-JOB-12 | A proposed major event or novel policy must pass `turn.review`; an item that fails twice must be dropped.                                                                          | M0  | J turn.review                   | CHECK         |
| REQ-JOB-13 | `chronicle.write` must cite at least one event per entry, cite every significant and major event, keep time order, and never narrate an effect before its cause.                   | M0  | J chronicle.write               | CHECK         |
| REQ-JOB-14 | **Withdrawn.** No ministry report is written; see REQ-READ-17 and REQ-READ-18. | M0  | J policy.report                 | CHECK         |
| REQ-JOB-15 | `memory.digest` must keep every pinned entry retrievable. It is internal memory for the judge and is not shown to the player. | M0  | J memory.digest                 | CHECK         |
| REQ-JOB-16 | `actor.reply` must concede only what appears in the engine-supplied `mayConcede` list; with an empty list the character must not give ground.                                      | M1  | J actor.reply                   | CHECK, BENCH  |
| REQ-JOB-17 | `actor.reply` must reveal only facts in the character's `knows` list.                                                                                                              | M1  | J actor.reply                   | CHECK         |
| REQ-JOB-18 | `talk.extract` must name the levers a speaker used and must not score how persuasive they were.                                                                                    | M1  | J talk.extract; E Conversation  | REVIEW        |
| REQ-JOB-19 | A commitment attributed to a character must be backed by a concession or offer that the character's own reply declared, and must be confirmed by both sides before it is recorded. | M1  | J talk.extract; R 9             | CHECK         |
| REQ-JOB-20 | `actor.decide` must choose only from actions the engine lists as legal for that actor's office.                                                                                    | M1  | J actor.decide                  | CHECK         |
| REQ-JOB-21 | `persona.write` must not produce a name that matches a real, known person.                                                                                                         | M1  | J Smaller jobs                  | CHECK         |
| REQ-JOB-22 | `intel.report` must contain no fact beyond the items the engine supplied; errors in a report are decided by the engine.                                                            | M2  | J Later jobs                    | CHECK         |
| REQ-JOB-23 | `scene.write` must never be called when the victim is a real, living person.                                                                                                       | M3  | J Later jobs; P Lethal          | CHECK         |
| REQ-JOB-24 | A chronicle entry may introduce figures the engine does not hold only by declaring each as a detail; details must be stored, reused on the same thread, and must never restate or contradict an engine-owned quantity. | M1 | J chronicle.write | CHECK |
| REQ-JOB-25 | Up front, a notable event must get only a headline and one or two sentences; its full piece (about 50, 150 or 400 words for minor, significant and major) must be written only when the player opens the entry. | M1 | J chronicle.write | CHECK |
| REQ-JOB-26 | A quote in the chronicle must belong to an actor listed as a speaker for that event, must be stored as that actor's utterance, and must be shown set apart and marked simulated. | M1 | J chronicle.write | CHECK, E2E |

## 7. Policy desk (POL)

| ID         | Requirement                                                                                                                                                                               | MS  | Source                          | Verified by |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------------------------------- | ----------- |
| REQ-POL-01 | The player must be able to type any intended action in plain words and turn it into a policy box with a + control.                                                                        | M0  | O Policy desk                   | E2E         |
| REQ-POL-02 | Boxes must be editable, deletable, reorderable, and pinnable as standing policy.                                                                                                          | M0  | O Policy desk                   | E2E         |
| REQ-POL-03 | **Withdrawn.** No reading is shown under a box. An unclear order is sent as written and answered in the world (REQ-POL-11). | M0  | O Policy desk; O Responsiveness | E2E         |
| REQ-POL-04 | The player's own wording in a box must never be rewritten.                                                                                                                                | M0  | O Policy desk                   | E2E         |
| REQ-POL-05 | A conflict between boxes must block execution until the player keeps one, edits, or chooses to send mixed signals.                                                                        | M0  | O Policy desk                   | E2E         |
| REQ-POL-06 | A blocked or infeasible policy must be returned with the reason.                                                                                                                          | M0  | O Gameplay                      | E2E         |
| REQ-POL-07 | Standing policies must keep acting, and keep costing, until repealed.                                                                                                                     | M0  | O Gameplay                      | GOLD        |
| REQ-POL-08 | Every message in any conversation, and every event and intelligence item, must offer a + that creates a box linked to its source; selecting part of a message must box only that passage. | M1  | O Policy desk                   | E2E         |
| REQ-POL-09 | Before execution, each affected advisor must be able to attach notes on cost, legality, likely reaction and time to a box.                                                                | M1  | O Policy desk                   | E2E         |
| REQ-POL-10 | A policy with no catalogue entry must be resolved by analogy to named known policies and must not be penalised for being new.                                                             | M2  | E Open by design                | BENCH       |
| REQ-POL-11 | An order too vague to act on must be sent as written and answered by an event in the world; the game must not stop to ask the player a question. | M0 | O Policy compiler | E2E |

## 8. Clock (CLK)

| ID         | Requirement                                                                                                                                                             | MS  | Source              | Verified by |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------------------- | ----------- |
| REQ-CLK-01 | The player must be able to move time forward by one hour, one day, one week, one month, three months, six months or one year, or to a chosen date and hour up to one year ahead. | M0  | O Gameplay; P Clock | E2E         |
| REQ-CLK-02 | Moving time forward must first send any boxes on the desk; there must be no separate execute control. A move must still stop early for anything urgent. | M0  | P Clock             | E2E         |
| REQ-CLK-03 | An advance must stop early for anything urgent.                                                                                                                         | M0  | P Clock             | E2E         |
| REQ-CLK-04 | The engine must keep one queue of dated events and advance by applying daily rules up to the next event.                                                                | M1  | P Clock             | INV         |
| REQ-CLK-05 | Asking for a deliverable, or waiting on a reply or meeting, must advance the clock until it arrives or something more urgent interrupts.                                | M1  | P Clock             | E2E         |
| REQ-CLK-06 | A live call or meeting must cost clock time; a message must cost none to send, and its reply must arrive after a delay set by the sender's rank, relations and urgency. | M1  | P Clock             | E2E         |
| REQ-CLK-07 | Small local results must resolve at once as beats that touch only the actors concerned.                                                                                 | M1  | P Clock             | E2E         |
| REQ-CLK-08 | The game must tell the player what is coming next when nothing is waiting on them, and offer to move to it.                                                             | M1  | P Clock             | E2E         |
| REQ-CLK-09 | The game must choose a tempo (crisis, active, routine, long view) from the situation, announce changes, and let the player override it.                                 | M2  | P Clock             | E2E         |
| REQ-CLK-10 | Long jumps are lower resolution by design; the same period sliced differently must land within a wide band, not on the same state.                                      | M0  | O Gameplay; R 4     | BENCH       |
| REQ-CLK-11 | A "to next major event" move must run day by day and stop at the first major event, crisis line or message addressed to the player, within one year, chosen by the engine without a model call. | M0 | O The time control | INV, E2E |
| REQ-CLK-12 | The clock must carry a time of day; a move of less than a day must deliver reactions, messages and events without stepping the engine's daily systems. | M1 | O The time control | INV |
| REQ-CLK-13 | Time must be controlled from a date pill with a forward panel listing each option with the date it lands on, and a back control that opens history. | M0 | O The time control | E2E |

## 9. Knowing what happened (READ)

| ID          | Requirement                                                                                                                                                                      | MS  | Source             | Verified by |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------------------ | ----------- |
| REQ-READ-01 | After each resolution the player must receive a chronicle in time order that tells each event once.                                                                              | M0  | O Consistency      | E2E         |
| REQ-READ-02 | Every chronicle entry must link to the events it summarises.                                                                                                                     | M0  | O Consistency      | E2E         |
| REQ-READ-03 | Every policy must have a page showing what was ordered, its stage, the events it caused, target figures before and since taken from the engine, side effects, reactions and cost. | M0  | O Knowing          | E2E         |
| REQ-READ-04 | A policy page must be assembled from cause links in the ledger, not from a model's impression.                                                                                   | M0  | O Knowing          | REVIEW      |
| REQ-READ-05 | The player must have a world briefing that can be filtered by place, subject and time, and a digest of what changed since they last looked.                                      | M0  | O Knowing          | E2E         |
| REQ-READ-06 | The player must have a timeline of the whole campaign; selecting a point must show the map, figures and news as they were.                                                       | M0  | O Knowing          | E2E         |
| REQ-READ-07 | A one-page state of play (policies in force, open commitments, top risks) must be kept current.                                                                                  | M0  | O Consistency      | E2E         |
| REQ-READ-08 | There must be no all-knowing answer box. The player finds things out by putting questions to people, who answer from their own knowledge.                                        | M1  | O Knowing          | E2E, REVIEW |
| REQ-READ-09 | The player must be able to put one question to a group and read the replies side by side.                                                                                        | M1  | O Knowing          | E2E         |
| REQ-READ-10 | What the player was told, and by whom, must be recorded so that it can later be compared with what was true.                                                                     | M1  | O Knowing          | E2E         |
| REQ-READ-11 | The "what if you had not" analysis must be presented as an estimate with a range from several replays, never as an exact figure.                                                 | M2  | O Knowing; R 3     | REVIEW      |
| REQ-READ-12 | The player must never be shown pressure or threshold as numbers outside the Open assist setting and the developer view.                                                          | M1  | E Reading pressure | E2E         |
| REQ-READ-13 | The game must offer the assist settings Realistic, Guided and Open; under Guided the chief of staff must dependably report which levers mattered after a stance holds or breaks. | M1  | E Learning why     | E2E         |
| REQ-READ-14 | History must be viewable by turn (the player's move followed by the world's response), by time, and by story thread. | M1 | O History | E2E |
| REQ-READ-15 | While the player views a past turn, the map and figures must show that moment, the desk must be disabled, and one control must return to the present; viewing must not create a branch. | M1 | O History | E2E |
| REQ-READ-16 | The chronicle must be exportable to a file. | M1 | O History | E2E |
| REQ-READ-17 | A policy reaching a milestone (starting to take effect, or having been felt) must be recorded as one chronicle event in built-in wording with the engine's figures, without a model call. | M0 | O Policy ledger | INV |
| REQ-READ-18 | Content written on demand (a full chronicle piece, a person's answer) must be saved when first written, shown unchanged afterwards, and built from the state recorded at the time of the event. | M1 | O The chronicle | INV, E2E |

## 10. User interface (UI)

| ID        | Requirement                                                                                                                                                                                                                | MS                               | Source      | Verified by |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ----------- | ----------- |
| REQ-UI-01 | The map must be the main screen, with every widget in a shared window shell that can be dragged, resized, minimised, maximised and pinned.                                                                                 | M0                               | O UI system | E2E         |
| REQ-UI-02 | All colours, sizes and fonts must come from one token file; no component may use a raw value.                                                                                                                              | M0                               | O UI system | REVIEW      |
| REQ-UI-03 | The UI must be dark first, built on shadcn/ui, Radix and Tailwind, with Lucide icons.                                                                                                                                      | M0                               | O UI system | REVIEW      |
| REQ-UI-04 | Reading text must be at least 15 px with lines capped near 70 characters.                                                                                                                                                  | M0                               | O UI system | REVIEW      |
| REQ-UI-05 | The UI must be fully operable by keyboard, show visible focus, and meet 4.5:1 text contrast.                                                                                                                               | M0                               | O UI system | MANUAL      |
| REQ-UI-06 | The app must include a gallery page showing every component and window in every state.                                                                                                                                     | M0                               | O UI system | E2E         |
| REQ-UI-07 | Motion must stay under 200 ms and honour the reduced-motion setting.                                                                                                                                                       | M0                               | O UI system | REVIEW      |
| REQ-UI-08 | Window layouts must be saveable and restorable.                                                                                                                                                                            | M1                               | O Widgets   | E2E         |
| REQ-UI-09 | Each world system must be available as a widget: world briefing, policy ledger, cabinet and staff, projects and trackers, elections, media monitor, trade and sanctions, international bodies, ground view, relationships. | M0 to M2, as each system arrives | O Widgets   | E2E         |

## 11. Responsiveness and recovery (PERF)

| ID          | Requirement                                                                                                                                                                       | MS  | Source              | Verified by |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------------------- | ----------- |
| REQ-PERF-01 | Any click, typing, window action or map movement must respond in under 100 ms and must never wait on a model.                                                                     | M0  | O Responsiveness    | E2E         |
| REQ-PERF-02 | Model work must run in a prioritised job queue in which anything the player is waiting on runs before background work.                                                            | M0  | O Responsiveness    | REVIEW      |
| REQ-PERF-03 | A turn must commit and show its date, figures, map and order outcomes as soon as the engine has applied the judged period; written entries and reports must arrive afterwards and must never delay the commit. | M0  | O Responsiveness    | E2E         |
| REQ-PERF-04 | Every window must remain usable while a resolution runs.                                                                                                                          | M0  | O Responsiveness    | E2E         |
| REQ-PERF-05 | Each step of a resolution must be saved before the next begins; after a stop at any point the resolution must resume from the last finished step without applying anything twice. | M0  | O Responsiveness    | E2E         |
| REQ-PERF-06 | State changes from one step must be committed together or not at all.                                                                                                             | M0  | O Responsiveness    | INV         |
| REQ-PERF-07 | The player must be able to cancel a resolution before it commits, returning the world to the moment before.                                                                       | M0  | O Responsiveness    | E2E         |
| REQ-PERF-08 | A slow or failed call must degrade only its own item, which is then marked.                                                                                                       | M0  | O Responsiveness    | E2E         |
| REQ-PERF-09 | A progress panel must name the step in progress and what remains.                                                                                                                 | M0  | O Responsiveness    | E2E         |
| REQ-PERF-10 | First results of a full resolution should appear within 10 s on a hosted model and 30 s on a local one, with completion within 45 s and 3 min (target).                           | M0  | O Responsiveness    | MANUAL      |
| REQ-PERF-11 | Character replies and narration must stream.                                                                                                                                      | M1  | O Responsiveness    | E2E         |
| REQ-PERF-12 | The first words of a character's reply should appear within 2 s hosted, 5 s local (target).                                                                                       | M1  | O Responsiveness    | MANUAL      |
| REQ-PERF-13 | M0 must include a resolution inspector showing every model call with its input, output, checks and cost, and a cost meter totalling tokens per resolution.                        | M0  | O Roadmap; R 13, 20 | E2E         |
| REQ-PERF-14 | The Director must fit each resolution inside a token budget, activating fewer actors when needed.                                                                                 | M2  | R 13                | INV         |
| REQ-PERF-15 | Before a turn commits, the only model work may be reading the boxes and judging the period. Reactions and brief chronicle entries must run after the commit, concurrently where the server allows. | M1 | O Speed | REVIEW |
| REQ-PERF-16 | Long written entries must stream to the screen as they are produced. | M1 | O Speed | E2E |
| REQ-PERF-17 | A move of a day or less with nothing ordered must be resolved without any model call. | M0 | O Speed | INV |
| REQ-PERF-18 | Adding or editing a box, routine notices and monthly summaries must make no model call. | M0 | O Speed | INV |
| REQ-PERF-19 | Prompts must carry a compact description of the output rather than a full schema, and the world brief only where the job needs it. | M0 | O Speed | REVIEW |
| REQ-PERF-20 | The Inspector must show, per turn, the time to first result and the time to the last written word. | M1 | O Speed | E2E |

## 12. Live map (MAP)

| ID         | Requirement                                                                                                                      | MS  | Source                     | Verified by |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------- | --- | -------------------------- | ----------- |
| REQ-MAP-01 | The map must show the controller of every region, with occupied and contested areas marked.                                      | M0  | O Live map                 | E2E         |
| REQ-MAP-02 | Everything on the map must be drawn from typed map operations stored in the ledger.                                              | M0  | O Live map                 | REVIEW      |
| REQ-MAP-03 | Models must refer to places only by ids from the gazetteer; a model must not be able to invent a location.                       | M0  | O Live map                 | CHECK       |
| REQ-MAP-04 | If the chronicle states a change of control with no matching map operation, the resolution must fail validation and be repaired. | M0  | O Live map                 | CHECK       |
| REQ-MAP-05 | The map must work offline from a bundled tile file, with no tile service or API key.                                             | M0  | O Live map                 | E2E         |
| REQ-MAP-06 | Disputed areas must be shown hatched along lines of actual control by default, with a setting for national points of view.       | M2  | O Live map                 | E2E         |
| REQ-MAP-07 | Clicking a chronicle entry must move the map to where it happened.                                                               | M0  | O Live map                 | E2E         |
| REQ-MAP-08 | After a resolution the map must replay it in order, in step with the chronicle.                                                  | M3  | O Live map                 | E2E         |
| REQ-MAP-09 | Unit movement must follow region adjacency and take time set by unit type and travel cost.                                       | M3  | O Live map; R 15           | INV         |
| REQ-MAP-10 | A region may change controller only through forces present, a defecting local government, or sustained insurgency.               | M3  | O Live map; E Four systems | INV         |
| REQ-MAP-11 | Foreign forces and unrest must be shown where the player's intelligence believes them to be, with uncertainty.                   | M3  | W Intelligence; P War      | E2E         |
| REQ-MAP-12 | A manual correction tool must let the player fix control, units or markers; each fix must be a ledger event.                     | M3  | O Live map                 | E2E         |
| REQ-MAP-13 | The map should hold 60 frames per second with all regions and 2,000 units on integrated laptop graphics (target).                | M3  | O Live map                 | MANUAL      |

## 13. Real-world grounding (WORLD)

| ID           | Requirement                                                                                                                                             | MS                        | Source                 | Verified by |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ---------------------- | ----------- |
| REQ-WORLD-01 | The world must be loaded from versioned scenario packs that fix a start date.                                                                           | M0                        | O Grounding            | REVIEW      |
| REQ-WORLD-02 | Every figure and fact in a pack must carry its source and as-of date.                                                                                   | M0                        | O Grounding; O Levels  | CHECK       |
| REQ-WORLD-03 | Each scenario must include a written world brief, and models must use its facts over their own memory.                                                  | M0                        | J Conventions; T Suite | BENCH       |
| REQ-WORLD-04 | Each country's government must be modelled with its offices, powers, procedures, legislature, courts, territorial structure and informal power holders. | M0 (one country), M2 (25) | O Government structure | REVIEW      |
| REQ-WORLD-05 | Each power link must record both its formal status and how much it holds in practice; feasibility must use both.                                        | M0                        | O Government structure | INV         |
| REQ-WORLD-06 | Each country must carry a domestic dossier: system, power map, public by group, economy as felt, and live issues.                                       | M0 (one country), M2 (25) | O Levels               | REVIEW      |
| REQ-WORLD-07 | Countries must be simulated at Full, Standard or Background depth and must move up automatically when they become salient.                              | M2                        | O Levels               | INV         |
| REQ-WORLD-08 | Any gap in a dossier filled by a model must be marked unverified in the UI.                                                                             | M2                        | O Levels               | E2E         |
| REQ-WORLD-09 | Each dataset's licence must be reviewed before its data ships; data that forbids redistribution must not be bundled.                                    | M2                        | O Grounding; R 17      | REVIEW      |
| REQ-WORLD-10 | Adding a country pack must require no code changes.                                                                                                     | M4                        | O Roadmap              | MANUAL      |

## 14. Actors, personas and conversation (ACT)

| ID         | Requirement                                                                                                                                                                                                                                 | MS  | Source                   | Verified by |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------------------------ | ----------- |
| REQ-ACT-01 | Everything the player can talk to must be an actor in one directory, with identity, interests, disposition, resources, memory and knowledge.                                                                                                | M1  | O Actors                 | REVIEW      |
| REQ-ACT-02 | Each person must have ten trait values that change specific engine rules, a weighted list of motives (some hidden), loyalties, red lines and a voice.                                                                                       | M1  | E Actors                 | INV         |
| REQ-ACT-03 | A persona may shift thresholds, odds and options only within fixed bands; it must not let an actor exceed what their office or resources allow.                                                                                             | M1  | E Actors                 | INV         |
| REQ-ACT-04 | Traits must stay fixed; motive weights and loyalties may change only through recorded events, by bounded amounts.                                                                                                                           | M1  | E Actors                 | INV         |
| REQ-ACT-05 | The player must be able to reach actors by direct message, cable, call, summit, public statement and back channel, each with its own visibility.                                                                                            | M1  | O Actors                 | E2E         |
| REQ-ACT-06 | Access to an actor must depend on standing and relations; a request may be routed to a deputy or declined.                                                                                                                                  | M1  | O Actors                 | E2E         |
| REQ-ACT-07 | Every utterance must be stored as an event with the set of actors who can see it.                                                                                                                                                           | M1  | O Consistency            | INV         |
| REQ-ACT-08 | Before an actor speaks, its context must be built from the ledger filtered to what that actor knows, never from the chat alone.                                                                                                             | M1  | O Consistency            | REVIEW      |
| REQ-ACT-09 | An actor must act only on facts in its knowledge set.                                                                                                                                                                                       | M1  | E Guardrails             | CHECK       |
| REQ-ACT-10 | Facts must spread between actors by rules: public events to all, sharing between allies, interception by capability, and leaks.                                                                                                             | M1  | O Consistency            | INV         |
| REQ-ACT-11 | Commitments made in one period that conflict must be listed and passed to adjudication.                                                                                                                                                     | M1  | O Consistency            | CHECK       |
| REQ-ACT-12 | Conversation may add pressure only through material levers backed by real state (offer, threat, information, relationship, third party, public pressure, time) and through appeals; the engine must verify each lever and compute its size. | M1  | E Conversation           | INV         |
| REQ-ACT-13 | An appeal must be sized by whether it reaches a motive the listener holds, the listener's openness, the listener's trust in the speaker, novelty, and whether its claims hold; a model must not score eloquence.                            | M1  | E Persuasion             | INV, BENCH  |
| REQ-ACT-14 | Each stance must record whether it rests mainly on belief or on interest; argument must not move a red line directly.                                                                                                                       | M1  | E Persuasion             | INV         |
| REQ-ACT-15 | A character holding a stance below its threshold must not concede under any wording, in at least 200 scripted attempts.                                                                                                                     | M1  | O Roadmap; E Calibration | BENCH       |
| REQ-ACT-16 | An actor must run its own model call in a resolution only when salient; other actors must move by rules and one batched digest.                                                                                                             | M2  | O Actors                 | INV         |
| REQ-ACT-17 | The same actor must behave consistently with its traits across 20 varied situations, and two actors must be distinguishable from unlabelled transcripts.                                                                                    | M1  | E Actors                 | BENCH       |
| REQ-ACT-18 | Each scenario must list a cast of stakeholders with, for each, its interests, its stance toward the player and the actions within its power. | M1 | O Every order gets an answer | REVIEW |
| REQ-ACT-19 | Every order that takes effect must draw at least one visible response in the same resolution from an actor it touches; silence must be stated, never implied by absence. | M1 | O Every order gets an answer | INV, E2E |
| REQ-ACT-20 | Which actors an order touches must be decided by engine rules from the cast's interests, not by a model. | M1 | O Every order gets an answer | INV |
| REQ-ACT-21 | A response must be a statement, an action from that actor's allowed list with bounded effects, or stated silence, and must be written against the player's own wording. | M1 | O Every order gets an answer; J policy.react | CHECK |
| REQ-ACT-22 | A response may schedule a later beat decided by dice; each beat must be its own event citing the order as its cause. | M1 | O Every order gets an answer | INV |
| REQ-ACT-23 | Responses must appear in the chronicle beside the order, on the policy's page, and in the inbox when addressed to the player. | M1 | O Every order gets an answer | E2E |
| REQ-ACT-24 | Until other countries are modelled, foreign actors must be able to appear in the cast as reactors that speak and take positions only. | M1 | O Every order gets an answer | REVIEW |

## 15. Inbound events and intrigue (EVT)

| ID         | Requirement                                                                                                                                                            | MS  | Source               | Verified by |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | -------------------- | ----------- |
| REQ-EVT-01 | The game must generate events that reach the player unasked, from actor initiative, the calendar, thresholds, shocks, consequences and intrigue.                       | M1  | O World comes to you | E2E         |
| REQ-EVT-02 | A generated event must name existing actors, use only what its sender knows, and stay within base rates.                                                               | M1  | O World comes to you | CHECK       |
| REQ-EVT-03 | Inbound items must carry deadlines, and an unanswered item must be treated as an answer by its sender.                                                                 | M1  | O World comes to you | E2E         |
| REQ-EVT-04 | The chief of staff must rank the inbox each period.                                                                                                                    | M1  | O World comes to you | E2E         |
| REQ-EVT-05 | Events must come in four sizes (colour, minor, significant, major); only major and significant events are rationed.                                                    | M2  | W Events             | CHECK       |
| REQ-EVT-06 | A small event must be able to grow in size when conditions feed it, by the pressure rule and the dice.                                                                 | M2  | W Events             | INV         |
| REQ-EVT-07 | Private-life events (affairs, family, health) must be generated only for fictional characters; a real, living person may be the subject of public-conduct events only. | M2  | W Events; R 16       | CHECK       |
| REQ-EVT-08 | Any two actors that matter to each other must have a relationship record of trust, affinity, ties, favours owed and leverage.                                          | M3  | E Intrigue           | REVIEW      |
| REQ-EVT-09 | Betrayal, coups and other plots must run as staged objects with members, progress and a daily chance of discovery, and must produce signs before they land.            | M3  | E Intrigue           | INV         |
| REQ-EVT-10 | While a scheme runs, the people around it must be able to contact the player for their own reasons, with truthfulness set by their persona and stake.                  | M3  | E Intrigue           | E2E         |
| REQ-EVT-11 | Actor-to-actor dealings offstage must update by rules without a model call unless the outcome reaches the player or crosses the importance line.                       | M3  | E Intrigue           | INV         |
| REQ-EVT-12 | What an actor said, and what is true, must both be stored, so that a lie stays consistent and can be exposed.                                                          | M3  | E Intrigue           | INV         |

## 16. Player, delegation and staff (PLY)

| ID         | Requirement                                                                                                                                                                | MS  | Source                     | Verified by |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | -------------------------- | ----------- |
| REQ-PLY-01 | The player must be an ordinary actor whose actions are limited by the powers of the position they hold.                                                                    | M0  | P Who you are              | REVIEW      |
| REQ-PLY-02 | M0 must start the player as head of government of one country.                                                                                                             | M0  | O Roadmap                  | E2E         |
| REQ-PLY-03 | A new game must open with a text prologue that sets place and date, identity, history, traits and ambition.                                                                | M1  | P Who you are              | E2E         |
| REQ-PLY-04 | A described position must be matched to a real office or role with its real powers; if none exists, the game must say so and offer the nearest real ones.                  | M1  | P Who you are              | E2E         |
| REQ-PLY-05 | Before confirming, the player must see a brief of who they report to, who reports to them, what they can decide alone, and what needs approval.                            | M1  | P Who you are              | E2E         |
| REQ-PLY-06 | The player must be able to play the real officeholder or their own character in an existing position.                                                                      | M1  | P Who you are              | E2E         |
| REQ-PLY-07 | The campaign must end when the player's character dies.                                                                                                                    | M1  | P Who you are              | E2E         |
| REQ-PLY-08 | Losing office must not end the campaign; the player continues as the same person.                                                                                          | M4  | P Who you are              | E2E         |
| REQ-PLY-09 | The player must be able to start as a citizen, local figure, insider or officer.                                                                                           | M4  | P Who you are              | E2E         |
| REQ-PLY-10 | Long efforts must be tracked as projects with an owner, budget, milestones, progress and risks; reported progress may differ from real progress.                           | M1  | P Projects                 | E2E         |
| REQ-PLY-11 | A tracker must show only numbers the engine holds.                                                                                                                         | M1  | P Projects                 | CHECK       |
| REQ-PLY-12 | The player must be able to give an actor a mandate with scope, authority, budget, objectives, limits, reporting and duration; the holder then acts on their own inside it. | M1  | P Projects                 | E2E         |
| REQ-PLY-13 | The engine must enforce a mandate's budget; a holder may break other limits only if their persona permits, with a roll for discovery.                                      | M1  | P Projects; J actor.decide | INV         |
| REQ-PLY-14 | Institutions must act within their legal powers whether or not the player directs them.                                                                                    | M1  | P Projects                 | GOLD        |
| REQ-PLY-15 | The player must be able to appoint and dismiss people in posts their office controls, choosing from a shortlist or naming someone.                                         | M1  | P Hiring                   | E2E         |
| REQ-PLY-16 | A dismissed person must leave with a grievance and what they know; a vacancy must lower its institution's performance.                                                     | M1  | P Hiring                   | INV         |
| REQ-PLY-17 | Protected posts must be removable only by the legal procedure, forced resignation, or an illegal move.                                                                     | M3  | P Hiring                   | INV         |

## 17. War, covert action and the authoritarian path (CONF)

| ID          | Requirement                                                                                                                                                                                 | MS  | Source                     | Verified by |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | -------------------------- | ----------- |
| REQ-CONF-01 | Every flashpoint must sit on a seven-rung escalation ladder; movement between rungs follows the pressure rule and the dice.                                                                 | M3  | P War                      | INV         |
| REQ-CONF-02 | A political leader must set war aims, limits, resources and commanders; forces then act under that mandate.                                                                                 | M3  | P War                      | E2E         |
| REQ-CONF-03 | The engine alone must resolve campaigns, from force ratio, terrain, supply, air and sea control, morale, command and surprise.                                                              | M3  | P War; J Later jobs        | INV         |
| REQ-CONF-04 | War must cost casualties, money, trade and public support daily; each side must have a will to fight that follows the pressure rule.                                                        | M3  | P War                      | INV         |
| REQ-CONF-05 | Nuclear use must have the highest threshold and a near-zero base rate; the campaign must continue afterwards.                                                                               | M3  | P War                      | INV         |
| REQ-CONF-06 | Covert acts must run as operations with a sponsor, service, capability, circle of people who know, odds and deniability.                                                                    | M3  | P Lethal                   | INV         |
| REQ-CONF-07 | An order must pass through people who can refuse, warn the target, leak, or keep proof.                                                                                                     | M3  | P Lethal                   | INV         |
| REQ-CONF-08 | The chance of an operation being exposed must never reach zero and must grow with time and with each person who knows.                                                                      | M3  | P Lethal                   | INV         |
| REQ-CONF-09 | Assassination, coup, foreign-backed removal, legal removal, arrest, exile and invasion must be possible against the player, at historical base rates.                                       | M3  | P Lethal                   | INV         |
| REQ-CONF-10 | When ordering an operation the player must choose the kind of means, each trading certainty against deniability.                                                                            | M3  | P Lethal                   | E2E         |
| REQ-CONF-11 | Every check on the player (courts, legislature, press, elections, term limits, army neutrality) must be an institution whose independence can be eroded by policies under the normal rules. | M3  | P Authoritarian            | INV         |
| REQ-CONF-12 | As fear of the player rises, reports and figures shown to the player must drift from the true values held by the engine.                                                                    | M3  | P Authoritarian            | INV         |
| REQ-CONF-13 | The game must add no bonus and no artificial penalty for any act; gains and costs must come only from the simulation.                                                                       | M3  | P Lethal; P Does not judge | BENCH       |

## 18. World systems (SYS)

| ID         | Requirement                                                                                                                                                       | MS  | Source          | Verified by |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | --------------- | ----------- |
| REQ-SYS-01 | Everything non-public the player knows must come from intelligence services with limited capabilities per region.                                                 | M2  | W Intelligence  | REVIEW      |
| REQ-SYS-02 | The player must set a limited number of collection priorities; reports must carry a confidence level and source type.                                             | M2  | W Intelligence  | E2E         |
| REQ-SYS-03 | Elections must run on each country's real calendar and electoral system, with support built from approval groups by region.                                       | M2  | W Elections     | INV         |
| REQ-SYS-04 | Manifesto promises must be tracked afterwards as commitments.                                                                                                     | M2  | W Elections     | E2E         |
| REQ-SYS-05 | The player must be able to lose an election.                                                                                                                      | M2  | W Elections     | E2E         |
| REQ-SYS-06 | The engine must keep the true event and each group's believed version side by side; approval must move on the believed version.                                   | M2  | W Media         | INV         |
| REQ-SYS-07 | The player's credibility must be a stock that falls each time a lie is caught.                                                                                    | M2  | W Media         | INV         |
| REQ-SYS-08 | Trade must be tracked between countries by sector, with dependence in both directions.                                                                            | M2  | W Trade         | REVIEW      |
| REQ-SYS-09 | Sanctions must be objects with a sender coalition, scope, enforcement and leakage, and must cost the senders too.                                                 | M2  | W Trade         | INV         |
| REQ-SYS-10 | International bodies must follow their real voting procedures; votes must be decided member by member from interests and relations.                               | M2  | W International | INV         |
| REQ-SYS-11 | Each campaign must follow a standing cast of ordinary people chosen to represent the country's groups and regions, whose lives the engine updates from the state. | M2  | P Ground view   | E2E         |
| REQ-SYS-12 | A ground-view scene must be tied to a cause in the ledger and must state no number the engine does not hold.                                                      | M2  | P Ground view   | CHECK       |

## 19. Content, neutrality and real people (CONT)

| ID          | Requirement                                                                                                                                                        | MS  | Source                | Verified by |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --- | --------------------- | ----------- |
| REQ-CONT-01 | Narration must state what happened without lessons, warnings, disclaimers or judging adjectives.                                                                   | M0  | P Does not judge      | BENCH       |
| REQ-CONT-02 | Actors inside the world may judge the player according to their own values; that reaction is simulation, not narration.                                            | M1  | P Does not judge      | REVIEW      |
| REQ-CONT-03 | The game must offer three content levels: restrained, standard (default) and mature.                                                                               | M0  | P Lethal              | E2E         |
| REQ-CONT-04 | No content level may include working real-world instructions for causing harm.                                                                                     | M0  | P Lethal              | BENCH       |
| REQ-CONT-05 | Every generated quote, post and article must be marked as simulated in the UI.                                                                                     | M0  | O Grounding           | E2E         |
| REQ-CONT-06 | Exported or shared content must carry a visible "Simulated in StateCraft" mark.                                                                                    | M1  | O Grounding           | E2E         |
| REQ-CONT-07 | Actors must be modelled as offices with the holder's name taken from the pack; a setting must switch between real names (default) and titles.                      | M0  | O Grounding           | E2E         |
| REQ-CONT-08 | Personas for real people must be built from documented public conduct, with sources, and the UI must say they are game modelling.                                  | M2  | E Actors; O Grounding | REVIEW      |
| REQ-CONT-09 | When a real, living person is the victim of violence, the result must be a news-style report with no dramatised scene, and it must not be shareable or exportable. | M3  | P Lethal              | CHECK, E2E  |
| REQ-CONT-10 | Scenes showing a real, named person committing atrocities must not be shareable or exportable.                                                                     | M3  | P Authoritarian       | E2E         |

## 20. Tests and model checks (TEST)

| ID          | Requirement                                                                                                                                                                                                                                     | MS                             | Source                | Verified by |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | --------------------- | ----------- |
| REQ-TEST-01 | There must be one end-to-end test per user-visible flow, driving the real UI against the real server and database.                                                                                                                              | M0                             | O Engineering         | REVIEW      |
| REQ-TEST-02 | End-to-end tests must use a scripted stand-in model that speaks a real API format, costs no tokens, and can be told to return invalid output, refuse, or time out.                                                                              | M0                             | O Engineering         | REVIEW      |
| REQ-TEST-03 | M0's end-to-end flows must cover: start a campaign; add boxes and see readings; execute and watch results arrive; read the chronicle and a policy page; see the map change; save, rewind and branch; stop the server mid-resolution and resume. | M0                             | O Engineering         | E2E         |
| REQ-TEST-04 | One seeded 12-month campaign must be run headless and its final state hash must match.                                                                                                                                                          | M0                             | O Engineering         | GOLD        |
| REQ-TEST-05 | A build must not be described as working unless the end-to-end suite passes on a clean checkout.                                                                                                                                                | M0                             | O Engineering         | REVIEW      |
| REQ-TEST-06 | A one-year term must be playable end to end on a local model.                                                                                                                                                                                   | M0                             | O Roadmap             | MANUAL      |
| REQ-TEST-07 | The app must run a connection test and a quick check when a model is connected, and give a verdict per job of fit, limited or not fit, with the reason.                                                                                         | M1                             | T Model check         | E2E         |
| REQ-TEST-08 | The game must propose which connected model should do which job, and warn when the player overrides a "not fit".                                                                                                                                | M1                             | T Model check         | E2E         |
| REQ-TEST-09 | The game must track each model's failure and repair rates during play and tell the player when they exceed what the check predicted.                                                                                                            | M1                             | T Model check         | E2E         |
| REQ-TEST-10 | A local model's check must report measured speed on the player's machine.                                                                                                                                                                       | M1                             | T Model check         | E2E         |
| REQ-TEST-11 | The model test suite must measure protocol, rule-following, scenario fidelity, resistance, persona, neutrality, content coverage, limits, memory, injection and cost.                                                                           | M1 (code-checked), M2 (judged) | T Suite; R 19         | REVIEW      |
| REQ-TEST-12 | Neutrality tests must include editorialising, moral rigging, country swap, ideology and religion swap, player favouritism, optimism, drama, dark roles, sycophancy and symmetry of refusals.                                                    | M2                             | T Neutrality          | BENCH       |
| REQ-TEST-13 | Test results must be reported over several seeds with confidence intervals; a judged rubric must publish its agreement with human-labelled examples.                                                                                            | M2                             | T How tests are built | REVIEW      |
| REQ-TEST-14 | A model that fails a test must be recorded and routed away from the affected job; it must not be edited or tricked.                                                                                                                             | M1                             | T Neutrality          | REVIEW      |

## 21. Memory (MEM)

| ID         | Requirement                                                                                                                                                               | MS  | Source   | Verified by |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | -------- | ----------- |
| REQ-MEM-01 | Each model call must receive a fresh context built for that job; no model carries the campaign between calls.                                                             | M0  | E Memory | REVIEW      |
| REQ-MEM-02 | Current state and open commitments must be supplied exactly and never summarised by a model.                                                                              | M0  | E Memory | REVIEW      |
| REQ-MEM-03 | History must roll up from resolution entries to month, year and era digests, each linking to the level below.                                                             | M0  | E Memory | CHECK       |
| REQ-MEM-04 | Each job must fit a fixed token budget with a share per context layer.                                                                                                    | M0  | E Memory | CHECK       |
| REQ-MEM-05 | Events above an importance line, and anything the player pins, must stay retrievable for the whole campaign.                                                              | M1  | E Memory | INV         |
| REQ-MEM-06 | An actor's memory must hold only what that actor learned.                                                                                                                 | M1  | E Memory | INV         |
| REQ-MEM-07 | A Memory window must show what the game and any actor remember about a topic, with links to source events, and let the player correct it; a correction is a ledger event. | M1  | E Memory | E2E         |
| REQ-MEM-08 | After long simulated campaigns, actors must be quizzed on questions with known answers; recall accuracy and contradiction rate must be tracked per model.                 | M2  | E Memory | BENCH       |

## 22. Openness and self-improvement (OPEN)

| ID          | Requirement                                                                                                                                                   | MS  | Source            | Verified by |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ----------------- | ----------- |
| REQ-OPEN-01 | From M0 the data must carry empty, unused slots for `notes`, `tags`, `analogues`, `quirks`, `measures` and `extensions`.                                      | M0  | E Open by design  | REVIEW      |
| REQ-OPEN-02 | An open feature must be switched on only together with a test for it.                                                                                         | M2  | E Open by design  | REVIEW      |
| REQ-OPEN-03 | A campaign must be able to gain a custom measure with a stated meaning, range, drift, movers and bounded links to core variables; it lives in that save only. | M4  | E Open by design  | INV         |
| REQ-OPEN-04 | The ledger, the dice, conservation of money and people, each actor's knowledge, and the two fixed content limits must never be opened to model invention.     | M0  | E Open by design  | REVIEW      |
| REQ-OPEN-05 | Nothing in the rules, prompts or models may change during a running campaign.                                                                                 | M0  | T Improves itself | REVIEW      |
| REQ-OPEN-06 | Every change proposed by an improvement loop must be a pull request with before-and-after scores, and must be approved by a person.                           | M4  | T Improves itself | REVIEW      |
| REQ-OPEN-07 | The guardrails, the two content limits and the test suite's pass marks must be changeable only by people.                                                     | M4  | T Improves itself | REVIEW      |
| REQ-OPEN-08 | Player data used for improvement must stay on the player's machine unless they opt in, case by case.                                                          | M4  | T Improves itself | REVIEW      |

## Open items without a requirement yet

These are named in the spec but not specified well enough to test:

- Engine-decided deception, replacing reliance on a character declaring its own lies (review finding 8).
- Measured token budgets and speed targets for local and hosted models (review finding 7).
- Screen layouts and the first ten minutes of play.
- The time limit for M0, suggested as six weeks.
- Legal review of map depiction, bundled data and the use of real people before any public release (review findings 16 and 17).

## Count

| Area      | Requirements |
| --------- | ------------ |
| PLAT      | 11           |
| SEC       | 7            |
| DATA      | 11           |
| ENG       | 25           |
| HARN      | 11           |
| JOB       | 26           |
| POL       | 11           |
| CLK       | 13           |
| READ      | 18           |
| UI        | 9            |
| PERF      | 20           |
| MAP       | 13           |
| WORLD     | 10           |
| ACT       | 24           |
| EVT       | 12           |
| PLY       | 17           |
| CONF      | 13           |
| SYS       | 12           |
| CONT      | 10           |
| TEST      | 14           |
| MEM       | 8            |
| OPEN      | 8            |
| **Total** | **303**      |

The total includes three withdrawn requirements (REQ-JOB-06, REQ-JOB-14 and REQ-POL-03), which keep their ids.
