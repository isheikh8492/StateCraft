# Engine rules (draft v0.1)

The engine keeps the world realistic by default: things stay as they are unless enough pressure builds to move them, and models can only nudge numbers the engine owns.

## Principles

Five rules hold everywhere in the engine.

1. **The engine owns every number.** Models never write state. They return typed, bounded proposals, and the engine applies them.
2. **Models estimate, dice decide.** For any uncertain outcome the model returns a probability adjustment, and the engine rolls the result. Each roll has its own seed, built from the campaign seed and the roll's id, so adding or removing one roll never changes another. A model cannot simply declare that a coup succeeded or that a deal was accepted.
3. **Continuity is the default.** Every variable has a trend it returns to, and every actor keeps its current stance. Change needs a cause recorded in the ledger.
4. **Rates are per day.** Every rule is written as a daily rate, so the arithmetic is the same however time is sliced. Model judgement is coarser over a long jump than over many short steps, so long jumps are lower resolution by design.
5. **Every effect has a cause.** Each state change stores the event ids that caused it. An effect with no cause is rejected.

## Status quo

Yes: people and institutions mostly defend what they already have, and the engine is built on that. Political science gives three reasons, and each becomes a rule.

| Finding | What it means | Engine rule |
| --- | --- | --- |
| Loss aversion | People weigh a loss about twice as heavily as an equal gain | A policy's losers react about twice as strongly as its winners. Taking a benefit away costs more approval than granting it earned. |
| Veto players | The more actors whose consent a change needs, the less changes | The threshold for change rises with each office, chamber, court or faction that can block it, taken from the government structure. |
| Punctuated equilibrium | Politics is long stability broken by short bursts of change | Pressure builds out of sight and decays slowly. Nothing moves until it crosses the threshold, then change comes fast. |

**The pressure rule.** Every stance an actor holds (a policy, an alliance, a border claim, loyalty to you) has a pressure value and a threshold:

```ts
// per stance, per day
pressure = pressure * decay + sum(pushes today)   // decay just under 1: old pressure fades

// a push is a ledger event aimed at this stance: sanctions, an offer, protests, a threat, a defeat
push = size * credibility(sender) * lossWeight     // lossWeight = 2 when the actor stands to lose

// the stance can change only when
pressure > threshold
threshold = base(stanceKind) * (1 + 0.5 * vetoPlayers) * entrenchment
// entrenchment grows the longer the stance has stood; red lines have an infinite threshold
```

What follows from this:

- **Below the threshold, the answer is no.** The model voicing an actor is given the stance, the pressure and the threshold. It can negotiate, stall or hint, but it cannot concede. This is the main defence against agreeable models.
- **Above the threshold, the dice decide** whether and how the stance breaks, with odds that rise the further pressure is past the line.
- **Your own side follows the same rule.** Your cabinet, legislature and provinces all hold stances. Big departures from current policy need pressure you build first, or political capital you spend.
- **Change costs more the further it goes.** The political capital cost of a policy grows with the square of its distance from current policy. Two moderate steps are cheaper than one radical one.
- **Stability is the base rate.** Rare events (coups, wars, government collapse, defaults) start from historical yearly rates per country type. Pressure multiplies the rate within a fixed band; it never replaces it.

### Reading pressure without numbers

You never see a pressure value or a threshold. You judge how close someone is to moving the way a politician does, from signals the game generates out of the hidden numbers:

| Signal | What it suggests |
| --- | --- |
| Tone and wording | A flat refusal softens to "this would be difficult", then to "what would you offer?" |
| Who answers | The leader stops replying in person and sends a deputy, or the reverse |
| Speed | Replies come faster, or you are made to wait |
| Trial balloons | A friendly newspaper floats the idea; a minister "misspeaks" |
| Third parties | A mutual contact tells you they are worried, or that they will never budge |
| Actions | Troops stand down, a visit is scheduled, a critic is released |
| Your advisors' read | Each gives an estimate in words, coloured by their own competence and interests |
| Intelligence | A report on the debate inside their cabinet, with a confidence level |

