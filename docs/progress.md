# Progress

Where the build stands and what comes next. Update this file in the same commit as the work it describes.

## Working agreement

- Work happens on a branch per milestone (`m0-first-slice`), merged to `master` when the milestone's gate passes.
- Every commit leaves `npm run check` passing.
- The spec in `docs/spec/` and the requirements in `docs/requirements.md` are the source of truth. Departures get a record in `docs/decisions/`.

## M0 First slice

Scope: one country (Pakistan), one position (head of government), policy only. Gate: a one-year term plays end to end on a local model.

| Step | Status | Notes |
| --- | --- | --- |
| 1. Skeleton, design system, first screen-to-ledger path | Done | Policy boxes persist through the API to the campaign file. 6 end-to-end and 10 unit tests. |
| 2. Engine: budget, approval, unrest, control | Done | Daily update for the four systems, caused effects, policy catalogue with ranges, funding check, keyed dice. Pakistan scenario pack with sources. 8 engine tests including a golden 12-month run. Decision record 0005. |
| 3. Model harness and the seven M0 jobs | Next | New packages `models` and `director`. Fallback first for every job, then the scripted stand-in model, then the OpenAI-compatible and Anthropic adapters. |
| 4. Clock and resolution | Not started | Execute boxes, advance time, resumable steps, progress panel, cancel. |
| 5. Reading the world | Not started | Chronicle, policy pages, world briefing, timeline, control map (MapLibre). |
| 6. Saves and branches | Not started | Scheduled snapshots, rewind, branch view. |
| 7. Developer tools | Not started | Resolution inspector and cost meter. |
| 8. Gate | Not started | One-year term on a local model through LM Studio. |

## Known gaps in what is built

- Database access is not yet on a worker thread (REQ-PLAT-07).
- Window drag and resize are pointer-only.
- Not yet run on Windows by the author of the code; verified on Linux only.

## M1 to M4

Not started. See the roadmap in the README.
