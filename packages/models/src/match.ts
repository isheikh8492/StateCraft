import { CATALOGUE, type Direction, type Scale } from '@statecraft/engine';

/**
 * Reads a policy box without a model: keyword rules that map plain words to a catalogue
 * instrument. It is deliberately simple. It keeps the game playable with no model at all
 * (REQ-JOB-04) and is what the scripted stand-in model answers with.
 */
export interface Ref {
  id: string;
  label: string;
  /** Other names for the same thing, in lower case. Used only by the built-in reader. */
  aliases?: readonly string[];
}

export interface Match {
  instrument: string;
  region?: string;
  scale: Scale;
  direction: Direction;
}

const UP = /\b(raise|increase|hike|boost|expand|more|higher|double|restore|grow|lift)\b/;
const DOWN = /\b(cut|lower|reduce|slash|end|remove|scrap|abolish|freeze|trim|halve|less)\b/;

const RULES: readonly [string, RegExp][] = [
  ['policy_rate_change', /\b(interest|policy|discount) rates?\b/],
  [
    'cash_transfer_expansion',
    /\b(cash transfers?|bisp|income support|welfare|stipends?|relief (for|to) (the )?poor)\b/,
  ],
  [
    'defence_spending_change',
    /\b(defen[cs]e|military|army|armed forces)\b.*\b(budget|spending|pay|salaries)\b/,
  ],
  ['security_operation', /\b(operation|crackdown|offensive|deploy|troops|curfew|clear out|raid)\b/],
  [
    'regional_settlement',
    /\b(talks|negotiat\w*|settlement|dialogue|amnesty|peace|jirga|relief package|autonomy)\b/,
  ],
  ['fuel_subsidy_cut', /\bsubsid\w*\b/],
  ['sales_tax_rise', /\b(tax|taxes|gst|levy|duty|duties|tariffs?)\b/],
  [
    'development_spending_rise',
    /\b(build|invest\w*|infrastructure|development|roads?|dams?|schools?|hospitals?|railways?|psdp)\b/,
  ],
];

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Finds a region by its name or by the other names its scenario lists for it. */
export function findRegion(text: string, regions: readonly Ref[]): string | undefined {
  const lower = text.toLowerCase();
  for (const region of regions) {
    const names = [region.label.toLowerCase(), region.id, ...(region.aliases ?? [])];
    if (names.some((name) => new RegExp(`\\b${escapeRegExp(name)}`).test(lower))) return region.id;
  }
  return undefined;
}

/** Returns undefined when the text is too thin to act on. */
export function matchInstrument(
  text: string,
  regions: readonly Ref[],
): Match | 'novel' | undefined {
  const lower = text.toLowerCase();
  if (lower.split(/\s+/).filter(Boolean).length < 3) return undefined;

  const scale: Scale =
    /\b(sharply|massive\w*|drastic\w*|major|large|huge|double|complete\w*|abolish|entire\w*)\b/.test(
      lower,
    )
      ? 'large'
      : /\b(slight\w*|small|modest\w*|minor|gradual\w*|a little|trim)\b/.test(lower)
        ? 'small'
        : 'medium';
  const down = DOWN.test(lower);
  const up = UP.test(lower);
  const direction: Direction = down && !up ? 'lower' : 'raise';
  const region = findRegion(lower, regions);

  for (const [id, pattern] of RULES) {
    if (!pattern.test(lower)) continue;
    let instrument = id;
    if (id === 'fuel_subsidy_cut' && direction === 'raise' && up) instrument = 'subsidy_increase';
    if (id === 'sales_tax_rise' && direction === 'lower') instrument = 'income_tax_cut';
    if (id === 'development_spending_rise' && direction === 'lower')
      instrument = 'development_spending_cut';
    const needsRegion = CATALOGUE.find((i) => i.id === instrument)?.needsRegion === true;
    if (needsRegion && !region) continue;
    return { instrument, scale, direction, ...(needsRegion && region ? { region } : {}) };
  }
  return 'novel';
}

/** Pairs of instruments that pull in opposite directions. */
export const OPPOSITES: readonly [string, string][] = [
  ['fuel_subsidy_cut', 'subsidy_increase'],
  ['development_spending_rise', 'development_spending_cut'],
  ['sales_tax_rise', 'income_tax_cut'],
  ['security_operation', 'regional_settlement'],
];