Signals can mislead on purpose. A skilled, dishonest actor can act close to yielding in order to draw out a better offer.

### What a conversation can change

Talking moves pressure through two kinds of lever: material ones backed by something real, and persuasion, which changes how the other side sees the matter. The model never scores how persuasive you were.

| Lever | What backs it | How the engine sizes it |
| --- | --- | --- |
| Offer | Something you actually hold and commit: money, an office, a vote, a concession | Its value to the other side, weighed by their motives. It becomes a commitment you must honour. |
| Threat | A capability you have and a record of following through | The harm you could do, times how credible you are. An empty threat lowers your credibility. |
| Information | A fact that changes their estimate of the situation | How much it shifts their expected outcome. A false fact works until it is caught, then costs trust. |
| Relationship | A favour owed, trust built, personal standing | The size of the debt and the trust between you |
| Third parties | Someone they depend on leaning on them at your request | That party's own leverage over them |
| Public pressure | Their own public, press or party turning on the stance | Their approval among the groups that matter to them |
| Time | A deadline that makes waiting costly for them | What delay costs them per day |

- **Persuasion is real, and it is a skill.** People and governments do change position because someone convinced them. The next section sets out how. What the game never does is let a model award points for eloquence.
- **How it works.** After each of your messages, the extraction job names which levers you used and on what terms. The engine checks each one against real state: do you have the money, the troops, the votes, the fact? Only levers that check out add pressure, and the engine computes how much.
- **The other side uses the same levers on you** and on each other.

### Persuasion

Persuasion works by reaching something the other side already cares about, or by changing what they believe. Knowing your counterpart is the skill, and the game rewards it.

| Kind of appeal | Example | Works best on |
| --- | --- | --- |
| To their interest, seen differently | "This pipeline makes you the transit hub, not the bypassed neighbour" | Pragmatists; anyone whose stance rests on a calculation |
| To their values or ideology | An argument from sovereignty, faith, justice or solidarity that they themselves hold | The ideologically committed, when the appeal fits their belief and not against it |
| To identity, honour and history | A shared struggle, an old debt between two peoples, how they will be remembered | The proud, the vain, leaders thinking of their legacy |
| To fear or hope | What happens to them if this fails; what becomes possible if it works | The risk-averse and the ambitious, respectively |
| Personal | Rapport, respect shown, time taken, a relationship built over many conversations | Anyone, slowly; it raises trust, which strengthens every other appeal |
| To their public | Speeches, interviews and visits aimed at the people a leader answers to | Countries: a government's position moves when its own public and elites move |

How the engine sizes an appeal, without judging how well it was worded:

1. **Does it reach a real motive?** The extraction job names what the appeal is aimed at. The engine checks that against the listener's actual motives, including hidden ones. An appeal that hits a strong motive counts for a lot; one that misses counts for nothing; one that offends a value counts against you.
2. **How open are they?** Traits set this. A flexible pragmatist can be argued round; a rigid ideologue cannot be argued out of the belief itself, though they can be reached through it.
3. **Do they believe you?** Your trust and reputation with them scale everything. The same words from a known liar do little.
4. **Is it new?** Repeating an argument brings less each time.
5. **Does it hold up?** If the appeal rests on a claim, the claim's truth matters once they check it.

What follows from this:

- **Positions resting on belief move by persuasion; positions resting on interest move by material levers.** Each stance records which it mostly is. A country's vote on a matter of principle can be won by argument. Its claim to a territory usually cannot.
- **Finding the key is the game.** A leader's hidden motives, learned through intelligence, conversation or a mutual friend, are what make persuasion work. The same speech fails on one person and turns another.
- **Countries are persuaded through people.** A government's position shifts when the few who decide are convinced, or when their public is. Public diplomacy and private persuasion are separate routes.
- **Persuasion can change more than a stance.** Sustained over time, it can shift a person's motive weights and beliefs, within the bounds for how personas change. That is how an opponent becomes an ally.
- **Red lines stay red.** No argument moves a red line directly. It moves only if the belief or interest behind it changes first.

