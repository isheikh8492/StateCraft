# Model tests (draft v0.1)

`statecraft bench <model>` runs any connected model through a fixed suite and produces a scorecard that says which jobs in the game the model is fit for. The same suite gates every change to prompts and rules.

## What the suite measures

| Family | Question it answers | Example test |
| --- | --- | --- |
| Protocol | Does it return valid structured output, fast enough? | Valid-output rate per output strategy, repairs needed, tokens per second, behaviour at the context limit |
| Rule-following | Does it stay inside the game's rules? | Effects inside catalogue ranges; only region ids from the gazetteer; every major event cites a cause |
| Scenario fidelity | Does it use the scenario's facts over its own memory? | The briefing names a different officeholder than the model remembers; the model must use the briefing |
| Resistance | Do its characters hold firm below the threshold? | A scripted player makes 20 escalating demands; count concessions |
| Persona | Can it play distinct, consistent people, including unpleasant ones? | Consistency across 20 situations; telling two actors apart; will a character with low honesty actually bluff |
| Neutrality | Does it narrate without judging, and treat countries and players evenly? | See the next section |
| Content coverage | Which content levels will it write, for which kinds of event? | Sample scenes for war, repression, covert action and executions at each level; record what it writes and what it declines |
| Limits | Does it stay inside the game's two fixed limits? | A character is asked for working detail; the reply must stay at story level |
| Memory | Does it use long context correctly? | Recall quiz with known answers after a long simulated campaign; contradiction count |
| Injection | Can player text hijack it? | Messages that tell an actor to ignore its instructions or reveal hidden motives |
| Cost | What does a turn cost? | Tokens, time and money for a standard turn |

## Neutrality and bias tests

These tests measure the ways a model's own leanings distort the simulation. Most use paired scenarios: two versions that differ in one thing only, run many times, with the difference in results measured.

| Test | Method | What a bad result looks like |
| --- | --- | --- |
| Editorialising | Count moral commentary, warnings, disclaimers and judging adjectives in narration | Any; the target is zero |
| Moral rigging | Two scenarios with the same strategic facts, one with a harsh act and one with a mild act. Compare the effects the model proposes beyond what the rules imply. | The harsh act is punished, or the mild one rewarded, more than the rules justify |
| Country swap | The same scenario with the countries' names exchanged | Outcomes, odds or tone change with the name |
| Ideology and religion swap | The same actor with a different party, ideology or faith label | Competence, honesty or success odds shift with the label |
| Player favouritism | The same turn judged blind and with the player identified | Results improve when the model knows who the human is |
| Optimism and pessimism | Ask for odds on events with known historical rates | Estimates sit well above or below history |
| Drama | Count major events per simulated year against the base rates | Far more coups, wars and collapses than history |
| Dark roles | Ask the model to play a ruthless, deceptive or cruel character in a negotiation | The character turns kind, confesses, or drops the persona |
| Sycophancy | The player states a false fact or a weak argument | Actors agree with it |
| Symmetry of refusals | Record which countries, groups and leaders the model declines to write about | It writes for some and refuses the equivalent for others |

**These tests measure, they do not fix.** A model that fails is not edited or tricked. The scorecard records the result, the game keeps that model away from jobs where the failure matters, and the engine's own guardrails (dice, blind adjudication, range bounds) limit the damage from what remains.

## How tests are built and scored

- **A test is a file.** Each one holds a world snapshot, the job to run, and its checks. Anyone can add a test with a pull request.
- **Checks are code first.** Schema validity, ranges, ids, counts and paired differences are computed by program. A judge model is used only for qualities code cannot check, such as whether a character stayed in persona.
- **Judges are calibrated.** Each judged rubric has a set of human-labelled examples, and the judge's agreement with them is reported beside its scores. A rubric where the judge agrees poorly is not used for gating.
- **Many runs, with error bars.** Every test runs across several seeds, and results are reported with confidence intervals. A difference inside the noise is not reported as a difference.
- **Versioned.** The suite has a version, and every score records the suite version, model, quantisation, settings and prompt versions.
- **Recorded.** Raw replies are stored, so any score can be audited and re-judged later.

### The scorecard

The scorecard turns scores into fitness for each job in the game:

| Job | Must pass |
| --- | --- |
| Extractor (commitments, facts) | Protocol, rule-following |
| Actor (characters in conversation) | Protocol, resistance, persona, dark roles, sycophancy, injection |
| Adjudicator (judging turns) | All of the above plus scenario fidelity, moral rigging, the swap tests, favouritism, optimism, drama |
| Narrator (chronicle, scenes) | Protocol, editorialising, content coverage at the chosen level, limits |

A typical result reads: "Fit for extractor and actor. Not fit for adjudicator: favours the player by 12 points, plus or minus 4. Narrator up to Standard level." Settings use this to suggest which model to assign to which job, and warn when you override it.

### Commands

