# Scorecard: StateCraft against Modern Day 2026

Last scored: 2026-11-12 (pass 6). Rules for this file are in `docs/GOAL.md`.

**Sources for the other game.** `[MD]` is its own page, <https://worldos.cc/worlds/modern-day-2026>,
read on 2026-11-12 (the page was cut short by the reader, so absence of a feature there is
not proof it is missing). `[claim]` is the second-hand description the owner supplied, which
came from an AI assistant and is not verified. Nobody on this project has played the other
game: nothing below about how well it works in play is known.

**Evidence for StateCraft.** A test name, or a session file under `docs/research/sessions/`.

Verdict: **behind**, **level**, **ahead**, or **unknown** where the other side is not known
well enough to say. "Ahead" needs evidence on our side and a source on theirs.

## What a player meets

| Capability | Modern Day 2026 | StateCraft today | Verdict |
| --- | --- | --- | --- |
| Countries playable | "Lead any nation": about 238 entries listed, including disputed territories such as Somaliland and Northern Cyprus `[MD]` | One: Pakistan, as Prime Minister | **behind** |
| Depth of one country | Not stated. The page lists domains tracked (diplomacy, economy, deterrence, technology, energy, domestic politics) with no detail `[MD]` | Budget, approval by group, unrest by region in stages, control, a legislature with real seat counts that votes, courts that stay orders, sixteen named stakeholders with standing (engine tests; session `2026-11-12-month-1`) | **unknown**, likely ahead per country |
| Other nations acting on their own agendas | Yes: "Every other country is run by its own AI government with its own interests"; since v6 they act "every turn" `[MD]` | No other country is modelled. India, China, Afghanistan and the IMF speak and can make bounded moves as cast members | **behind** |
| A world that moves without you | Yes since v6: coups, elections, civil wars, border wars, new alliances; a time skip reports what happened; background events never take your own territory `[MD]` | The cast moves first and the engine draws the country's own events, several a day when things are tense, each at its hour; play runs from one to the next (decisions 0009, 0012, 0013; session `by-the-hour`). Inside one country only | **behind** in scope; hour-by-hour play is not something their page describes |
| Plain-language orders | Yes: "whatever you want to do — the world reacts" `[MD]` | Yes. A clear order can no longer be set aside as too vague, and dice decide whether it goes as intended, in part, stalls or backfires (decision 0011; session `landings`). But an order outside the ten or so catalogue instruments still gets only small bounded effects and no consequences of its own | **behind**: still the weakest thing in play |
| Diplomacy | Private and group chats with any character `[MD]`; treaties and alliances `[claim]` | Ask any reachable stakeholder; offers become undertakings with a due date that are kept or broken on the record; threats cost standing (test "holds you to your word"). No treaties, no alliances, no other states | **behind** in scope, **ahead** on being held to your word |
| War and territory | A zoomable territory map acted on region by region; provinces added so civil wars and secessions can play out `[MD]` | Regions have control status drawn on the map; no units, no fronts, no transfer of territory | **behind** |
| Map correctness | The GM gets the map wrong often enough that players are given a wrench tool to fix it `[MD]` | Control changes only through engine rules; a model cannot change the map (engine test "control changes only by an explicit act") | **ahead** |
| Economy and trade | Listed as a domain `[MD]`; mechanics not stated | One national economy with a budget and effects with lags; no trade between countries | **unknown** |
| Domestic politics | Listed as a domain; elections happen in the background `[MD]` | Legislature votes, courts, approval by group, coalition partners whose standing sways votes. No elections, no loss of office | **unknown**; no way to lose is a real gap |
| World-level conditions | Energy and technology listed as domains `[MD]`; mechanics not stated | None | **behind** |
| Consistency over a long game | Not stated. The wrench tool suggests the GM drifts `[MD]`; forgotten treaties `[claim]` | Eighteen months played with no failed step and the world rebuilt from the ledger throughout (session `year-1`). But the judge sees only the last eight events and its own events repeated from month to month | **unknown** |
| Speed of a turn | Not stated | On `gpt-oss-20b` locally at about 20 tokens a second: 17 s on average and 44 s at worst for a turn with orders; instant with none (session `month-2`). Hosted: never measured | **unknown** |
| Quality and amount of writing | From the owner's screenshots: an adviser's answer of about 900 words in headed sections with named people, dates and amounts; chronicle entries with datelines, figures and quotes by default; names made up freely `[owner's screenshots]` | Advisers now brief in headed sections with names, dates and amounts, up to 434 words on the local model, with made-up names recorded and reused (decision 0014; session `briefings`). The chronicle is still one line an event unless a full account is asked for | **behind**: on the chronicle, and on length with a local model |
| Saves, rewind, branches | Runs keep their own history `[MD]`; rewind not stated | Snapshot every turn, rewind to any turn or date onto a new branch, old line kept (tests; session `month-1` step 15) | **ahead** on what is stated |
| Offline, no key, local model | Browser only; runs on a metered allowance of "Zaps", with subscriptions `[MD]` | Runs locally, with no model at all, or on a local model: 21 of 21 calls answered by the local model, none fell back (session `month-1`) | **ahead** |
| Scenarios and start dates | Kept current to the month (v8 opens after the November 2026 US midterms); the same author runs WW1, WW2 and 350 BC worlds; one-click remix `[MD]` | One scenario, sourced, starting November 2026. Packs are data files but there is no second pack and no guide | **behind** |
| Characters you can talk to | Any character, privately or in groups `[MD]` | Sixteen, one at a time; armed groups cannot be reached. Your own advisers give plans and draft orders you can put on the desk in one click (session `adviser`) | **behind** in number; drafting orders is not something their page describes |
| Cutscenes and presentation | Cards, cutscenes `[MD]` | Windows over a map; text only | **behind** |