### Learning why something worked

Because nothing is shown as a number and every source can mislead, the game provides ways to learn from outcomes:

| Setting | What you get |
| --- | --- |
| Realistic | Only what your advisors and intelligence tell you |
| Guided (default for a first campaign) | Your chief of staff is dependable. After a stance holds or breaks, they tell you which levers mattered and which did not. |
| Open | Pressure shown as a rough gauge on each stance. Intended for learning and for development. |

At the end of a campaign, every setting shows the true record of what moved each major decision.

## The four v1 systems

The first version runs on four systems. Combat, trade and technology come later and plug into the same pattern: a few state variables, a daily update, and a fixed list of ways a policy can touch them.

### 1. Budget and economy

| Variable | Unit |
| --- | --- |
| GDP, trend growth, current growth | USD per year; % per year |
| Inflation, unemployment | % per year; % |
| Revenue, spending by category | % of GDP |
| Debt, interest rate on debt | % of GDP; % per year |
| Reserves | months of imports |

```ts
// daily update (dt = 1/365)
growth    += (trendGrowth - growth) * pullGrowth * dt + impulses.growth
inflation += (anchor - inflation) * pullInflation * dt + impulses.inflation + importPricePassThrough
deficit    = spending + debt * interestRate - revenue
debt      += deficit * dt
interestRate = baseRate + riskPremium(debt, reserves, stability)   // rises as debt grows and reserves fall
reserves  += (tradeBalance + capitalFlows) * dt
```

- **Money is conserved.** Every spending policy needs a funding source: tax, borrowing, cuts elsewhere or reserves. The engine rejects a policy slate that does not add up.
- **Crisis thresholds.** Reserves under 3 months of imports or a fast-rising interest rate trigger a threshold event such as a currency run or an IMF approach.

### 2. Approval

Approval is tracked per group (5 to 8 per country, taken from its dossier) and summed by population share.

```ts
target[g]    = base[g] + economyFelt[g] + security[g] + issueAlignment[g] + rally
approval[g] += (target[g] - approval[g]) * pullApproval * dt     // moves over months, not days
```

- **Ceilings and floors.** Committed opponents never approve and committed supporters rarely leave, so national approval lives in a band set by the country's partisan split. An approval of 100 cannot happen.
- **Rallies fade.** A war or a disaster gives a rally bonus that decays over weeks.
- **Losses count double,** as in the status quo rule.

### 3. Unrest

Each region has an unrest level from 0 to 100 and a stage: calm, protest, riot or insurgency.

```ts
grievance = lowApproval(localGroups) + priceShock + repressionMemory + identityGrievance
unrest   += (grievance * mobilization - stateCapacity * response) * dt + spillover(neighbours)
```

- **Stages have hysteresis.** A region moves up a stage only after holding above the line for a set number of days, and moves down more slowly than it went up.
- **Repression trades time for anger.** It lowers unrest now and raises grievance later.
- **Unrest spreads** to neighbouring regions that share the grievance.

### 4. Control

Each region has an owner, a controller and a status: held, contested or occupied.

- Control changes only through forces present over time, a local government defecting, or insurgency holding its top stage long enough to make the region contested.
- Sovereignty changes only through an explicit transfer. Other states then each decide on recognition by their own stance rule.

### How a policy touches the systems

Each policy instrument has a catalogue entry listing the variables it may touch, the allowed size of each effect, and its delay:

```ts
fuel_subsidy_cut: {
  authority: "budget",                       // procedure it must pass
  effects: [
    { on: "spending.subsidies", range: [-2.0, -0.1], unit: "% GDP",  lagDays: 0 },
    { on: "inflation",          range: [0.2, 3.0],   unit: "points", lagDays: 14, lastsDays: 180 },
    { on: "approval.urbanPoor", range: [-15, -2],    unit: "points", lagDays: 7 },
    { on: "unrest.grievance",   range: [1, 20],      unit: "points", lagDays: 7 },
  ],
}
```

