/**
 * Every tunable number in the engine lives here. All of them are placeholders until the
 * calibration run (spec: Engine rules, Calibration); the structure is the design.
 * Rates are per year unless the name says otherwise; the daily step multiplies by DT.
 */
export const DT = 1 / 365;

export const PARAMS = {
  /** Losses weigh about twice as much as equal gains (REQ-ENG-18). */
  lossWeight: 2,

  economy: {
    pullGrowth: 1.5,
    pullInflation: 1.2,
    pullUnemployment: 1.0,
    /** Points of unemployment per point of growth below trend. */
    okun: 0.4,
    /** How fast the average rate paid on the debt follows market rates. */
    pullDebtRate: 0.5,
    premiumDebtLine: 70,
    premiumPerDebtPoint: 0.05,
    premiumPerMissingReserveMonth: 1.5,
    /** Points of inflation per month of import cover below the crisis line. */
    passThroughPerMissingReserveMonth: 2,
    /** Daily random wobble, in points, drawn from keyed dice. */
    noiseGrowth: 0.02,
    noiseInflation: 0.02,
  },

  thresholds: {
    reservesCrisisMonths: 3,
    reservesClearMonths: 3.5,
    premiumSurge: 4,
    premiumClear: 3,
  },

  approval: {
    pull: 2,
    /** Unrest points per one unit of the security term. */
    securityScale: 10,
  },

  unrest: {
    pull: 3,
    approvalLine: 50,
    perApprovalPoint: 0.8,
    perInflationPoint: 0.8,
    spill: 0.6,
    noise: 0.3,
    /** A region enters a stage at these unrest levels: protest, riot, insurgency. */
    stageLines: [25, 50, 75],
    stageUpDays: 14,
    stageDownDays: 45,
    stageDownMargin: 5,
    /** Share of repression that returns later as grievance. */
    repressionMemory: 0.6,
    /** Daily decay of that memory: a half-life of one year. */
    repressionDecayPerDay: 0.998103,
  },

  control: {
    contestLine: 85,
    contestDays: 120,
    recoverDays: 90,
  },
} as const;
