/**
 * Reads the text out of a JSON reply that is still being written, so prose can reach the
 * screen word by word while the model is at work (REQ-PERF-16). The reply is one object
 * whose prose sits in string fields; this walks as much of it as has arrived and returns
 * every string found so far, keyed by its path: `reply`, `body`, `answers.a2.text`.
 *
 * What it returns is provisional. The finished reply is still parsed, mended and checked as
 * a whole, and only that version is saved.
 */
const ESCAPES: Record<string, string> = {
  '"': '"',
  '\\': '\\',
  '/': '/',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
};

export function partialStrings(reply: string): Record<string, string> {
  const out: Record<string, string> = {};
  // Thinking a model leaves in the reply is not prose; while it is still thinking, nothing is.
  const text = reply.replace(/<think>[\s\S]*?<\/think>/gi, '');
  if (/<think>/i.test(text)) return out;
  let i = text.indexOf('{');
  if (i < 0) return out;

  /** Where we are: each level is an object waiting on a key or a value, or a list. */
  const stack: { list: boolean; key: string; index: number; wantsKey: boolean }[] = [];
  const path = () => stack.map((level) => (level.list ? String(level.index) : level.key)).join('.');

  /** Reads a string starting at the opening quote. `done` is false if the text ran out. */
  const readString = (): { value: string; done: boolean } => {
    let value = '';
    i++;
    while (i < text.length) {
      const c = text[i] as string;
      if (c === '"') {
        i++;
        return { value, done: true };
      }
      if (c === '\\') {
        const next = text[i + 1];
        if (next === undefined) break;
        if (next === 'u') {
          const hex = text.slice(i + 2, i + 6);
          if (hex.length < 4) break;
          value += String.fromCharCode(Number.parseInt(hex, 16) || 0xfffd);
          i += 6;
          continue;
        }
        value += ESCAPES[next] ?? next;
        i += 2;
        continue;
      }
      value += c;
      i++;
    }
    i = text.length;
    return { value, done: false };
  };

  while (i < text.length) {
    const c = text[i] as string;
    const top = stack.at(-1);
    if (c === '{') {
      stack.push({ list: false, key: '', index: 0, wantsKey: true });
      i++;
    } else if (c === '[') {
      stack.push({ list: true, key: '', index: 0, wantsKey: false });
      i++;
    } else if (c === '}' || c === ']') {
      stack.pop();
      if (stack.length === 0) break;
      i++;
    } else if (c === ',') {
      if (top?.list) top.index++;
      else if (top) top.wantsKey = true;
      i++;
    } else if (c === '"') {
      const { value, done } = readString();
      if (top && !top.list && top.wantsKey) {
        if (!done) break;
        top.key = value;
        top.wantsKey = false;
      } else if (top) out[path()] = value;
    } else i++;
  }
  return out;
}
