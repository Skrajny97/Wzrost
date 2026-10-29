// The Encyklopedia (src/server/encyclopedia.js, DECISIONS.md
// "Encyklopedia"), from its book in the top bar: everything the character
// has got, in tabs and tiers, each entry with where to get it; one not got
// yet is a shadow with "???". The item sets and the counts of discoveries
// open chests, and the Bestiariusz of every land and inner region is here
// too, with its chests (combat.js).

import { herbSprite, itemSprite, materialSprite, potionSprite } from '../art.js';
import { materialIcon } from '../craft-table.js';
import { fill, h, icon } from '../dom.js';
import { countOf, formatNumber } from '../format.js';
import { systemPoints } from '../quests.js';
import { playSound } from '../sound.js';
import { call, state } from '../state.js';
import { timePoints } from '../time.js';
import { openSheet, pageHeading, toast, withButton } from '../ui.js';
import { bestiaryRow } from './combat.js';

const HOME = '#/encyklopedia';
const DEFAULT_TAB = 'items';

const chestText = (chest) =>
  [`+${formatNumber(chest.gold)} złota`, chest.timePoints > 0 && `+${timePoints(chest.timePoints)}`, chest.systemPoints > 0 && `+${systemPoints(chest.systemPoints)}`]
    .filter(Boolean)
    .join(', ');

// What a count of discoveries asks for, by tab: "4 mikstury".
const COUNTS = {
  potions: (count) => countOf(count, 'miksturę', 'mikstury', 'mikstur'),
  herbs: (count) => countOf(count, 'zioło', 'zioła', 'ziół'),
  materials: (count) => countOf(count, 'materiał', 'materiały', 'materiałów'),
  parts: (count) => countOf(count, 'część', 'części', 'części'),
};

// The picture of an entry, by tab.
const ART = {
  items: (entry) => itemSprite({ base: entry.id }) ?? icon(entry.slotId, { size: 28 }),
  potions: (entry) => potionSprite(entry.id) ?? icon('flask', { size: 28 }),
  herbs: (entry) => herbSprite(entry.id) ?? icon('leaf', { size: 28 }),
  materials: (entry) => materialIcon(entry.id, 28),
  parts: (entry) => materialSprite(entry.id) ?? icon('hammer', { size: 28 }),
};