The adjudicating model picks a value inside each range and must give its reason. It cannot touch a variable the entry does not list. A policy that fits no entry is resolved as a "novel policy": it gets small default ranges and a second review (see the next section).

## Actors: personas and motives

Every person in the game has a persona made of three parts: traits, motives and a voice. Traits and motives are numbers the engine uses, so a ruthless general and a cautious technocrat behave differently under the same pressure, not just speak differently.

### Traits

Traits are dials from 0 to 1. Each one changes a specific engine rule:

| Trait | High value means | What it changes |
| --- | --- | --- |
| Ambition | Wants a higher office or more power | Starts plots and makes demands more often; loyalty decays faster when passed over |
| Ruthlessness | Accepts harm to others to get results | Unlocks harsh options (purges, repression, betrayal); lowers the weight on public backlash |
| Risk appetite | Gambles on uncertain outcomes | Acts at lower odds of success; escalates sooner in a standoff |
| Ideology | Holds beliefs over interests | Raises thresholds on stances tied to the belief; some become red lines |
| Loyalty | Sticks with a patron, party or institution | Raises the pressure needed to defect; names who the loyalty is to |
| Patience | Plays a long game | Values future gains nearly as much as present ones; waits out a weak hand |
| Suspicion | Expects betrayal | Discounts others' promises; demands guarantees; checks claims through intelligence |
| Honesty | Keeps their word and says what they mean | Lowers the odds of bluffing, lying and breaking commitments |
| Vanity | Cares about status and respect | Reacts strongly to public slights and flattery; values symbolic wins |
| Competence | Good at the job | Scales how well their plans and their ministry's work turn out |

### Motives

Each actor has a ranked, weighted list of what they want. Typical motives: staying in office, gaining power, wealth, security, the national interest, an ideology or faith, a faction or community, legacy, revenge for a specific grievance, and fear of a specific rival.

- **Public and private motives differ.** An actor has a stated agenda and a real one. You see the stated one. The real one shows through behaviour over time and through intelligence reports, which can be wrong.
- **Motives drive choices.** When an actor decides, the model proposes options, and each is scored against the actor's weighted motives. The actor cannot pick an option that scores clearly worse for them than the alternatives without a recorded reason.
- **Motives conflict inside one person.** A minister can be loyal to you and afraid for their career. The weights settle it, and a change in circumstances can tip it.

```ts
interface Persona {
  traits: Record<TraitName, number>;            // 0 to 1
  motives: { goal: Goal; weight: number; hidden: boolean }[];
  loyalties: { to: ActorId; strength: number }[];
  redLines: StanceId[];
  voice: { register: string; habits: string[] };   // how they talk; no effect on rules
  knownToPlayer: Partial<Record<TraitName, { estimate: number; confidence: number }>>;
}
```

### Plots

Ambition and grievance produce plots: coup attempts, leadership challenges, defections, leaks, secret talks with your rivals. A plot is an engine object with members, a goal, progress and a chance of discovery each day.

- A plot starts only when an actor's motives, traits and opportunity line up. The dice decide whether it advances.
- Your intelligence chief may warn you, miss it, or be part of it.
- Plots run for other governments too, so a rival's sudden fall has a history you can later uncover.

### Where personas come from

- **Real people.** Traits and motives are set from documented decisions and public record, with sources, and reviewed with the country dossier. They are game modelling of public conduct, and the UI says so.
- **Everyone else.** Unnamed and minor actors are built from archetypes fitted to the country: career general, populist, technocrat, party loyalist, dynast, cleric, oligarch, reformer, hardliner. Each archetype gives trait ranges, and the seeded generator picks values inside them.
- **Institutions.** A ministry, an army or a party has interests and a culture but no traits. The person holding its top office supplies the persona, so a change of leader changes how it behaves.

### How personas change

Traits are stable. Motive weights and loyalties shift only through recorded events, by bounded amounts: a leader who survives a coup attempt grows more suspicious, a minister you humiliate in public loses loyalty, a general you promote gains it.

### Limits and tests

