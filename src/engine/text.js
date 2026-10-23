// Report texts come in several variants per message. The variant is picked by
// an index, not by the random generator, so writing text never changes a fight.

export function say(texts, key, index, vars = {}) {
  const variants = texts[key];
  const template = variants[index % variants.length];
  return template.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
}
