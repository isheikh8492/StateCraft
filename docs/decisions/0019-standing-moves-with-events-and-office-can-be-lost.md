# 0019. Standing moves with what the cast does, and office can be lost

Date: 2026-11-14. Status: accepted. Extends decisions 0007 (standing from recorded causes),
0016 (the cast devises its moves) and 0017 (stories in the background).

## Context

Two gaps recorded on the scorecard: nothing the cast did could cost the player votes or an
ally, only unrest and public support; and there was no way to lose. Pressure built and had
nowhere to go.

## Decision

**Standing.** How an actor stands toward the player is still worked out only from recorded
causes. Two more causes are counted:

- A move an actor devises may press on how it stands with the government, raise or lower,
  as one of the things in its reach. If the move comes off, the shift is up to 12 points at
  full strength, shared with whatever else it pressed on, and is kept with the move.
- A story an actor is behind that comes to a head costs it 8 points toward the player; one
  that fades earns 4.

A bloc's votes already lean with its leader's standing, so both reach the assembly.

**Losing office.** Two things can take it, and neither comes without warning.

- *A vote of no confidence.* After the first sixty days, on any day when national approval
  is under 35 or a coalition partner's leader is wary or worse, there is a 4% chance the
  opposition tables a motion. The vote is seven days later, giving the player a week to win
  partners back; the player's office says so. It is counted like any vote in the assembly,
  with the government's unpopularity weighing on its partners. Survive, and no motion can
  be tabled for ninety days. Lose, and office is lost.
- *The army.* When the army's leaders stand below -60 and approval is under 30, there is a
  3% chance a day that word gets out that officers have met. Ten days later, if they still
  stand below -40 and approval is under 35, it is even odds whether they move; otherwise
  the talk dies away and cannot start again for 120 days.

When office is lost the run stops, the event is major news, and no further move can be made
on that line of history. The player can go back from the Rewind window or start again.

## Consequences

- Played as badly as possible with no model (test "losing office"): two motions survived by
  shrinking margins, 216 to 116 and then 193 to 139, and removal by the army in month
  eight. A government that orders nothing for a year keeps office.
- On `openai/gpt-oss-20b` one devised move in nine pressed on its own standing, and pressed
  it the wrong way: an armed group's blockade "raised" its standing. The size is bounded,
  the sense is not.
- There are no elections. A term has no end.
- All the odds and thresholds are placeholders until calibration.
