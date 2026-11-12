# Player and world (draft v0.1)

You are one person in the world, with whatever position and powers that person holds. Every system below follows from that: where you start, how time passes, who acts for you, and how far you can go.

## The game does not judge

StateCraft describes; it never moralises. Politics is shown as it is, and what to make of it is left to you.

- **The narrator is neutral.** The chronicle, reports and scenes state what happened, to whom and with what result. They contain no lessons, warnings, disclaimers or approving and disapproving adjectives.
- **No act is rigged.** Mercy and cruelty, honesty and deceit are all resolved by the same rules. Outcomes come from the simulation alone.
- **The world still judges, because real worlds do.** Opposition leaders, newspapers, clergy, foreign governments and ordinary people react to what you do according to their own values and interests. That reaction is part of the simulation, not the game's opinion.
- **Human consequences are reported as facts.** Deaths, displacement and fear are part of what happened, so they appear, without comment.
- **Models are held to this.** Language models tend to add moral commentary. Narration prompts forbid it, and the eval suite measures how often it slips through, with a target of zero.

The game's fixed limits are not moral commentary and stay in place: no real-world instructions, and reports instead of dramatised scenes when a real, living person is the victim.

## Who you are

You can start as anyone, from an ordinary citizen to a head of state, because the player is just another actor in the world. The rule that already limits a prime minister ("you can do what your office can do") limits a student, a colonel or a mayor in exactly the same way.

### The prologue

A new game opens with a short text interview, written as a scene, not a form. It asks five things and builds your character from the answers:

1. **Where and when?** Country, start date, and the city or province.
2. **Who are you?** Pick a real officeholder, or describe someone in your own words: "a 34-year-old union organiser in Karachi", "an army major posted in Quetta", "the finance minister".
3. **How did you get here?** Family, education, career, the party or institution you belong to, who helped you and who you crossed. The game offers options that fit the country and lets you type your own.
4. **What are you like?** A few short dilemmas set your starting traits, the same ten dials every actor has.
5. **What do you want?** Your ambition, stated in a sentence. It becomes your first objective, and you can change it.

The game then generates what your choice implies: your position and its powers, your income and resources, the people around you (boss, rivals, friends, family, patrons), and your reputation.

### Getting the position right

Whatever you describe is matched to a real position in that country's structure before play starts, so the status quo around you is accurate.

- **Matched to a real office or role.** "Army major in Quetta" becomes a specific rank in a specific formation, with that rank's real chain of command above it. "Finance minister" becomes the real office with its real powers, budget authority and the people it answers to.
- **You see what the job is.** Before you confirm, a one-page brief states who you report to, who reports to you, what you can decide alone, what needs someone's approval, what you earn, and who else wants your job.
- **If the position does not exist, the game says so** and offers the nearest real ones. It does not invent an office to fit.
- **Sources.** Powers and reporting lines come from the country's government structure. Where the data is thin (a district police post, a union branch), the game fills in from the country's general pattern and marks it as estimated.

### Starting tiers

| Tier | Examples | What you can do on day one |
| --- | --- | --- |
| Citizen | Student, journalist, shopkeeper, engineer, activist | Speak, write, organise, join a party or movement, run for local office, emigrate |
| Local figure | Mayor, union leader, cleric, local party boss, police chief | Run a town or an organisation, deliver votes, bargain with the provincial government |
| Insider | Member of parliament, senior civil servant, diplomat, intelligence officer, party strategist | Vote, draft, leak, advise, build a faction |
| Officer | Captain up to general | Command your unit, earn promotion, be courted by plotters |
| Power holder | Minister, governor, tycoon, army chief, opposition leader | Run a portfolio, a province, a fortune or a force |
| Head of government or state | President, prime minister, monarch, junta leader | The full game as specified so far |

### How it plays at each level

