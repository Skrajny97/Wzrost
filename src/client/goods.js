// The goods of a character besides gold and items: its materials, minerals,
// herbs, potions and the camp's resources, as a Wymiana message on the chat
// shows them (screens/community.js; a player's request through the author,
// 13.11.2026: "oznaczanie nie tylko przedmiotów z plecaka ale także
// materiałów, żeby się nimi wymieniać"), the same goods a trade carries
// (screens/trade.js).

import { herbSprite, mineralSprite, potionSprite, resourceArt } from './art.js';
import { materialIcon, materialTitle } from './craft-table.js';
import { icon } from './dom.js';
import { t } from './i18n.js';
import { walletEntries } from './state.js';

// The kinds in the order lists show them.
export const GOODS_KINDS = ['material', 'mineral', 'herb', 'potion', 'resource'];

// A kind's heading over its goods in a list.
export const goodsHeading = (kind) =>
  ({ material: t('Materiały'), mineral: t('Minerały'), herb: t('Zioła'), potion: t('Mikstury'), resource: t('Zasoby obozu') })[kind];

// What a good is, where it has no rarity to say.
export const goodsKindName = (kind) => ({ material: t('Materiał'), mineral: t('Minerał'), herb: t('Zioło'), potion: t('Mikstura'), resource: t('Zasób obozu') })[kind];

// A good's picture, `size` pixels for a line icon where it has no sprite.
export function goodsArt(good, size) {
  switch (good.kind) {
    case 'material':
      return materialIcon(good.materialId, size);
    case 'mineral':
      return mineralSprite(good.id) ?? icon('ore', { size });
    case 'herb':
      return herbSprite(good.id) ?? icon('leaf', { size });
    case 'potion':
      return potionSprite(good.id) ?? icon('flask', { size });
    default:
      return resourceArt(good.id, size);
  }
}

// The goods the character has, kind after kind: {kind, id, name, count},
// and the rarity's colour where it has one.
export function ownedGoods(character) {
  const resources = walletEntries(character).filter((entry) => entry.id !== 'gold' && entry.amount > 0);
  return [
    ...(character.crafting?.materials ?? []).map((material) => ({
      kind: 'material',
      id: material.key,
      materialId: material.materialId,
      name: materialTitle(material),
      count: material.count,
      color: material.color,
    })),
    ...(character.minerals ?? []).map((mineral) => ({ kind: 'mineral', id: mineral.id, name: mineral.name, count: mineral.count, color: mineral.color })),
    ...(character.herbs ?? []).map((herb) => ({ kind: 'herb', id: herb.id, name: herb.name, count: herb.count })),
    ...(character.potions ?? []).map((potion) => ({ kind: 'potion', id: potion.id, name: potion.name, count: potion.count })),
    ...resources.map((entry) => ({ kind: 'resource', id: entry.id, name: entry.name, count: entry.amount })),
  ].filter((good) => good.count > 0);
}

// How many of a good the character has, 0 for none.
export const ownedCount = (character, kind, id) => ownedGoods(character).find((good) => good.kind === kind && good.id === id)?.count ?? 0;
