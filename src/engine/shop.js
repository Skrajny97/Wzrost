// The Skup złomu's counter (`shop` of the building in data/buildings.json):
// the scrap dealer sells crafting parts for gold. At the building's level L
// he has the parts of every rarity up to rarities[L − 1], the last one for
// every level from there on. A part costs goldPerPart × its rarity's sell
// multiplier, and every level above the first takes discountPerLevel off
// the price. The prices stay above what the items the parts come from fetch
// when sold instead (test/engine.test.js), so taking an item apart on the
// Stół rozbiórki keeps its worth.

const rarityIndex = (rarityId, content) => content.rarities.findIndex((rarity) => rarity.id === rarityId);

// The one building with a shop, if any.
export const shopBuilding = (content) => content.buildings.find((building) => building.shop) ?? null;

// A part's price at the building's level.
export function partPrice(partId, level, content) {
  const { goldPerPart, discountPerLevel } = shopBuilding(content).shop;
  const { sell } = content.raritiesById[content.partsById[partId].rarity];
  return Math.max(1, Math.round(goldPerPart * sell * (1 - discountPerLevel) ** (level - 1)));
}

// What the dealer sells at the building's level: every part with its price,
// the commonest first; nothing before the building stands.
export function shopOffer(level, content) {
  const building = shopBuilding(content);
  if (!building || level < 1) return [];
  const { rarities } = building.shop;
  const cap = rarityIndex(rarities[Math.min(level, rarities.length) - 1], content);
  return content.parts
    .filter((part) => rarityIndex(part.rarity, content) <= cap)
    .sort((a, b) => rarityIndex(a.rarity, content) - rarityIndex(b.rarity, content))
    .map((part) => ({ partId: part.id, price: partPrice(part.id, level, content) }));
}

// The building's level from which the dealer sells the parts of a rarity,
// or null if he never does.
export function shopLevelFor(rarityId, content) {
  const index = rarityIndex(rarityId, content);
  return shopBuilding(content).shop.rarities.findIndex((cap) => rarityIndex(cap, content) >= index) + 1 || null;
}

// Why `count` parts of a kind cannot be bought now, or null.
export function shopBlock({ level, gold, partId, count }, content) {
  const building = shopBuilding(content);
  if (!building || level < 1) return { code: 'not_built', message: `Najpierw zbuduj: ${building?.name ?? 'Skup złomu'}.` };
  const part = typeof partId === 'string' && Object.hasOwn(content.partsById, partId) ? content.partsById[partId] : null;
  if (!part) return { code: 'invalid_part', message: 'Złomiarz nie ma takich części.' };
  if (!building.shop.counts.includes(count)) return { code: 'invalid_count', message: 'Złomiarz nie sprzedaje tylu części naraz.' };
  const offer = shopOffer(level, content).find((entry) => entry.partId === part.id);
  if (!offer) {
    const from = shopLevelFor(part.rarity, content);
    return { code: 'not_sold', message: from ? `Złomiarz sprzeda ${part.name} od poziomu ${from}.` : 'Złomiarz nie ma takich części.' };
  }
  if (gold < offer.price * count) return { code: 'not_enough', message: 'Brakuje złota na te części.' };
  return null;
}
