// Report texts come in several variants per message. The variant is picked by
// an index, not by the random generator, so writing text never changes a fight.

export function say(texts, key, index, vars = {}) {
  const variants = texts[key];
  const template = variants[index % variants.length];
  return template.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
}

// A noun after a number, in Polish: 1, then 2–4 (but not 12–14), then the rest.
export function countedForm(count, [one, few, many]) {
  if (count === 1) return one;
  const last = count % 10;
  const tens = count % 100;
  return last >= 2 && last <= 4 && (tens < 12 || tens > 14) ? few : many;
}
