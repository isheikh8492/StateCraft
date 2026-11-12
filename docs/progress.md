# Progress

Where the build stands and what comes next. Update this file in the same commit as the work it describes.

## Working agreement

- Work happens on a branch per step, merged to `master` when `npm run check` passes.
- Every commit leaves `npm run check` passing.
- The spec in `docs/spec/` and the requirements in `docs/requirements.md` are the source of truth. Departures get a record in `docs/decisions/`.

## M0 First slice

Scope: one country (Pakistan), one position (head of government), policy only. Gate: a one-year term plays end to end on a local model.

| Step | Status | Notes |
| --- | --- | --- |
| 1. Skeleton, design system, first screen-to-ledger path | Done | |
| 2. Engine: budget, approval, unrest, control | Done | Pakistan scenario pack with sources. Golden 12-month run. Decision record 0005. |
| 3. Model harness and the seven M0 jobs | Done | Package `models`: OpenAI-compatible, Anthropic and Gemini adapters; parse, check, repair twice, fall back; refusal handling; call log; scripted stand-in model; in-app model check. |
| 4. Clock and resolution | Done | Package `director`: compile, adjudicate, apply, narrate, report, each saved before the next; resume after a stop; cancel; conflicts held for a choice; blocked orders returned with the reason; advance up to six months; early stop on a crisis. |
| 5. Reading the world | Done in part (see below) | Chronicle with links to events and policies, policy pages built from the record, briefing with state of play, monthly digests, MapLibre map of regions with no tile service. See gaps. |
| 6. Saves and branches | Done | Snapshot at every commit, rewind to any saved point or any date onto a new branch, old line kept. Decision record 0006. |
| 7. Developer tools | Done | Inspector with every model call and a cost meter; true numbers behind a developer switch. |
| 8. Gate | **Not passed** | A one-year term plays end to end on the scripted stand-in and on no model at all (tested). It has not been run on a real model: no local or hosted model was available where this was built. |

## What must happen before M0 is called finished

1. **Play a year on a real local model** through LM Studio and read the Inspector: how often it falls back, how long a resolution takes, how many tokens it uses. Record the numbers here.
2. **Run `npm run check` on Windows.** Everything so far was verified on Linux only.
3. **Try the Anthropic and Gemini adapters with real keys.** They follow the published wire formats but have never made a real call.

## M0 requirements not met yet

These are in `docs/requirements.md` for M0 and are not built, or are built in a reduced form.

| Requirement | State |
| --- | --- |
| REQ-MAP-02: everything on the map from typed map operations in the ledger | Reduced. The map (MapLibre, offline, no tiles or key) is drawn from engine state each time. There are no stored map operations yet; they arrive with units and fronts in M3. |
| REQ-MAP-04: chronicle and map cross-checked | Not needed yet: control changes come only from the engine, never from model text. |
| REQ-WORLD-04 to 06: full government structure and dossier | Reduced. The office's powers and limits, a legislature with real seat counts that votes on budget measures, and courts that can stay executive orders. No cabinet, provinces as actors, or informal power holders yet; those arrive with actors in M1. |
| REQ-HARN-03: capability probe | Reduced. The harness learns what a server rejects and adapts; context size and safe concurrency are not measured. |
| REQ-READ-05, 06: filters, "since you last looked", timeline scrubbing | Not built. The timeline lists saved points and rewinds to them or to any date. |
| REQ-DATA-04: daily snapshots | Replaced. Snapshots are taken at every resolution; a date inside a resolution is reached by running that resolution again from its saved inputs up to that day, which gives the same world (tested). |
| REQ-DATA-07: replay from recorded replies | Not built as a general tool. Step results are stored, so nothing needs replaying to load a save. |
| REQ-PERF-03: results appear as they commit | Reduced. The progress panel names each step; results appear together when the resolution commits, so that cancel can return the world untouched. |
| REQ-CONT-03, 07: content levels, real names switch | Not built. Narration runs at the standard level; real names are on. |
| REQ-UI-05: full keyboard operation | Partly. Everything is reachable by keyboard except dragging and resizing windows. |
| REQ-UI-09: every world system as a widget | The M0 systems have windows. The rest arrive with their systems. |
| REQ-MEM-04: token budget per context layer | Not built. Inputs are small and bounded by construction (last 8 events, 6 policies), not by a counted budget. |
| REQ-TEST-03: stop the server mid-resolution, in the browser | Covered by a director test that cuts the run after a saved step and resumes from the file, not by a browser test. |
| REQ-PLAT-07: database on a worker thread | Not built. |

