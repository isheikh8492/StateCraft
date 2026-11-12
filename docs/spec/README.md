# StateCraft specification

Snapshot of the product specification as of 2026-11-11 (spec v0.2).

| File | Contents |
| --- | --- |
| [00-overview.md](00-overview.md) | Summary, platform and stack, architecture, model harness, responsiveness, gameplay loop, policy desk, levels of play, government structure, actors, inbound events, live map, consistency, knowing what happened, widgets, saves, real-world grounding, engineering practice, UI design system, roadmap |
| [01-model-jobs.md](01-model-jobs.md) | The 20 model jobs: inputs, outputs, checks, fallbacks, size targets |
| [02-engine-rules.md](02-engine-rules.md) | Principles, status quo and pressure, conversation levers, persuasion, the four core systems, personas, intrigue, emergent entities, open slots, guardrails, memory, calibration |
| [03-player-and-world.md](03-player-and-world.md) | Neutral narration, who you are, the clock, projects and mandates, hiring and firing, war, ground view, the authoritarian path, lethal politics |
| [04-world-systems.md](04-world-systems.md) | Events of every size, intelligence, elections, media, trade and sanctions, international bodies |
| [05-model-tests.md](05-model-tests.md) | Model test suite, neutrality tests, scorecards, the in-app model check, self-improvement loops |
| [06-architecture-review.md](06-architecture-review.md) | Review of 2026-11-11: 21 findings, what is sound, what to postpone, fix lists |
| [../requirements.md](../requirements.md) | Numbered requirements extracted from these files, each with its milestone, source and verification method |

## Notes

- These files were exported from the working design document. Diagrams were redrawn as Mermaid.
- Once code exists, this folder is the source of truth: change the spec here, in the same pull request as the code it describes.
- In `01-model-jobs.md`, two schemas carry a correction note from the architecture review. The note overrides the code block under it.
- Everything beyond milestone M1 is a design hypothesis until M0 and M1 have run.
