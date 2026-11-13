/**
 * Strict JSON schemas, built fresh for each call, and the local mender that puts small
 * mistakes right instead of asking the model again (spec: Speed; REQ-HARN-04).
 *
 * Why hand-built rather than exported from Zod: a schema written for one call can name the
 * only answers that are allowed — these region ids, this actor's option ids, the variables
 * this order may touch — as enums. A local server turns the schema into a grammar, so an
 * enum is not advice but the only thing the model can emit. That removes a whole class of
 * rejected answers, and with them the second and third calls they cost.
 *
 * Every object is closed (`additionalProperties: false`) and lists every field it requires,
 * in a fixed order. There is no open "extensions" field: anything not named is dropped.
 *
 * Numeric bounds and string lengths are written into the schema for the mender's use. No
 * server enforces them (neither llama.cpp grammars nor OpenAI's strict mode support them),
 * which is precisely why `mend` exists.
 */

export type Schema = Record<string, unknown>;

export const str = (maxLength?: number, description?: string): Schema => ({
  type: 'string',
  ...(maxLength === undefined ? {} : { maxLength }),
  ...(description === undefined ? {} : { description }),
});

export const num = (minimum: number, maximum: number): Schema => ({
  type: 'number',
  minimum,
  maximum,
});

export const int = (minimum: number, maximum: number): Schema => ({
  type: 'integer',
  minimum,
  maximum,
});

export const bool: Schema = { type: 'boolean' };

/** The only answers allowed. A server that compiles the schema can emit nothing else. */
export const pick = (values: readonly string[]): Schema =>
  values.length > 0 ? { type: 'string', enum: [...values] } : str(60);

export const list = (items: Schema, maxItems: number, minItems = 0): Schema => ({
  type: 'array',
  items,
  minItems,
  maxItems,
});

/**
 * A closed object. Keys given in `optional` may be left out; every other key is required,
 * and the order here is the order the model is asked to write them in.
 */
export const obj = (
  properties: Record<string, Schema>,
  optional: readonly string[] = [],
): Schema => {
  const skip = new Set(optional);
  return {
    type: 'object',
    properties,
    required: Object.keys(properties).filter((key) => !skip.has(key)),
    additionalProperties: false,
  };
};

/**
 * A reply of the short form `{"inflation": 1.2, "growth": -0.1}`: one named number per
 * variable, bounded. Shorter to write than a list of `{"on": …, "value": …}` pairs, and the
 * names it may use are the only ones in the schema.
 */
export const numbers = (fields: Record<string, [number, number]>, required: boolean): Schema => {
  const properties: Record<string, Schema> = {};
  for (const [name, [min, max]] of Object.entries(fields)) properties[name] = num(min, max);
  return {
    type: 'object',
    properties,
    required: required ? Object.keys(properties) : [],
    additionalProperties: false,
  };
};

// ------------------------------------------------------------------------------------- mending

const WORD = /\S+/g;
const countWords = (text: string) => (text.match(WORD) ?? []).length;

/**
 * Cuts text to a word count, at a sentence end where there is one nearby. The text up to
 * the cut is kept exactly as written, paragraph breaks and all.
 */
