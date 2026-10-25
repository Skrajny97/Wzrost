// Seeded pseudo-random numbers: sfc32 seeded by the cyrb128 string hash.
// The same seed always gives the same sequence, on the server and in the browser.

export function createRng(seed) {
  let [a, b, c, d] = cyrb128(String(seed));
  const next = () => {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 15; i++) next();

  return {
    next,
    float: (min, max) => min + (max - min) * next(),
    // Inclusive on both ends.
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (probability) => next() < probability,
    pick: (list) => list[Math.floor(next() * list.length)],
    weighted(list, weightOf = (item) => item.weight) {
      const total = list.reduce((sum, item) => sum + weightOf(item), 0);
      let roll = next() * total;
      for (const item of list) {
        roll -= weightOf(item);
        if (roll < 0) return item;
      }
      return list[list.length - 1];
    },
  };
}

// An expected count like 2.4 becomes 2 or 3, with the right average.
export function countEvents(expected, rng) {
  const whole = Math.floor(expected);
  return whole + (rng.chance(expected - whole) ? 1 : 0);
}

function cyrb128(text) {
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
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}
