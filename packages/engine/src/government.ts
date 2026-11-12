import type { Scale } from './catalogue.ts';
import { roll } from './rng.ts';
import { clamp, type Scenario } from './state.ts';

/**
 * Veto players: the legislature that must pass a budget measure, and the courts that may
 * stay an executive order. Both are decided by keyed dice, never by a model (REQ-ENG-02).
 * The probabilities are placeholders until calibration.
 */
export type Legislature = NonNullable<Scenario['government']>['legislature'];
export type Court = NonNullable<Scenario['government']>['court'];

export interface VoteResult {
  yes: number;
  no: number;
  passed: boolean;
}

/**
 * A vote on one measure. `popularity` is the sum of the measure's effects on public
 * standing: allies peel away from unpopular measures, and a weak government loses its own
 * back benches.
 */
export function legislatureVote(
  seed: string,
  rollId: string,
  legislature: Legislature,
  measure: {
    popularity: number;
    nationalApproval: number;
    /** How each bloc's leaders stand toward the government, -100 to 100, by bloc id. */
    standing?: Readonly<Record<string, number>>;
  },
): VoteResult {
  let yes = 0;
  let total = 0;
  for (const bloc of legislature.blocs) {
    const base =
      bloc.stance === 'government'
        ? 0.97 - (measure.nationalApproval < 30 ? 0.06 : 0)
        : bloc.stance === 'ally'
          ? 0.9 + clamp(measure.popularity * 0.02, -0.5, 0.08)
          : 0.03 + clamp(measure.popularity * 0.01, 0, 0.2);
    // A bloc whose leaders have been won over, or alienated, votes accordingly.
    const lean = clamp((measure.standing?.[bloc.id] ?? 0) / 400, -0.25, 0.25);
    const share = clamp(base + lean + (roll(seed, `${rollId}:${bloc.id}`) - 0.5) * 0.12, 0, 1);
    yes += Math.round(bloc.seats * share);
    total += bloc.seats;
  }
  return { yes, no: total - yes, passed: yes >= legislature.majority };
}

const STAY_CHANCE: Readonly<Record<Scale, number>> = { small: 0.02, medium: 0.06, large: 0.15 };

/** Whether the courts stay an order made on the office's own authority. */
export function courtStays(seed: string, rollId: string, court: Court, scale: Scale): boolean {
  return roll(seed, rollId) < court.independence * STAY_CHANCE[scale];
}