- **Personas bend the rules; they do not break them.** A trait shifts thresholds, odds and available options within fixed bands. A reckless leader still cannot do what their office or their army cannot do.
- **Consistency test.** The same actor is run through 20 varied situations and a judge model scores whether the behaviour fits the trait values.
- **Distinctness test.** A judge reads unlabelled transcripts from two actors and must tell them apart. If it cannot, the personas are too bland.

## Intrigue: scheming, betrayal and infighting

Actors deal with each other the way people do: they form alliances, hold grudges, trade favours, lie, and turn on each other when it pays. This happens between any two actors, whether or not you are involved, and most of it happens out of your sight.

### The relationship web

Every pair of actors that matter to each other has a relationship record, separate from how either feels about you:

| Field | Meaning |
| --- | --- |
| Trust | How far each believes the other's word; moves with kept and broken promises |
| Affinity | Personal liking or dislike, apart from interests |
| Ties | Patron and client, rivals for the same office, family, faction, shared history |
| Favours owed | A running account of debts in both directions |
| Leverage | What each holds over the other: a secret, a debt, evidence, a hostage to fortune |

Actors also belong to **factions** inside governments, parties and armies. A faction has members, a leader, a goal and a share of real power, and factions compete for offices, budgets and your ear.

### Betrayal

An actor considers betraying an ally, a patron or you when the gain outweighs what holds them back:

```ts
temptation = gainFromBetrayal * ambition + grievance
restraint  = loyalty + fearOfRetaliation + honesty * reputationCost + favoursOwed

// if temptation > restraint, a betrayal plot can start; the dice decide whether it does
```

- **Betrayal is prepared, not sudden.** It starts as a plot with stages, so there are signs before it lands: a meeting you were not told about, a cooled tone, an intelligence report.
- **It works both ways.** You can betray others, and it costs you trust with everyone who learns of it.
- **Reputation travels.** Each actor has a public reputation for keeping their word. A known betrayer finds every later deal more expensive.

### Deception

- **Actors can lie, bluff and double-deal.** One actor can tell you and your rival different things. The ledger records what was actually said to whom and what is actually true, so a lie stays consistent and can be caught.
- **Lies can be detected.** Contradicting reports, intelligence, a third party who was in the room, or the liar's own slip can expose one. Honesty and competence set the odds.
- **Rumours spread.** Unverified claims move through the relationship web and the media with a truth value the listener cannot see. You can start them too.

### Infighting

- **In your own government.** Ministers compete over budgets, credit and succession. They brief against each other, withhold information, and ask you to choose. Left alone, a feud lowers both ministries' performance and can end in a resignation or a leak.
- **In other governments.** A rival state's hardliners and moderates, its army and its ruling party, its president and prime minister all contend. Their feuds are openings: you can back a faction, wait for one to win, or be blamed for interfering.
- **Between states and organisations.** Allies quarrel inside alliances, and coalition partners undercut each other.
- **Power struggles.** When a top office weakens or falls vacant, the contenders' factions, favours and leverage decide the succession over several turns.

### Intrigue comes to you

While a scheme is under way, the people in and around it contact you for their own reasons. Each stage of a plot, feud or power struggle can generate messages to your inbox:

| Who reaches out | Why | What you cannot be sure of |
| --- | --- | --- |
| An informant | To warn you, win favour or settle a score with the plotter | Whether the tip is true, or planted to make you purge a loyal ally |
| A plotter | To sound you out, recruit you, or ask you to look away | Whether refusing marks you as the next target |
| The betrayer | To reassure you that all is well | That they are lying |
| A feuding minister | To denounce a rival and ask you to choose | How much is fact and how much is ambition |
| A threatened ally | To ask for protection or a way out | What they did to end up threatened |
| A foreign faction | To seek your backing against their own government | Whether their government is listening |
| A rival's envoy | To offer a deal that splits you from an ally | Whether your ally got the same offer about you |
| A blackmailer | To trade silence for a favour | Whether they hold what they claim |
| A journalist | To ask for comment on a leak before publishing | Who the source was |

