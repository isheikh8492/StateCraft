# StateCraft

An open-source geopolitics simulator, played in plain text on a live world map. You hold one position in a real country, and AI models play everyone else. A deterministic engine owns the numbers and the record of events, so any model can be connected without corrupting the world.

**Status:** playable. You take office as Prime Minister of Pakistan in November 2026, write orders in plain words, move time forward, and see who answers: the army, armed groups, your coalition partners, the opposition, lenders and neighbours each react to what you do, and you can put questions to them. It has been tested end to end with a scripted stand-in model and with no model. [docs/progress.md](docs/progress.md) lists exactly what is and is not built.

## Run it

You need [Node.js](https://nodejs.org) 22.13 or newer. Nothing else.

**Windows:** double-click `start.cmd`.

**Any system:**

```
npm start
```

That is all, every time. It installs what is needed only on the first run or after the dependencies change, and rebuilds the app only after its code changes; otherwise it goes straight to opening StateCraft in your browser at `http://127.0.0.1:4317`. Your campaign is saved in `data/campaign.statecraft`.

## Connect a model

The game plays without a model, in plain built-in wording. A model makes it read better and lets the world surprise you.

1. Open the **Model** window.
2. For a local model, start [LM Studio](https://lmstudio.ai) (or Ollama), load a model, start its local server, and press **LM Studio** under Quick setup. Type the model's name exactly as the server lists it.
3. For a hosted model, choose the connection, put your key in a file called `.env` in this folder (copy `.env.example`), and restart StateCraft. The key never leaves that file.
4. Press **Check this model**. It runs four short jobs and tells you whether the model is suitable, usable or unsuitable.

The **Inspector** window shows every model call of the last resolution and what it cost.

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
  ledger/     Append-only event store, one SQLite file per campaign, with branches and snapshots.
  models/     The model harness: adapters, the seven jobs, checks, repair, fallbacks, stand-in.
  director/   The turn pipeline: compile, adjudicate, apply, narrate, report.
  server/     Local HTTP API (Fastify). Binds to 127.0.0.1 and checks host, origin and token.
  web/        The interface (React, Vite, Tailwind). Design tokens in src/theme/tokens.css.
e2e/          End-to-end tests: the real UI against the real server.
docs/
  spec/           The product and technical specification.
  requirements.md Numbered requirements extracted from the specification.
  decisions/      Short records of significant technical decisions.
```

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
| M1 People      | A cast that answers every order, then conversations, advisors, personas, resistance, hiring and firing, mandates                                     | No concessions below the threshold in 200 attempts |
| M2 The world   | 25 countries in depth, media, elections, trade, international bodies, intelligence                                    | A 2015 start looks like 2015 to 2020               |
| M3 Conflict    | Units on the map, war, covert action, plots, the authoritarian path                                                   | Story and map agree in every replayed turn         |
| M4 Breadth     | Lower starting positions, historical packs, self-improvement, desktop app                                             | A new country pack ships without code changes      |

## Licence

Code: [Apache-2.0](LICENSE). Scenario data keeps each source's own licence.
