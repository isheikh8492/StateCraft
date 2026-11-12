# 0001. npm workspaces, not pnpm

Date: 2026-11-11. Status: accepted. Supersedes the "pnpm workspaces" line in spec v0.2.

## Decision

The monorepo uses npm workspaces.

## Why

The project's first requirement for players is that opening the app is easy. npm ships with Node.js, so the only thing a player installs is Node. pnpm would be a second install, and recent Node versions no longer bundle a way to get it.

## Cost

pnpm is faster and stricter about undeclared dependencies. At this repository's size neither matters yet. Switching later means replacing the lockfile and the `-w` flags in scripts.
