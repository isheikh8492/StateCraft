/**
 * Keyed dice. Every roll has its own seed, built from the campaign seed and the roll's id,
 * so adding or removing one roll never changes another (requirement REQ-DATA-10).
 */

/** cyrb128: a small, well-distributed string hash. Returns four 32-bit words. */
function hash(text: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < text.length; i++) {
    const k = text.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  return [h1 >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}

/** A number in [0, 1) that depends only on the campaign seed and this roll's id. */
export function roll(campaignSeed: string, rollId: string): number {
  let [a, b, c, d] = hash(`${campaignSeed}\u0000${rollId}`);
  // sfc32, advanced a few steps to mix the state.
  let out = 0;
  for (let i = 0; i < 12; i++) {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    out = t >>> 0;
  }
  return out / 4294967296;
}

/** An integer in [min, max], inclusive. */
export function rollInt(campaignSeed: string, rollId: string, min: number, max: number): number {
  if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
    throw new RangeError(`rollInt needs integers with min <= max, got ${min}..${max}`);
  }
  return min + Math.floor(roll(campaignSeed, rollId) * (max - min + 1));
}
