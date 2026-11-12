# 0005. Policies change the world through caused, bounded offsets

Date: 2026-11-11. Status: accepted.

## Context

The engine has to let a policy move the economy, approval and unrest, while keeping three promises from the spec: only the engine changes numbers, every change has a recorded cause, and with no cause the world stays where it is.

## Decision

A policy never writes a variable. It adds **effects**: each names a target (`inflation`, `spending.subsidies`, `approval.urban_poor`, `grievance.kp`), an amount, a start day, an optional end day, and the ledger event ids that caused it. While an effect is active, the target's resting level is shifted by its amount, and the daily update pulls the real value toward that level at the system's own speed.

- The **catalogue** lists, per instrument, which targets it may touch and the allowed range of each. A pick outside the range is rejected, not clipped, so the model's repair loop sees the mistake.
- **Scenario numbers are a baseline.** At day 0 the engine works out each group's base approval and each region's long-standing grievance so that the starting world is at rest.
- **Time moves one day at a time.** A 30-day jump is thirty daily steps, so slicing can never change the result.
- Approval targets are **tags**, not country-specific group ids, so one catalogue serves every country.
- The one exception to offsets is repression, which lowers unrest once and leaves grievance behind.

## Consequences

- Removing an effect undoes its pull, which is what repealing a policy should do.
- Every event the engine raises can name the causes behind it; a change with no active effect is labelled `trend`.
- Monetary policy has no automatic channel to growth and inflation yet: the catalogue ranges carry it. A reaction function for the central bank comes with actors in M1.
- All speeds and ranges are placeholders in `packages/engine/src/params.ts` and the catalogue, marked unsourced, until the calibration run.