- **Your world is as big as your reach.** The game simulates in detail the actors you can affect or who can affect you. A mayor's inbox holds councillors and contractors; a president's holds foreign leaders. The map opens at your scale and widens as you rise.
- **Rising is not scripted.** You climb through the country's real routes: elections, appointments, promotion, patronage, wealth, protest, or force. Each is a procedure with thresholds and dice, the same as any policy.
- **You take orders too.** Below the top you have superiors who give you directives, judge your work and can fire you. The delegation rules later in this tab apply to you from the other side.
- **Losing power is not the end.** Voted out, fired, exiled or jailed, you keep playing as that person: in opposition, in exile, plotting a return, or building a new life. The campaign ends when your character dies or you choose to stop.

### Real person or your own

- **Play the real officeholder** and inherit their record, allies and enemies as of the start date.
- **Play your own character** in an existing position. The prologue settles how you came to hold it, by a route the country's rules allow, and everyone reacts to you as a newcomer with that history.

Your stated traits are only a starting point. Other actors judge you by what you do, and your reputation follows your record.

## The clock

Yes, the game should move time for you. The clock runs on events: everything that will happen sits in a queue with a time on it, and the game advances to the next thing that needs you. You never have to pick a turn length unless you want to.

### Actions take time

| Action | Clock cost | Reply |
| --- | --- | --- |
| Phone call or meeting | 30 minutes to a few hours, live | Immediate; it is a conversation |
| Direct message | None to send | Minutes to days, depending on who they are and how they see you |
| Diplomatic cable | None to send | Days; it passes through a bureaucracy |
| Summit | Days of preparation, a day or more on site | Live, with all parties in the room |
| Signing an order | Minutes | Effects follow the policy's own lead time |
| Passing a law | Days to months | Each stage of the procedure is a queued event |

- **Live talk spends time; letters wait for it.** A call happens now and moves the clock by its length. A message is sent, and the reply lands in the queue for later.
- **People answer when they would.** Reply time depends on rank, relations, urgency and time zone. Someone can be asleep, travelling or busy, hand you to a deputy, or make you wait on purpose.
- **Your day is finite.** In a crisis you can fit only so many calls and meetings into an hour. Choosing who to call first is part of the game.

### Three ways time moves

1. **Beats.** When something small concludes (a call ends, you sign an order), the game resolves just that: the people involved react, commitments are recorded, the clock moves by minutes or hours. A beat is quick and touches only the actors concerned.
2. **Auto-advance.** When nothing is waiting on you, the game shows what is coming ("Delhi's reply expected in about 2 days; budget vote in 5 days") and moves to the next event. One setting makes this automatic.
3. **Manual advance.** You can still jump ahead by any amount up to six months, or to a date. The jump stops early for anything urgent.

### What moves the clock by itself

Time advances without being asked whenever you do something whose result takes time:

- **You execute policies.** Confirming your policy boxes runs the clock forward to the first result worth your attention.
- **You ask for a deliverable.** "Draft me a budget", "get me a ceasefire proposal by Friday", "find out who leaked this": the clock runs until it is delivered, or until something more urgent interrupts.
- **You wait on a reply or a meeting.** The clock runs to the reply or the appointment.

Pure conversation and reading never move the clock on their own, beyond the length of a live call.

### Tempo

The game picks a tempo from the situation and tells you when it changes:

| Tempo | When | Feel |
| --- | --- | --- |
| Crisis | A standoff, a coup attempt, a disaster, a war decision | Hour by hour; every call counts |
| Active | A negotiation, an election campaign, a bill in parliament | Day by day |
| Routine | Ordinary governing | Week by week, stopping at events |
| Long view | Quiet years, long projects | Months at a time, with digests |

You can override the tempo at any moment. Under every tempo the engine runs the same per-day rules, so the pace changes what you see and decide, not how the world behaves.

### How it works underneath

The engine keeps one priority queue of dated events: replies due, deadlines, votes, arrivals of units, project milestones, plot stages. Advancing time means applying the per-day rules up to the next event's time, then handling that event. A full world resolution, with other countries' moves and the chronicle, runs at the end of each game day in crisis tempo and at longer intervals otherwise.

