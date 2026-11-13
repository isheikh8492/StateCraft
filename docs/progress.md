# Progress

## Start here

If you are picking this project up cold, read this section, then the tables below.

- **What exists:** a playable slice. You are Prime Minister of Pakistan from November 2026: write orders, move time, see who answers, ask people, give undertakings, look back, rewind.
- **The standing brief is `docs/GOAL.md`.** Work follows its loop. The comparison with Modern Day 2026 is `docs/research/scorecard.md`; what each pass played, measured and decided is `docs/research/journal.md`.
- **Verified on a real model (2026-11-12):** one in-game month on `openai/gpt-oss-20b` in LM Studio, on Windows. 21 model calls, none fell back to built-in wording, 4 needed a second try, all 21 held to the schema by the server. A turn with orders took 33 s on average and 71 s at worst; about 19 tokens a second. Transcript: `docs/research/sessions/2026-11-12-month-1.md`. `npm run check` passes on Windows.
- **The M0 gate passed on 2026-11-12:** eighteen in-game months on the local model with no failed step (see step 8 in the table below). M1 is the current milestone.
- **Not verified:** CI has not run since the map moved to MapLibre; the Anthropic and Gemini adapters have never made a real call; no hosted model has been measured.
- **Next, in order:**
  1. Freedom of action: a wider catalogue, and orders outside it with consequences that fit what was ordered. (Done on 2026-11-12, decision record 0011: the dice decide how an order lands, and a clear order can no longer be set aside as too vague.)
  1a. Make the odds of a landing depend on who opposes the order and how the government stands, not only on its size.
  1b. Ways to lose office, so that a year has stakes.
  1c. Events of the world's own drawn by the engine from the cast and the state of the country, in place of the judge's free-hand one-liners.
  2. Check that an undertaking was kept by its specifics, not just by the kind of order issued.
  3. Give the judge a memory beyond the last eight events, and carry detail figures forward (same mechanism).
  4. Personas, plots and betrayal: actors with traits and private motives. The cast already acts first (decision record 0009), but from the state of the country, not from a character. With it, ways to lose office (a confidence vote, a coup, an election), so there is something to scheme for.
  5. Two more persuasion levers: information, and pressure through a third party.
  6. Model-written messages from advisers and allies, after the commit.
  7. A turn report and a docked layout that keeps the map visible.
- **Waiting on the player:** whether to keep the advice line under boxes.
- **Ideas noted, not planned:** a coding-agent CLI as a fourth way to connect a model; a "look" action on a region; exporting a whole campaign's model calls for comparing models.

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
| 3. Model harness and jobs | Done | Package `models`: OpenAI-compatible (streamed), Anthropic and Gemini adapters; a strict JSON schema built per call; parse, mend, check, repair, fall back; refusal handling; call log with per-call measurements; scripted stand-in model that behaves like LM Studio; in-app model check. Jobs in use: `policy.compile`, `turn.adjudicate`, `turn.review`, `policy.react`, `turn.reactions`, `actor.reply`, `chronicle.write` (on demand). Decision record 0008. |
| 4. Clock and turns | Done | Package `director`: compile, adjudicate, apply, then commit; each step saved before the next; resume after a stop; cancel; conflicts held for a choice; blocked orders returned with the reason; reactions follow the commit. Decision records 0006 and 0007. |
| 5. Reading the world | Done in part (see below) | Chronicle with links to events and policies, policy pages built from the record, briefing with state of play, monthly digests, MapLibre map of regions with no tile service. See gaps. |
| 6. Saves and branches | Done | Snapshot at every commit, rewind to any saved point or any date onto a new branch, old line kept. Decision record 0006. |
| 7. Developer tools | Done | Inspector with every model call and a cost meter: per call, the time to the first token, tokens a second, thinking tokens, whether the server enforced the schema, and what was put right locally. True numbers behind a developer switch. |
| 8. Gate | **Passed 2026-11-12** | Eighteen in-game months (1 November 2026 to 26 April 2028) played end to end on `openai/gpt-oss-20b` in LM Studio on Windows, through the real server: 12 orders, 7 questions to the cast, 4 full accounts, a rewind onto a new branch, no failed step. 69 model calls: 65 answered first try, 3 after a second try, 1 fell back to built-in wording; all 69 held to the schema by the server; 13 small mistakes put right locally. A turn with orders took 37 s on average and 78 s at worst; 19.6 tokens a second; 3.6 s to the first token; 99,363 tokens in and 20,901 out. Transcript and numbers: `docs/research/sessions/2026-11-12-year-1.md` and `.json`. Run on the build before the fixes that session led to. |

