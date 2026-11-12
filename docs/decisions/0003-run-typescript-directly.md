# 0003. Run the server's TypeScript directly with tsx

Date: 2026-11-11. Status: accepted.

## Decision

Workspace packages export their TypeScript source, and the server runs through `tsx` in both development and normal use. Only the web app has a build step.

## Why

One fewer build to run, wait for and get out of date. `npm start` builds the web app and starts the server; there is no compiled server output to keep in step with the source.

## Cost

Start-up pays a small transpile cost. `tsx` does not type-check, so `npm run typecheck` must run separately; CI does this on every pull request. A packaged desktop build will need a real server build.