## Projects, trackers and delegation

Anything that takes longer than a signature is a project, and anyone you empower can act for you under a mandate. Together these let the country keep running while you deal with something else, and they bring in the oldest problem in government: the people acting for you have their own aims.

### Projects

A project is a tracked object: a port, a nuclear programme, a tax reform, a census, a peace process.

```ts
interface Project {
  goal: string;
  owner: ActorId;                     // the person or institution running it
  budget: { planned: Money; spent: Money };
  milestones: { name: string; due: GameTime; done: boolean }[];
  progress: number;                   // 0 to 100, computed by the engine
  risks: ("overrun" | "delay" | "corruption" | "sabotage" | "protest" | "partner_pullout")[];
  dependsOn: ProjectId[];
}
```

- **Progress is earned daily** from funding, the owner's competence and the state's capacity, minus disruption. The dice decide setbacks from the risk list.
- **Reported progress and real progress can differ.** A weak or dishonest owner reports good news. Audits, site visits and intelligence show the truth.
- **Projects have enemies.** Rivals at home and abroad can delay, defund or sabotage them, and partners can pull out.

### Trackers

The tracker window pins anything you want to watch: a project, an engine number (reserves, approval in Sindh), a relationship, a plot you suspect. You can also ask in plain words ("track how close we are to energy independence"), and the game builds a tracker from real engine variables. A tracker can never show a number the engine does not hold.

### Mandates

A mandate hands part of your authority to a person or an institution:

| Part | Example |
| --- | --- |
| Holder | The interior minister |
| Scope | Public order in Karachi |
| Authority | Advise only; act and report; or act freely |
| Budget | Up to a stated amount |
| Objectives | "End the port strike within a month" |
| Limits | "No live ammunition; no arrests of union leaders" |
| Reporting | Weekly, or when a limit is at risk |
| Duration | Until revoked, or a date |

- **Holders act on their own.** Each day or turn, a mandate holder decides and acts inside the scope through the same policy pipeline you use. You see reports, not every decision.
- **Persona decides how it goes.** A loyal, competent holder does what you meant. An ambitious one builds a power base with your authority. A corrupt one skims. A ruthless one meets the objective in ways you did not sanction and reports only the success.
- **Limits can be broken.** The engine enforces the budget. Other limits rely on the holder's honesty and on your oversight, which is why who you appoint matters.
- **Standing directives** are open-ended mandates for institutions: rules of engagement for the army, a negotiating line for the foreign ministry, an inflation target for the central bank.
- **Institutions act anyway.** Courts rule, central banks set rates and legislatures legislate inside their legal powers whether or not you ask. A mandate adds to what they do; it does not switch them on.
- **Long skips depend on it.** During a jump of months, your mandates and directives are how the government behaves in your absence.

When you play below the top, you are the one holding mandates from a superior, with the same choices about how faithfully to carry them out.

## Hiring and firing

Every office and staff post can be filled, emptied and refilled, by you or by anyone with the power to do it. Who can appoint and dismiss whom comes from the country's government structure.

- **Shortlists.** For an open post the game offers candidates with a known record, a faction, and your advisors' estimate of their traits, which can be wrong. You can also name anyone you know.
- **The core trade-off is loyalty against competence.** Loyalists are safe and often mediocre. The able are useful and may outgrow you.
- **Confirmation.** Some posts need a vote or a sign-off. A blocked nominee costs political capital.
- **Firing has a price.** The person leaves with what they know, a grievance and their faction's resentment. Depending on their persona they retire, join your rivals, leak, or start plotting.
- **Protected posts.** Judges, central bank governors, army chiefs and elected officials cannot simply be dismissed. Removing them takes the legal procedure, enough pressure to force a resignation, or an illegal move (see the authoritarian path).
- **Refusal.** Someone with their own power base can refuse to go, which turns a personnel decision into a crisis.
- **Vacancies and purges hurt.** An empty post lowers its institution's performance, and removing many people at once lowers state capacity for months.
- **Beyond government.** You can recruit envoys, fixers, informants and outside advisors, and other actors can try to hire your people away.

