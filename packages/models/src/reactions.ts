/**
 * The parts of the world each kind of actor can move by acting. This is a limit on reach,
 * not a list of things to do: what the actor does is for a model to invent, and a devised
 * move may press only on these (decision record 0016). "approval.*" is every group of the
 * public, "grievance.*" every region and the country as a whole, "grievance.own" the region
 * in question or the actor's own, and "standing.self" how the actor itself stands with the
 * government, which for the leader of a bloc is also how that bloc votes. Foreign actors reach nothing: until other countries are
 * modelled they only speak (REQ-ACT-24).
 */
export const REACH: Readonly<Record<string, readonly string[]>> = {
  military: ['approval.security', 'grievance.own', 'standing.self'],
  militant: ['grievance.own', 'approval.security', 'approval.periphery', 'standing.self'],
  ally: ['approval.*', 'grievance.all', 'standing.self'],
  opposition: ['approval.*', 'grievance.*', 'standing.self'],
  religious: ['approval.religious', 'approval.rural', 'grievance.*', 'standing.self'],
  business: ['growth', 'inflation', 'approval.business', 'approval.urban_middle', 'standing.self'],
  lender: ['growth', 'approval.business', 'standing.self'],
  province: ['grievance.own', 'approval.*', 'standing.self'],
};

/**
 * The moves used when no model is connected: what each kind of actor does in answer to an
 * order, beyond speaking, and what it does to the world. Effects stay inside the limits for events outside the catalogue. Foreign actors
 * have no options: until other countries are modelled they only speak (REQ-ACT-24).
 */
export interface ReactionOption {
  id: string;
  label: string;
  /** `{region}` is filled with the order's region, or the actor's own. */
  effects: Record<string, number>;
}

export const REACTION_OPTIONS: Readonly<Record<string, readonly ReactionOption[]>> = {
  military: [
    {
      id: 'back_publicly',
      label: 'Back the decision publicly',
      effects: { 'approval.security': 2 },
    },
    {
      id: 'signal_displeasure',
      label: 'Let its displeasure be known',
      effects: { 'approval.security': -2 },
    },
  ],
  militant: [
    { id: 'step_up_attacks', label: 'Step up attacks', effects: { 'grievance.{region}': 3 } },
    {
      id: 'observe_pause',
      label: 'Quietly hold back for a while',
      effects: { 'grievance.{region}': -3 },
    },
  ],
  ally: [
    {
      id: 'demand_concessions',
      label: 'Demand concessions for its support',
      effects: { 'approval.urban_middle': -1 },
    },
  ],
  opposition: [
    { id: 'call_protests', label: 'Call street protests', effects: { 'grievance.all': 2 } },
  ],
  religious: [
    { id: 'offer_mediation', label: 'Offer to mediate', effects: { 'grievance.{region}': -1.5 } },
    { id: 'denounce', label: 'Denounce it from the pulpit', effects: { 'approval.religious': -2 } },
  ],
  business: [
    {
      id: 'shutter_strike',
      label: 'Call a shutdown',
      effects: { growth: -0.1, 'approval.business': -2 },
    },
    { id: 'welcome', label: 'Welcome it publicly', effects: { 'approval.business': 2 } },
  ],
  lender: [
    {
      id: 'warn_publicly',
      label: 'Warn publicly that targets are at risk',
      effects: { 'approval.business': -2 },
    },
    { id: 'endorse', label: 'Endorse it', effects: { 'approval.business': 2 } },
  ],
  province: [
    { id: 'cooperate', label: 'Cooperate fully', effects: { 'grievance.{region}': -1.5 } },
    { id: 'defy', label: 'Drag its feet and protest', effects: { 'grievance.{region}': 2 } },
  ],
};
