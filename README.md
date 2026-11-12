# StateCraft

An open-source geopolitics simulator, played in plain text on a live world map. You hold one position in a real country, and AI models play everyone else. A deterministic engine owns the numbers and the record of events, so any model can be connected without corrupting the world.

**Status:** design complete for the first milestone; no code yet.

## Documentation

- [Specification](docs/spec/README.md): the product and technical design, in seven files.
- [Requirements](docs/requirements.md): 278 numbered requirements extracted from the specification, each with its milestone, source and verification method.

## Roadmap

| Milestone | Scope | Gate |
| --- | --- | --- |
| M0 First slice | One country, one position, policy only: boxes, clock, four core systems, chronicle, policy ledger, control map, saves | A one-year term plays end to end on a local model |
| M1 People | Conversations, advisors, personas, resistance, hiring and firing, mandates | No concessions below the threshold in 200 attempts |
| M2 The world | 25 countries in depth, media, elections, trade, international bodies, intelligence | A 2015 start looks like 2015 to 2020 |
| M3 Conflict | Units on the map, war, covert action, plots, the authoritarian path | Story and map agree in every replayed turn |
| M4 Breadth | Lower starting positions, historical packs, self-improvement, desktop app | A new country pack ships without code changes |

## Licence

Code: Apache-2.0. Scenario data keeps each source's own licence.
