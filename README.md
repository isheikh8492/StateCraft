# StateCraft

An open-source geopolitics simulator, played in plain text on a live world map. You hold one position in a real country, and AI models play everyone else. A deterministic engine owns the numbers and the record of events, so any model can be connected without corrupting the world.

**Status:** early. The project skeleton, design system and the first path from screen to campaign file work. The engine for the economy, approval, unrest and control runs (`npm run sim -w @statecraft/scenarios` prints a year of Pakistan with no player), but it is not yet connected to the screen or to a model. See the [roadmap](#roadmap).

## Run it

You need [Node.js](https://nodejs.org) 22.13 or newer. Nothing else.

**Windows:** double-click `start.cmd`.

**Any system:**

```
npm install
npm start
```

The first run installs dependencies and builds the app, then opens it in your browser at `http://127.0.0.1:4317`. Your campaign is saved in `data/campaign.statecraft`.

## Develop

```
npm run dev        # server and web app with live reload, at http://localhost:5173
npm run check      # everything CI runs: lint, type-check, unit tests, end-to-end tests
```

| Command             | What it does                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| `npm run lint`      | Lint and format check (Biome)                                                                        |
| `npm run format`    | Fix formatting and safe lint issues                                                                  |
| `npm run typecheck` | TypeScript, strict, every package                                                                    |
| `npm test`          | Unit tests (Vitest)                                                                                  |
| `npm run test:e2e`  | End-to-end tests (Playwright) against the real server. First time: `npx playwright install chromium` |

Open `http://127.0.0.1:4317/#gallery` to see every component of the design system.

## Project layout

```
packages/
  protocol/   Zod schemas for everything that crosses a boundary. Types derive from these.
  engine/     The deterministic core: no I/O, no clock, seeded dice only.
  scenarios/  Starting worlds as data, each with a list of its sources.
  ledger/     Append-only event store, one SQLite file per campaign.
  server/     Local HTTP API (Fastify). Binds to 127.0.0.1 and checks host, origin and token.
  web/        The interface (React, Vite, Tailwind). Design tokens in src/theme/tokens.css.
e2e/          End-to-end tests: the real UI against the real server.
docs/
  spec/           The product and technical specification.
  requirements.md Numbered requirements extracted from the specification.
  decisions/      Short records of significant technical decisions.
```

Two more packages arrive with the first simulation build: `models` (the model harness and adapters) and `director` (the turn pipeline).

Dependencies point one way: `web` and `server` depend on `protocol`; `server` depends on `ledger` and `engine`; `engine` depends on nothing.

## Documentation

- [Specification](docs/spec/README.md)
- [Requirements](docs/requirements.md)
- [Decisions](docs/decisions/)
- [Contributing](CONTRIBUTING.md)

## Roadmap

| Milestone      | Scope                                                                                                                 | Gate                                               |
| -------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| M0 First slice | One country, one position, policy only: boxes, clock, four core systems, chronicle, policy ledger, control map, saves | A one-year term plays end to end on a local model  |
| M1 People      | Conversations, advisors, personas, resistance, hiring and firing, mandates                                            | No concessions below the threshold in 200 attempts |
| M2 The world   | 25 countries in depth, media, elections, trade, international bodies, intelligence                                    | A 2015 start looks like 2015 to 2020               |
| M3 Conflict    | Units on the map, war, covert action, plots, the authoritarian path                                                   | Story and map agree in every replayed turn         |
| M4 Breadth     | Lower starting positions, historical packs, self-improvement, desktop app                                             | A new country pack ships without code changes      |

## Licence

Code: [Apache-2.0](LICENSE). Scenario data keeps each source's own licence.