## The full system

One row per line of "The full system" in `docs/GOAL.md`. Where the other game stands on
these is mostly not public, so the verdict column is about whether StateCraft has it.

| Capability | StateCraft today | Has it? |
| --- | --- | --- |
| Rules in code; the model chooses inside bounds | Core design; engine tests | yes |
| Strict validation, retry only when unusable | Decision 0008; 4 repairs and 0 fallbacks in 21 real calls, with the causes of 3 of those repairs since removed | yes |
| Saves, rewind, branching | Tests | yes |
| Full replay from recorded replies | Calls recorded; replay not built | partly |
| Golden-seed regression through a model | One no-model golden run | partly |
| Refusals caught and retried | Built; no real refusal met yet | partly |
| Prompt caching | Fixed text first; no cache headers | partly |
| Fallback to a second model | Not built | no |
| A living world | Decision 0009 | partly |
| Factions whose ignored demands escalate; losing office | Not built | no |
| Delayed causality with detection | Stages and beats only | partly |
| A pacing director | Not built | no |
| Other nations with private agendas | Not built | no |
| Only the relevant slice sent to a model | True for one country | partly |
| Cheap model for reactions, strong for judging | Roles can differ | partly |
| World-level conditions | Not built | no |
| Trade and supply chains | Not built | no |
| Media with several biased voices | Not built | no |
| Whole-campaign memory | Last eight events | no |
| Fog of war and intelligence | Hidden approval and standing only | partly |
| Covert operations | Not built | no |
| Sub-national tiles with adjacency | Regions without adjacency | partly |
| Territory changing hands by rule | Not built | no |
| Manual map correction | Not needed while the engine owns the map | not planned |
| Desktop app | Not built | no |
| Scenario packs anyone can write | Data files; no guide or checker | partly |

## Where this leaves us

Behind on breadth (one country against about 238, no other states, no war), and that is what
a player sees first. Ahead on the things that go wrong in a game where a model is the rules
engine: the map cannot be invented, a promise is remembered and enforced, every turn can be
rewound, and it runs with no account and no meter. The honest summary is that StateCraft is
a deeper game about one country and not yet a game about the world.
