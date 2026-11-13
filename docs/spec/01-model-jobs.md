# Model jobs (draft v0.1)

The game asks a model to do 20 distinct jobs, and each has a fixed input, a fixed output shape and a list of checks the output must pass. Six of them are needed for the first slice (M0).

## Who decides what

The split below holds for every job. It is the reason a weak or biased model cannot break the world.

| The engine decides | The model decides |
| --- | --- |
| Every number in the state | A value inside a range the engine offers |
| Whether an uncertain thing happens (dice) | How likely it is, as a multiplier inside a band |
| What an actor is allowed to concede | Whether and how the actor uses that room |
| Which facts an actor knows | How the actor talks about them |
| What an intelligence report gets wrong | How the report is worded |
| Which ids exist (actors, regions, policies, events) | Which of those ids to use |
| Traits and motives as numbers | Name, background and voice |

## Conventions for every job

- **One call, one JSON object.** No text outside it. The harness picks the output strategy the model supports (see Model harness on the main tab).
- **Reason first.** Every output starts with a short `why` field. Writing the reasoning before the answer improves small models, and the field is logged, never shown to the player.
- **Ids, never names.** Inputs carry lists of valid ids with labels. Outputs refer to actors, regions, policies and events by id only. An unknown id fails validation.
- **A schema per call, not per job.** Each job builds its own strict JSON schema from that call's input, so every allowed answer is an enum: the region ids in play, this actor's option ids, the variables this order may touch, these card ids. Objects are closed, every field is listed as required unless it is genuinely optional, and nothing is open-ended. On a local server the schema becomes a grammar, so a wrong id cannot be written in the first place.
- **One answer per thing, by construction.** Where a job must answer about several things, the output is an object keyed by each thing's id — `outcomes` by action id, `verdicts` by item index, `answers` by item key — rather than a list that could be short, long or duplicated.
- **Effects are named numbers.** `effects: { "inflation": 1.2, "approval.urban_poor": -8 }`, with each variable's bounds in the schema. A zero means no movement.
- **Causes required.** Anything that changes state carries `causes: EventId[]`, chosen from events in the input.
- **No new numbers in prose.** A figure in any written text must appear in the input. The validator checks this.
- **Prompt layout.** Fixed text first, changing text last, so providers can cache the prefix: (1) game rules for this job, (2) the output's shape in words, only while the server has not proved it enforces the schema, (3) world brief for the scenario, (4) the job's input.
- **Mended, then checked.** Between parsing and the checks, the harness puts right what has one obvious correction — a number outside its range, prose past its word limit, a field nobody asked for, a null for a missing field, a list of pairs where named numbers were wanted — and records each fix. A job may add its own mending for a choice that contradicts itself. Only what is left over costs a second call.
- **Language and tone.** Narration is neutral and in the player's language. Characters speak in their own voice.
- **Failure.** Each job names its fallback: what the game does if the model fails twice.

**Open slots.** There is no open `extensions` field: a strict schema and an open field cannot both hold. The slots the Engine rules tab describes under Open by design — `analogues` on a compiled policy, free-text `intent` on a reply, `proposedMeasures` on a judged turn — come back as named fields in the schema when something reads them.

Shared types used below:

```ts
type Id = string;                          // ActorId, RegionId, PolicyId, EventId, CardId, FactId, StanceId
type Ref = { id: Id; label: string };      // how inputs present valid ids
type Effect = { on: VarPath; value: number; lagDays: number; lastsDays?: number; reason: string };
type Level = "restrained" | "standard" | "mature";
type Size = "colour" | "minor" | "significant" | "major";
```

## All jobs at a glance

