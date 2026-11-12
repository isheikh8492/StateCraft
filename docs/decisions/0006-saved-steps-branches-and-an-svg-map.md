# 0006. Saved steps, branches in one file, and an SVG map for M0

Date: 2026-11-11. Status: accepted.

## Context

A resolution makes several model calls and can take minutes on a local model. The player must be able to cancel it, the server may stop half way, and the player must be able to go back in time without losing anything.

## Decision

- **A resolution is a list of steps, each saved before the next begins**: compile, adjudicate, apply, narrate, report. The result of each step is stored in the ledger as it finishes. On start-up, an unfinished resolution continues from its last saved step; finished steps are read back, never redone.
- **The world changes at one point only.** The apply step works out the new world and stores it with the step, but the campaign adopts it only when the `resolution.committed` event and its snapshot are written in one transaction. Cancelling before that leaves the world exactly as it was.
- **Rewinding forks a branch inside the same file.** A branch records its parent and the last shared event. Reading a branch walks its ancestors up to each fork. Nothing is deleted; the abandoned future stays in the file.
- **Loading reads the latest snapshot** and folds stored step results into the screen's view. No rule is ever re-run on old events, so a newer engine cannot change an old campaign's past.
- **The M0 map is an SVG** of province outlines taken from Natural Earth, coloured from engine state. The spec calls for MapLibre with offline tiles; that is deferred to M3, where moving units and fronts need it.

## Consequences

- Results reach the screen when the resolution commits, not step by step. The progress panel shows which step is running. This is a departure from REQ-PERF-03, taken so that cancel is clean.
- Snapshots exist at resolution boundaries, so those are the points you can rewind to.
- The view sent to the screen never contains approval or unrest as numbers; the developer inspector reads the true numbers through a separate route.

## Amendment, 2026-11-12

- The map is now MapLibre GL JS. It still needs no tile service or key: the style contains only GeoJSON outlines shipped with the game (the world at 1:110m and the scenario's regions at 1:10m, both Natural Earth). Region names and unrest dots are HTML markers, because MapLibre text needs a font server. A scenario lists the Natural Earth subdivisions each region is made of, and `npm run outlines -w @statecraft/scenarios` builds its outline file, so a new country needs data and no code.
- Rewinding to a date inside a resolution forks just before it and runs that resolution again from its saved inputs up to that day. The engine is deterministic and time moves a day at a time, so this lands on exactly the world of that day without storing a snapshot per day.