- **Timing follows the plot.** Messages arrive as the scheme moves through its stages, so the inbox itself is evidence. A sudden run of reassurances means something.
- **Every sender has a motive.** Who writes, what they say and how truthful it is come from their persona, their stake in the outcome and what they know.
- **Your reply is a move.** Answering, ignoring, forwarding to your intelligence chief or confronting someone each change the plot's odds and the relationships involved.
- **Silence is possible.** A well-run plot by competent, disciplined people may send you nothing until it lands. Good intelligence and loyal advisors are how you avoid that.

### What you can do

Intrigue is open to you through the same policy boxes and conversations as everything else: promise an office, buy loyalty, collect leverage, play two rivals against each other, plant a rumour, shield an ally, order surveillance on your own cabinet. Each is checked against your office's powers and carries a risk of exposure.

### Keeping it affordable and believable

- **Offstage dealings run on rules.** Most actor-to-actor dealings update the relationship web by engine rules and dice, with no model call. A model writes the scene only when the outcome reaches you or crosses the importance line.
- **The surprise budget applies.** Betrayals and coups are rare events with base rates. Personas and pressure shift the odds; they do not turn every cabinet into a conspiracy.
- **You learn only what you could know.** Scheming reaches you through advisors, intelligence, leaks and consequences, and each source has its own reliability and its own motives.

## A world that reshapes itself

The world's cast and categories are not fixed at the start. When events call for it, the game creates, splits, merges and retires them during play, so a campaign that runs for years ends up with a society that differs from the one it began with.

| What can emerge | Example |
| --- | --- |
| Approval groups | A youth movement forms after a rigged vote; refugees become a group after a war; "farmers" splits into landowners and tenants when land reform divides them |
| Parties and factions | A party splits over a coalition deal; officers form a reform faction after a defeat |
| Organisations | A new union, militia, protest movement, company or alliance |
| People | A protest leader, a whistle-blower, a general who makes a name in a war, a cast member who enters politics |
| Issues | A new item on the national agenda that did not exist at the start |
| Regions and states | A province is carved out, a territory secedes, two states merge |
| Policy types | A catalogue entry for something no one had tried before |

How it works:

1. **The model proposes.** During adjudication a model may propose a new entity or a change to one, giving its kind, its cause in the ledger and its starting values.
2. **The engine checks.** A proposal must fit one of the fixed kinds above, cite a real cause, and pass the conservation rules. A new approval group's members must come out of existing groups, so the population still adds up. A new party's seats come from the party it left.
3. **It starts small.** New entities begin with little weight and grow or die by the normal rules.
4. **It is recorded.** Creation, splits, mergers and dissolutions are ledger events, so they rewind with everything else.

The kinds of thing are fixed in code; the things themselves are data and can change freely. That is the line that lets the world evolve without the rules drifting.

**Getting more realistic over time.** Entities that emerge often across many campaigns, such as a group most players' games end up creating, are picked up by the improvement loop in the Model tests tab and proposed as part of the starting data.

## Open by design

The engine is strict about consequences and loose about invention. A model may invent anything, provided each invention states what it is, what caused it and how it connects to numbers the engine already holds. The engine checks only the connection.

### Five places that stay open

| Area | Strict part | Open part |
| --- | --- | --- |
| Policies | Effects land on real variables, inside bounds, with a cause | A policy the catalogue has never seen is resolved by analogy: the model names the two or three known policies it most resembles and argues why, and its ranges are taken from those. It is not penalised for being new. |
| Personas | Ten trait dials drive the rules | Free-text quirks, habits, obsessions, fears and history that the model plays and the rules do not score |
| Behaviour | What a character may concede and what they know | What a character is trying to do is described in open words. Fixed labels are added afterwards for statistics only. |
| Kinds of thing | Every entity has an owner, members and links to state | An entity may carry several kinds at once, or a kind nobody defined: a movement that is party, militia and charity together |
| Measures | Core variables and their update rules | A campaign can gain custom measures (see below) |