export function clipWords(text: string, max: number): string {
  let count = 0;
  let end = text.length;
  for (const word of text.matchAll(WORD)) {
    count++;
    if (count === max) end = word.index + word[0].length;
    if (count > max) break;
  }
  if (count <= max) return text;
  const cut = text.slice(0, end);
  // The last place a sentence closes, with any quotation mark that closes with it.
  let stop = -1;
  for (const close of cut.matchAll(/[.!?]["'”’)]*(?=\s|$)/g)) stop = close.index + close[0].length;
  return stop > cut.length * 0.6 ? cut.slice(0, stop) : `${cut.replace(/[,;:]$/, '')}…`;
}

interface Mending {
  fixes: string[];
  /**
   * False once a fix was needed that a server enforcing the schema would have prevented: a
   * field nobody asked for, a value of the wrong type, a list where named values were
   * wanted. Clamping a number or trimming prose says nothing, since no server enforces
   * those. It is how the harness tells a server that honours the schema from one that
   * quietly ignores it.
   */
  shapeOk: boolean;
  /** Guards against a reply that nests far deeper than any schema. */
  depth: number;
}

const typeOf = (schema: Schema) => schema.type as string | undefined;

/** Folds `[{"on":"inflation","value":1.2}]` into `{"inflation":1.2}` for a numbers object. */
function foldPairs(value: unknown[], properties: Record<string, Schema>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const item of value) {
    if (item === null || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const name = row.on ?? row.name ?? row.variable ?? row.key;
    if (typeof name !== 'string' || !(name in properties)) continue;
    const n = Number(row.value ?? row.amount ?? row.change);
    if (Number.isFinite(n)) out[name] = n;
  }
  return out;
}

function mendValue(value: unknown, schema: Schema, path: string, state: Mending): unknown {
  if (state.depth > 12) return value;
  const kind = typeOf(schema);
  const at = path || 'the reply';

  if (Array.isArray(schema.enum)) {
    const allowed = schema.enum as string[];
    if (typeof value === 'string' && !allowed.includes(value)) {
      const want = value
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_');
      const near = allowed.find((a) => a.toLowerCase() === want);
      if (near !== undefined) {
        state.fixes.push(`${at}: read "${value}" as "${near}"`);
        state.shapeOk = false;
        return near;
      }
    }
    return value;
  }

  if (kind === 'string') {
    let text = typeof value === 'string' ? value : value === undefined ? value : String(value);
    if (typeof text !== 'string') return value;
    if (typeof value !== 'string') {
      state.fixes.push(`${at}: read as text`);
      state.shapeOk = false;
    }
    const max = schema.maxLength as number | undefined;
    if (max !== undefined && text.length > max) {
      text = `${text.slice(0, max - 1).trimEnd()}…`;
      state.fixes.push(`${at}: shortened to ${max} characters`);
    }
    return text;
  }

  if (kind === 'number' || kind === 'integer') {
    let n = typeof value === 'number' ? value : Number(String(value).replace(/[^\d.+-]/g, ''));
    if (!Number.isFinite(n)) return value;
    if (typeof value !== 'number') {
      state.fixes.push(`${at}: read "${String(value)}" as a number`);
      state.shapeOk = false;
    }
    if (kind === 'integer' && !Number.isInteger(n)) {
      n = Math.round(n);
      state.fixes.push(`${at}: rounded to ${n}`);
    }
    const min = schema.minimum as number | undefined;
    const max = schema.maximum as number | undefined;
    if (min !== undefined && n < min) {
      state.fixes.push(`${at}: ${n} clamped to ${min}`);
      n = min;
    } else if (max !== undefined && n > max) {
      state.fixes.push(`${at}: ${n} clamped to ${max}`);
      n = max;
    }
    return n;
  }

  if (kind === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (value === 'true' || value === 'false') {
      state.fixes.push(`${at}: read "${value}" as a true/false answer`);
      state.shapeOk = false;
      return value === 'true';
    }
    return value;
  }

  if (kind === 'array') {
    if (!Array.isArray(value)) return value;
    const items = (schema.items ?? {}) as Schema;
    state.depth++;
    let out = value.map((item, i) => mendValue(item, items, `${at}[${i}]`, state));
    state.depth--;
    const max = schema.maxItems as number | undefined;
    if (max !== undefined && out.length > max) {
      state.fixes.push(`${at}: dropped ${out.length - max} beyond the ${max} allowed`);
      state.shapeOk = false;
      out = out.slice(0, max);
    }
    return out;
  }

  if (kind === 'object') {
    const properties = (schema.properties ?? {}) as Record<string, Schema>;
    const open = schema.additionalProperties !== false;
    if (Array.isArray(value)) {
      const folded = foldPairs(value, properties);
      if (Object.keys(folded).length > 0 || value.length === 0) {
        state.fixes.push(`${at}: read a list of pairs as named values`);
        state.shapeOk = false;
        return mendValue(folded, schema, path, state);
      }
      return value;
    }
    if (value === null || typeof value !== 'object') return value;
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    state.depth++;
    for (const [key, raw] of Object.entries(source)) {
      const child = properties[key];
      if (!child && !open) {
        // Not an error worth another call: a field nobody asked for is simply dropped.
        state.fixes.push(`${at}: dropped the unasked field "${key}"`);
        state.shapeOk = false;
        continue;
      }
      // A field written as null is the same as one left out, and Zod is told nothing of null.
      if (raw === null || raw === undefined) continue;
      out[key] = child ? mendValue(raw, child, `${at}.${key}`, state) : raw;
    }
    state.depth--;
    return out;
  }

  return value;
}

/**
 * Puts a reply right where the mistake is mechanical: a number outside its range, text past
 * its limit, a field nobody asked for, a null standing in for a missing field, a list of
 * pairs where named values were wanted. Each fix is reported so the Inspector can show it.
 * A reply this cannot rescue is sent back to the model.
 */
export function mend(
  value: unknown,
  schema: Schema,
): { value: unknown; fixes: string[]; shapeOk: boolean } {
  const state: Mending = { fixes: [], shapeOk: true, depth: 0 };
  const mended = mendValue(value, schema, '', state);
  return { value: mended, fixes: state.fixes.slice(0, 12), shapeOk: state.shapeOk };
}

export { countWords };
