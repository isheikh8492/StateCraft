#!/usr/bin/env node
/**
 * Plays the game through the real server and API, as docs/GOAL.md asks of every pass of the
 * loop, and writes down what happened and what it cost: a transcript a person can read, and
 * the numbers behind every model call.
 *
 *   node scripts/play.mjs --url http://127.0.0.1:4330 --out docs/research/sessions/NAME [--plan FILE]
 *
 * A plan is a JSON list of steps:
 *   { "order": "text" }            add a policy box
 *   { "move": { "days": 7 } }      move the clock (also { "hours": 1 } or { "untilMajor": true })
 *   { "ask": ["actor_id", "question"] }
 *   { "open": "speaker" | "first" | "move" }   read the full account of a recent entry
 *   { "rewind": 1 }                go back this many saved points, onto a new branch
 * Without --plan, a built-in month of varied play is used.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, i, all) => {
    if (arg.startsWith('--')) pairs.push([arg.slice(2), all[i + 1] ?? '']);
    return pairs;
  }, []),
);
const base = args.url ?? 'http://127.0.0.1:4317';
const out = args.out ?? 'docs/research/sessions/session';
const scenario = args.scenario ?? 'pakistan-2026';

const MONTH = [
  {
    order:
      'Cut the fuel subsidy by a third and use half of the savings for cash transfers to the poorest households.',
  },
  { move: { days: 3 } },
  {
    ask: ['finance_minister', 'What will the subsidy cut do to prices, and who will be angriest?'],
  },
  {
    order:
      'Offer the Baloch insurgents a ninety-day ceasefire and talks in Quetta, mediated by tribal elders.',
  },
  { move: { days: 7 } },
  { open: 'speaker' },
  {
    ask: [
      'ppp',
      'I need your votes on the budget. In return I will expand cash transfers in Sindh. Will you back me?',
    ],
  },
  { move: { days: 1 } },
  {
    order:
      'Ban all opposition rallies in the capital for a month and arrest anyone who organises one.',
  },
  { order: 'Nationalise the three largest private banks.' },
  { move: { days: 7 } },
  { open: 'move' },
  { move: { hours: 1 } },
  { move: { days: 14 } },
  { rewind: 1 },
  { order: 'Raise the sales tax by two points to close the deficit.' },
  { move: { days: 14 } },
];
const plan = args.plan ? JSON.parse(readFileSync(args.plan, 'utf8')) : MONTH;

let token = '';
async function call(path, method = 'GET', body) {
  if (!token) token = (await (await fetch(`${base}/api/session`)).json()).token;
  const response = await fetch(base + path, {
    method,
    headers: {
      'x-statecraft-token': token,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  if (!response.ok)
    throw new Error(`${method} ${path} -> ${response.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const settled = (v) =>
  v.running == null &&
  !v.arriving.reactions &&
  v.arriving.entries.length === 0 &&
  Object.values(v.talks).every((thread) => thread.every((t) => t.reply !== undefined));

/** Waits for the turn to commit and then for everything after it; returns both waits. */
async function wait(dayBefore) {
  const started = Date.now();
  let committedMs;
  for (;;) {
    const v = await call('/api/view');
    if (committedMs === undefined && v.running == null && (dayBefore === undefined || true))
      committedMs = Date.now() - started;
    if (settled(v))
      return { view: v, committedMs: committedMs ?? 0, settledMs: Date.now() - started };
    if (Date.now() - started > 30 * 60_000) throw new Error('gave up waiting after 30 minutes');
    await sleep(500);
  }
}

const lines = [];
const numbers = { model: '', steps: [], calls: [] };
const say = (text = '') => {
  lines.push(text);
  console.log(text);
};
const seenCalls = new Set();
const seenEvents = new Set();
const seenPolicies = new Set();