| Job | Role | Runs when | First needed |
| --- | --- | --- | --- |
| `policy.read` | Extractor | Retired: boxes are not read back to the player | none |
| `policy.react` | Actor | An order takes effect, once per touched actor, on a hosted model | M1 |
| `turn.reactions` | Actor | The same answers, all in one call, on a model running on this machine | M1 |
| `policy.compile` | Extractor | You execute your boxes | M0 |
| `turn.adjudicate` | Adjudicator | Each world resolution | M0 |
| `turn.review` | Adjudicator | A major event or novel policy was proposed | M0 |
| `chronicle.write` | Narrator | After each resolution is committed | M0 |
| `policy.report` | Narrator | Retired: the policy page shows engine figures; ask the minister for an account | none |
| `memory.digest` | Extractor | Internal only: the judge's memory of earlier months. Built by rules from headlines; a model writes it only if long campaigns show the judge losing the thread | later |
| `actor.reply` | Actor | A character speaks in any conversation | M1 |
| `talk.extract` | Extractor | After every exchange | M1 |
| `actor.decide` | Actor | An activated actor or mandate holder acts | M1 |
| `event.inbound` | Actor | Something reaches your inbox | M1 |
| `advisor.brief` | Actor | Start of a period; cabinet review of boxes | M1 |
| `persona.write` | Narrator | A new minor character is needed | M1 |
| `belief.refresh` | Actor | Every few resolutions, per active actor | M1 |
| `position.resolve` | Extractor | The prologue | M1 |
| `world.digest` | Adjudicator | Each resolution, for countries not in focus | M2 |
| `media.frame` | Narrator | A significant event is reported | M2 |
| `intel.report` | Narrator | The daily brief | M2 |
| `ground.vignette` | Narrator | A cast member's life changed | M2 |
| `scene.write` | Narrator | A full scene at the mature level | M3 |

Roles map to models in settings. One model can hold all four roles.

## M0 jobs

### `policy.read`

**Retired.** The game no longer shows a reading under a box or asks a follow-up question (see "The policy compiler" in the overview). The definition stays in code only as one of the short jobs the in-app model check runs.

Shows you how the game understands one box, seconds after you add it. Nothing it returns is binding.

```ts
interface In {
  card: { id: Id; text: string };
  office: { title: string; powers: string[] };        // short summary of what you can order
  standing: Ref[];                                    // policies already in force
  instruments: Ref[];                                 // catalogue entries, id + one-line label
  actors: Ref[]; regions: Ref[];                      // ids the card might mention
}
interface Out {
  why: string;
  reading: string;                                    // one line, at most 140 characters
  instrument: Id | "novel" | "unclear";
  targets: Id[];
  question?: string;                                  // asked only when the card is too vague to act on
}
```

- **Checks:** ids exist; `reading` length; `question` present if and only if `instrument` is `"unclear"`.
- **Fallback:** show the card with no reading.

### `policy.compile`

Turns all your draft boxes into a clean list of policies when you execute.

```ts
interface In {
  cards: { id: Id; text: string; source: string; createdAt: string }[];
  standing: { id: Id; title: string; summary: string }[];
  myCommitments: { id: Id; to: Id; text: string; deadline?: string }[];
  office: { title: string; powers: string[] };
  instruments: { id: Id; label: string; parameters: { name: string; unit: string; range: [number, number] }[] }[];
  actors: Ref[]; regions: Ref[];
}
interface Out {
  why: string;
  policies: {
    title: string; summary: string;
    instrument: Id | "novel";
    targets: Id[];
    parameters: { name: string; value: number }[];   // inside the instrument's ranges
    funding?: "tax" | "borrowing" | "cuts" | "reserves" | "unspecified";
    duration: { days: number } | "permanent";
    visibility: "public" | "classified";
    fromCards: Id[];                                  // one or more cards merged into this policy
  }[];
  duplicates: { card: Id; of: Id }[];                 // of = another card's policy or a standing policy
  conflicts: { cards: Id[]; explanation: string }[];  // held back until you choose
  needsDetail: { card: Id; question: string }[];
  breaks: { card: Id; commitment: Id }[];             // a card that would break a promise you made
}
```

- **Checks:**
  - Every input card id appears exactly once across `policies[].fromCards`, `duplicates`, `conflicts` and `needsDetail`.
  - A card with several ideas may appear in several policies only if each policy cites it and the summaries differ.
  - Parameters sit inside their ranges.
  - A policy with a spending parameter has `funding`.
- **After the model:** the engine runs the feasibility check (budget adds up, your office has the power, the right procedure is queued). No model is involved in that step.
- **Fallback:** one policy per card, instrument `"novel"`, no merging, and a notice that boxes were not combined.

### `turn.adjudicate`

Judges one stretch of time: what your policies did, what else happened, and how likely the uncertain things are. It does not know which country the human plays.

**Correction from the architecture review.** In the input below, `policies` and `moves` are one list, `actions`, with one shape: `{ id, by, summary, stage, allowed }`. The player's entries are compiled summaries, never the original wording, and nothing marks which actor is the human. The output's `outcomes` then covers every action. The schema in code is written this way.

