// Categories over a long list, to show one of them at a time: the
// Targowisko's goods (the author: "filtracja potrzebna w targowisku zeby
// szukac itemy po kategoriach, bo jak jest duzo w plecaku to lista
// przytłaczająca"). Lists only, no page, so the tests run it.

// "Wszystko": every category at once.
export const ALL = 'all';

// A good's category on the Targowisko: an item's slot, else the kind of the
// stack (herb, potion, material, part).
export const goodsCategory = (goods) => (goods.kind === 'item' ? goods.item.slot : goods.kind);

// The categories of `order` ([{ id, name }]) with something among `entries`,
// in that order, each with how many (`count`); `categoryOf` gives an entry's.
export function categoriesOf(entries, categoryOf, order) {
  const counts = new Map();
  for (const entry of entries) {
    const id = categoryOf(entry);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return order.filter(({ id }) => counts.has(id)).map((category) => ({ ...category, count: counts.get(category.id) }));
}

// The entries of one category, in their order, or all of them.
export const inCategory = (entries, categoryOf, id) => (id === ALL ? entries : entries.filter((entry) => categoryOf(entry) === id));

// The category to show: the one chosen while it holds something, else all.
export const shownCategory = (chosen, categories) => (categories.some(({ id }) => id === chosen) ? chosen : ALL);
