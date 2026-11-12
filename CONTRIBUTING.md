# Contributing

## Before you open a pull request

Run `npm run check`. It runs what CI runs: lint, type-check, unit tests and end-to-end tests. A pull request that fails any of them is not merged.

## Rules of the codebase

- **Schema first.** Any shape that crosses a boundary (API route, ledger event, save file, model job) is a Zod schema in `packages/protocol`. Derive the type from it; do not write the type by hand.
- **The engine stays pure.** `packages/engine` does no I/O, reads no clock and uses no randomness except its own seeded dice.
- **The ledger is append-only.** Nothing is updated or deleted. To undo something, append an event.
- **Tokens only.** No component uses a raw colour, size or font. Add a token in `packages/web/src/theme/tokens.css` if one is missing.
- **Build UI from the gallery.** A new component goes into the gallery (`#gallery`) in every state before it is used on a screen.
- **No `any`, no non-null assertions.** Biome enforces both.
- **No secrets in the repository.** Keys go in a local `.env`, which git ignores.

## Tests

The suite is deliberately small.

- **End-to-end tests** (`e2e/`) are the main layer: one test per thing a player can do, against the real server and a real campaign file.
- **Unit tests** sit beside the code (`*.test.ts`) and cover engine invariants and the ledger.

A build is not described as working unless the end-to-end suite passes on a clean checkout.

## Commits and pull requests

- One change per pull request, with a short description of what and why.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org): `feat(server): ...`, `fix(web): ...`, `docs: ...`.
- A significant technical choice gets a short record in `docs/decisions/`.
- Change the spec in `docs/spec/` in the same pull request as the code it describes.