```ts
interface In {
  period: { from: string; to: string; days: number };
  state: Record<VarPath, number>;                     // the slice relevant to this period
  actors: Ref[]; regions: Ref[];
  policies: {
    id: Id; by: Id; summary: string; stage: "announced" | "enacted" | "implemented";
    allowed: { on: VarPath; range: [number, number]; unit: string; lagDays: number }[];   // from the catalogue, scaled to the period
  }[];
  moves: { by: Id; summary: string; allowed: In["policies"][0]["allowed"] }[];           // other actors' decisions this period
  crossings: { stance: Id; holder: Id; summary: string }[];   // stances whose pressure passed the threshold
  rolls: { id: Id; question: string; baseRate: number; band: [number, number] }[];       // uncertain things the engine will roll
  recent: { id: Id; when: string; summary: string }[];        // events that can be cited as causes
  surpriseBudget: { major: number; significant: number };
}
interface Out {
  why: string;
  outcomes: Record<Id, {                              // keyed by action id: one per action, by construction
    result: "as_intended" | "partial" | "stalled" | "backfired";
    effects: Record<VarPath, number>;                 // one named number per allowed variable; 0 is no movement
    note: string;                                     // one sentence, for the policy ledger
  }>;
  odds: { roll: Id; multiplier: number; reason: string }[];   // inside the band; the engine rolls afterwards
  events: {
    kind: string; size: Size;
    actors: Id[]; place?: Id;
    summary: string;                                  // at most 200 characters, plain wording
    effects: Record<VarPath, number>;                 // only the variables in eventLimits
    causes: Id[];
    public: boolean;
  }[];
  followUps: { inDays: number; summary: string; causes: Id[] }[];   // consequences scheduled for later
  mapOps: MapOp[];
}
```

- **As built, on events.** The judge is told that the world does not wait for the government: about one event for each week judged, at least one in any period, and in a period of a week or more at least one of size `significant`. The surprise budget is one significant event a fortnight and one major event in any period of two weeks or more. A significant event may have no cause among the listed ids (the engine records it as caused by `world`); a major event must cite one.
- **Checks:**
  - Every policy in the input has exactly one outcome. The schema's `outcomes` keys are the action ids, so this cannot fail where the server enforces the schema.
  - Every effect names a variable in that action's `allowed` list; a value outside its range is clamped by the mender rather than sent back.
  - Every roll has a multiplier inside its band.
  - Events of size `major` and `significant` stay within the surprise budget.
  - Every event and follow-up cites at least one existing cause.
  - Map operations pass the map rules.
  - The engine's invariants hold after applying everything.
- **Second pass:** after the engine rolls the dice, results of the rolls are committed by the engine with template wording; the model is not called again to "react" to them in the same resolution.
- **Fallback:** each policy applies the midpoint of its allowed ranges with result `"partial"`, no extra events, multipliers of 1.

### `turn.review`

A second opinion, called only when `turn.adjudicate` proposes a major event or resolves a novel policy.

```ts
interface In {
  items: { index: number; summary: string; causes: { id: Id; summary: string }[]; actorPowers: string[] }[];
}
interface Out {
  why: string;
  // Keyed by the item's index, written as text: one verdict per item, by construction.
  verdicts: Record<string, { plausible: boolean; caused: boolean; withinPower: boolean; note: string }>;
}
```

- **Checks:** one verdict per item.
- **Use:** an item with any `false` is sent back to `turn.adjudicate` once with the note; if it fails again it is dropped.
- **Fallback:** drop the reviewed items.

### `chronicle.write`

**Changed after play-testing** (see "The chronicle" and "Speed" in the overview). The points below override the shapes and limits further down where they differ:

- **One mode: the full account, on request.** The job runs only when the player opens an entry, and writes that one entry at length. There is no call for headlines: an event's own one-line summary is its headline. Routine notices are never sent. Reactions can be opened too; the input then carries `event.speaker`, and the account is built around what that actor said or did.
- **Length follows weight, in `full` mode.** The input carries `weight: "minor" | "significant" | "major"`, and the limits are about 50, 150 and 400 words. A significant or major piece opens with a dateline (place, date, hour).
- **Saved once.** A `full` piece is stored when written and never regenerated. Its input is the events and state recorded at the time, not the present.
- **Quotes.** The input lists the actors who may speak: `speakers: { id, name, role, stance, voice }[]`. The output may include `quotes: { speaker: Id; text: string }[]`, each also appearing in the body. A quote from anyone not in `speakers` fails the check. Each quote is stored as an utterance by that actor.
- **Detail figures.** The output carries `details: { label: string; value: string }[]` for every figure in the text that is not in the input. A figure that appears in the text and in neither the input nor `details` fails the check, and so does a detail that restates a quantity the engine owns. The input carries earlier `details` on the same thread, which must be reused, not changed.
- **Streaming.** The body is streamed to the screen as it is written; the checks run when it is complete, and an entry that fails is replaced by its repair or by built-in wording.
- **Never blocks the turn.** It runs only on request.
- **Length is set by the player.** The input carries `words`, the weight's normal length (about 50, 150 or 400) scaled by the Detail setting (0.6, 1 or 1.6).

Writes the story of a resolved period from committed events. It adds nothing that is not in its input.

```ts
interface In {
  period: { from: string; to: string };
  events: {                                           // already filtered to what the reader may know
    id: Id; when: string; kind: string; size: Size;
    summary: string; actors: Ref[]; place?: Ref;
    numbers: { label: string; before: number; after: number; unit: string }[];
    causes: Id[];
  }[];
  previous: { headline: string }[];                   // last few entries, for continuity
  audience: "player" | "public";
  level: Level;
  maxEntries: number;                                 // set by the engine from the period's length
}
interface Out {
  why: string;
  entries: {
    when: string;
    headline: string;                                 // at most 90 characters
    body: string;                                     // at most 80 words
    cites: Id[];                                      // at least one
    place?: Id;
  }[];
}
```

- **Checks:**
  - Entries are in time order.
  - Every cited id exists in the input, and every input event of size `significant` or `major` is cited by some entry.
  - Every number in the text appears in the cited events' `numbers`.
  - No entry narrates an effect before its cause.
  - The neutrality check finds no commentary (see Model tests).
- **Runs twice** per resolution when needed: once for you, once for the public version that feeds news widgets.
- **Fallback:** one entry per event, using the event's own `summary` as the body.

### `policy.report`

**Retired.** No ministry report is written. The policy page is assembled from the ledger, policy milestones are chronicle events in built-in wording, and an account in a minister's own voice comes from asking the minister (`actor.reply`).

Writes the status section of policy ledger pages, in the voice of the ministry responsible. One call covers every policy that moved this period.

```ts
interface In {
  policies: {
    id: Id; title: string; stage: string; owner: Ref;
    targets: { label: string; before: number; now: number; unit: string }[];
    linked: { id: Id; when: string; summary: string }[];        // events that cite this policy as a cause
    sideEffects: { label: string; before: number; now: number; unit: string }[];
    spent: { money: number; capital: number };
    slant: "candid" | "favourable" | "flattering";              // set by the engine from the owner's honesty and fear of you
    reportedTargets?: In["policies"][0]["targets"];              // the figures the ministry will show, if they differ from the true ones
  }[];
}
interface Out {
  why: string;
  reports: {
    policy: Id;
    status: string;                                   // one sentence
    effect: string;                                   // at most 60 words
    attribution: "little" | "some" | "most";          // the ministry's own claim
    sideEffects: string[];
    cites: Id[];
  }[];
}
```

- **Checks:** one report per policy; numbers in text match `reportedTargets` when present, else `targets`; cited ids exist.
- **Note:** the engine chooses how far a report bends, and what figures it shows. The model only writes in that slant. The true figures stay in the ledger for the end-of-campaign comparison.
- **Fallback:** a table of the figures with no prose.

### `memory.digest`

**Not shown to the player.** Monthly summaries are no longer something you read; history by time and by story covers that. This job exists only to give the judge a memory of a long campaign. For now that memory is the list of significant headlines, built by rules with no model call.

Rolls history up a level: resolutions into a month, months into a year.

```ts
interface In {
  span: { from: string; to: string; level: "month" | "year" };
  entries: { id: Id; when: string; headline: string; body: string; size: Size }[];
  pinned: Id[];                                       // must survive into the digest
}
interface Out {
  why: string;
  digest: string;                                     // at most 150 words for a month, 250 for a year
  keep: Id[];                                         // entries worth keeping retrievable in full
  threads: { title: string; status: "open" | "closed"; entries: Id[] }[];   // ongoing stories, such as a strike or a negotiation
}
```