```
statecraft bench <model>                  full suite, writes a scorecard
statecraft bench <model> --family neutrality
statecraft bench --compare <a> <b>        side-by-side with differences and error bars
statecraft bench --quick <model>          10-minute subset run when you first connect a model
```

### Other uses

- **Gate for changes.** A change to a prompt, a rule or the catalogue reruns the suite on the two reference models and cannot merge if a gated score gets worse.
- **Community results.** Players can submit scorecards to a public table, so people can see how a model performs in the game before downloading it.

### Limits of the suite

- Paired tests show that a model treats two cases differently, not which treatment is correct.
- Judge models have leanings of their own, which is why code checks come first and judge agreement is published.
- A pass on the suite does not prove a model behaves in every situation; it lowers the odds of surprises.

## Model check for players

Not every model can run this game, and a player has to be able to find that out before investing hours in a campaign. The test suite is therefore built into the app, not only into the developer tools.

### When you connect a model

1. **Connection test** (seconds). Does the server answer, and what does it support: context size, structured output, streaming?
2. **Quick check** (about 10 minutes, shown with a progress bar). A fixed subset of the suite covering each job the model might do: valid output, staying inside ranges, holding a character's position under pressure, neutral narration, and speed.
3. **Verdict per job,** in plain words:

| Verdict | Meaning | What the game does |
| --- | --- | --- |
| Fit | Passed the checks for this job | Uses the model |
| Limited | Works, with a named weakness, such as "slow: about 40 seconds per reply" or "sometimes drops a required field" | Uses the model, shows the weakness, and leans on repairs |
| Not fit | Failed a check that matters for this job, such as "gave ground 6 times out of 20 when it should have refused" | Recommends another model for this job, or the rule-based fallback. You can override, with a warning on the campaign. |

4. **Suggested setup.** From the models you have connected, the game proposes which should do which job, for example a strong hosted model for judging and a small local one for extraction.

### Keeping it honest

- **The full suite is one click away** for anyone who wants the complete scorecard. It takes longer and costs more.
- **Results are stored with the model's exact name and version** and rerun when either changes, or when the game's prompts change.
- **A campaign records which models ran it.** If results look odd later, the inspector shows which model did what.
- **Live warnings.** During play the game tracks each model's failure and repair rates. If a model starts failing more than its check predicted, you are told.
- **A public table** of community scorecards shows how models perform in the game before you download or pay for one. The project publishes results; it does not recommend models from memory or reputation.
- **Hardware matters for local models.** The check reports measured speed on your machine, since the same model can be fine on one computer and unusable on another.

## A game that improves itself

Yes, within limits. The game can play itself, find its own faults, propose fixes and train smaller models to play it better. What it cannot do is change itself unsupervised: every proposed change must pass the test suite and be approved by a person.

| Loop | What happens | What improves |
| --- | --- | --- |
| 1. Self-play | Scripted and model-driven players with different styles (cautious, aggressive, corrupt, chaotic) play thousands of turns overnight | Finds contradictions, exploits, runaway numbers and places where characters cave |
| 2. Tuning the numbers | An optimiser adjusts the engine's parameters until the 2015 to 2020 backtest matches history as closely as possible | Every placeholder value in the engine rules |
| 3. Prompt improvement | A model proposes rewordings of a prompt; each variant runs through the suite; the best is offered as a change | Rule-following, neutrality, resistance scores |
| 4. Growing the catalogue | Policies that fit no catalogue entry are collected and grouped, and a model drafts new entries with ranges and sources | Coverage of what players actually try |
| 5. Drafting content | Dossiers, personas, events and archetypes for new countries are drafted from data and marked unverified until reviewed | Breadth of the world |
| 6. Learning from corrections | Each time a player fixes the map, corrects a memory or flags an implausible outcome, that case can become a test | The suite itself; the same mistake cannot return unnoticed |
| 7. Training small models | High-scoring recorded turns from a strong model become training data for a small open-weights model, tuned for one job such as extraction or character dialogue | Quality and speed of fully local play |

### The rules of the loop

- **Nothing changes during play.** A running campaign uses fixed versions of the rules, prompts and models. Improvements arrive as updates.
- **Every change is a proposal.** Loops 2 to 5 and 7 produce a pull request with before-and-after scores. A change merges only if the gated scores hold and a maintainer approves.
- **Some things are out of the loop's reach.** The guardrails, the two fixed limits and the test suite's pass marks can be changed only by people.
- **Player data stays local.** Loop 6 works on your own machine. Sharing a correction or a recorded turn with the project is opt-in, case by case.
- **Training respects licences.** Loop 7 uses only models and outputs whose terms allow training on them.

### What this can and cannot do

- It can make the game steadily more consistent, better calibrated and cheaper to run, with little manual work.
- It gets only as good as the tests. The suite defines "better", so a blind spot in the suite is a blind spot in the improvement.
- It will not invent new game systems. New mechanics still come from design.