### Custom measures

When a campaign comes to turn on something the engine does not track, such as the legitimacy of a new constitution, trust between two communities or the progress of a peace process, the game can create a measure for it during play.

```ts
interface CustomMeasure {
  id: string;
  name: string;
  meaning: string;                       // what a high and a low value mean
  range: [number, number];
  start: number;
  drift: number;                         // pull per day toward a resting value
  movedBy: { eventKind: string; change: [number, number] }[];     // what raises and lowers it
  links: { to: VarPath; strength: number; max: number }[];        // bounded influence on core variables
  causes: EventId[];                     // why it came into being
}
```

- A measure is proposed by the adjudicating model, or asked for by the player in plain words.
- It starts with weak links to the core. The links may be strengthened only after the measure has behaved sensibly for a set period.
- It lives in that campaign's save. It never changes the engine's code.

### Slots built in from the first version

These fields exist in the data and the job schemas from M0, empty and unused, so that switching a feature on later needs no change to saved games:

- `notes` on every entity: free text the model may read and write.
- `tags` on every entity and event: open labels beside the fixed kinds.
- `analogues` on every policy: the known policies it was resolved by analogy to.
- `quirks` on every persona.
- `measures` in the world state: the list of custom measures.
- `extensions` on every job's output: a place for a model to return something the schema did not expect. It is logged and never applied.

### How each one gets switched on

1. The slot ships empty in M0.
2. The `extensions` log shows what models keep trying to say that the schema has no room for. That log decides what to open next.
3. A feature is switched on only with a test for it in the model test suite, so openness never brings drift back.
4. Inventions that recur across many campaigns are promoted into the starting rules by the improvement loop.

### What never opens

The ledger, the dice, conservation of money and people, what each actor knows, and the two fixed content limits.

## Keeping the game master on track

The game master model is treated as a creative but unreliable narrator. Every one of its outputs passes these checks before anything is committed, and a turn that fails is repaired or rerun before you see it.

| Guardrail | Rule | Stops |
| --- | --- | --- |
| Typed effects | Output is a list of typed effects and map operations from the catalogue, never free-form state | Invented mechanics and impossible changes |
| Range bounds | Each effect must sit inside its catalogue range, scaled by the days in the turn | Wild swings |
| Dice | The model gives odds within a band; the engine rolls | Outcomes chosen for drama, or to please the player |
| Blind adjudication | The adjudicator is not told which country the human plays. Every actor's actions arrive in one list with one shape, as compiled summaries, never in the player's own wording | Favouring the player |
| Invariants | Budgets add up, seats sum to the chamber, one controller per region, dead people stay dead, each office has one holder | Contradictions in state |
| Canon lock | Output that contradicts a recorded fact is rejected with the fact quoted back | Rewriting history |
| Knowledge check | An actor may act only on facts in its knowledge set | Actors reacting to secrets they never learned |
| Cause required | Every major event cites the earlier ledger events that led to it | Events from nowhere |
| Surprise budget | Major events per turn are capped, scaled by the days elapsed and current tension | A melodramatic world where everything happens at once |
| Second review | Novel policies and major events get a second model call with a checklist: plausible, caused, within the actor's power | Single-call mistakes on the things that matter most |
| Envelope monitor | Running statistics are compared with historical ranges (approval, growth, coups per decade). Outside the range, pull toward the trend strengthens. | Slow drift over long campaigns |

**Failure handling.** A failed check returns the specific error to the model for up to two repairs. After that the engine falls back to a rules-only result for that item, and the chronicle marks it. The turn always completes.

**Versioning.** Every prompt and catalogue entry has a version. Recorded turns are replayed against any change, and a change that raises the failure rate or moves outcomes outside the envelopes does not merge.

## Memory and context in long campaigns

The model never carries the campaign in its head. The ledger keeps everything, and each model call gets a fresh context built for that one job from five layers. A campaign can run for decades of game time and each call stays the same size.

