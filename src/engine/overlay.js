// A translation laid over the game's data (the English beta, 490–497 A):
// data/en/<file>.json has the texts of data/<file>.json in English, at the
// same places. An object's keys, an array's items by their id (by
// `monster` where the items have none, as the affixes' names), any other
// array by position. Polish stays the only source: a text missing from the
// overlay, or empty there, stays Polish, and an overlay never changes a
// number, an id, a key the Polish data has not got or the shape of the
// data. What has nothing translated is the Polish data itself, shared.

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// The key an array's items are known by in an overlay, or null for an
// array taken by position: `id`, or `monster`, when every item has its own.
export function overlayKey(list) {
  for (const key of ['id', 'monster']) {
    if (list.length > 0 && list.every((item) => isObject(item) && typeof item[key] === 'string') && new Set(list.map((item) => item[key])).size === list.length) {
      return key;
    }
  }
  return null;
}

export function overlayTexts(base, over) {
  if (over === undefined || over === null) return base;
  if (typeof base === 'string') return typeof over === 'string' && over !== '' ? over : base;
  if (Array.isArray(base)) {
    const key = overlayKey(base);
    let items;
    if (key) {
      if (!isObject(over)) return base;
      items = base.map((item) => overlayTexts(item, Object.hasOwn(over, item[key]) ? over[item[key]] : undefined));
    } else {
      if (!Array.isArray(over)) return base;
      items = base.map((item, index) => overlayTexts(item, over[index]));
    }
    return items.every((item, index) => item === base[index]) ? base : items;
  }
  if (!isObject(base) || !isObject(over)) return base;
  let merged = null;
  for (const [name, value] of Object.entries(over)) {
    if (name.startsWith('$') || !Object.hasOwn(base, name)) continue;
    const text = overlayTexts(base[name], value);
    if (text !== base[name]) (merged ??= { ...base })[name] = text;
  }
  return merged ?? base;
}
