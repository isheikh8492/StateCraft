# 0008. Fast local calls: strict schemas, local repair, and one call for a turn's answers

Date: 2026-11-12. Status: accepted.

## Context

Decision 0007 cut what a turn waits for down to two model calls. What each of those calls
costs was still untuned, and the target is a model running on the player's own machine
through LM Studio, where there is no provider to blame for the wait:

- A local server answers one request at a time. Work sent side by side queues, and each call
  pays for its own prompt again.
- Every call carried the full JSON Schema exported from Zod — open-ended, with an
  `extensions` field and optional fields — and, in the prompt, a second description of the
  output shape. A schema that does not forbid a wrong answer does not prevent one.
- A reply with one number out of range, one field too long, or one field nobody asked for was
  sent back to the model. On a local model a repair costs as much as the original call.
- Thinking tokens are pure latency for jobs where the engine has already decided the outcome
  and the model only words it.
- Nothing was measured. There was no way to tell a slow server from a slow model, or prompt
  processing from generation.
- The screen asked the server for the whole state four times a second while a turn ran.

## Decision

- **A strict JSON schema is built fresh for each call** and names the only answers that are
  allowed: these region ids, this actor's option ids, the variables this order may touch,
  these card ids. Every object is closed, lists every field it requires, and has no open
  `extensions` field. A local server compiles the schema into a grammar, so an enum is not
  advice but the only thing the model can emit.
- **The output shape leaves the prompt once the server has proved it enforces the schema** —
  that is, once a reply has come back in the schema's exact shape. A server that quietly
  ignores `response_format` looks no different at the request, so nothing is assumed.
- **Where one answer per thing is wanted, the reply is keyed by that thing's id.** A turn's
  outcomes are an object keyed by action id, a review's verdicts by item index, a turn's
  answers by item key. "Exactly one outcome per action" is then true by construction rather
  than a check that can fail.
- **Effects are named numbers**, `{"inflation": 1.2}`, not a list of `{"on", "value"}` pairs.
  Shorter to write, and each variable carries its own bounds in the schema.
- **Mechanical mistakes are put right where the reply lands, not sent back:** a number
  outside its range is clamped, over-long prose is trimmed at a sentence end, a field nobody
  asked for is dropped, a null standing in for a missing field is removed, a list of pairs is
  read as named values, an action no actor can take is read as a statement. Every fix is
  recorded and shown in the Inspector. The model is asked again only when the reply is
  unusable.
- **The lowest reasoning effort is asked for** on OpenAI-compatible servers, and dropped
  silently if the server objects, like every other option the harness learns about.
- **A turn's answers from the cast are asked for in one call on a model that runs on this
  machine**, and side by side on a hosted one. At most five answers a turn, however much was
  ordered.
- **Every call is measured:** time to the first token, tokens a second with that wait taken
  out, tokens spent thinking, whether the server held the reply to the schema, and what was
  put right locally. The Inspector and the model check both show it. Replies from
  OpenAI-compatible servers are streamed to get these figures.
- **Prose the player is waiting to read is shown as it is written.** The wait that is felt
  is the wait before the first word, so an answer from a person, a full account, and the
  cast's answers to a turn appear word by word instead of all at once. The prose sits in
  string fields of a JSON reply, so the harness reads those fields out of the half-written
  object and the server sends them down the live connection. In the one-call form, the
  cast's answers are written one actor after another and appear in that order. This
  reverses the earlier choice to drop streaming (REQ-PERF-16).
- **What is streamed is provisional and never saved.** The finished reply is still mended
  and checked as a whole, and only that text enters the record. Usually it is what was
  watched arriving, or that text cut at a sentence end; when a check fails and the model is
  asked again, the text on screen starts over. Answers that are due over the coming hours
  are not streamed, since they must not be read before they arrive.
- **A warm-up call is made when the server starts and when a model is pointed at**, so the
  first turn does not wait for the weights, and the harness learns what the server accepts
  before anything depends on it.
- **The screen is pushed to down one live connection** (`GET /api/stream`) whenever anything
  changes, with a slow poll left only as a safety net for a dropped line.

## Consequences

- Job versions are bumped, so recorded calls from an earlier campaign are marked as coming
  from a different contract. The save-file format does not change.
- The stand-in model now behaves like LM Studio: it streams, reports usage, and answers in
  the schema's shape alone when a schema is sent. The end-to-end tests therefore exercise
  the enforced-schema path, the measurements and the mender for real.
- A hosted provider that cannot take a schema is unaffected: it keeps the shape in the
  prompt and the repair loop behind it.
- Clamping a value the model chose means the game sometimes applies a number the model did
  not write. That is the engine's prerogative — it already bounds every effect — and the
  change is on the record.
- The open `extensions` field is gone from every job. The open slots the engine rules
  describe (analogues, custom measures, free-text intent) will come back as named fields when
  something reads them.