| Layer | Holds | Kept how |
| --- | --- | --- |
| 1. State | Current numbers, officeholders, policies in force, region control, unit positions | Exact, from the engine. Never summarized by a model. |
| 2. Open commitments | Every unfulfilled promise, threat, deadline and treaty term | Exact. Always included for the parties involved. |
| 3. Facts | Structured facts extracted from events: who did what to whom, when, and who knows it | A fact table indexed by actor, place, issue and date |
| 4. History | The chronicle, rolled up: turn entries, month digests, year digests, an era summary | Each level is written from the level below and links back to it |
| 5. Actor memory | Per actor: a file on each counterpart (trust, debts, grudges), its key memories and its current beliefs | Ranked by importance, recency and relevance; rewritten periodically |

Most of "what happened" is already in layers 1 and 2 as exact state, so losing detail in a summary cannot change who holds a city or what was promised. Structured records are the truth: all text memory is regenerated from them, and where a memory and a number disagree, the number wins.

**Rules for memory:**

- **Pinned memories never drop.** Wars, treaties, betrayals, deaths, coups and anything above an importance line stay available forever. You can pin anything yourself.
- **Recent is verbatim, old is summarized.** A conversation keeps its last messages word for word and a running summary of the rest. History keeps the last few turns in full, then month and year digests.
- **Retrieval by links first.** Context is gathered by following links from the actors, places and issues in the current job, then by full-text search. Embedding search is optional, so a small local setup still works.
- **Memory respects knowledge.** An actor's memory holds only what that actor learned. The game master's context for an actor is filtered the same way.
- **Beliefs get refreshed.** Every few turns, each active actor rewrites its beliefs and relationship files from its memories. Trust is also a number the engine tracks, so a grudge survives even a bad summary.
- **Long skips arrive with a brief.** After Advance to date, you get a "what changed" brief, and every actor's memory receives the digest of the period.

**Context budget.** Each job has a fixed token budget with a share per layer, sized so the smallest supported local model can run it. A model with a larger context window gets more history and more memories, never a different structure.

| Share | Content |
| --- | --- |
| 10% | Instructions and output schema |
| 25% | State and open commitments relevant to the job |
| 25% | Retrieved facts |
| 20% | Actor memory and beliefs |
| 20% | Recent thread or recent chronicle |

**Memory inspector.** A Memory window shows what the game master and any actor you are talking to currently remember about a topic, with links to the source events. You can correct a wrong memory, and the correction is a ledger event.

**Memory tests.** After long simulated campaigns, actors are quizzed on questions with known answers from the ledger, such as who broke a ceasefire and when. Recall accuracy and contradiction rate are tracked per model, and both are part of the eval suite.

## Calibration

Every number in this draft is a placeholder: pull speeds, decay, thresholds, catalogue ranges, context shares and the loss weight of 2. The structure is the proposal; the values get set by testing.

- **Backtest.** Start from 2015 data with no player and run to 2020. Tune until the ranges, volatility and frequencies of growth, inflation, approval swings, unrest and changes of government look like that period. Known outside shocks such as the pandemic are fed in as scripted events. Tune on some countries and check on others, so the fit is not simply memorised. The test never requires reproducing the actual path of history.
- **Base rates.** Yearly rates for coups, wars, defaults and government collapses come from historical datasets, grouped by regime type and income level.
- **Catalogue ranges.** Each instrument's ranges come from published estimates where they exist, such as fiscal multipliers and exchange-rate pass-through, and are marked "unsourced" where they do not.
- **Resistance test.** A scripted player makes escalating demands of actors whose pressure is under the threshold. The target concession rate is zero.

Decisions:

| Question | Decision |
| --- | --- |
| Showing pressure and thresholds | Never shown as numbers. You read them through events, conversations, advisors and intelligence. A debug view exists for development only. |
| Approval groups | Each country gets the groups that actually shape its politics, taken from its dossier (for example urban poor, farmers, business, the army's families, a province or community), not a fixed five. |
| The cap on events | It applies to major events only. Small and mid-size events happen constantly, as in life. See Events of every size in the World systems tab. |
