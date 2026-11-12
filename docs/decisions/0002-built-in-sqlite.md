# 0002. Node's built-in SQLite module

Date: 2026-11-11. Status: accepted.

## Decision

The ledger uses `node:sqlite`, not `better-sqlite3`.

## Why

`better-sqlite3` is a native module. It needs a prebuilt binary for each Node version and platform, or a compiler on the player's machine, which is the commonest way a Node app fails to install on Windows. The built-in module needs nothing.

## Cost

- Node 22 prints an "experimental" warning for this module at start-up. Newer versions do not.
- The API is synchronous. All access goes through the `Ledger` interface in `packages/ledger`, so moving it to a worker thread later does not change callers. It is not in a worker yet (requirement REQ-PLAT-07 is open).