## What is left of M0

The gate has passed. These remain open and do not block M1:

1. **Try the Anthropic and Gemini adapters with real keys.** They follow the published wire formats but have never made a real call. Needs keys from the owner.
2. **CI has not run since the map moved to MapLibre.**
3. The requirements listed below as reduced or not built.

## M0 requirements not met yet

These are in `docs/requirements.md` for M0 and are not built, or are built in a reduced form.

| Requirement | State |
| --- | --- |
| REQ-MAP-02: everything on the map from typed map operations in the ledger | Reduced. The map (MapLibre, offline, no tiles or key) is drawn from engine state each time. There are no stored map operations yet; they arrive with units and fronts in M3. |
| REQ-MAP-04: chronicle and map cross-checked | Not needed yet: control changes come only from the engine, never from model text. |
| REQ-WORLD-04 to 06: full government structure and dossier | Reduced. The office's powers and limits, a legislature with real seat counts that votes on budget measures, and courts that can stay executive orders. No cabinet, provinces as actors, or informal power holders yet; those arrive with actors in M1. |
| REQ-HARN-03: capability probe | Reduced. The harness learns what a server rejects and adapts (schema, streaming, reasoning effort, token parameter, temperature), warms the model before play, and proves schema enforcement from a reply rather than assuming it. Context size is not measured; concurrency is taken from whether the server is on this machine rather than measured. |
| REQ-READ-05, 06: filters, "since you last looked", timeline scrubbing | Not built. The timeline lists saved points and rewinds to them or to any date. |
| REQ-DATA-04: daily snapshots | Replaced. Snapshots are taken at every resolution; a date inside a resolution is reached by running that resolution again from its saved inputs up to that day, which gives the same world (tested). |
| REQ-DATA-07: replay from recorded replies | Not built as a general tool. Step results are stored, so nothing needs replaying to load a save. |
| REQ-PERF-03: results appear as they commit | Reduced. The progress panel names each step; results appear together when the resolution commits, so that cancel can return the world untouched. The screen is now pushed to as each thing commits, rather than asking for the state several times a second. |
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
| Depth on demand | Entries are short. "Read the full account" on any entry, including a reaction, writes the long piece once and saves it. A Detail setting (Brief, Standard, Rich) sets how long reactions and accounts run. |
| The cast | Sixteen Pakistani stakeholders with interests, stance and voice (authored; see the scenario's SOURCES.md). |
| Reactions | Every order that takes effect is answered: the engine picks who is touched, up to three answer in full after the turn commits, and the rest are named. An answer can be an action with bounded effects. |
| Later beats | A reaction can set up a follow-up that the dice decide on its day (a lull holds or breaks), recorded as its own event citing the order. |
| Asking people | The People window: put a question to any reachable member of the cast and get an answer in their voice, from what they could know. Armed groups cannot be reached. |
| Removed | Ministry reports, monthly summaries, the "Read as" line. Policy milestones are chronicle events in built-in wording. |

## Built for speed on a local model (decision record 0008)

| Area | State |
| --- | --- |
| Measured calls | Per call, in the Inspector and the model check: time to the first token, tokens a second with that wait taken out, thinking tokens, whether the server held the reply to the JSON schema, and every small mistake put right locally. OpenAI-compatible replies are streamed to get these figures. |
| Strict schemas | A JSON schema built fresh for each call, with the allowed answers as enums (region ids, instrument ids, an actor's option ids, the variables an order may touch, card ids). Closed objects, no open `extensions` field. One answer per thing by construction: outcomes keyed by action id, verdicts by item index, answers by item key. The prompt stops describing the shape once a reply has come back in the schema's exact shape. |
| Mending instead of asking again | Numbers clamped, prose trimmed at a sentence end, unasked fields dropped, nulls removed, a list of pairs read as named values, an impossible action read as a statement. Each fix is recorded. The model is asked again only when the reply is unusable. |
| Lowest reasoning effort | Asked for on OpenAI-compatible servers, dropped silently where the server does not know the option. |
| One call for a turn's answers | On a model running on this machine the whole turn's reactions are asked for in one call; a hosted model still writes them side by side. At most five answers a turn. |
| Shorter replies, a warm model, a pushed screen | Effects as `{"inflation": 1.2}`; a warm-up call when the server starts and when a model is pointed at; `GET /api/stream` pushes the screen on every change, with a slow poll left only as a safety net. |
| Prose shown as it is written (REQ-PERF-16) | An answer from a person, a full account, and the cast's answers to a turn appear word by word, down the same live connection. The text on screen is provisional and never saved; the finished, checked text replaces it. Answers due over the coming hours are not shown early. OpenAI-compatible servers only: the Anthropic and Gemini adapters do not stream yet. The stand-in has a `standin-typing` model that writes slowly, for watching it work. Not built: a live count of tokens on the progress panel for the two calls before a turn commits, which write data, not prose. |
| Not verified | No real model has run any of it. The stand-in now behaves like LM Studio (streams, reports usage, answers in the schema's shape), so the tests exercise these paths, but the figures above have never been read off a real local model. |

## A world that moves first (decision record 0009)

| Area | State |
| --- | --- |
| The cast acts unprompted | As a turn of a day or more ends, dice decide whether somebody moves first (a one-in-four chance for each day passed; a second mover in a turn of a week or more; at most two). The engine weighs who has reason to, from the state of the country and each actor's standing, and gives the model that reason; the model writes what they do. A move can be one of the actor's bounded actions and can set up a later beat. Nobody answering an order that turn, or who moved in the last fortnight, is chosen. |
| How it shows | An event of its own in the chronicle ("made a move", "spoke out"), significant, filed under dealings with that actor, written word by word as it arrives. |
| Cost | No extra call on a local model when orders were sent: moves ride in the one reactions call. A turn with nothing ordered now makes that one call when somebody moves, after the commit. |
| A more eventful judge | Told to write what the world does on its own account: about one event a week, at least one that matters in any period of a week or more. One significant event a fortnight (was one in 45 days), one major event in any period of two weeks or more (was 30 days). A significant event no longer has to cite an earlier one. |
| Not built | Moves that reach your inbox as a demand to answer; "to next major event" stopping on a move; actors with private motives and plots. The chances and weights are placeholders, like every other number. |
| Not verified | No real model has written a move or judged a period under the new instructions. With no model and with the stand-in, moves come from templates. |

## Built after that, on request

| Area | State |
| --- | --- |
| Conversations that change minds | Each member of the cast has a hidden standing toward you. It moves through recorded causes only: orders they like or dislike, undertakings you give them in conversation (credit now), keeping one (noticed) or letting its 45 days lapse (said in public, and costs more than keeping earns), and threats. You see it as a stance word and a trend (warming, cooling). A party leader's standing sways its bloc's votes in the legislature. Words of friendship alone move nobody. |
| People reaching out | Members of the cast write to you unasked: a partner an order cuts against, an actor whose undertaking was kept or broken, your Finance Minister on a crisis line, your Interior Minister when a region worsens, your Principal Secretary on a lost vote or a court stay. Unread counts show on the People button. "To next major event" stops when someone writes. |
| Advice before you act | Under each unsent box, a line from your own office, by rules and with no model: what your office cannot order, what needs a vote, and who is known to object. |
| Hours | After an order sent with a one-hour move, answers reach you one at a time over the day (after one, three and six hours). A longer move brings them all. |
| History by story | The chronicle grouped into running stories: an order and everything that followed from it, dealings with one actor, the economy, one place. |
| Looking back | "See the world at this point" on any turn shows the map and briefing as they stood. The desk and the clock are disabled until you return to the present; nothing is rewound. |
| Export | The chronicle, turn by turn, as a Markdown file. |
| Late reactions | Fixed: a move made while reactions are still arriving starts once they have landed. |

## Still not built from that spec

| Item | State |
| --- | --- |
| Brief model-written headlines | Not built, deliberately: an event's own one-line summary is the headline, so no call is made. |
| The full persuasion model (REQ-ACT-12 to 15): seven kinds of lever, openness, trust, belief against interest, thresholds per stance | Reduced to offers and threats, one standing number per actor, and undertakings checked against later orders. An undertaking counts as kept when you issue an order of a kind that actor wants, not when you do the specific thing you said. |
| Personas with traits and motives; plots and betrayal | Not built. An actor has interests, a stance and a voice. |
| Messages written by a model | Not built. Unasked messages use built-in wording, so they cost nothing and read plainly. |
| Detail figures carried into later entries (REQ-JOB-24) | Checked when written; not yet carried forward. |
| The judge's memory of earlier months | Not wired. It sees the last eight events only. |
| A move of hours with nothing pending | Changes the clock and nothing else. |

## M1 to M4

M1 is under way: the cast, reactions, later beats and asking people are built (see above). Personas with traits and motives, pressure and persuasion, hiring and firing, and delegation are not started. M2 to M4 are not started. See the roadmap in the README.
