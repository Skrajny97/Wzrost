// The Encyklopedia (src/server/encyclopedia.js, DECISIONS.md
// "Encyklopedia"), from its book in the top bar: everything the character
// has got, in tabs and tiers, each entry with where to get it; one not got
// yet is a shadow with "???". The item sets and the counts of discoveries
// open chests, and the Bestiariusz of every land and inner region is here
// too, with its chests (combat.js). A tab with a chest to open has a gold
// dot, and the set, the counts or the place of that chest a gold frame.
// Tiers and lands fold under their headings: the character's own and those
// with a chest to open start unfolded. Where the game has Talia Systemu
// (CARDS) the last tab, "Karty", is the cards collected (card-collection.js
// in the engine): the count and its bonus, then every land's cards, a card
// not found yet as its creature's shadow.

import { herbSprite, itemSprite, materialSprite, mineralSprite, potionSprite } from '../art.js';
import { bestiaryReady, placeReady } from '../bestiary.js';
import { cardFace } from '../cards.js';
import { materialIcon } from '../craft-table.js';
import { fill, h, icon } from '../dom.js';
import { countOf, formatNumber } from '../format.js';
import { t } from '../i18n.js';
import { systemPoints } from '../quests.js';
import { playSound } from '../sound.js';
import { call, state } from '../state.js';
import { timePoints } from '../time.js';
import { openSheet, pageHeading, toast, withButton } from '../ui.js';
import { bestiaryRow } from './combat.js';

const HOME = '#/encyklopedia';
const DEFAULT_TAB = 'items';

// The tiers and lands the player folded or unfolded by hand, kept while
// the game is open.
const unfolded = new Map();

const chestText = (chest) =>
  [t('+{gold} złota', { gold: formatNumber(chest.gold) }), chest.timePoints > 0 && `+${timePoints(chest.timePoints)}`, chest.systemPoints > 0 && `+${systemPoints(chest.systemPoints)}`]
    .filter(Boolean)
    .join(', ');

// What a count of discoveries asks for, by tab: "4 mikstury".
const COUNTS = {
  potions: (count) => countOf(count, 'miksturę', 'mikstury', 'mikstur'),
  herbs: (count) => countOf(count, 'zioło', 'zioła', 'ziół'),
  materials: (count) => countOf(count, 'materiał', 'materiały', 'materiałów'),
  parts: (count) => countOf(count, 'część', 'części', 'części'),
  minerals: (count) => countOf(count, 'minerał', 'minerały', 'minerałów'),
};

// The picture of an entry, by tab.
const ART = {
  items: (entry) => itemSprite({ base: entry.id }) ?? icon(entry.slotId, { size: 28 }),
  potions: (entry) => potionSprite(entry.id) ?? icon('flask', { size: 28 }),
  herbs: (entry) => herbSprite(entry.id) ?? icon('leaf', { size: 28 }),
  materials: (entry) => materialIcon(entry.id, 28),
  parts: (entry) => materialSprite(entry.id) ?? icon('hammer', { size: 28 }),
  minerals: (entry) => mineralSprite(entry.id) ?? icon('ore', { size: 28 }),
};