## War

Think of war as politics at higher stakes: you decide whether to fight, what for, with what limits, and when to stop, and the people under you do the fighting. The game models it in four layers, and you act on the layer your position commands.

### 1. The road to war: an escalation ladder

Every flashpoint sits on a rung, and both sides can climb or step down:

| Rung | What it looks like |
| --- | --- |
| 1. Dispute | Claims, protests, votes at the UN |
| 2. Coercion | Sanctions, expelled diplomats, cyber attacks, proxy support |
| 3. Mobilisation | Troops move, reserves called up, ultimatums |
| 4. Incidents | Border clashes, shoot-downs, a strike that can still be denied |
| 5. Limited war | Fighting with stated limits on area, targets or aims |
| 6. General war | Full use of conventional forces |
| 7. Nuclear threshold | Alerts and threats first; use only at the very top |

- Moving up a rung follows the pressure rule and the dice, like any change of stance.
- **Misreading is built in.** Each side sees the other's moves through its own intelligence and its leaders' suspicion. A defensive mobilisation can look like preparation to attack.
- Most crises end on rungs 2 to 4. That is the base rate, and the engine holds to it.

### 2. Your part: aims, limits and commanders

As a political leader you do not move units. You set the war aim, the limits (rules of engagement, forbidden targets, a ceiling on escalation), the resources, and who commands. The armed forces then run the campaign under that mandate, with everything the delegation rules imply: a cautious general may stall, and an aggressive one may exceed your limits.

If you play an officer, you command at your own level and receive your aims from above.

### 3. The fighting: campaigns

A campaign is an objective with forces assigned to it: take a region, hold a line, blockade a port, gain control of the air. The engine resolves each one daily from seven factors:

- force ratio and quality
- terrain and weather
- supply and how long the supply lines are
- control of the air and sea
- morale
- the commander's competence
- surprise

The dice add friction. The results are front movement, losses and changes of region control, which the map animates. Other forms use the same pattern with different inputs: air campaigns, blockades, proxy wars, insurgency and counter-insurgency, cyber operations.

### 4. The cost, and how wars end

- **Costs build every day:** casualties, money, lost trade, refugees, damaged cities. Public support starts with a rally and decays into war-weariness at a rate set by losses and by whether people believe in the aim.
- **Each side has a will to fight** that follows the pressure rule. Wars end when one side's will breaks, both tire, or outside powers force a halt.
- **Peace is negotiated in conversation.** Ceasefire and treaty terms become commitments in the ledger. A harsh peace seeds the next crisis.
- **Occupation is its own war.** Holding hostile territory feeds the unrest system, up to insurgency.

### Nuclear weapons

Nuclear use has the highest threshold in the game and a base rate near zero. The model covers alerts, signalling, deterrence and the chain of command that must agree. If it happens, the game does not end: it continues in the aftermath, with the human, economic and political consequences shown in full.

### What you see

Your picture of a war is your intelligence, not the truth. Enemy strength and positions are estimates with a confidence level, and your own commanders' reports can be optimistic.

## Ground view: ordinary people

Each campaign follows a standing cast of about 15 ordinary people for as long as it runs. They are the approval and unrest numbers with faces: when flour goes up 18%, you read what that did to one family you already know.

### The cast

- **Chosen to represent the country.** One or two people per approval group and major region, generated from the dossier: a rickshaw driver in Karachi, a wheat farmer in Punjab, a teacher in Quetta, a textile exporter, a nurse working abroad who sends money home, a conscript, a student.
- **They persist.** Each has a household, a job, an income, opinions and a few relationships. The engine updates their lives cheaply from the state: prices, wages, jobs, safety, and what happens in their region.
- **Years pass for them.** Over a long campaign they marry, lose work, emigrate, get drafted, join a protest, prosper, or die in a flood or a war. New people join as others leave.

