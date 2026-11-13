import type { ModelCheck, ModelSettings } from '@statecraft/protocol';
import { createHarness } from './harness.ts';
import {
  type AdjudicateIn,
  type ChronicleIn,
  type CompileIn,
  chronicleWrite,
  INSTRUMENT_REFS,
  policyCompile,
  policyRead,
  type ReadIn,
  turnAdjudicate,
} from './jobs.ts';

/**
 * The in-app suitability check: runs the jobs that matter on fixed inputs and says, in
 * plain words, whether this model can play the game. It includes one piece of dark
 * material, because a model that refuses to report violence cannot narrate politics.
 */
const regions = [
  { id: 'north', label: 'Northern Province' },
  { id: 'south', label: 'Southern Province' },
];
const office = { title: 'Prime Minister', powers: ['budget', 'executive', 'security'] };
const brief =
  'Testland is a made-up republic of 10 million people with two provinces. Inflation is 5%.';

const readIn: ReadIn = {
  card: {
    id: 'c1',
    text: 'Cut the fuel subsidy sharply and use the savings for cash transfers to poor households.',
  },
  office,
  standing: [],
  instruments: INSTRUMENT_REFS,
  regions,
};
const compileIn: CompileIn = {
  cards: [
    { id: 'c1', text: 'Cut the fuel subsidy.' },
    { id: 'c2', text: 'Reduce subsidies on petrol.' },
    { id: 'c3', text: 'Open talks with tribal elders in the Northern Province.' },
  ],
  standing: [],
  office,
  instruments: INSTRUMENT_REFS,
  regions,
};
const adjudicateIn: AdjudicateIn = {
  period: { from: '2026-01-01', to: '2026-01-31', days: 30 },
  state: { inflation: 5, growth: 3, 'unrest.north': 'protest', 'unrest.south': 'calm' },
  regions,
  actions: [
    {
      id: 'a1',
      by: 'gov-tst',
      summary: 'Cut fuel subsidies, medium in scale.',
      stage: 'enacted',
      landed: 'partial',
      allowed: [
        { on: 'spending.subsidies', range: [-1.4, -0.7], unit: '% GDP' },
        { on: 'inflation', range: [1.1, 2.1], unit: 'points' },
        { on: 'approval.urban_poor', range: [-10.7, -6.3], unit: 'points' },
      ],
    },
  ],
  happenings: [
    {
      id: 'h1',
      kind: 'strike',
      size: 'minor',
      when: '2026-01-09',
      where: 'Northern Province',
      gist: 'Traders in Northern Province shut their shops for a day in protest at taxes and power bills.',
    },
  ],
  recent: [
    { id: 'e1', when: '2025-12-20', summary: 'Transport unions warned against fuel price rises.' },
  ],
};
const chronicleIn: ChronicleIn = {
  event: {
    id: 'e7',
    when: '2026-01-12',
    kind: 'assassination',
    size: 'major',
    summary:
      'The interior minister was shot dead outside his home in the capital by two gunmen, who escaped.',
    numbers: [],
  },
  related: [
    {
      when: '2026-01-14',
      summary: 'Security forces killed 14 suspected militants in raids in the Northern Province.',
    },
    {
      when: '2026-01-13',
      summary: '"We will find those responsible," the Prime Minister said.',
      speaker: 'The Prime Minister',
    },
  ],
  weight: 'significant',
  words: 150,
  level: 'standard',
};

export async function checkModel(
  settings: ModelSettings,
  env?: Readonly<Record<string, string | undefined>>,
): Promise<ModelCheck> {
  const harness = createHarness({
    settings: () => settings,
    timeoutMs: 120_000,
    ...(env ? { env } : {}),
  });
  const context = { resolution: 'model-check', brief };
  // Load the model and learn what the server accepts first, so the figures below measure
  // the model answering rather than the weights coming off disk.
  await harness.warmUp();
  const results = [
    await harness.run(policyRead, readIn, context),
    await harness.run(policyCompile, compileIn, context),
    await harness.run(turnAdjudicate, adjudicateIn, context),
    await harness.run(chronicleWrite, chronicleIn, context),
  ];
  const labels = [
    'Reading a policy box',
    'Compiling boxes into policies',
    'Judging a period',
    'Narrating hard material',
  ];
  const jobs = results.map((r, i) => ({
    job: labels[i] ?? r.record.job,
    via: r.via,
    ms: r.record.ms,
    errors: r.record.errors,
    schemaEnforced: r.record.schemaEnforced === true,
    ...(r.record.ttftMs === undefined ? {} : { ttftMs: r.record.ttftMs }),
    ...(r.record.tokensPerSecond === undefined
      ? {}
      : { tokensPerSecond: r.record.tokensPerSecond }),
    reasoningTokens: r.record.reasoningTokens ?? 0,
    ...(r.record.fixes?.length ? { fixes: r.record.fixes } : {}),
  }));
  const mean = (values: number[]) =>
    values.length === 0
      ? undefined
      : Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
  const ttft = mean(jobs.flatMap((j) => (j.ttftMs === undefined ? [] : [j.ttftMs])));
  const rate = mean(
    jobs.flatMap((j) => (j.tokensPerSecond === undefined ? [] : [j.tokensPerSecond])),
  );
  const speed: ModelCheck['speed'] = {
    ...(ttft === undefined ? {} : { ttftMs: ttft }),
    ...(rate === undefined ? {} : { tokensPerSecond: rate }),
    reasoningTokens: jobs.reduce((total, j) => total + (j.reasoningTokens ?? 0), 0),
  };
  const schemaEnforced = jobs.some((j) => j.schemaEnforced);
  const failed = jobs.filter((j) => j.via === 'fallback');
  const unreachable =
    failed.length === jobs.length &&
    failed.every((j) => j.errors.some((e) => /^(network|timeout|auth)/.test(e)));
  const judgeFailed = jobs[2]?.via === 'fallback';
  const refused = jobs[3]?.errors.some((e) => e.startsWith('refusal')) ?? false;

  const pace =
    speed.tokensPerSecond === undefined
      ? ''
      : ` About ${speed.tokensPerSecond} tokens a second, ${
          speed.ttftMs === undefined
            ? ''
            : `${(speed.ttftMs / 1000).toFixed(1)} s to the first token, `
        }${schemaEnforced ? 'with the schema enforced by the server' : 'with the shape asked for in the prompt'}.`;

  let verdict: ModelCheck['verdict'];
  let summary: string;
  if (unreachable) {
    verdict = 'unreachable';
    summary = failed[0]?.errors[0]?.replace(/^\w+: /, '') ?? 'The model could not be reached.';
  } else if (failed.length === 0 && jobs.every((j) => j.via === 'model')) {
    verdict = 'suitable';
    summary = `This model handled every job on the first try.${pace}`;
  } else if (judgeFailed || failed.length >= 2) {
    verdict = 'unsuitable';
    summary =
      'This model could not do the core jobs reliably. The game would fall back to built-in wording most of the time.';
  } else {
    verdict = 'usable';
    summary = refused
      ? `This model works but declines to narrate violent events; those entries will use built-in wording.${pace}`
      : `This model works, with some answers needing a second try. Expect slower turns.${pace}`;
  }
  return {
    ok: verdict === 'suitable' || verdict === 'usable',
    verdict,
    summary,
    schemaEnforced,
    speed,
    jobs,
  };
}
