# 0014. Invented detail is allowed, and recorded

Date: 2026-11-12. Status: accepted. Narrows the rule that a model never invents.

## Context

From the owner, with screenshots of the same kind of question put to an adviser here and in
WorldOS's Modern Day 2026. Theirs ran to about 900 words in headed sections and named a
Chief Justice, an article of the constitution, a date for a meeting and an amount of money.
Ours ran to 160 words of "convene a task force" and "engage tribal leaders".

Three things made ours thin. The length was capped. A model was forbidden to state any name
or figure it had not been given, and sentences that did were taken out. And it had been
given very little: sixteen stakeholders and a short brief.

The rule against invention exists so that a model cannot change the world: it protects the
numbers, the map and what has happened. It was also stripping out the texture that makes
advice worth reading. The owner pointed out that the other game simply makes names up.

## Decision

- **Facts are of two kinds.** The world's own state (the economy, the public mood, unrest,
  who controls what, how a vote went, whether something happened) comes only from the
  engine and the record, as before. Texture (who holds an office nobody named, where a
  meeting is held, what a body or a programme is called, a date for something proposed, an
  amount proposed) may be made up by whoever is writing.
- **What is made up is put on record and kept.** A reply declares the names it introduces,
  as a label and a value, before it writes. The game stores them (`canon.added`) and gives
  them to whoever writes next, with the instruction to use them exactly. The first name a
  thing is given is the one it keeps; a second offered for the same label is dropped.
- **Advice is no longer policed for figures.** A date, an amount or an article in a
  proposal is the substance of the proposal.
- **An adviser's answer is a briefing when the question deserves one:** headed sections,
  up to 250, 500 or 900 words by the Detail setting, and up to five orders the player can put
  on the desk. A simple question gets a short answer. Others speak at ordinary length.
- **Layout is a small fixed set:** headings, lists, bold and italic. The screen draws those
  and treats nothing as markup beyond them.

## Consequences

- Measured on `openai/gpt-oss-20b` at Rich
  (`docs/research/sessions/2026-11-12-briefings.md`): answers of 113 to 434 words in 21 to
  40 seconds, streamed, with the first words after 4 to 9 seconds. A name settled in one
  answer (a Chief Justice) was reused in a later one.
- A model can still state a false figure about the world in an answer, and nothing now
  takes that sentence out. It is told not to, and it is given the true ones. This is the
  cost of the decision.
- A small model declares only some of the names it uses. Asking for the names before the
  writing made it far more reliable, but a name can still go unrecorded and be contradicted
  later.
- Names are made up, not real. The scenario pack should come to supply the real ones (a
  dossier of office holders, cities, laws and programmes), which then take the place of
  invention for anything they cover. That is the next piece of work on this.
- Reactions, the news and full accounts still follow the stricter rule. Bringing accounts
  under this one, and writing them without being asked for events that matter, is the piece
  after that.