### What you see

- **Vignettes.** Each turn brings one to three short scenes (60 to 120 words) from a cast member's life, each tied to a cause in the ledger. No scene may state a number the engine does not hold.
- **Voices.** Street interviews, call-in shows, social posts, protest signs and the jokes people tell about you. Jokes are a good barometer: their tone tracks approval, and under repression they go quiet in public and sharper in private.
- **Then and now.** Open any cast member to see their life at the start of your term beside their life today.

### They can reach you

- A letter to the leader, a petition, a video that spreads, a question shouted at a rally.
- You can answer, visit, help one person publicly, or ignore them. Each is an event others see and judge.
- A cast member can become political: a union organiser, a candidate, a martyr whose name a movement adopts.

### Why it matters to the rules

- **It keeps you honest.** Your official figures can be rosy (see the authoritarian path). The cast lives under the real numbers.
- **It shows the human scale.** War, repression, austerity and prosperity appear as what they did to people you have followed, reported without comment.
- **It is the game, at the bottom tier.** If you start as an ordinary citizen, you are living this layer.

## The authoritarian path

You can become a dictator. The game allows it and models it as it works in reality: step by step, against resistance, by buying the loyalty of the few people whose support you need, and with the gains and costs it really has.

### Constraints are things you can erode

Every check on you is an institution with an independence value from the government structure: courts, legislature, press, election commission, term limits, a neutral army, civil society. Each can be worn down by policies that follow the normal rules of pressure, thresholds and political capital:

| Move | What it does | What pushes back |
| --- | --- | --- |
| Emergency powers | Suspends procedures for a time | Courts, legislature, the street |
| Packing or purging courts | Lowers judicial independence | Judges, lawyers, opposition, foreign partners |
| Capturing the media | Lowers press independence; shapes what the public hears | Journalists, the internet, exiles |
| Rigging or cancelling elections | Removes the vote as a threat | Opposition, observers, mass protest |
| Banning parties, jailing rivals | Removes organised opposition | Their supporters; martyrs gain followers |
| Secret police and surveillance | Raises plot discovery; raises fear | Its chief becomes powerful enough to threaten you |
| Personality cult | Raises loyalty among supporters | Ridicule, and your own belief in it |
| Abolishing term limits | Removes the exit | Everyone waiting for their turn |

You can also arrive by force: a coup if you are an officer, or a self-coup from the top.

### You rule through a coalition

No one rules alone. Your survival depends on a small group whose backing is essential: the army command, security chiefs, party barons, tycoons, sometimes clerics. They stay loyal while you pay them in offices, money and protection, and while backing you looks safer than replacing you. This is the same loyalty and betrayal maths as the rest of the game, with higher stakes.

### What it costs

- **You go blind.** As fear rises, people stop telling you the truth. Your approval figures, project reports and intelligence drift toward what you want to hear, while the real numbers keep running underneath. The ground view and the occasional shock are your only honest sources.
- **Your enforcers become your threat.** The more you rely on the army and the secret police, the more a coup from inside becomes your main risk.
- **The country pays.** Capital and skilled people leave, investment falls, corruption rises, and state capacity decays as loyalty replaces competence.
- **The world reacts.** Sanctions, isolation, lost aid, foreign backing for your opponents, and legal jeopardy if you ever fall.
- **There is no safe exit.** A ruler with blood on their hands cannot retire, so leaving power becomes more dangerous the longer you hold it.
- **Repression has a tail.** It lowers unrest now and stores grievance for later, up to insurgency and revolution.

The road runs the other way too: you can inherit a dictatorship and try to open it, which has its own dangers.

### How the game treats it

- **Consequences are shown plainly.** Repression and atrocities are modelled as events with victims, costs and long memory. The chronicle and the ground view record what was done and to whom.
- **No score judges it.** The end-of-campaign assessment reports what you built, what you destroyed and what it cost in lives.
- **Reports stay non-graphic by default.** The Content settings control how much detail written reports carry.
- **Real names stay labelled.** Playing a real leader down this path is fiction, marked as simulation everywhere it appears. Sharing and export are switched off for scenes that show a real, named person committing atrocities.