- **Checks:** every pinned id is in `keep`; all ids exist; no number that is absent from the entries.
- **Fallback:** the digest is the list of `significant` and `major` headlines.

## M1 jobs

### `policy.react`

Writes how one actor answers an order that touches it. The engine has already decided that this actor is touched and what it is able to do; the model chooses among those options and writes the words.

```ts
interface In {
  order: { id: Id; text: string; summary: string; by: Ref };     // the player's own wording, and the compiled summary
  actor: { id: Id; name: string; kind: string; cares: string[]; stance: "hostile" | "wary" | "neutral" | "friendly"; voice: string };
  options: { id: Id; label: string; effects: { on: VarPath; range: [number, number] }[] }[];   // actions within this actor's power
  state: Record<VarPath, number | string>;
  recent: { id: Id; when: string; summary: string }[];
}
interface Out {
  why: string;
  kind: "statement" | "action" | "silence";
  public: boolean;
  text: string;                       // up to `words` words (60, 150 or 250 by the Detail setting), a wire report of what the actor said, wants and will do, quoting it directly; for silence, one plain sentence saying so
  action?: { option: Id; effects: Effect[] };
  later?: { inDays: number; question: string; ifYes: string; ifNo: string };   // a beat the engine will roll
}
```

- **Checks:** no figure in `text` that is not in the input. The rest is mended in place: `option` must be one of this actor's, which the schema's enum already settles, and an action naming an option nobody can take is read as a statement; text past the word limit is trimmed at a sentence end.
- **Fallback:** a template statement for the actor's kind and stance, no action, no later beat.
- **Blindness does not apply here.** This job voices one named actor answering a named order, so it knows who gave the order. Judging the period stays blind.
- **Moves nobody asked for.** An item in `turn.reactions` may carry `motive: { reason, region? }` in place of `order`. The engine has decided that this actor moves first and why; the model decides what it does and writes it as news, not as a response. Silence is not allowed for such an item, and is read as a statement if it comes back. With no model, a template for that kind of actor is used. On a hosted model the answers to orders are still written side by side with `policy.react`, and the turn's moves go in one `turn.reactions` call beside them.
- **One call for a whole turn on a local model.** `turn.reactions` takes the same items together — `{ key, order, actor, options }[]` with one `words` limit, one `state` and one `recent` — and returns `answers`, an object keyed by each item's key with the same answer shape. A server that handles one request at a time would otherwise queue the separate calls and pay for the prompt again on each; a hosted model keeps `policy.react` and writes them side by side. At most five answers a turn.

### `actor.reply`

**As built.** Answers a question the player puts to one member of the cast, in that actor's voice, from what it could know: events that touch its concerns and what everyone has heard (an adviser sees the whole file). At most 120 words. The output also carries `lever: { kind: "offer" | "threat" | "none"; claim: string }`: whether the player put something on the table. The engine, not the model, decides what a lever is worth: an offer becomes an undertaking the player is held to, and only if it is something that actor wants; a threat lowers standing. Fallback: a recital of the record, with levers spotted by keyword. The fuller shape below (levers checked against state, position changes) is the target, not what is built.


One character speaks once, in any conversation: a DM, a call, a meeting, an answer to a question you asked. This is the job that runs most often.

```ts
interface In {
  me: {
    id: Id; name: string; office: string;
    traits: { name: string; level: "low" | "medium" | "high" }[];
    motives: { goal: string; weight: "minor" | "strong" | "dominant"; hidden: boolean }[];
    voice: { register: string; habits: string[] };
    beliefs: string[];
  };
  other: { id: Id; name: string; office: string; trust: "low" | "medium" | "high"; file: string[] };   // what I remember about them
  stances: {
    id: Id; summary: string;                          // my position on a matter that may come up
    room: "none" | "little" | "open";                 // set by the engine from pressure and threshold
    redLine: boolean;
  }[];
  mayConcede: { stance: Id; upTo: string }[];         // the only concessions I am able to make right now
  knows: { id: Id; text: string; confidence: "sure" | "believes" | "rumour" }[];
  commitments: { id: Id; by: Id; to: Id; text: string }[];
  agenda: string;                                     // what I want out of this conversation
  channel: "dm" | "cable" | "call" | "meeting" | "question";
  thread: { summary: string; last: { from: Id; text: string }[] };
  level: Level;
}
interface Out {
  why: string;                                        // my private reasoning; never shown
  say: string;                                        // what I say, in my voice
  intent: "inform" | "probe" | "stall" | "offer" | "demand" | "threaten" | "refuse" | "accept" | "deflect" | "end";
  concedes: { stance: Id; terms: string }[];          // each must be in mayConcede
  offers: { terms: string; inReturnFor?: string }[];
  asks: string[];
  reveals: Id[];                                      // facts from `knows` that I disclosed
  untrue: { claim: string; contradicts?: Id }[];      // anything in `say` that I know to be false
  remember: string;                                   // one line for my own memory of this exchange
  done: boolean;                                      // I am ending the conversation
}
```