## Known simplifications in the rules

- Every speed, threshold and catalogue range is a placeholder until calibration.
- The cost of a slate that is not paid for is borrowed automatically and stated on the policy page.
- With no model, the world's own events come from a small fixed deck (strikes, outages, rallies, attacks, floods) chosen by dice and tilted by the state of the country. A model writes richer and more specific ones.
- Vote and court odds are placeholders: allies peel away from unpopular measures, and the courts stay a small share of executive orders.
- There is no "Read as" line and no follow-up question (a departure from REQ-POL-03 and REQ-JOB-06). Boxes go out as written. An order too vague to act on is answered in the world: the chronicle reports that ministries could not act on it, and its policy page says why.
- A pinned box stays on the desk after it is executed and is not sent again until its wording changes.

## Built from the 12 November spec

The speed slice and the first part of M1, built together.

| Area | State |
| --- | --- |
| Speed | A turn commits after two model calls at most (reading the boxes, judging the period). Nothing is written before the commit. A move of under a week with nothing ordered calls no model. Prompts carry a compact output shape, and the world brief only where needed. |
| The time control | A date pill with the hour. Right arrow: to next major event, 1 hour, 1 day, 1 week, 1 month, 3 months, 6 months, 1 year, or a specific date; any of them sends the desk first. Left arrow opens history. |
| History | By turn (your move, then the world's response) and by time. |
| Depth on demand | Entries are short. "Read the full account" writes the long piece once and saves it. |
| The cast | Sixteen Pakistani stakeholders with interests, stance and voice (authored; see the scenario's SOURCES.md). |
| Reactions | Every order that takes effect is answered: the engine picks who is touched, up to three answer in full after the turn commits, side by side, and the rest are named. An answer can be an action with bounded effects. |
| Later beats | A reaction can set up a follow-up that the dice decide on its day (a lull holds or breaks), recorded as its own event citing the order. |
| Asking people | The People window: put a question to any reachable member of the cast and get an answer in their voice, from what they could know. Armed groups cannot be reached. |
| Removed | Ministry reports, monthly summaries, the "Read as" line. Policy milestones are chronicle events in built-in wording. |

## Still not built from that spec

| Item | State |
| --- | --- |
| Streaming of long pieces (REQ-PERF-16) | Not built. A full account appears when it is finished, with a "Writing…" state meanwhile. |
| Brief model-written headlines | Not built, deliberately: an event's own one-line summary is the headline, so no call is made. |
| History by story, read-only viewing of a past turn with the map as it was, export (REQ-READ-14 to 16) | Not built. |
| Time of day beyond the hour hand (REQ-CLK-12) | Partly. The clock shows an hour and an hour's move leaves the engine's day untouched; messages do not yet arrive by the hour. |
| Quotes stored as utterances, declared detail figures kept across entries (REQ-JOB-24, 26) | Partly. Reactions are stored and quoted; detail figures are checked when written but not yet carried into later entries. |
| Conversation that changes positions (pressure, levers, persuasion) | Not built. Asking gets you information and a view; it does not yet move anyone. |
| Advisors warning you before you act; people reaching out to you unasked | Not built. |
| Reactions when you move before the last ones have arrived | Known gap: rewinding to a date inside the following turn can drop those late reactions. |
| The judge's memory of earlier months | Not wired. It sees the last eight events only. |

## M1 to M4

M1 is under way: the cast, reactions, later beats and asking people are built (see above). Personas with traits and motives, pressure and persuasion, hiring and firing, and delegation are not started. M2 to M4 are not started. See the roadmap in the README.