## Lethal politics

Yes. Assassination, purges, coups and foreign intervention are part of the game, in both directions: you can order them, and they can be done to you. The game models them as political acts with odds, accomplices and consequences. It tells what happened as a story would, and gives no real-world instructions.

### Covert action

Every covert act is an operation: a tracked object like a project, run by an intelligence or security service.

| Part | Meaning |
| --- | --- |
| Type | Surveillance, bribery, election interference, sabotage, abduction, assassination, backing a coup, arming a rebellion, a false-flag incident |
| Sponsor and service | Who ordered it and who carries it out |
| Capability | Whether that service can do this, in that place, at all |
| Circle | Everyone who knows. Each one can refuse, warn the target, leak, or keep proof as leverage over you |
| Odds | Chance of success, set by capability, the target's protection and the dice |
| Deniability | How well it can be hidden, and for how long |

- **People must agree to do it.** An order to kill passes through officers with their own traits and loyalties. An honest or frightened one may stall, refuse or go to your rivals.
- **Secrets decay.** The chance of exposure never reaches zero and grows with time and with every person in the circle. Much of what you do in the dark comes out eventually, often at the worst moment.

### Violence against people

The options include assassination, targeted killing abroad, disappearance, political imprisonment, show trials, executions, forced exile, and proscription: a list of named enemies to be removed. Each follows the same rules, and each has real gains and real costs, and the simulation decides which is larger:

- **Killing a leader rarely kills a movement.** A successor takes over, sometimes abler or harder, and the dead become martyrs.
- **It invites the same in return.** Once killing is in play, your rivals and their foreign backers use it too.
- **It changes your own circle.** People near you become afraid, tell you less, and start weighing whether they are next. Each act makes the next one easier to order and harder to stop.
- **The world answers.** Expulsions, sanctions, broken alliances, and legal jeopardy if you ever fall.

### When it works

States use targeted killing because it sometimes gets them what they want. The game models that honestly: an operation can succeed and leave you better off. Whether it does depends on the target and the moment, not on a moral rule.

| It tends to work when | It tends to backfire when |
| --- | --- |
| The target is hard to replace: a rare specialist, a commander the organisation is built around, the one person holding a coalition together | The organisation has depth and a clear line of succession |
| The aim is narrow: stop one programme, one plot, one attack | The aim is to end a movement with popular support |
| It stays deniable, or the victim's side cannot afford to retaliate | It is traced to you and the other side can answer in kind |
| It comes at a decisive moment: before a vote, a launch, an offensive | It hands the other side a martyr at the moment they needed one |
| Your allies tolerate it or look away | It breaks a rule your partners care about |

- **Gains are real and measured.** A programme delayed by years, a rival faction leaderless, a plot against you ended, deterrence restored. These show up in the engine's numbers like any other effect.
- **Other states do it for the same reasons.** Ambitious and threatened governments weigh the same table when deciding whether to act against you or each other.
- **Advisors argue both sides.** Before you order one, your intelligence chief, your foreign minister and your legal counsel each give their own estimate, shaped by their own interests.

### It can happen to you

| Threat | Where it comes from | What protects you |
| --- | --- | --- |
| Assassination | A rival, a faction, a foreign service, a lone attacker | The quality and loyalty of your protection; how exposed your habits are; warnings from intelligence |
| Coup | Your army, your security chiefs, your own party | Keeping your coalition paid and divided; counter-intelligence |
| Foreign-backed removal | A power that wants you gone: money for your opponents, pressure on your backers, covert support for plotters | Allies, legitimacy at home, being costly to remove |
| Legal removal | Impeachment, a court ruling, a confidence vote | Votes, coalition discipline, public support |
| Arrest or exile | Whoever replaces you | A negotiated exit, or friends abroad |
| Invasion | A neighbour or a great power | Deterrence, alliances, the cost of occupying you |