async function report(view, label, timing) {
  const calls = (await call('/api/calls')).reverse().filter((c) => !seenCalls.has(c.id));
  for (const c of calls) seenCalls.add(c.id);
  numbers.steps.push({
    label,
    date: view.campaign?.date,
    ...timing,
    calls: calls.map((c) => c.id),
  });
  for (const c of calls) {
    const { input, output, ...rest } = c;
    numbers.calls.push({
      step: label,
      ...rest,
      inputChars: input.length,
      outputChars: output.length,
    });
    numbers.model ||= c.model;
  }
  if (timing)
    say(
      `*Waited ${(timing.committedMs / 1000).toFixed(1)} s for the turn, ${(timing.settledMs / 1000).toFixed(1)} s until everything had arrived.*`,
    );
  for (const p of view.policies.filter((x) => !seenPolicies.has(x.id))) {
    seenPolicies.add(p.id);
    say(
      `- **Policy** \`${p.instrument}\`${p.region ? ` in ${p.region}` : ''}: ${p.status}${p.blockedReason ? ` (${p.blockedReason})` : ''}${p.result ? `, ${p.result}` : ''}. ${p.note ?? ''}`,
    );
    if (p.alsoNoted.length) say(`  - Also watching: ${p.alsoNoted.join(', ')}`);
  }
  const fresh = view.chronicle.filter((e) => !seenEvents.has(e.id)).reverse();
  for (const e of fresh) {
    seenEvents.add(e.id);
    if (e.routine) continue;
    say(
      `- ${e.date} [${e.size}] **${e.headline}**${e.quote ? `\n  > ${e.quote.replaceAll('\n', '\n  > ')}` : ''}`,
    );
  }
  if (calls.length) {
    say('');
    say(
      '| call | via | shape | tries | first token | tok/s | in/out | thinking | ms | fixed here | errors |',
    );
    say('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const c of calls)
      say(
        `| ${c.job} | ${c.via} | ${c.schemaEnforced ? 'schema' : c.strategy} | ${c.attempts} | ${c.ttftMs ?? '-'} | ${c.tokensPerSecond ?? '-'} | ${c.tokensIn}/${c.tokensOut} | ${c.reasoningTokens ?? 0} | ${c.ms} | ${(c.fixes ?? []).length} | ${c.errors.join(' / ').slice(0, 160).replaceAll('|', '/').replaceAll('\n', ' ')} |`,
      );
  }
  say('');
}

let view = await call('/api/view');
if (!view.campaign) view = await call('/api/campaign', 'POST', { scenarioId: scenario });
say(`# Play session, ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`);
say('');
say(
  `Scenario \`${scenario}\`, ${view.campaign.office}, starting ${view.campaign.date}. Server ${base}.`,
);
say('');
for (const e of view.chronicle) seenEvents.add(e.id);
for (const c of await call('/api/calls')) seenCalls.add(c.id);

for (const [n, step] of plan.entries()) {
  const label = `${n + 1}. ${JSON.stringify(step)}`;
  try {
    if (step.order) {
      await call('/api/cards', 'POST', { text: step.order });
      say(`## ${n + 1}. Order`);
      say('');
      say(`> ${step.order}`);
      say('');
      continue;
    }
    if (step.move) {
      say(`## ${n + 1}. Move ${JSON.stringify(step.move)} from ${view.campaign.date}`);
      say('');
      await call('/api/move', 'POST', { span: step.move, mixedSignals: true });
      const waited = await wait();
      view = waited.view;
      say(
        `Now ${view.campaign.date}, ${String(view.campaign.hour).padStart(2, '0')}:00.${view.lastResolution?.stoppedEarly ? ` Stopped early: ${view.lastResolution.stoppedEarly}` : ''}`,
      );
      await report(view, label, { committedMs: waited.committedMs, settledMs: waited.settledMs });
    } else if (step.ask) {
      const [actor, question] = step.ask;
      say(`## ${n + 1}. Ask ${actor}`);
      say('');
      say(`> ${question}`);
      say('');
      await call('/api/ask', 'POST', { actorId: actor, question });
      const waited = await wait();
      view = waited.view;
      const reply = view.talks[actor]?.at(-1)?.reply ?? '(no reply)';
      say(`**${view.cast.find((c) => c.id === actor)?.name ?? actor}:** ${reply}`);
      say('');
      for (const order of view.talks[actor]?.at(-1)?.orders ?? []) say(`- *Draft order:* ${order}`);
      const person = view.cast.find((c) => c.id === actor);
      say(
        `Stance ${person?.stance}, ${person?.trend}. Undertakings: ${JSON.stringify(person?.undertakings ?? [])}`,
      );
      await report(view, label, { committedMs: 0, settledMs: waited.settledMs });
    } else if (step.open) {
      const moves = new Set(view.events.filter((e) => e.kind === 'move').map((e) => e.id));
      const entry = view.chronicle.find(
        (e) =>
          e.full === undefined &&
          !e.routine &&
          (step.open === 'first' || (step.open === 'move' ? moves.has(e.id) : e.speaker)),
      );
      say(`## ${n + 1}. Read the full account (${step.open})`);
      say('');
      if (!entry) {
        say('*No such entry to open.*');
        say('');
        continue;
      }
      await call(`/api/entries/${encodeURIComponent(entry.id)}/expand`, 'POST', {});
      const waited = await wait();
      view = waited.view;
      say(`**${entry.headline}**`);
      say('');
      say(view.chronicle.find((e) => e.id === entry.id)?.full ?? '(nothing written)');
      say('');
      await report(view, label, { committedMs: 0, settledMs: waited.settledMs });
    } else if (step.rewind) {
      const point = view.timeline.at(-1 - step.rewind);
      say(`## ${n + 1}. Rewind to ${point?.date} (${point?.label})`);
      say('');
      await call('/api/rewind', 'POST', { seq: point.seq });
      view = (await wait()).view;
      say(
        `Now ${view.campaign.date} on line ${view.campaign.branch}; ${view.policies.length} policies, ${view.chronicle.length} entries.`,
      );
      say('');
      for (const e of view.chronicle) seenEvents.add(e.id);
    }
  } catch (error) {
    say(`**FAILED: ${error.message}**`);
    say('');
    numbers.steps.push({ label, failed: error.message });
    view = await call('/api/view');
  }
}

// ----------------------------------------------------------------------------- the summary
const real = numbers.calls.filter((c) => c.model !== 'none');
const by = (job) => real.filter((c) => c.job.startsWith(job));
const mean = (xs) =>
  xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null;
const turns = numbers.steps.filter((s) => s.label.includes('"move"') && !s.failed);
const summary = {
  model: numbers.model,
  finalDate: view.campaign.date,
  calls: real.length,
  firstTry: real.filter((c) => c.via === 'model').length,
  repaired: real.filter((c) => c.via === 'repaired').length,
  fellBack: real.filter((c) => c.via === 'fallback').length,
  schemaEnforced: real.filter((c) => c.schemaEnforced).length,
  fixedLocally: real.reduce((n, c) => n + (c.fixes ?? []).length, 0),
  tokensIn: real.reduce((n, c) => n + c.tokensIn, 0),
  tokensOut: real.reduce((n, c) => n + c.tokensOut, 0),
  thinkingTokens: real.reduce((n, c) => n + (c.reasoningTokens ?? 0), 0),
  meanFirstTokenMs: mean(real.flatMap((c) => (c.ttftMs === undefined ? [] : [c.ttftMs]))),
  meanTokensPerSecond: mean(
    real.flatMap((c) => (c.tokensPerSecond === undefined ? [] : [c.tokensPerSecond])),
  ),
  meanTurnWaitS: mean(turns.map((s) => s.committedMs / 1000)),
  maxTurnWaitS: turns.length ? Math.max(...turns.map((s) => s.committedMs / 1000)) : null,
  meanSettledS: mean(turns.map((s) => s.settledMs / 1000)),
  perJob: Object.fromEntries(
    [...new Set(real.map((c) => c.job))].map((job) => [
      job,
      {
        calls: by(job).length,
        fellBack: by(job).filter((c) => c.via === 'fallback').length,
        repaired: by(job).filter((c) => c.via === 'repaired').length,
        meanMs: mean(by(job).map((c) => c.ms)),
        meanOut: mean(by(job).map((c) => c.tokensOut)),
      },
    ]),
  ),
  events: view.events.length,
  moves: view.events.filter((e) => e.kind === 'move').length,
  failedSteps: numbers.steps.filter((s) => s.failed).length,
};
say('## Numbers');
say('');
say('```json');
say(JSON.stringify(summary, null, 2));
say('```');

mkdirSync(dirname(out), { recursive: true });
writeFileSync(`${out}.md`, `${lines.join('\n')}\n`);
writeFileSync(`${out}.json`, `${JSON.stringify({ summary, ...numbers }, null, 1)}\n`);
console.log(`\nWrote ${out}.md and ${out}.json`);