export function mountEncyclopedia(container, { params }) {
  let book = null;
  let gone = false;
  let tab = params.tab ?? DEFAULT_TAB;
  const tabs = h('div', { class: 'segmented encyclopedia-tabs', role: 'group', 'aria-label': t('Zakładki Encyklopedii') });
  const body = h('div', { class: 'encyclopedia' }, h('p', { class: 'muted', text: t('Wczytywanie…') }));
  fill(container, pageHeading(t('Encyklopedia')), tabs, body);

  // The chests ready to open by the character's view, to fetch the book
  // again when one more waits.
  let readyCount = state.character.encyclopedia?.ready ?? 0;

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

  // The tabs with a chest to open.
  function readyTabs() {
    const ready = (chests) => chests.some((entry) => entry.ready);
    return new Set(
      [
        ready(book.items.tiers.flatMap((tier) => tier.sets)) && 'items',
        ...['potions', 'herbs', 'materials', 'parts', 'minerals'].filter((kind) => book[kind] && ready(book[kind].chests)),
        bestiaryReady(state.character, state.content) > 0 && 'bestiary',
      ].filter(Boolean),
    );
  }

  function renderTabs() {
    const ready = readyTabs();
    // With the cards' tab, eight: three, three and two (styles.css).
    tabs.classList.toggle('encyclopedia-tabs--eight', book.tabs.length === 8);
    fill(
      tabs,
      book.tabs.map((each) =>
        h('button', {
          type: 'button',
          class: `segmented-option${ready.has(each.id) ? ' encyclopedia-tab--ready' : ''}`,
          'aria-pressed': each.id === tab,
          'aria-label': ready.has(each.id) ? t('{name}: skrzynia do odebrania', { name: each.name }) : null,
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
  }

  function render() {
    if (!book) return;
    renderTabs();
    const views = {
      bestiary: bestiaryTab,
      items: itemsTab,
      potions: () => tieredTab('potions'),
      herbs: () => tieredTab('herbs'),
      materials: materialsTab,
      parts: () => flatTab('parts'),
      minerals: () => tieredTab('minerals', true),
      cards: cardsTab,
    };
    fill(body, (views[tab] ?? itemsTab)());
  }

  // A chest of a set or of a count, as at the quests and the Bestiariusz:
  // shut with how far its list is, ready to open, or open.
  function chestButton(entry, inside) {
    const status = entry.opened ? 'opened' : entry.ready ? 'ready' : 'locked';
    const open = async () => {
      if (entry.opened) {
        toast(t('Ta skrzynia jest już otwarta.'));
        return;
      }
      if (!entry.ready) {
        toast(t('{task} ({have} z {need}), a skrzynia się otworzy. W środku: {chest}.', { task: inside, have: entry.have, need: entry.need, chest: chestText(entry.chest) }));
        return;
      }
      const result = await call('POST', '/api/encyclopedia/chest', { id: entry.id });
      playSound('chest');
      toast(t('Skrzynia otwarta: {chest}.', { chest: chestText(result.chest) }));
      book = result.encyclopedia;
      render();
    };
    return h(
      'button',
      {
        type: 'button',
        class: `quest-chest quest-chest--${status} encyclopedia-chest`,
        'aria-label': entry.opened
          ? t('Skrzynia otwarta')
          : entry.ready
            ? t('Otwórz skrzynię: {chest}', { chest: chestText(entry.chest) })
            : t('Skrzynia: {chest}. {have} z {need}', { chest: chestText(entry.chest), have: entry.have, need: entry.need }),
        onClick: (event) => withButton(event.currentTarget, open),
      },
      h('span', { class: 'quest-chest-art', 'aria-hidden': 'true' }, materialSprite('chest') ?? icon('pouch', { size: 28 })),
      h('span', { class: 'quest-chest-caption', text: entry.opened ? t('Otwarta') : entry.ready ? t('Otwórz') : `${entry.have}/${entry.need}` }),
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
          'aria-label': entry.found ? entry.name : t('Nieodkryte'),
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
    h('p', { class: 'encyclopedia-summary' }, h('strong', { text: t('Odkryte: {found} z {all}', { found: formatNumber(part.found), all: formatNumber(part.all) }) }), extra && ` · ${extra}`);

  // The chests of a tab's counts in one row, above its tiers.
  const countChests = (kind, chests) =>
    chests.length > 0 &&
    h(
      'section',
      { class: `card encyclopedia-counts${chests.some((entry) => entry.ready) ? ' encyclopedia-ready' : ''}`, 'aria-label': t('Skrzynie za odkrycia') },
      h('h2', { class: 'card-title', text: t('Skrzynie za odkrycia') }),
      h(
        'ul',
        { class: 'encyclopedia-count-list' },
        chests.map((entry) =>
          h('li', { class: 'encyclopedia-count' }, chestButton(entry, t('Odkryj {count}', { count: COUNTS[kind](entry.need) })), h('span', { class: 'muted', text: COUNTS[kind](entry.need) })),
        ),
      ),
    );

  // A tier or a land that folds under its heading: unfolded at first when
  // `startOpen`, then as the player left it.
  function foldable(key, startOpen, className, head, ...children) {
    return h(
      'details',
      {
        class: `${className} encyclopedia-fold`,
        open: unfolded.get(key) ?? startOpen,
        onToggle: (event) => {
          const { open } = event.currentTarget;
          if (open === startOpen) unfolded.delete(key);
          else unfolded.set(key, open);
        },
      },
      h('summary', { class: 'encyclopedia-fold-head' }, head, icon('chevron', { size: 18, className: 'encyclopedia-fold-chevron' })),
      h('div', { class: 'stack encyclopedia-fold-body' }, children),
    );
  }

  // The gold dot of a folded heading whose chest waits.
  const headDot = (ready) => ready && [h('span', { class: 'encyclopedia-dot', 'aria-hidden': 'true' }), h('span', { class: 'visually-hidden', text: t('Skrzynia do odebrania') })];

  // A tier's heading with how much of it is discovered: "3 z 22", the
  // number apart from "z 22", as a key of nothing but "{found} z {all}"
  // would match any message with " z " that the server translates by its
  // shape (translateMessage, src/server/i18n.js).
  const tierHead = (tier, ready) => [
    h('h2', { class: 'section-title encyclopedia-tier' }, `${tier.name} `, h('span', { class: 'muted', text: `· ${tier.range}` })),
    h('span', { class: 'encyclopedia-fold-count', text: `${tier.entries.filter((entry) => entry.found).length} ${t('z {max}', { max: tier.entries.length })}` }),
    headDot(ready),
  ];

  // The tier the character is in, or one with a chest to open, starts
  // unfolded; without the character's own, the first.
  const tierOpen = (tiers, tier, ready) => tier.current || ready || (!tiers.some((each) => each.current) && tier === tiers[0]);

  const tierSection = (kind, tiers, tier, ready, ...children) =>
    foldable(`${kind}:${tier.index}`, tierOpen(tiers, tier, ready), 'encyclopedia-section', tierHead(tier, ready), ...children);

  function itemsTab() {
    const part = book.items;
    return [
      summary(part),
      h('p', { class: 'muted', text: part.note }),
      part.tiers.map((tier) =>
        tierSection(
          'items',
          part.tiers,
          tier,
          tier.sets.some((set) => set.ready),
          tier.sets.map((set) =>
            h(
              'div',
              {
                class: `card encyclopedia-set${set.ready ? ' encyclopedia-ready' : ''}`,
                // The narrator points at the class's first set, with the
                // weapon of the first exploration, and unfolds its tier.
                ...(set.id === `items:1:${state.character.classId}` && {
                  'data-guide': 'encyclopedia-set',
                  onUnfold: (event) => event.currentTarget.closest('details')?.setAttribute('open', ''),
                }),
              },
              h('div', { class: 'encyclopedia-set-head' }, h('h3', { class: 'card-title', text: set.name }), chestButton(set, t('Zdobądź wszystkie przedmioty zestawu'))),
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

  // A tab in tiers by the level of its profession: the potions, the herbs,
  // and Górnictwo's gems and ores (`byRarity`: in the colour of their rarity
  // once discovered).
  function tieredTab(kind, byRarity = false) {
    const part = book[kind];
    const color = (entry) => (byRarity && entry.found ? rarityColor(entry.rarity) : null);
    return [
      summary(part),
      countChests(kind, part.chests),
      part.tiers.map((tier) => tierSection(kind, part.tiers, tier, false, h('ul', { class: 'bag-grid' }, tier.entries.map((entry) => tile(kind, entry, color(entry)))))),
    ];
  }

  function materialsTab() {
    const part = book.materials;
    return [
      summary(part, t('Trofea: {count}', { count: formatNumber(part.trophies) })),
      countChests('materials', part.chests),
      part.tiers.map((tier) =>
        tierSection(
          'materials',
          part.tiers,
          tier,
          false,
          h('ul', { class: 'bag-grid' }, tier.entries.map((entry) => tile('materials', entry, entry.found ? rarityColor(entry.rarity) : null))),
        ),
      ),
    ];
  }

  // A tab without tiers: the parts.
  function flatTab(kind) {
    const part = book[kind];
    return [summary(part), countChests(kind, part.chests), h('ul', { class: 'bag-grid' }, part.entries.map((entry) => tile(kind, entry, entry.found ? rarityColor(entry.rarity) : null)))];
  }

  // The Bestiariusz of every land and its inner regions, as at the Walka.
  function bestiaryTab() {
    const met = new Set(state.character.met ?? []);
    const known = (place) => ({ found: place.dangers.filter((danger) => met.has(danger.monsterId)).length, all: place.dangers.length });
    const ready = (place) => placeReady(place, state.character);
    // A place's levels: "poz. 1–10".
    const levels = (place) => t('poz. {min}–{max}', { min: place.minLevel, max: place.maxLevel });
    const { level } = state.character;
    // The land of the character's level, or one with a chest to open,
    // starts unfolded.
    return state.content.regions.map((region) => {
      const waiting = [region, ...region.areas].some(ready);
      return foldable(
        `bestiary:${region.id}`,
        waiting || (level >= region.minLevel && level <= region.maxLevel),
        `card encyclopedia-land${waiting ? ' encyclopedia-ready' : ''}`,
        [h('h2', { class: 'card-title' }, region.name, h('span', { class: 'muted', text: ` · ${levels(region)}` })), headDot(waiting)],
        region.dangers?.length > 0 && [h('p', { class: 'muted', text: t('Cała kraina, poznane stwory: {found} z {all}', known(region)) }), bestiaryRow(region, true)],
        region.areas.map((area) =>
          h(
            'div',
            { class: `encyclopedia-area${ready(area) ? ' encyclopedia-ready' : ''}` },
            h('p', { class: 'encyclopedia-area-name', text: `${area.name} · ${levels(area)}` }),
            bestiaryRow(area),
          ),
        ),
      );
    });
  }

  // Talia Systemu's cards (cards.js, card-collection.js in the engine): the
  // count of different cards with the collection's bonus and the way to its
  // next threshold, then every land's cards with its count, each found one
  // as on the Salon's table and a tap showing its sheet, each other one its
  // creature's shadow. The land of the character's level starts unfolded.
  function cardsTab() {
    const part = book.cards;
    if (!part) return itemsTab();
    const { level } = state.character;
    // The first card found, marked for tools/layout-check.cjs (its sheet).
    const first = part.lands.flatMap((land) => land.cards).find((card) => card.found) ?? null;
    const progress = part.threshold && h('div', { class: 'meter-fill' });
    if (progress) progress.style.width = `${Math.max(0, Math.min(1, (part.found - part.threshold.from) / (part.threshold.to - part.threshold.from))) * 100}%`;
    return [
      h(
        'section',
        { class: 'card encyclopedia-cards-head', 'data-guide': 'encyclopedia-cards' },
        h('h2', { class: 'card-title', text: part.summary }),
        part.bonus.length > 0 &&
          h(
            'div',
            { class: 'encyclopedia-cards-bonus' },
            h('p', { class: 'encyclopedia-cards-now', text: part.bonus[0] }),
            part.bonus.slice(1, -1).map((line) => h('p', { text: line })),
            progress &&
              h(
                'div',
                { class: 'meter encyclopedia-cards-meter' },
                h('div', { class: 'meter-track', role: 'progressbar', 'aria-label': part.bonus[1], 'aria-valuemin': part.threshold.from, 'aria-valuemax': part.threshold.to, 'aria-valuenow': part.found }, progress),
              ),
            h('p', { class: 'muted', text: part.bonus.at(-1) }),
          ),
        h('p', { class: 'muted', text: part.note }),
      ),
      part.lands.map((land) =>
        foldable(
          `cards:${land.id}`,
          level >= land.minLevel && level <= land.maxLevel,
          'card encyclopedia-land',
          [
            h('div', { class: 'encyclopedia-cards-land' }, h('h2', { class: 'card-title', text: land.name }), h('span', { class: 'encyclopedia-cards-levels', text: t('poz. {min}–{max}', { min: land.minLevel, max: land.maxLevel }) })),
            h('span', { class: 'encyclopedia-fold-count', text: land.count }),
          ],
          h(
            'ul',
            { class: 'tcard-grid tcard-grid--collection encyclopedia-cards' },
            land.cards.map((card) =>
              h(
                'li',
                { class: card.found ? 'encyclopedia-card' : 'encyclopedia-card encyclopedia-card--unknown', ...(card === first && { 'data-guide': 'encyclopedia-card' }) },
                card.found
                  ? cardFace(card, { onClick: () => cardSheet(card) })
                  : cardFace({ id: card.id, name: '???', type: 'unknown', rarity: 'unknown', color: null, level: '?', attack: 0, life: 0 }, { label: part.unknown }),
              ),
            ),
          ),
        ),
      ),
    ];
  }

  // A card's sheet: its face, name and rarity, then its type and what it
  // beats, its level with Atak and Życie, its copies, where it drops and its
  // chance there.
  function cardSheet(card) {
    openSheet(
      h(
        'div',
        { class: 'item-details encyclopedia-card-sheet' },
        h(
          'div',
          { class: 'encyclopedia-card-sheet-head' },
          h('div', { class: 'encyclopedia-card-sheet-face' }, cardFace(card, { label: card.name })),
          h('div', {}, h('h2', { class: 'item-title', vars: { '--rarity': card.color }, text: card.name }), h('p', { class: 'item-meta', text: card.meta })),
        ),
        h('ul', { class: 'encyclopedia-sources' }, card.details.map((line) => h('li', { text: line }))),
      ),
    );
  }

  load();
  return {
    // A chest more to open brings the book again; the Bestiariusz and its
    // dot follow the character's creatures met and chests opened.
    update() {
      if (!book) return;
      const ready = state.character.encyclopedia?.ready ?? 0;
      if (ready !== readyCount) {
        readyCount = ready;
        load();
      } else if (tab === 'bestiary') render();
      else renderTabs();
    },
    unmount() {
      gone = true;
    },
  };
}