- **Attempts are rare and most fail.** Base rates come from history, and a failed attempt changes politics too: a crackdown, a rally, a purge.
- **You get signs, not certainty.** Warnings arrive through the intrigue rules: a tip, a rumour, a change in someone's tone. Some are true.
- **You can die.** If your character is killed, the campaign ends.

### Foreign intervention

Outside powers act on their interests in your country, and you can act in others. Intervention has its own ladder: funding parties and media, election interference, sanctions, covert support for plotters, arming insurgents, strikes, invasion. Each rung costs the intervener more and is harder to deny. Small states live with this constantly, and managing the great powers' view of you is part of survival.

### Means are a choice

When you order an operation you choose the kind of means, and each kind trades certainty against deniability and message:

| Kind | Deniability | What it signals |
| --- | --- | --- |
| Staged accident or illness | High, if it holds | Nothing, which is the point; slow and uncertain |
| Quiet disappearance | Medium | Fear among those who notice |
| Open attack | Low | A warning to everyone else; invites retaliation |
| Legal killing: a trial and execution | None | Claims legitimacy; creates a public martyr |
| Through a proxy | High at first | Leaves you owing dangerous people |

### Content levels

| Level | What reports contain |
| --- | --- |
| Restrained | One-line outcomes |
| Standard (default) | News-style reports: what happened, where, by what kind of means, the aftermath |
| Mature | Full narrative scenes, including violence and its effect on people |

No level includes real-world instructions.

### Limits

- **Story, not instructions.** The game says what happened: who, where, when, by what kind of means (a shooting, a bomb, poison, a staged accident), who was behind it and what followed. With the mature setting on, it writes these as full scenes. It never gives working detail a reader could use: how to build a device, make or obtain a poison, or defeat real security.
- **Real, living people.** These rules apply to every actor, since removing them would make the world false. When the target is a real, living person, the result is a news-style report of what happened, where and by what means, with no dramatised scene, and it cannot be shared or exported. A setting replaces real names with titles.
- **Models may refuse.** Some hosted models will not write these events. The engine resolves them by rules and uses fixed neutral wording, so the game never depends on a model agreeing.
- **No thumb on the scale.** The game adds no bonus for these acts and no artificial penalty either. Gains and costs come only from the simulation. The end-of-campaign assessment states what you did, what it achieved and who it cost, and leaves the judgement to you.

This system arrives with the intelligence services, in milestone M3.

## What arrives when

No system in this tab is in the first slice (M0), which is one country, one position and policy only. The data model supports each system from day one, and the play arrives in stages. The milestones are in the roadmap on the main tab.

| System | First form (M1 to M3) | Later |
| --- | --- | --- |
| Who you are | Prologue; start as head of government or a minister, real or your own character | Officer, local and citizen starts; playing on after losing power |
| The clock | Event queue, beats, auto-advance to the next event, manual advance | Tempo chosen by the game; reply delays tuned per actor |
| Projects and trackers | Projects with progress and overruns; trackers bound to engine numbers | Sabotage, false reporting, trackers from plain-language requests |
| Mandates | Act-and-report mandates for ministers; standing directives | Full principal and agent behaviour; mandates you receive from superiors |
| Hiring and firing | Appoint and dismiss ministers and advisors, with shortlists | Protected posts, refusals, purges, recruiting outside government |
| War | Escalation ladder up to incidents; war aims and limits as policy | Campaign resolution on the map; nuclear model |
| Ground view | A cast of 8 with one vignette per turn | Full cast, letters to you, cast members entering politics |
| Authoritarian path | Emergency powers, media and court moves, with pushback | Coalition management, the blindness effect, coups from inside |

Decisions:

| Question | Decision |
| --- | --- |
| Starting positions at first | Head of government or minister, with the position matched exactly to the real office and its powers |
| Automatic time | The clock moves when you execute policies, ask for a deliverable, or wait on a reply |
| Death of your character | The campaign ends |