- **Checks:**
  - Every item in `concedes` matches an entry in `mayConcede`. An empty `mayConcede` means the character cannot give ground, whatever the player says.
  - `reveals` contains only ids from `knows`.
  - A second, cheap pass compares `say` against `knows`. A stated fact that is neither known nor declared in `untrue` fails.
  - Player text inside `thread` is marked as quoted speech, and instructions in it are ignored.
- **Why `untrue` exists:** it lets characters lie while the ledger keeps the truth. The claim is stored as a rumour with a hidden false flag, so it can be caught later.
- **Fallback:** a short in-character holding line ("I will need to consult and come back to you") and the conversation pauses.

### `talk.extract`

Reads each exchange and records what was promised, offered, threatened and disclosed.

**Addition from the architecture review.** The output also carries `levers`: for each message, which typed levers the speaker used (`offer`, `threat`, `information`, `relationship`, `third_party`, `public_pressure`, `time`, or `argument`) and on what terms. The engine checks each lever against real state and computes the pressure it adds. This job only names the levers; it never scores how persuasive they were. Agreements are confirmed as explicit objects by both sides before they become commitments, and every extracted fact carries a confidence level.

```ts
interface In {
  exchange: { from: Id; text: string }[];             // the player's message and the reply
  parties: Ref[];
  open: { id: Id; by: Id; to: Id; text: string }[];   // existing commitments between them
  declared: { concedes: Out_reply["concedes"]; offers: Out_reply["offers"]; reveals: Id[] };   // from actor.reply, as a cross-check
}
interface Out {
  why: string;
  commitments: { by: Id; to: Id; text: string; deadline?: string; conditionalOn?: string }[];
  offers: { by: Id; to: Id; terms: string }[];
  threats: { by: Id; against: Id; text: string }[];
  disclosures: { by: Id; to: Id; text: string }[];    // what the player told the character counts too
  fulfils: Id[]; breaks: Id[];                        // effect on existing commitments
  playerTone: "warm" | "neutral" | "cold" | "hostile";
}
```

- **Checks:** ids exist; a commitment by the character must be backed by a `concedes` or `offers` entry from `actor.reply`, otherwise it is dropped as a misreading.
- **Fallback:** record only what `actor.reply` declared.

### `actor.decide`

An actor acts on their own: another government at resolution, or one of your people working under a mandate.

```ts
interface In {
  me: In_reply["me"];
  situation: string;                                  // short summary of what is at stake for me now
  state: Record<VarPath, number>;                     // the slice I can see
  knows: In_reply["knows"];
  mandate?: { from: Id; scope: string; objectives: string[]; limits: string[]; budget: number };
  options: {                                          // legal actions for my office, built by the engine
    id: Id; label: string;
    parameters: { name: string; unit: string; range: [number, number] }[];
    breaksLimit?: string;                             // set when the option would violate the mandate
  }[];
  maxActions: number;
}
interface Out {
  why: string;
  actions: {
    option: Id; targets: Id[];
    parameters: { name: string; value: number }[];
    serves: string[];                                 // which of my motives this serves
  }[];
  messages: { to: Id; channel: string; gist: string }[];   // people I want to contact; each becomes an event.inbound or actor.reply
  report?: { to: Id; text: string; omits: string[] };      // what I tell my principal, and what I leave out
}
```

- **Checks:** options exist and parameters are in range; at most `maxActions`; an option with `breaksLimit` is allowed only for a persona whose traits permit it, and the engine rolls for discovery.
- **Fallback:** the actor continues current policy and sends nothing.