export function mountEncyclopedia(container, { params }) {
  let book = null;
  let gone = false;
  let tab = params.tab ?? DEFAULT_TAB;
  const tabs = h('div', { class: 'segmented encyclopedia-tabs', role: 'group', 'aria-label': 'Zakładki Encyklopedii' });
  const body = h('div', { class: 'encyclopedia' }, h('p', { class: 'muted', text: 'Wczytywanie…' }));
  fill(container, pageHeading('Encyklopedia'), tabs, body);

  async function load() {
    try {
      const { encyclopedia } = await call('GET', '/api/encyclopedia');
      if (gone) return;
      book = encyclopedia;
      render();
    } catch (error) {
      if (!gone) fill(body, h('p', { class: 'chat-error', role: 'status', text: error.message }));
    }
  }

  function render() {
    if (!book) return;
    fill(
      tabs,
      book.tabs.map((each) =>
        h('button', {
          type: 'button',
          class: 'segmented-option',
          'aria-pressed': each.id === tab,
          text: each.name,
          // The tab changes here, without a new request; the address
          // keeps it for a reload.
          onClick: () => {
            tab = each.id;
            history.replaceState(history.state, '', each.id === DEFAULT_TAB ? HOME : `${HOME}/${each.id}`);
            render();
          },
        }),
      ),
    );
    const views = { bestiary: bestiaryTab, items: itemsTab, potions: () => tieredTab('potions'), herbs: () => tieredTab('herbs'), materials: materialsTab, parts: partsTab };
    fill(body, (views[tab] ?? itemsTab)());
  }

  // A chest of a set or of a count, as at the quests and the Bestiariusz:
  // shut with how far its list is, ready to open, or open.
  function chestButton(entry, inside) {
    const status = entry.opened ? 'opened' : entry.ready ? 'ready' : 'locked';
    const open = async () => {
      if (entry.opened) {
        toast('Ta skrzynia jest już otwarta.');
        return;
      }
      if (!entry.ready) {
        toast(`${inside} (${entry.have} z ${entry.need}), a skrzynia się otworzy. W środku: ${chestText(entry.chest)}.`);
        return;
      }
      const result = await call('POST', '/api/encyclopedia/chest', { id: entry.id });
      playSound('chest');
      toast(`Skrzynia otwarta: ${chestText(result.chest)}.`);
      book = result.encyclopedia;
      render();
    };
    return h(
      'button',
      {
        type: 'button',
        class: `quest-chest quest-chest--${status} encyclopedia-chest`,
        'aria-label': entry.opened ? 'Skrzynia otwarta' : entry.ready ? `Otwórz skrzynię: ${chestText(entry.chest)}` : `Skrzynia: ${chestText(entry.chest)}. ${entry.have} z ${entry.need}`,
        onClick: (event) => withButton(event.currentTarget, open),
      },
      h('span', { class: 'quest-chest-art', 'aria-hidden': 'true' }, materialSprite('chest') ?? icon('pouch', { size: 28 })),
      h('span', { class: 'quest-chest-caption', text: entry.opened ? 'Otwarta' : entry.ready ? 'Otwórz' : `${entry.have}/${entry.need}` }),
    );
  }

  // An entry as a tile; a tap shows it with where to get it.
  function tile(kind, entry, color) {
    return h(
      'li',
      {},
      h(
        'button',
        {
          type: 'button',
          class: `slot slot--bag encyclopedia-tile${entry.found ? '' : ' encyclopedia-tile--unknown'}${entry.trophy?.won ? ' encyclopedia-tile--trophy' : ''}`,
          vars: color ? { '--rarity': color } : {},
          'aria-label': entry.found ? entry.name : 'Nieodkryte',
          onClick: () => entrySheet(kind, entry, color),
        },
        ART[kind](entry),
        entry.trophy?.won && h('span', { class: 'encyclopedia-trophy', 'aria-hidden': 'true' }, icon('trophy', { size: 14 })),
      ),
    );
  }

  const rarityColor = (id) => state.content.rarities.find((rarity) => rarity.id === id)?.color ?? null;
  const rarityName = (id) => state.content.rarities.find((rarity) => rarity.id === id)?.name ?? '';

  function entrySheet(kind, entry, color) {
    const meta = [entry.slot, entry.found && entry.rarity && kind !== 'items' && rarityName(entry.rarity)].filter(Boolean).join(' · ');
    openSheet(
      h(
        'div',
        { class: 'item-details' },
        h(
          'div',
          { class: 'item-head' },
          h('span', { class: `item-art${entry.found ? '' : ' encyclopedia-tile--unknown'}`, vars: color ? { '--rarity': color } : {} }, ART[kind](entry)),
          h('div', {}, h('h2', { class: 'item-title', vars: color ? { '--rarity': color } : {}, text: entry.name }), meta && h('p', { class: 'item-meta', text: meta })),
        ),
        entry.description && h('p', { class: 'sheet-text', text: entry.description }),
        h('ul', { class: 'encyclopedia-sources' }, entry.sources.map((line) => h('li', { text: line }))),
      ),
    );
  }

  const summary = (part, extra) =>
    h('p', { class: 'encyclopedia-summary' }, h('strong', { text: `Odkryte: ${formatNumber(part.found)} z ${formatNumber(part.all)}` }), extra && ` · ${extra}`);

  // The chests of a tab's counts in one row, above its tiers.
  const countChests = (kind, chests) =>
    chests.length > 0 &&
    h(
      'section',
      { class: 'card encyclopedia-counts', 'aria-label': 'Skrzynie za odkrycia' },
      h('h2', { class: 'card-title', text: 'Skrzynie za odkrycia' }),
      h(
        'ul',
        { class: 'encyclopedia-count-list' },
        chests.map((entry) => h('li', { class: 'encyclopedia-count' }, chestButton(entry, `Odkryj ${COUNTS[kind](entry.need)}`), h('span', { class: 'muted', text: COUNTS[kind](entry.need) }))),
      ),
    );

  const tierHeading = (tier) => h('h2', { class: 'section-title encyclopedia-tier' }, `${tier.name} `, h('span', { class: 'muted', text: `· ${tier.range}` }));

  function itemsTab() {
    const part = book.items;
    return [
      summary(part),
      h('p', { class: 'muted', text: part.note }),
      part.tiers.map((tier) =>
        h(
          'section',
          { class: 'stack encyclopedia-section' },
          tierHeading(tier),
          tier.sets.map((set) =>
            h(
              'div',
              { class: 'card encyclopedia-set' },
              h('div', { class: 'encyclopedia-set-head' }, h('h3', { class: 'card-title', text: set.name }), chestButton(set, 'Zdobądź wszystkie przedmioty zestawu')),
              h(
                'ul',
                { class: 'bag-grid' },
                set.bases.map((id) => {
                  const entry = tier.entries.find((candidate) => candidate.id === id);
                  return entry && tile('items', entry, entry.found ? rarityColor(entry.rarity) : null);
                }),
              ),
            ),
          ),
        ),
      ),
    ];
  }

  function tieredTab(kind) {
    const part = book[kind];
    return [
      summary(part),
      countChests(kind, part.chests),
      part.tiers.map((tier) => h('section', { class: 'stack encyclopedia-section' }, tierHeading(tier), h('ul', { class: 'bag-grid' }, tier.entries.map((entry) => tile(kind, entry))))),
    ];
  }

  function materialsTab() {
    const part = book.materials;
    return [
      summary(part, `Trofea: ${formatNumber(part.trophies)}`),
      countChests('materials', part.chests),
      part.tiers.map((tier) =>
        h(
          'section',
          { class: 'stack encyclopedia-section' },
          tierHeading(tier),
          h('ul', { class: 'bag-grid' }, tier.entries.map((entry) => tile('materials', entry, entry.found ? rarityColor(entry.rarity) : null))),
        ),
      ),
    ];
  }

  function partsTab() {
    const part = book.parts;
    return [summary(part), countChests('parts', part.chests), h('ul', { class: 'bag-grid' }, part.entries.map((entry) => tile('parts', entry, entry.found ? rarityColor(entry.rarity) : null)))];
  }

  // The Bestiariusz of every land and its inner regions, as at the Walka.
  function bestiaryTab() {
    const met = new Set(state.character.met ?? []);
    const known = (place) => `${place.dangers.filter((danger) => met.has(danger.monsterId)).length} z ${place.dangers.length}`;
    return state.content.regions.map((region) =>
      h(
        'section',
        { class: 'card encyclopedia-land' },
        h('h2', { class: 'card-title' }, region.name, h('span', { class: 'muted', text: ` · poz. ${region.minLevel}–${region.maxLevel}` })),
        region.dangers?.length > 0 && [h('p', { class: 'muted', text: `Cała kraina, poznane stwory: ${known(region)}` }), bestiaryRow(region, true)],
        region.areas.map((area) =>
          h('div', { class: 'encyclopedia-area' }, h('p', { class: 'encyclopedia-area-name', text: `${area.name} · poz. ${area.minLevel}–${area.maxLevel}` }), bestiaryRow(area)),
        ),
      ),
    );
  }

  load();
  return {
    // The Bestiariusz follows the character's creatures met and chests opened.
    update() {
      if (tab === 'bestiary') render();
    },
    unmount() {
      gone = true;
    },
  };
}
