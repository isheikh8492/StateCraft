import {
  type Effect,
  EngineRuleError,
  GROUP_TAGS,
  SPENDING_CATEGORIES,
  type World,
} from './state.ts';

/**
 * Targets an effect may name:
 *   revenue | growth | inflation | baseRate | externalBalance
 *   spending.<category>
 *   approval.<group id or tag>
 *   grievance.<region id or "all">
 *   capacity.<region id or "all">
 *   repression.<region id>          (one-off on the start day)
 */
const PLAIN = new Set(['revenue', 'growth', 'inflation', 'baseRate', 'externalBalance']);

export function isValidTarget(world: World, on: string): boolean {
  if (PLAIN.has(on)) return true;
  const dot = on.indexOf('.');
  if (dot < 0) return false;
  const kind = on.slice(0, dot);
  const scope = on.slice(dot + 1);
  const isRegion = world.regions.some((r) => r.id === scope);
  switch (kind) {
    case 'spending':
      return (SPENDING_CATEGORIES as readonly string[]).includes(scope);
    case 'approval':
      return (
        (GROUP_TAGS as readonly string[]).includes(scope) ||
        world.groups.some((g) => g.id === scope)
      );
    case 'grievance':
    case 'capacity':
      return scope === 'all' || isRegion;
    case 'repression':
      return isRegion;
    default:
      return false;
  }
}

/** Add caused effects to the world. Nothing is applied until its start day. */
export function addEffects(world: World, effects: readonly Effect[]): World {
  for (const effect of effects) {
    if (effect.causes.length === 0 || effect.causes.some((c) => c.trim() === '')) {
      throw new EngineRuleError('no_cause', `Effect ${effect.id} on ${effect.on} has no cause.`);
    }
    if (!isValidTarget(world, effect.on)) {
      throw new EngineRuleError('bad_target', `Effect ${effect.id}: unknown target ${effect.on}.`);
    }
    if (!Number.isFinite(effect.amount)) {
      throw new EngineRuleError('bad_amount', `Effect ${effect.id}: amount is not a number.`);
    }
    if (effect.on.startsWith('repression.') && effect.amount < 0) {
      throw new EngineRuleError(
        'bad_amount',
        `Effect ${effect.id}: repression cannot be negative.`,
      );
    }
    if (effect.endDay !== null && effect.endDay <= effect.startDay) {
      throw new EngineRuleError('bad_amount', `Effect ${effect.id}: it ends before it starts.`);
    }
  }
  return { ...world, effects: [...world.effects, ...effects] };
}

export function isActive(effect: Effect, day: number): boolean {
  return effect.startDay <= day && (effect.endDay === null || day < effect.endDay);
}

/** Sum of active offsets per target on a given day. One-off targets are left out. */
export function offsetsOn(world: World, day: number): Map<string, number> {
  const sums = new Map<string, number>();
  for (const effect of world.effects) {
    if (effect.on.startsWith('repression.') || !isActive(effect, day)) continue;
    sums.set(effect.on, (sums.get(effect.on) ?? 0) + effect.amount);
  }
  return sums;
}

/** Cause ids behind the active effects whose target starts with one of the prefixes. */
export function causesOf(world: World, day: number, prefixes: readonly string[]): string[] {
  const causes = new Set<string>();
  for (const effect of world.effects) {
    if (effect.startDay > day) continue;
    if (!prefixes.some((p) => effect.on === p || effect.on.startsWith(`${p}.`))) continue;
    for (const cause of effect.causes) causes.add(cause);
  }
  // With no recorded cause the change came from the world's own drift.
  return causes.size > 0 ? [...causes].sort() : ['trend'];
}