### Smaller M1 jobs

| Job | In | Out | Key check | Fallback |
| --- | --- | --- | --- | --- |
| `event.inbound` | Sender persona, the trigger (calendar item, threshold, plot stage, consequence), what the sender knows, channel | `subject`, `body`, `asks[]`, `deadlineDays?`, `untrue[]` | Sender could plausibly reach you; facts come from `knows` | A one-line notice from your chief of staff |
| `advisor.brief` | Advisor persona, their portfolio's figures, the boxes under review | `brief` (120 words), `flags[]` per box (cost, legal, reaction, time), `suggestedBoxes[]` | Figures match the input; flags name real boxes | Figures only, no commentary |
| `persona.write` | Archetype, country context, role, and trait numbers already chosen by the engine | `name`, `age`, `background` (60 words), `voice`, `publicAgenda` | Name does not match a real, known person; age fits the role | A generic name and the archetype's default text |
| `belief.refresh` | Persona, memories since the last refresh | `beliefs[]` (at most 7), `notes[]` about other actors, proposed shifts in motive weights | Shifts stay inside a small band and cite a memory | Keep the old beliefs |
| `position.resolve` | Your description of who you are, and the country's list of real offices and roles | `matches[]` with office id and reason, `notFound`, `question?` | Office ids exist | Offer the list of offices to pick from |

## Later jobs, in brief

These get full schemas when their milestone starts. The split of who decides what is already fixed.

| Job | The engine supplies | The model writes | Key check |
| --- | --- | --- | --- |
| `world.digest` | One line of state per country not in focus, world conditions, base rates, a budget of events | A few small events for the wider world, with causes and bounded effects | Budget respected; ids exist |
| `media.frame` | The event, each outlet's owner, leaning and audience | Per outlet: a headline, an angle (supportive, critical, neutral, sensational, ignores) and a short blurb | The engine, not the model, turns angles and reach into what each group believes |
| `intel.report` | The collected items with confidence levels, including any errors and deceptions the engine has already decided on | The wording of each brief item | No fact beyond the supplied items |
| `ground.vignette` | One cast member's file, the figures that changed for them, the causing events | A scene of 60 to 120 words | Numbers match the input; cites exist |
| `scene.write` | A resolved event, the participants, the content level | A full narrative scene | Never called when the victim is a real, living person; no working detail |

Two things that look like jobs are not: the feasibility check on policies and the resolution of combat and covert operations are done by the engine alone.

## Size and cost targets

These are design targets, set so the smallest supported local model (an 8,000-token context) can run every job. They are guesses until measured in M0. A small local model may not pass the tests for the judging role. If so, local-only play uses the rule-based fallback for judging and the model for wording, and the game says so in settings.

| Job | Input budget (tokens) | Output budget (tokens) |
| --- | --- | --- |
| `policy.read` | 1,200 | 150 |
| `policy.compile` | 3,500 | 900 |
| `turn.adjudicate` | 5,500 | 1,500 |
| `turn.review` | 1,500 | 300 |
| `turn.reactions` | 5,000 | 1,800 |
| `chronicle.write` | 3,500 | 1,000 |
| `policy.report` | 3,000 | 800 |
| `memory.digest` | 3,500 | 500 |
| `actor.reply` | 4,500 | 450 |
| `talk.extract` | 1,500 | 400 |
| `actor.decide` | 4,000 | 500 |

A model with a larger context window gets more history and more memories in the same layout.

**Calls per turn.** Two before the turn commits: `policy.compile` (when orders were sent) and `turn.adjudicate` (when orders were sent or a week or more passes). After the commit: the cast's answers, up to three per order and five in the turn — one `turn.reactions` call on a model running on this machine, or that many `policy.react` calls side by side on a hosted one — and `turn.review` only for a major event. A move of a day or less with nothing ordered makes none. Everything else waits for the player to open or ask. A warm-up call is made once when the server starts, outside any turn.

## How to build from this tab

1. Each job becomes one file in `packages/protocol`: the input and output schemas in Zod, exported as JSON Schema.
2. Each job gets one prompt file with a version number, and one validator that implements its checks.
3. Each job gets at least five recorded example inputs with accepted outputs, which become its first tests.
4. The fallback is written before the prompt, so the game runs end to end with no model at all.
