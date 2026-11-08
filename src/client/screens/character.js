// The character screen: a 3:4 portrait with five equipment slots on each side,
// an eye that hides the slots, and the bag with items that are not worn.
// The item card also upgrades the item on the camp's Kowadło and takes a bag
// item apart on the Stół rozbiórki.

import { herbSprite, itemSprite, materialSprite, mineralSprite, potionSprite, resourceArt, scrollArt } from '../art.js';
import { bonusList } from '../bonuses.js';
import { characterLook, portraitLayers } from '../cosmetics.js';
import { MATERIALS_HINT, materialIcon, materialSheet, materialTitle } from '../craft-table.js';
import { fill, h, icon } from '../dom.js';
import { askGuildButton } from '../guild-requests.js';
import { countOf, formatCountdown, formatDecimal, formatHours, formatMinutes, formatNumber, formatPrecise, plural, saleGold, timeFormat } from '../format.js';
import { t } from '../i18n.js';
import { SLOT_ICONS, itemIcon } from '../icons.js';
import { playSound } from '../sound.js';
import { buildLocked, buildLockedText, call, costShortfall, isUnlocked, serverNow, state, unlockInfo, walletEntries } from '../state.js';
import { scrapperSheet } from '../scrapper.js';
import { itemTip, setTipRenderer } from '../item-tip.js';
import { afterSheet, closeSheet, confirmAction, openSheet, pageHeading, systemLink, systemPanel, toast, withButton } from '../ui.js';
import { bust } from './select.js';

// The words of these tables are written in Polish and shown in the page's
// language (t(), i18n.js).
const POSITION_NAMES = { front: 'przód', middle: 'środek', back: 'tył' };

// An item's name with its upgrade, e.g. "Miecz Rysia +3".
export const itemTitle = (item) => (item.upgrade > 0 ? `${item.name} +${item.upgrade}` : item.name);

// The number in the corner of a slot: the upgrade level.
const upgradeBadge = (item) => item.upgrade > 0 && h('span', { class: 'slot-level', text: `+${item.upgrade}` });

// Whether an item would make the character stronger in place of what its
// slot holds, as the server counts it (valueChanges in preview.js): a word
// for the lists of items and a line for the item's card.
const VERDICTS = {
  better: { text: 'lepiej', line: 'Lepiej: postać będzie silniejsza.' },
  worse: { text: 'gorzej', line: 'Gorzej: postać będzie słabsza.' },
  mixed: { text: 'coś za coś', line: 'Coś za coś: jedne wartości wzrosną, inne spadną.' },
  same: { text: 'bez zmian', line: 'Bez zmian w walce.' },
};

// The mark of a bag item: a green triangle up, a red one down, both for a
// trade-off (drawn in CSS, so that no font lacks them), with the word in a
// list and alone in the corner of a tile. None for an item that changes
// nothing or that the class cannot wear (verdict null).
export function verdictMark(verdict, { tile = false } = {}) {
  if (!verdict || verdict === 'same') return null;
  return tile
    ? h('span', { class: `slot-verdict verdict verdict--${verdict}`, 'aria-hidden': 'true' })
    : h('span', { class: `verdict verdict--${verdict}`, text: t(VERDICTS[verdict].text) });
}

// A report keeps copies of its finds; the same item in the bag has an id.
const sameItem = (a, b) =>
  a.name === b.name && a.level === b.level && a.rarityName === b.rarityName && a.properties.join('|') === b.properties.join('|');

// Where a report's copy of an item is now: in the bag or worn, or null.
export function ownedCopy(item) {
  const character = state.character;
  const inBag = character.bag.find((candidate) => sameItem(candidate, item));
  if (inBag) return { item: inBag, equipped: false };
  const worn = Object.values(character.equipment).find((candidate) => candidate && sameItem(candidate, item));
  return worn ? { item: worn, equipped: true } : null;
}

// The mark of a find in a report's list, while it waits in the bag.
export function findMark(item) {
  const owned = ownedCopy(item);
  return owned && !owned.equipped ? verdictMark(owned.item.verdict) : null;
}

// The eye toggle is remembered while the page is open.
let gearHidden = false;
// Which half of the backpack shows: the items, or the materials, which take
// no room in it. Remembered while the page is open too.
let bagTab = 'items';

// How the bag's items and materials are sorted (the author: "dodaj tez
// jakas opcje sortowania w plecaku"), each tab its own choice, kept on the
// device: in the order the game gives them (items the newest first,
// materials by rarity and name), the rarest first, the highest level first,
// by the gear's slot, or the most pieces first.
const BAG_SORTS = {
  items: [
    { id: 'order', label: 'Najnowsze' },
    { id: 'rarity', label: 'Rzadkość' },
    { id: 'level', label: 'Poziom' },
    { id: 'slot', label: 'Rodzaj' },
  ],
  materials: [
    { id: 'order', label: 'Kolejność' },
    { id: 'rarity', label: 'Rzadkość' },
    { id: 'count', label: 'Liczba' },
  ],
};
const BAG_SORT_KEY = 'insight-bag-sort';
let bagSorts = { items: 'order', materials: 'order' };
try {
  bagSorts = { ...bagSorts, ...JSON.parse(localStorage.getItem(BAG_SORT_KEY) ?? '{}') };
} catch {
  // Without storage the bag keeps the game's order.
}
function sortBag(kind, list) {
  const sort = bagSorts[kind];
  if (!BAG_SORTS[kind].some((one) => one.id === sort) || sort === 'order') return list;
  const rarity = (entry) => state.content.rarities.findIndex((one) => one.id === entry.rarity);
  const slot = (item) => state.content.slots.findIndex((one) => one.id === item.slot);
  const by = {
    rarity: (a, b) => rarity(b) - rarity(a) || (b.level ?? 0) - (a.level ?? 0),
    level: (a, b) => b.level - a.level || rarity(b) - rarity(a),
    slot: (a, b) => slot(a) - slot(b) || rarity(b) - rarity(a) || b.level - a.level,
    count: (a, b) => b.count - a.count || rarity(b) - rarity(a),
  }[sort];
  return [...list].sort(by);
}

// A material's name as a title, from the Stół rozbiórki's module (trade.js
// takes it from here).
export { materialTitle };

// The pieces a need of materials of a rarity takes, as the server picks
// them ({ key, materialId, label, count }): "1 × Futro rysia, 1 × Skóra węgorza".
export const piecesText = (takes) => takes.map((one) => `${formatNumber(one.count)} × ${materialTitle(one)}`).join(', ');

// Why the gear cannot change now: the character is on an exploration, whose
// report is made with what it wears (inventory.js). At a profession's work
// the gear is at hand (the author: "W trakcie wykonywania Profesji.. w sumie
// powinniśmy być w stanie zarządzać Ekwipunkiem?"), and the bag always.
// A mercenary's gear waits too (mercenaries.js).
const onExploration = (character) => buildLocked(character);
const busyText = (character) => buildLockedText(character, t('Ekwipunek zmienisz'));

// A herb's or a potion's stacks in the bag: full ones, then the rest.
function stacksOf(entry, stack) {
  const stacks = Array.from({ length: Math.floor(entry.count / stack) }, () => stack);
  if (entry.count % stack > 0) stacks.push(entry.count % stack);
  return stacks;
}

// What the bag holds by the stack: herbs and potions, each with its picture,
// its slot class and its address in the API (/api/herbs/…, /api/potions/…).
const STACKS = {
  herbs: { art: (id) => herbSprite(id) ?? icon('leaf', { size: 24 }), slot: 'slot--herb', api: 'herbs', key: 'herbId', discard: 'Wyrzucić zioła?' },
  potions: { art: (id) => potionSprite(id) ?? icon('flask', { size: 24 }), slot: 'slot--potion', api: 'potions', key: 'potionId', discard: 'Wyrzucić mikstury?' },
};

// The account's characters as round busts over the Postać tab, the one
// played marked, a dot on one whose report waits; a tap on another plays it
// at once (players on the chat, via the author, 7.11.2026: "miniaturki
// postaci w formie ikon", instead of three taps through the Ustawienia).
// Only with two characters or more.
// Over each bust the time left of what the character does now (the author,
// 8.11.2026: "nad ikonki zmiany postaci wrzucić jeszcze timer odmierzający
// czas ich głównej aktywności aktualnie wykonywanej"): its exploration, its
// profession's work or its mercenary service, counted down every second;
// "Gotowe" once it ended, nothing while it does nothing. The one played
// follows its own activity as it changes; the others, the list asked when
// the tab opened.
let switchTicks = [];
function switchTimer(one) {
  const time = h('span', { class: 'char-switch-time', 'aria-hidden': 'true' });
  const update = (now) => {
    const activity = one.played ? state.character.activity : one.activity;
    const left = activity?.endsAt ? activity.endsAt - now : null;
    time.textContent = left === null ? '' : left > 0 ? formatCountdown(left) : t('Gotowe');
    time.classList.toggle('char-switch-time--done', left !== null && left <= 0);
  };
  update(serverNow());
  switchTicks.push(update);
  return time;
}

function characterSwitch(list, switchCharacter) {
  switchTicks = [];
  if (!list || list.characters.length < 2 || !switchCharacter) return null;
  return h(
    'nav',
    { class: 'char-switch', 'aria-label': t('Twoje postacie'), 'data-guide': 'char-switch' },
    list.characters.map((one) =>
      h(
        'button',
        {
          type: 'button',
          class: 'char-switch-item',
          'aria-current': one.played ? 'true' : null,
          'aria-label': one.played ? t('{name} (grasz teraz)', { name: one.name }) : t('Graj postacią {name}', { name: one.name }),
          onClick: one.played ? null : (event) => withButton(event.currentTarget, () => switchCharacter(one.id)),
        },
        switchTimer(one),
        h('span', { class: 'char-switch-bust' }, bust(one)),
        one.activity?.finished && !one.played && h('span', { class: 'char-switch-dot', 'aria-hidden': 'true' }),
        h('span', { class: 'char-switch-name', text: one.name }),
      ),
    ),
  );
}

export function mountCharacter(container, { switchCharacter } = {}) {
  // The account's characters for the busts at the top, asked once.
  let characters = null;
  call('GET', '/api/characters')
    .then((list) => {
      characters = list;
      if (list.characters.length > 1) render();
    })
    .catch(() => {});

  function render() {
    const character = state.character;
    const busy = onExploration(character);
    const slots = state.content.slots;

    const frame = h('div', { class: `portrait${gearHidden ? ' portrait--bare' : ''}` });
    const eye = h(
      'button',
      {
        type: 'button',
        class: 'eye-toggle',
        'aria-pressed': gearHidden,
        'aria-label': gearHidden ? t('Pokaż ekwipunek') : t('Ukryj ekwipunek'),
        onClick: () => {
          gearHidden = !gearHidden;
          render();
        },
      },
      icon(gearHidden ? 'eye-off' : 'eye'),
    );
    const column = (side) =>
      h(
        'div',
        { class: `slots slots--${side}` },
        slots.filter((slot) => slot.column === side).map((slot) => slotButton(slot, character.equipment[slot.id])),
      );
    // The forest, or the background bought in the Sklep Systemu, and over it
    // the class's figure in the character's look; with a frame worn, both in
    // its window, under the frame, the slots and the eye (cosmetics.js).
    const layers = portraitLayers(characterLook(character), character.cosmetics);
    frame.classList.toggle('portrait--framed', layers.length > 1);
    frame.append(...layers, column('left'), column('right'), eye);

    fill(container,
      characterSwitch(characters, switchCharacter),
      pageHeading(character.name, `${character.evolution?.current ? t('{name} (z klasy: {base})', { name: character.className, base: character.baseClassName }) : character.className} · ${t(POSITION_NAMES[character.position])} · solo`, {
        tag: character.guildTag,
        nameColor: character.nameColor,
      }),
      // On a computer the figure and the bag side by side (styles.css); on
      // a phone these wrappers have no box of their own.
      h(
        'div',
        { class: 'character-columns' },
        h(
          'div',
          { class: 'character-figure' },
          // What works on the character now, over its figure (the author).
          bonusList(character),
          h('div', { class: 'portrait-wrap' }, frame),
          systemPanel(...characterMessage(character, busy)),
        ),
        bagSection(character.bag),
      ),
    );
  }

  function slotButton(slot, item) {
    if (slot.locked) {
      const core = unlockInfo('core');
      return h(
        'button',
        {
          type: 'button',
          class: 'slot slot--core slot--locked',
          'data-guide': `slot-${slot.id}`,
          'aria-label': t('{slot}: zablokowany', { slot: slot.name }),
          onClick: () =>
            openSheet(
              h('h2', { class: 'sheet-title', text: slot.name }),
              systemPanel(t('{name} odblokuje się {condition}.', { name: core.name, condition: core.condition })),
            ),
        },
        icon('core', { size: 24 }),
      );
    }
    if (!item) {
      return h(
        'button',
        { type: 'button', class: 'slot slot--empty', 'data-guide': `slot-${slot.id}`, 'aria-label': t('{slot}: pusty slot', { slot: slot.name }), onClick: () => emptySlotSheet(slot) },
        icon(SLOT_ICONS[slot.id], { size: 24 }),
      );
    }
    return itemTip(
      h(
        'button',
        {
          type: 'button',
          class: 'slot',
          'data-guide': `slot-${slot.id}`,
          vars: { '--rarity': item.color },
          'aria-label': `${slot.name}: ${itemTitle(item)}, ${item.rarityName}`,
          onClick: () => itemSheet(item, { equipped: true }),
        },
        itemSprite(item) ?? icon(itemIcon(item), { size: 24 }),
        upgradeBadge(item),
      ),
      item,
    );
  }

  function bagSection(bag) {
    const capacity = state.character.bagCapacity;
    // Herbs take places too, by the stack.
    const used = state.character.bagUsed ?? bag.length;
    const { materials } = state.character.crafting;
    const count = h('span', {
      class: `section-count${used >= capacity ? ' section-count--full' : ''}`,
      text: `(${formatNumber(used)}/${formatNumber(capacity)})`,
    });
    const tab = (id, label) =>
      h(
        'button',
        {
          type: 'button',
          class: 'segmented-option',
          'aria-pressed': bagTab === id,
          onClick: () => {
            bagTab = id;
            render();
          },
        },
        label,
      );
    const stacked = materials.reduce((sum, material) => sum + material.count, 0);
    // The parts for the Warsztat have their own tab (the author: "Podzielić
    // na 3: Przedmioty, Materiały, Części").
    const parts = state.character.crafting.parts.filter((part) => part.count > 0);
    const partCount = parts.reduce((sum, part) => sum + part.count, 0);
    // The gems and ores of Górnictwo have their own tab once it opens, or
    // while the character has some.
    const minerals = state.character.minerals ?? [];
    const mineralCount = minerals.reduce((sum, mineral) => sum + mineral.count, 0);
    const showMinerals = mineralCount > 0 || Boolean(state.character.professions?.mining);
    const grids = {
      items: () => [scrollsLine(), bag.length > 1 && sortRow('items'), itemsGrid(sortBag('items', bag))],
      materials: () => [materials.length > 1 && sortRow('materials'), materialsGrid(sortBag('materials', materials))],
      parts: () => partsGrid(parts),
      minerals: () => mineralsGrid(minerals),
    };
    return h(
      'section',
      { class: 'bag', 'aria-labelledby': 'bag-title' },
      h(
        'div',
        { class: 'bag-head' },
        h('h2', { class: 'section-title', id: 'bag-title' }, `${t('Plecak')} `, count),
      ),
      bagActions(bag),
      h(
        'div',
        { class: `segmented bag-tabs${showMinerals ? ' bag-tabs--four' : ''}`, role: 'group', 'aria-label': t('Zawartość plecaka') },
        tab('items', t('Przedmioty')),
        tab('materials', stacked > 0 ? t('Materiały ({count})', { count: formatNumber(stacked) }) : t('Materiały')),
        tab('parts', partCount > 0 ? t('Części ({count})', { count: formatNumber(partCount) }) : t('Części')),
        showMinerals && tab('minerals', mineralCount > 0 ? t('Minerały ({count})', { count: formatNumber(mineralCount) }) : t('Minerały')),
      ),
      (grids[bagTab === 'minerals' && !showMinerals ? 'items' : bagTab] ?? grids.items)(),
    );
  }

  // The Kowadło's scrolls the character holds, over its items (632 A: they
  // are its own, bought in the Kuźnia or made in the Warsztat), each with
  // its picture; nothing without any.
  function scrollsLine() {
    const kinds = [
      ['ward-scroll', 'ochronne', state.character.scrolls ?? 0],
      ['steady-scroll', 'utrwalenia', state.character.steadyScrolls ?? 0],
    ].filter(([, , count]) => count > 0);
    if (kinds.length === 0) return null;
    return h(
      'p',
      { class: 'bag-scrolls' },
      `${t('Zwoje:')} `,
      kinds.map(([id, name, count], index) => h('span', { class: 'bag-scroll' }, scrollArt(id, 20), `${t(name)} ${formatNumber(count)}${index < kinds.length - 1 ? ',' : ''}`)),
    );
  }

  // "Sortuj:" over a tab's grid: the game's own buttons, the choice kept on
  // the device.
  function sortRow(kind) {
    return h(
      'div',
      { class: 'bag-sort' },
      h('span', { class: 'bag-sort-label', text: t('Sortuj:') }),
      h(
        'div',
        { class: `segmented bag-sort-options bag-sort-options--${BAG_SORTS[kind].length}`, role: 'group', 'aria-label': t('Sortowanie plecaka') },
        BAG_SORTS[kind].map((one) =>
          h(
            'button',
            {
              type: 'button',
              class: 'segmented-option',
              'aria-pressed': bagSorts[kind] === one.id,
              onClick: () => {
                bagSorts = { ...bagSorts, [kind]: one.id };
                try {
                  localStorage.setItem(BAG_SORT_KEY, JSON.stringify(bagSorts));
                } catch {
                  // Kept while the page is open.
                }
                render();
              },
            },
            t(one.label),
          ),
        ),
      ),
    );
  }

  // Under the bag's title: the scrapper's sale by the handful, without going
  // to the camp (320 A), and taking several items apart on the Stół
  // rozbiórki, once it stands.
  function bagActions(bag) {
    const sell = bag.some((item) => !(item.upgrade > 0) && !item.gem);
    const salvage = state.character.crafting.pace > 0 && bag.some((item) => item.salvage);
    if (!sell && !salvage) return null;
    return h(
      'div',
      { class: 'bag-actions' },
      sell && h('button', { type: 'button', class: 'button button--world button--small', text: t('Sprzedaj zbędne'), onClick: scrapperSheet }),
      salvage && h('button', { type: 'button', class: 'button button--world button--small', text: t('Rozbierz kilka'), onClick: () => salvageManySheet() }),
    );
  }

  // The parts for the Warsztat, a slot for each, outside the bag's room too.
  function partsGrid(parts) {
    if (parts.length === 0) return h('p', { class: 'muted', text: t('Nie masz jeszcze części. Stół rozbiórki robi je z materiałów i rozebranych przedmiotów.') });
    return [
      h('p', { class: 'bag-note', text: t('Części nie zajmują miejsca w plecaku.') }),
      h(
        'ul',
        { class: 'bag-grid' },
        parts.map((part) =>
          h(
            'li',
            {},
            h(
              'button',
              {
                type: 'button',
                class: 'slot slot--bag',
                vars: { '--rarity': part.color },
                'aria-label': t('{name}, {count} szt.', { name: part.name, count: formatNumber(part.count) }),
                onClick: () => partSheet(part),
              },
              materialIcon(part.id),
              h('span', { class: 'slot-level', text: formatNumber(part.count) }),
            ),
          ),
        ),
      ),
    ];
  }

  function partSheet(part) {
    const art = materialSprite(part.id);
    const title = h('h2', { class: 'item-title', vars: { '--rarity': part.color }, text: part.name });
    const meta = h('p', { class: 'item-meta', text: t('{count} szt.', { count: formatNumber(part.count) }) });
    const workshop = state.character.professions?.workshop;
    openSheet(
      h(
        'div',
        { class: 'item-details' },
        art ? h('div', { class: 'item-head' }, h('span', { class: 'item-art', vars: { '--rarity': part.color } }, art), h('div', {}, title, meta)) : [title, meta],
        part.description && h('p', { class: 'sheet-text', text: part.description }),
        h('p', { class: 'sheet-text', text: t('Z części Warsztat wykonuje przedmioty, a przy wymianie 10 części daje 1 część rzadszą.') }),
      ),
      workshop && h('a', { class: 'button button--world', href: '#/profesje/rzemieslnictwo', onClick: closeSheet, text: t('Do Warsztatu') }),
    );
  }

  // The gems and ores of Górnictwo, a slot for each, outside the bag's room
  // too, framed in their rarity's colour.
  function mineralsGrid(minerals) {
    if (minerals.length === 0) return h('p', { class: 'muted', text: t('Nie masz jeszcze kamieni ani kruszców. Wydobędziesz je w Górnictwie.') });
    return [
      h('p', { class: 'bag-note', text: t('Kamienie i kruszce nie zajmują miejsca w plecaku.') }),
      h(
        'ul',
        { class: 'bag-grid' },
        minerals.map((mineral) =>
          h(
            'li',
            {},
            h(
              'button',
              {
                type: 'button',
                class: 'slot slot--bag slot--mineral',
                vars: { '--rarity': mineral.color },
                'aria-label': t('{name}, {count} szt.', { name: mineral.name, count: formatNumber(mineral.count) }),
                onClick: () => mineralSheet(mineral),
              },
              mineralSprite(mineral.id) ?? icon('ore', { size: 24 }),
              h('span', { class: 'slot-level', text: formatNumber(mineral.count) }),
            ),
          ),
        ),
      ),
    ];
  }

  // A mineral's card: what it is, what a gem gives set in an item or which
  // jewellery an ore sets, and selling as many as chosen to the scrapper or
  // throwing them away, once the player confirms, as for herbs (533 A).
  function mineralSheet(mineral) {
    let count = 1;
    const price = (amount) => saleGold(mineral.price, amount);
    const value = h('output', { class: 'herb-count-value' });
    const sell = h('button', { type: 'button', class: 'button button--system' });
    const less = h('button', { type: 'button', class: 'button button--world duration-step', 'aria-label': t('Mniej'), text: '−', onClick: () => set(count - 1) });
    const more = h('button', { type: 'button', class: 'button button--world duration-step', 'aria-label': t('Więcej'), text: '+', onClick: () => set(count + 1) });
    const all = h('button', { type: 'button', class: 'link-button', text: t('wszystkie'), onClick: () => set(mineral.count) });
    function set(next) {
      count = Math.min(mineral.count, Math.max(1, next));
      value.textContent = t('{count} szt.', { count: formatNumber(count) });
      sell.textContent = t('Sprzedaj za {gold} złota', { gold: formatNumber(price(count)) });
      less.disabled = count === 1;
      more.disabled = count === mineral.count;
    }
    set(count);
    const act = (path, done) => async (event) =>
      withButton(event.currentTarget, async () => {
        const result = await call('POST', `/api/minerals/${path}`, { mineralId: mineral.id, count });
        closeSheet();
        done?.(result);
      });
    sell.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      const sure = await confirmAction({
        title: t('Sprzedać minerał?'),
        text: t('Złomiarz kupi: {name} ×{count} za {gold} złota.', { name: mineral.name, count: formatNumber(count), gold: formatNumber(price(count)) }),
        confirmLabel: t('Sprzedaj'),
      });
      if (!sure) return;
      await act('sell', ({ sold }) => {
        playSound('coin');
        toast(t('Złomiarz kupił {count} szt. za {gold} złota.', { count: formatNumber(sold.count), gold: formatNumber(sold.gold) }));
      })({ currentTarget: button });
    });
    const discard = async (event) => {
      const button = event.currentTarget;
      const sure = await confirmAction({
        title: t('Wyrzucić minerał?'),
        text: t('{name}: {count} szt. zniknie na zawsze.', { name: mineral.name, count: formatNumber(count) }),
        confirmLabel: t('Wyrzuć'),
        danger: true,
      });
      if (sure) await act('discard')({ currentTarget: button });
    };
    const art = mineralSprite(mineral.id);
    const title = h('h2', { class: 'item-title', vars: { '--rarity': mineral.color }, text: mineral.name });
    const kind = mineral.kind === 'gem' ? t('Kamień szlachetny · {rarity}', { rarity: mineral.rarityName }) : t('Kruszec');
    const meta = h('p', { class: 'item-meta', text: t('{kind} · {count} szt.', { kind, count: formatNumber(mineral.count) }) });
    const use =
      mineral.kind === 'gem'
        ? t('Daje biżuterii rzadkość: {rarity}. Oprawiony w przedmiot podnosi wszystkie jego liczby o {percent}%.', {
            rarity: mineral.rarityName,
            percent: formatNumber(Math.round(mineral.bonus * 100)),
          })
        : t('Idzie na oprawy biżuterii rzadkości: {rarities}.', { rarities: mineral.rarityNames.join(', ') });
    const jeweller = state.character.professions?.jewelcrafting;
    openSheet(
      h(
        'div',
        { class: 'item-details' },
        art ? h('div', { class: 'item-head' }, h('span', { class: 'item-art', vars: { '--rarity': mineral.color } }, art), h('div', {}, title, meta)) : [title, meta],
        h('p', { class: 'sheet-text', text: mineral.description }),
        h('p', { class: 'sheet-text', text: use }),
        h('p', { class: 'sheet-text', text: t('Złomiarz płaci {price} złota za sztukę.', { price: formatDecimal(mineral.price) }) }),
      ),
      h('div', { class: 'herb-count' }, less, value, more, all),
      jeweller && h('a', { class: 'button button--world', href: '#/profesje/jubilerstwo', onClick: closeSheet, text: t('Do Szlifierni') }),
      h('div', { class: 'sheet-actions' }, h('button', { type: 'button', class: 'button button--world', onClick: discard, text: t('Wyrzuć') }), sell),
    );
  }

  // The materials from beaten creatures, a slot for each stack, outside the bag's room.
  function materialsGrid(materials) {
    if (materials.length === 0) return h('p', { class: 'muted', text: t(MATERIALS_HINT) });
    return [
      h('p', { class: 'bag-note', text: t('Materiały nie zajmują miejsca w plecaku.') }),
      h(
        'ul',
        { class: 'bag-grid' },
        materials.map((material) =>
          h(
            'li',
            {},
            h(
              'button',
              {
                type: 'button',
                class: 'slot slot--bag',
                vars: { '--rarity': material.color },
                'aria-label': `${materialTitle(material)}, ${material.rarityName}, ${formatNumber(material.count)}`,
                onClick: () => materialSheet(material),
              },
              materialIcon(material.materialId),
              h('span', { class: 'slot-level', text: formatNumber(material.count) }),
            ),
          ),
        ),
      ),
    ];
  }

  function itemsGrid(bag) {
    const stacked = Object.keys(STACKS).flatMap((kind) => (state.character[kind] ?? []).map((entry) => ({ kind, entry })));
    if (bag.length === 0 && stacked.length === 0) return h('p', { class: 'muted', text: t('Plecak jest pusty. Łupy z wypraw trafiają tutaj.') });
    return h(
      'ul',
      { class: 'bag-grid' },
      stacked.flatMap(({ kind, entry }) =>
        stacksOf(entry, state.character.herbStack).map((count) =>
          h(
            'li',
            {},
            h(
              'button',
              {
                type: 'button',
                class: `slot slot--bag ${STACKS[kind].slot}`,
                'aria-label': t('{name}, {count} szt.', { name: entry.name, count: formatNumber(count) }),
                onClick: () => stackSheet(kind, entry),
              },
              STACKS[kind].art(entry.id),
              h('span', { class: 'slot-level', text: formatNumber(count) }),
            ),
          ),
        ),
      ),
      bag.map((item) =>
        h(
          'li',
          {},
          itemTip(
            h(
              'button',
              {
                type: 'button',
                class: 'slot slot--bag',
                vars: { '--rarity': item.color },
                'aria-label': [itemTitle(item), item.rarityName, item.slotName, t('poziom {level}', { level: item.level }), verdictMark(item.verdict) && t(VERDICTS[item.verdict].text)]
                  .filter(Boolean)
                  .join(', '),
                onClick: () => itemSheet(item, { equipped: false }),
              },
              itemSprite(item) ?? icon(itemIcon(item), { size: 24 }),
              verdictMark(item.verdict, { tile: true }),
              upgradeBadge(item),
            ),
            item,
          ),
        ),
      ),
    );
  }

  // A herb's or a potion's card: what it is, what the scrapper pays, and
  // selling or throwing away as many as chosen: one to start with (the
  // author: "niech domyślnie zaznaczona będzie jedna jednostka a nie
  // wszystkie"), "wszystkie" for the whole stack.
  function stackSheet(kind, entry) {
    const { art: artOf, api, key, discard: discardTitle } = STACKS[kind];
    const character = state.character;
    // On an exploration the HP is the report's: a healing potion waits.
    const exploring = character.activity?.kind === 'hunt' && entry.fight === 'heal';
    // A strengthening potion is drunk as many at once as chosen, each adding
    // its fights (brewing.js); a healing one, one at a time.
    const timed = entry.drink && !entry.fight;
    let count = 1;
    const price = (amount) => saleGold(entry.price, amount);
    const value = h('output', { class: 'herb-count-value' });
    const sell = h('button', { type: 'button', class: 'button button--system' });
    const drink =
      entry.drink &&
      entry.known !== false &&
      h('button', {
        type: 'button',
        class: 'button button--system',
        disabled: exploring,
        onClick: (event) =>
          withButton(event.currentTarget, async () => {
            const { text } = await call('POST', '/api/potions/drink', { potionId: entry.id, ...(timed && { count }) });
            closeSheet();
            playSound('potion');
            toast(text);
          }),
      });
    const less = h('button', { type: 'button', class: 'button button--world duration-step', 'aria-label': t('Mniej'), text: '−', onClick: () => set(count - 1) });
    const more = h('button', { type: 'button', class: 'button button--world duration-step', 'aria-label': t('Więcej'), text: '+', onClick: () => set(count + 1) });
    const all = h('button', { type: 'button', class: 'link-button', text: t('wszystkie'), onClick: () => set(entry.count) });
    function set(next) {
      count = Math.min(entry.count, Math.max(1, next));
      value.textContent = t('{count} szt.', { count: formatNumber(count) });
      sell.textContent = t('Sprzedaj za {gold} złota', { gold: formatNumber(price(count)) });
      if (drink) drink.textContent = timed && count > 1 ? t('{verb} {count} szt.', { verb: entry.verb, count: formatNumber(count) }) : entry.verb;
      less.disabled = count === 1;
      more.disabled = count === entry.count;
    }
    set(count);
    const act = (path, done) => async (event) =>
      withButton(event.currentTarget, async () => {
        const result = await call('POST', `/api/${api}/${path}`, { [key]: entry.id, count });
        closeSheet();
        done?.(result);
      });
    sell.addEventListener('click', act('sell', ({ sold }) => {
      playSound('coin');
      toast(t('Złomiarz kupił {count} szt. za {gold} złota.', { count: formatNumber(sold.count), gold: formatNumber(sold.gold) }));
    }));
    const discard = async (event) => {
      const button = event.currentTarget;
      const sure = await confirmAction({
        title: t(discardTitle),
        text: t('{name}: {count} szt. zniknie na zawsze.', { name: entry.name, count: formatNumber(count) }),
        confirmLabel: t('Wyrzuć'),
        danger: true,
      });
      if (sure) await act('discard')({ currentTarget: button });
    };
    const art = artOf(entry.id);
    const title = h('h2', { class: 'item-title', text: entry.name });
    const stacks = Math.ceil(entry.count / character.herbStack);
    const meta = h('p', {
      class: 'item-meta',
      text: t('{count} szt. · {stacks} {places} w plecaku', { count: formatNumber(entry.count), stacks, places: plural(stacks, 'miejsce', 'miejsca', 'miejsc') }),
    });
    openSheet(
      h(
        'div',
        { class: 'item-details' },
        art ? h('div', { class: 'item-head' }, h('span', { class: 'item-art' }, art), h('div', {}, title, meta)) : [title, meta],
        h('p', { class: 'sheet-text', text: entry.description }),
        h('p', {
          class: 'sheet-text',
          text: t('Jedno miejsce mieści {stack} szt. Złomiarz płaci {price} złota za sztukę.', { stack: character.herbStack, price: formatDecimal(entry.price) }),
        }),
      ),
      [
        // A healing potion or a potion for a time is drunk, or the oil put
        // on the blade, one at a time (potions.js); one from a Wymiana waits
        // for its recipe.
        entry.known === false && h('p', { class: 'region-warning', text: t('Tej mikstury nie użyjesz, póki nie poznasz jej receptury w Alchemii.') }),
        exploring && entry.known !== false && h('p', { class: 'muted', text: t('Leczyć się można po powrocie z wyprawy.') }),
        drink,
        h('div', { class: 'herb-count' }, less, value, more, all),
        h('div', { class: 'sheet-actions' }, h('button', { type: 'button', class: 'button button--world', onClick: discard, text: t('Wyrzuć') }), sell),
      ],
    );
  }

  function emptySlotSheet(slot) {
    const fitting = state.character.bag.filter((item) => item.slot === slot.id);
    openSheet(
      h('h2', { class: 'sheet-title', text: slot.name }),
      h('p', { class: 'sheet-text', text: t('Pusty slot.') }),
      fitting.length === 0
        ? h('p', { class: 'muted', text: t('W plecaku nie ma przedmiotu do tego slotu.') })
        : h(
            'ul',
            { class: 'item-list' },
            fitting.map((item) =>
              h(
                'li',
                {},
                h(
                  'button',
                  { type: 'button', class: 'item-row', onClick: () => itemSheet(item, { equipped: false }) },
                  itemSummary(item),
                  verdictMark(item.verdict),
                  icon('chevron', { size: 18 }),
                ),
              ),
            ),
          ),
    );
  }

  render();
  return { update: render, tick: (now) => switchTicks.forEach((update) => update(now)) };
}

// An item from the bag or the equipment: its properties, what wearing it
// changes (for an item the class can wear), the item beside the one worn in
// its slot, and the actions.
// `anvil`: the Kowadło part open, as after an upgrade.
export function itemSheet(item, { equipped, anvil = false }) {
  const character = state.character;
  // On an exploration the bag stays at hand: only wearing and taking off
  // wait, and an item worn is changed at home or at a profession's work
  // (inventory.js).
  const busy = onExploration(character);
  const usable = !item.classIds || item.classIds.includes(character.classId);
  // A later base of its kind waits for its class level (a Metin2-like tier),
  // an item from another player too, whatever its own level (inventory.js).
  const early = usable && item.classLevel !== null && character.classLevel < item.classLevel;
  const worn = equipped ? null : character.equipment[item.slot];
  const act = (path) => async (event) =>
    withButton(event.currentTarget, async () => {
      await call('POST', `/api/items/${item.id}/${path}`);
      closeSheet();
    });

  const discard = async (event) => {
    const button = event.currentTarget;
    const sure = await confirmAction({
      title: t('Wyrzucić przedmiot?'),
      text: t('{item} zniknie na zawsze.', { item: itemTitle(item) }),
      confirmLabel: t('Wyrzuć'),
      danger: true,
    });
    if (sure) await withButton(button, () => call('POST', `/api/items/${item.id}/discard`));
  };

  // The scrapper buys a bag item from its card, an upgraded one too.
  const sell = async (event) => {
    const button = event.currentTarget;
    const sure = await confirmAction({
      title: t('Sprzedać przedmiot?'),
      text: [
        t('Złomiarz kupi: {item} za {gold} złota.', { item: itemTitle(item), gold: formatNumber(item.price) }),
        item.upgrade > 0 && t('W tej cenie jest też część złota wydanego na ulepszenia.'),
        item.gem && t('Kamień w nim przepadnie: {gem}.', { gem: item.gem.name }),
      ]
        .filter(Boolean)
        .join(' '),
      confirmLabel: t('Sprzedaj'),
    });
    if (!sure) return;
    await withButton(button, async () => {
      const { sold } = await call('POST', `/api/items/${item.id}/sell`);
      closeSheet();
      toast(t('Sprzedano za {gold} złota.', { gold: formatNumber(sold.gold) }));
    });
  };

  const preview = usable && h('div', { class: 'preview', 'aria-live': 'polite' }, h('p', { class: 'muted', text: t('Liczenie zmian…') }));
  openSheet(
    itemDetails(item),
    preview,
    usable && worn && compareTable(item, worn),
    anvilSection(item, busy && equipped, anvil),
    !equipped && salvageSection(item, false),
    busy && h('p', { class: 'muted', text: busyText(state.character) }),
    !usable && h('p', { class: 'region-warning', text: t('Twoja klasa nie może używać tego przedmiotu. Sprzedasz go złomiarzowi.') }),
    early && h('p', { class: 'region-warning', text: t('Ten przedmiot założysz od poziomu klasy {level}.', { level: item.classLevel }) }),
    !equipped &&
      item.price !== undefined &&
      h('button', { type: 'button', class: 'button button--world', onClick: sell, text: t('Sprzedaj za {gold} złota', { gold: formatNumber(item.price) }) }),
    h(
      'div',
      { class: 'sheet-actions' },
      equipped
        ? h('button', { type: 'button', class: 'button button--world', disabled: busy, onClick: act('unequip'), text: t('Zdejmij') })
        : [
            h('button', { type: 'button', class: 'button button--world', onClick: discard, text: t('Wyrzuć') }),
            h('button', { type: 'button', class: 'button button--system', disabled: busy || !usable || early, onClick: act('equip'), text: t('Załóż') }),
          ],
    ),
  );
  if (preview) showPreview(preview, item, equipped);
}

// The item beside the one worn in its slot, number by number: the damage of
// a weapon, the armor and each stat, and by how much the item has more or
// less of it (for damage, of its average). Also for an item of the
// Targowisko (market.js) and, with its own words, for what a companion
// wears (companions.js).
export function compareTable(item, worn, { title = t('Porównanie z założonym'), wornLabel = t('Założony') } = {}) {
  const ids = [...new Set([...item.lines, ...worn.lines].map((line) => line.id))];
  const lineOf = (of, id) => of.lines.find((line) => line.id === id);
  return h(
    'div',
    { class: 'compare' },
    h('p', { class: 'compare-title', text: title }),
    h(
      'p',
      { class: 'compare-worn' },
      `${wornLabel}: `,
      h('span', { class: 'item-name', vars: { '--rarity': worn.color }, text: itemTitle(worn) }),
      ` · ${worn.rarityName} · ${t('poz. {level}', { level: worn.level })}`,
    ),
    h(
      'table',
      { class: 'compare-table' },
      h(
        'thead',
        {},
        h('tr', {}, h('th', { scope: 'col' }, h('span', { class: 'visually-hidden', text: t('Wartość') })), [t('Ten'), wornLabel, t('Różnica')].map((text) => h('th', { scope: 'col', text }))),
      ),
      h(
        'tbody',
        {},
        ids.map((id) => {
          const mine = lineOf(item, id);
          const theirs = lineOf(worn, id);
          const change = Math.round(((mine?.value ?? 0) - (theirs?.value ?? 0)) * 10) / 10;
          return h(
            'tr',
            {},
            h('th', { scope: 'row', text: (mine ?? theirs).label }),
            h('td', { class: 'num', text: mine?.text ?? '—' }),
            h('td', { class: 'num', text: theirs?.text ?? '—' }),
            h('td', {
              class: `num${change > 0 ? ' compare-up' : change < 0 ? ' compare-down' : ''}`,
              text: change === 0 ? '0' : `${change > 0 ? '+' : '−'}${formatDecimal(Math.abs(change))}`,
            }),
          );
        }),
      ),
    ),
  );
}

// Where an item is now: in the bag or worn.
function ownedItem(id) {
  const character = state.character;
  const inBag = character.bag.find((candidate) => candidate.id === id);
  if (inBag) return { item: inBag, equipped: false };
  const worn = Object.values(character.equipment).find((candidate) => candidate?.id === id);
  return worn ? { item: worn, equipped: true } : null;
}

const percent = (share) => `${formatDecimal(share * 100)}%`;

// The Stół rozbiórki part of a bag item's card: the parts that taking it
// apart gives and how long it takes, or that the table is still to be built.
// The patterns items taken apart teach, by where they are used, each name
// once: [["w Warsztacie", ["Pałasz"]], ["w Szlifierni", ["Sygnet", "Otoczak"]]].
function patternsByPlace(patterns) {
  const places = new Map();
  for (const { name, at } of patterns) {
    const names = places.get(at) ?? [];
    if (!names.includes(name)) names.push(name);
    places.set(at, names);
  }
  return [...places];
}

// The gem and the ore jewellery gives at once for Jubilerstwo when taken
// apart (salvage.minerals), as words: "Złoty kruszec ×8, Ametyst ×1".
const mineralsLine = (minerals) => (minerals ?? []).map((one) => `${one.name} ×${formatNumber(one.count)}`).join(', ');

function salvageSection(item, busy) {
  const { salvage } = item;
  if (!salvage) return null;
  const { crafting, camp } = state.character;
  const table = camp.buildings.find((building) => building.crafts);
  const built = crafting.pace > 0;
  // A rarity above what the table takes yet: the level it needs.
  const needs = salvage.needs;
  const full = crafting.queue.length >= crafting.limit;
  const takeApart = async (event) => {
    const button = event.currentTarget;
    const sure = await confirmAction({
      title: t('Rozebrać przedmiot?'),
      text: [
        t('{item} zniknie, a stół zrobi z niego: {part} ×{count}, w {time}.', {
          item: itemTitle(item),
          part: salvage.part,
          count: salvage.parts,
          time: formatMinutes(salvage.minutes),
        }),
        salvage.minerals && t('Od razu dostaniesz do Jubilerstwa: {minerals}.', { minerals: mineralsLine(salvage.minerals) }),
        salvage.pattern && t('System odsłoni Ci wzór {at}: {pattern}.', { at: salvage.patternAt, pattern: salvage.pattern }),
        item.gem && t('Kamień w nim przepadnie: {gem}.', { gem: item.gem.name }),
      ]
        .filter(Boolean)
        .join(' '),
      confirmLabel: t('Rozbierz'),
    });
    if (!sure) return;
    await withButton(button, async () => {
      const { salvage: order } = await call('POST', `/api/items/${item.id}/salvage`);
      closeSheet();
      playSound('build');
      toast(
        [
          t('Na stole: {item}. {part} ×{count} będą gotowe o {time}.', { item: order.name, part: order.part, count: order.parts, time: timeFormat.format(new Date(order.endsAt)) }),
          order.minerals && t('Do Jubilerstwa: {minerals}.', { minerals: mineralsLine(order.minerals) }),
          order.pattern && t('Nowy wzór {at}: {pattern}.', { at: order.patternAt, pattern: order.pattern }),
        ]
          .filter(Boolean)
          .join(' '),
      );
    });
  };
  return h(
    'div',
    { class: 'compare' },
    h('p', { class: 'compare-title', text: table?.name ?? t('Stół rozbiórki') }),
    h(
      'p',
      { class: 'anvil-step' },
      `${t('Rozbiórka:')} `,
      h('span', { class: 'item-name', vars: { '--rarity': salvage.color }, text: `${salvage.part} ×${salvage.parts}` }),
      salvage.minutes !== null ? ` · ${formatMinutes(salvage.minutes)}` : '',
    ),
    salvage.minerals && h('p', { class: 'anvil-step', text: t('Do Jubilerstwa od razu: {minerals}', { minerals: mineralsLine(salvage.minerals) }) }),
    !built && h('p', { class: 'muted', text: t('Zbuduj w obozie Stół rozbiórki, żeby rozbierać przedmioty na części.') }),
    needs && h('p', { class: 'muted', text: t('Ta rzadkość wymaga Stołu rozbiórki na poziomie {level}.', { level: needs }) }),
    salvage.pattern && h('p', { class: 'system-hint', text: t('Rozbiórka odsłoni wzór {at}: {pattern}.', { at: salvage.patternAt, pattern: salvage.pattern }) }),
    built && !needs && full && h('p', { class: 'muted', text: t('Kolejka stołu jest pełna. Poczekaj, aż skończy się pierwsze zlecenie.') }),
    h('button', { type: 'button', class: 'button button--world', disabled: busy || !built || Boolean(needs) || full, onClick: takeApart, text: t('Rozbierz') }),
  );
}

// "Rozbierz kilka" (the author: "zaznaczać które chcemy (i możemy)
// przedmioty i dać do rozbiórki"): the bag's items in a grid, a tap marks
// one, and one call takes the marked ones apart. Items of a rarity the Stół
// rozbiórki does not take yet stay dim. Each kind of part takes one place in
// the table's queue; the parts and the time are as one by one. In a sheet
// from the bag, or `inline` on the table's own screen (the author:
// "rozbieranie przedmiotów dostepne tez z pozycji stolu rozbiorki"); `back`
// shows the sheet again after the question "Rozebrać?" was turned down,
// with the marks still there. Returns the picker's nodes and the update of
// its sum, to call once they are in place.
export function salvagePicker(marked, { inline = false, back = null } = {}) {
  const { crafting } = state.character;
  const bag = state.character.bag.filter((item) => item.salvage);
  const takes = (item) => item.salvage.minutes !== null;
  const room = Math.max(0, crafting.limit - crafting.queue.length);
  const chosen = () => bag.filter((item) => marked.has(item.id));
  // The parts the items make, by kind: [name, { color, count }].
  const partsOf = (items) => {
    const parts = new Map();
    for (const { salvage } of items) parts.set(salvage.part, { color: salvage.color, count: (parts.get(salvage.part)?.count ?? 0) + salvage.parts });
    return [...parts];
  };
  const minutesOf = (items) => items.reduce((sum, item) => sum + item.salvage.minutes, 0);
  // Jewellery's gem and ore, added up by mineral.
  const mineralsOf = (items) => {
    const minerals = new Map();
    for (const { salvage } of items) for (const one of salvage.minerals ?? []) minerals.set(one.id, { ...one, count: (minerals.get(one.id)?.count ?? 0) + one.count });
    return [...minerals.values()];
  };
  const summary = h('p', { class: 'sheet-text', role: 'status' });
  const roomNote = h('p', { class: 'region-warning', hidden: true });
  const takeApart = h('button', { type: 'button', class: 'button button--world', onClick: (event) => go(event.currentTarget) });
  const update = () => {
    const items = chosen();
    const parts = partsOf(items);
    fill(
      summary,
      items.length === 0
        ? t('Nic jeszcze nie zaznaczono.')
        : [
            `${t('Zaznaczone: {count}. Stół zrobi z nich:', { count: formatNumber(items.length) })} `,
            parts.map(([part, { color, count }], index) => [
              index > 0 && ', ',
              h('span', { class: 'item-name', vars: { '--rarity': color }, text: `${part} ×${formatNumber(count)}` }),
            ]),
            t(', w {time}.', { time: formatMinutes(minutesOf(items)) }),
            mineralsOf(items).length > 0 && ` ${t('Do Jubilerstwa od razu: {minerals}.', { minerals: mineralsLine(mineralsOf(items)) })}`,
          ],
    );
    const tooMany = parts.length > room;
    roomNote.hidden = !tooMany;
    roomNote.textContent =
      room === 0
        ? t('Kolejka stołu jest pełna. Poczekaj, aż skończy się pierwsze zlecenie.')
        : t('Każda rzadkość części to osobne zlecenie stołu. Zaznaczone potrzebują ich: {count}, a wolne miejsca w kolejce: {room}.', { count: parts.length, room });
    takeApart.textContent = items.length > 0 ? t('Rozbierz ({count})', { count: formatNumber(items.length) }) : t('Rozbierz');
    takeApart.disabled = items.length === 0 || tooMany;
  };
  const tile = (item) => {
    const button = h(
      'button',
      {
        type: 'button',
        class: 'slot slot--bag salvage-pick',
        vars: { '--rarity': item.color },
        disabled: !takes(item),
        'aria-pressed': String(marked.has(item.id)),
        'aria-label': [
          itemTitle(item),
          item.rarityName,
          item.slotName,
          t('poziom {level}', { level: item.level }),
          t('daje: {what}', { what: `${item.salvage.part} ×${item.salvage.parts}${item.salvage.minerals ? `, ${mineralsLine(item.salvage.minerals)}` : ''}` }),
        ].join(', '),
        onClick: () => {
          if (marked.has(item.id)) marked.delete(item.id);
          else marked.add(item.id);
          button.setAttribute('aria-pressed', String(marked.has(item.id)));
          update();
        },
      },
      itemSprite(item) ?? icon(itemIcon(item), { size: 24 }),
      verdictMark(item.verdict, { tile: true }),
      upgradeBadge(item),
      h('span', { class: 'salvage-check', 'aria-hidden': 'true' }, icon('check', { size: 14 })),
    );
    return h('li', {}, button);
  };
  const go = async (button) => {
    const items = chosen();
    const upgraded = items.filter((item) => item.upgrade > 0).length;
    const gems = items.filter((item) => item.gem).length;
    const patterns = patternsByPlace(items.filter((item) => item.salvage.pattern).map((item) => ({ name: item.salvage.pattern, at: item.salvage.patternAt })));
    const sure = await confirmAction({
      title: t('Rozebrać przedmioty?'),
      text: [
        t('{items} {vanish} z plecaka, a stół zrobi z nich: {parts}, w {time}.', {
          items: countOf(items.length, 'przedmiot', 'przedmioty', 'przedmiotów'),
          vanish: plural(items.length, 'zniknie', 'znikną', 'zniknie'),
          parts: partsOf(items)
            .map(([part, { count }]) => `${part} ×${formatNumber(count)}`)
            .join(', '),
          time: formatMinutes(minutesOf(items)),
        }),
        mineralsOf(items).length > 0 && t('Od razu dostaniesz do Jubilerstwa: {minerals}.', { minerals: mineralsLine(mineralsOf(items)) }),
        upgraded > 0 && t('Ulepszone wśród nich: {count}.', { count: formatNumber(upgraded) }),
        gems > 0 && t('Z kamieniem wśród nich: {count}.', { count: formatNumber(gems) }),
        ...patterns.map(([at, names]) => t('System odsłoni Ci {patterns} {at}: {names}.', { patterns: plural(names.length, 'wzór', 'wzory', 'wzory'), at, names: names.join(', ') })),
      ]
        .filter(Boolean)
        .join(' '),
      confirmLabel: t('Rozbierz'),
    });
    if (!sure) {
      back?.();
      return;
    }
    await withButton(button, async () => {
      // The marks go with the items, back if the table turns them down.
      marked.clear();
      let salvaged;
      try {
        ({ salvaged } = await call('POST', '/api/items/salvage', { ids: items.map((item) => item.id) }));
      } catch (error) {
        for (const item of items) marked.add(item.id);
        throw error;
      }
      playSound('build');
      const ready = Math.max(...salvaged.orders.map((order) => order.endsAt));
      toast(
        [
          t('Na stole: {items}. {parts} będą gotowe o {time}.', {
            items: countOf(salvaged.count, 'przedmiot', 'przedmioty', 'przedmiotów'),
            parts: salvaged.orders.map((order) => `${order.part} ×${formatNumber(order.parts)}`).join(', '),
            time: timeFormat.format(new Date(ready)),
          }),
          salvaged.minerals && t('Do Jubilerstwa: {minerals}.', { minerals: mineralsLine(salvaged.minerals) }),
          ...patternsByPlace(salvaged.patterns).map(([at, names]) => `${plural(names.length, 'Nowy wzór', 'Nowe wzory', 'Nowe wzory')} ${at}: ${names.join(', ')}.`),
        ]
          .filter(Boolean)
          .join(' '),
      );
    });
  };
  const dim = bag.some((item) => !takes(item));
  return {
    nodes: [
      h('ul', { class: 'bag-grid salvage-grid' }, bag.map(tile)),
      dim && h('p', { class: 'muted', text: t('Przyciemnionych stół jeszcze nie bierze: ich rzadkość wymaga wyższego poziomu Stołu rozbiórki.') }),
      h('div', { class: `salvage-bar${inline ? ' salvage-bar--inline' : ''}` }, summary, roomNote, takeApart),
    ],
    update,
  };
}

// "Rozbierz kilka" in a sheet from the bag.
function salvageManySheet(marked = new Set()) {
  const picker = salvagePicker(marked, { back: () => salvageManySheet(marked) });
  openSheet(
    h('h2', { class: 'sheet-title', text: t('Rozbierz kilka') }),
    h('p', { class: 'sheet-text', text: t('Wybierz przedmioty, które Stół rozbiórki ma rozebrać. Ponowny wybór odznacza przedmiot.') }),
    ...picker.nodes,
  );
  picker.update();
}

// The card of a character's item after an upgrade: open again with the
// Kowadło unfolded, or closed when the item broke.
function reopenOwned(done) {
  const owned = ownedItem(done.itemId);
  if (owned) itemSheet(owned.item, { equipped: owned.equipped, anvil: true });
  else closeSheet();
}

// The Kowadło part of the item card: the next upgrade with its price, chance
// and risk, or why there is none, and where the item may break, a Zwój
// ochronny from the Warsztat to put on the Kowadło. The server rolls the
// outcome. Folded behind "Ulepsz" until `open` (the author: "Kowadło
// powinno się rozwijać przyciskiem "Ulepsz" i dopiero wtedy pelny opis").
// The character pays from its own stock. `send` makes the try with the
// player's choices and gives the server's answer, and `reopen` shows the
// card after it: by default those of the character's own item; a
// companion's item has its own (companions.js).
export function anvilSection(item, busy, open = false, { send = (choices) => call('POST', `/api/items/${item.id}/upgrade`, choices), reopen = reopenOwned } = {}) {
  const anvil = item.anvil;
  if (!anvil) return null;
  const title = h('p', { class: 'compare-title', text: t('Kowadło') });
  if (anvil.level >= anvil.max) {
    return h('div', { class: 'compare' }, title, h('p', { class: 'muted', text: t('Przedmiot ma najwyższe ulepszenie: +{max}.', { max: anvil.max }) }));
  }
  const { next } = anvil;
  if (!next) {
    const hint =
      anvil.cap === 0
        ? t('Zbuduj Kowadło w obozie, żeby ulepszać przedmioty.')
        : t('Kowadło na poziomie {level} ulepsza do +{level}. Rozbuduj je w obozie, żeby iść wyżej.', { level: anvil.cap });
    return h('div', { class: 'compare' }, title, h('p', { class: 'system-hint', text: hint }), h('a', { class: 'link-button', href: '#/oboz/anvil', onClick: closeSheet, text: t('Przejdź do Kowadła') }));
  }
  const have = Object.fromEntries(walletEntries().map((entry) => [entry.id, entry]));
  const short = Object.entries(next.cost).some(([resource, amount]) => (have[resource]?.amount ?? 0) < amount);
  // From +5 on materials of the item's rarity too (proposal 4: "Wyższe
  // ulepszenia biorą też materiał rzadkości przedmiotu"), any of them added
  // up (481 B): the pieces held in all (`have`) and those the server takes,
  // the most plentiful material first (`takes`, null while too few).
  const need = next.materials;
  const lacks = Boolean(need && !need.takes);
  const missing = short || lacks;
  const rarityName = need ? (state.content.rarities.find((rarity) => rarity.id === need.rarity)?.name ?? need.rarity) : '';
  const paid = need ? t('złoto, rudę i materiały') : t('złoto i rudę');
  const risk =
    anvil.level === 0
      ? t('Porażka zabiera tylko {paid}.', { paid })
      : next.breakChance > 0
        ? t('Porażka zabiera {paid}, a przedmiot spada do +{level}. Z szansą {chance} przedmiot rozpada się.', { paid, level: anvil.level - 1, chance: percent(next.breakChance) })
        : t('Porażka zabiera {paid}, a przedmiot spada do +{level}.', { paid, level: anvil.level - 1 });
  const materialLine =
    need &&
    h(
      'li',
      { class: `cost${lacks ? ' cost--missing' : ''}` },
      lacks ? icon('unknown', { size: 16 }) : materialIcon(need.takes[0].materialId, 16),
      h('span', { text: t('Materiały ({rarity})', { rarity: rarityName }) }),
      h('strong', { text: `${formatNumber(need.have)} / ${formatNumber(need.count)}` }),
    );
  // The Zwój ochronny only where the item may break, and the Zwój
  // utrwalenia only where a failure would take a level (the author's of
  // 4.11.2026); the boxes start empty, so a scroll goes only when the player
  // says so.
  const scrolls = state.character.scrolls ?? 0;
  const ward =
    next.breakChance > 0 && scrolls > 0 ? h('input', { type: 'checkbox', class: 'avoid-rare-box', id: `ward-${item.id}`, 'aria-describedby': `ward-note-${item.id}` }) : null;
  const steadyScrolls = state.character.steadyScrolls ?? 0;
  const steady =
    anvil.level > 0 && steadyScrolls > 0 ? h('input', { type: 'checkbox', class: 'avoid-rare-box', id: `steady-${item.id}`, 'aria-describedby': `steady-note-${item.id}` }) : null;
  const failed = (done) => {
    const vars = { name: done.name, level: done.to };
    if (done.saved && done.kept) return t('Nie udało się, ale zwoje uchroniły przedmiot: {name} zostaje na +{level}.', vars);
    if (done.saved) return t('Nie udało się: {name} spada do +{level}. Zwój ochronny uchronił przedmiot przed rozpadem.', vars);
    if (done.kept) return t('Nie udało się, ale Zwój utrwalenia utrzymał {name} na +{level}.', vars);
    return done.to < done.from ? t('Nie udało się: {name} spada do +{level}.', vars) : t('Nie udało się: {name} zostaje na +0.', vars);
  };
  const upgrade = (event) =>
    withButton(event.currentTarget, async () => {
      const answer = await send({ ward: Boolean(ward?.checked), steady: Boolean(steady?.checked) });
      const done = answer.upgrade;
      if (done.result === 'success') {
        playSound('done');
        toast(t('Udało się: {name} +{level}.', { name: done.name, level: done.to }));
      } else {
        playSound('defeat');
        toast(done.result === 'broken' ? t('Przedmiot rozpadł się na kowadle: {name} +{level}.', { name: done.name, level: done.from }) : failed(done));
      }
      reopen(done, answer);
    });
  // Where a scroll comes from: the Systemowy Warsztat (from the level of the
  // profession the scroll opens at), and the smith in the Osada's Kuźnia
  // (326 A).
  const where = (does, scroll) => {
    const workshop = scroll?.hidden ? t('w Systemowym Warsztacie od {level}. poziomu Rzemieślnictwa', { level: scroll.level }) : t('w Systemowym Warsztacie');
    return `${does} ${
      !state.character.settlementOpen
        ? t('Zrobisz go {where}.', { where: workshop })
        : state.character.professions?.workshop
          ? t('Zrobisz go {where} albo kupisz u kowala w Kuźni w Osadzie.', { where: workshop })
          : t('Kupisz go u kowala w Kuźni w Osadzie.')
    }`;
  };
  const canGet = Boolean(state.character.professions?.workshop || state.character.settlementOpen);
  const step = h('p', { class: 'anvil-step', tabindex: '-1', text: t('Ulepszenie +{from} → +{to}', { from: anvil.level, to: next.level }) });
  const full = h(
    'div',
    { class: 'compare anvil' },
    title,
    step,
    h('ul', { class: 'preview-list' }, next.properties.map((line) => h('li', { class: 'preview-up', text: line }))),
    h('p', { class: 'anvil-chance', text: t('Szansa powodzenia: {chance}', { chance: percent(next.chance) }) }),
    h(
      'ul',
      { class: 'cost-list', 'aria-label': t('Koszt ulepszenia') },
      Object.entries(next.cost).map(([resource, amount]) =>
        h(
          'li',
          { class: `cost${(have[resource]?.amount ?? 0) < amount ? ' cost--missing' : ''}` },
          resourceArt(resource, 16),
          h('span', { text: have[resource]?.name ?? resource }),
          h('strong', { text: `${formatNumber(have[resource]?.amount ?? 0)} / ${formatNumber(amount)}` }),
        ),
      ),
      materialLine,
    ),
    // Which pieces go: the server's pick (481 B).
    need && !lacks && h('p', { class: 'muted', text: t('Ulepszenie weźmie: {pieces}.', { pieces: piecesText(need.takes) }) }),
    lacks && h('p', { class: 'system-hint', text: t('To ulepszenie bierze też {count} szt. materiałów tej samej rzadkości co przedmiot (dowolnych, sumują się).', { count: formatNumber(need.count) }) }),
    // A material of the item's rarity, from the guild (346 A): what is
    // missing in all, of whichever material is asked for.
    lacks && askGuildButton({ kind: 'material', rarity: need.rarity, missing: need.count - need.have }),
    h('p', { class: 'muted', text: risk }),
    ward &&
      h(
        'label',
        { class: 'avoid-rare', for: `ward-${item.id}` },
        ward,
        scrollArt('ward-scroll', 24),
        h('span', { text: t('Użyj Zwoju ochronnego (masz {count})', { count: formatNumber(scrolls) }) }),
      ),
    ward && h('p', { class: 'muted', id: `ward-note-${item.id}`, text: t('Zwój chroni przed rozpadem, ale nie przed spadkiem ulepszenia. Przepada przy tej próbie.') }),
    steady &&
      h(
        'label',
        { class: 'avoid-rare', for: `steady-${item.id}` },
        steady,
        scrollArt('steady-scroll', 24),
        h('span', { text: t('Użyj Zwoju utrwalenia (masz {count})', { count: formatNumber(steadyScrolls) }) }),
      ),
    steady && h('p', { class: 'muted', id: `steady-note-${item.id}`, text: t('Po nieudanej próbie przedmiot zostaje na swoim poziomie. Zwój przepada przy tej próbie.') }),
    next.breakChance > 0 && !ward && canGet && h('p', { class: 'system-hint', text: where(t('Zwój ochronny chroni przed rozpadem na Kowadle.'), state.character.professions?.workshop?.scroll) }),
    anvil.level > 0 &&
      !steady &&
      canGet &&
      h('p', { class: 'system-hint', text: where(t('Zwój utrwalenia chroni przed spadkiem ulepszenia na Kowadle.'), state.character.professions?.workshop?.steadyScroll) }),
    h('button', {
      type: 'button',
      class: 'button button--system',
      disabled: busy || missing,
      onClick: upgrade,
      text: short ? t('Brakuje: {what}', { what: costShortfall(next.cost).join(', ') }) : missing ? t('Brakuje materiału') : t('Ulepsz do +{level}', { level: next.level }),
    }),
  );
  if (open) return full;
  // What the try lacks, said under "Ulepsz" instead of unfolding (the author:
  // "Niech Ulepsz jeśli chodzi o przedmiot nie otwiera się tylko pokazuje
  // czego brakuje jeśli nie da się ulepszyć").
  const lacking = [
    ...costShortfall(next.cost),
    lacks && t('{count} szt. materiałów ({rarity}): to ulepszenie bierze {need} szt.', { count: formatNumber(need.count - need.have), rarity: rarityName, need: formatNumber(need.count) }),
  ].filter(Boolean);
  const note = h('p', { class: 'region-warning', role: 'status', hidden: true });
  // The materials the try lacks, from the guild (346 A), under what is
  // missing once "Ulepsz" says it.
  const ask = lacks ? askGuildButton({ kind: 'material', rarity: need.rarity, missing: need.count - need.have }) : null;
  if (ask) ask.hidden = true;
  const folded = h(
    'div',
    { class: 'compare anvil' },
    h('p', { class: 'compare-title', text: t('Kowadło') }),
    h('button', {
      type: 'button',
      class: 'button button--world',
      'aria-expanded': 'false',
      text: t('Ulepsz'),
      onClick: () => {
        if (lacking.length > 0) {
          // One full stop, also after "szt.".
          const said = lacking.join(', ');
          note.textContent = `${t('Brakuje: {what}', { what: said })}${said.endsWith('.') ? '' : '.'}`;
          note.hidden = false;
          if (ask) ask.hidden = false;
          return;
        }
        folded.replaceWith(full);
        step.focus({ preventScroll: true });
      },
    }),
    note,
    ask,
  );
  return folded;
}


// The combat values an item changes, named as on the stats screen, with
// their units; a resistance ("resist.fire") is named by its element.
const CHANGES = {
  damage: ['Średnie obrażenia', ''],
  reduction: ['Redukcja obrażeń', '%'],
  maxHp: ['Maks. HP', ''],
  dodge: ['Unik', '%'],
  crit: ['Trafienie krytyczne', '%'],
  effectResist: ['Odporność na efekty', '%'],
  speed: ['Szybkość', ''],
  mana: ['Maks. mana', ''],
  regen: ['Regeneracja', ' HP/min'],
  recovery: ['Odzysk HP po walce', '%'],
};
const changeName = (key) => (CHANGES[key] ? [t(CHANGES[key][0]), CHANGES[key][1]] : [state.content.elements.find((element) => `resist.${element.id}` === key)?.resistance ?? key, '%']);

// What wearing (or taking off) the item changes, counted by the server: the
// verdict on the whole, then each change, as the author asked: "+2,5", "−4",
// "+1%".
async function showPreview(box, item, equipped) {
  try {
    const { changes, verdict } = await call('GET', `/api/items/${item.id}/preview`);
    const rows = Object.entries(changes);
    fill(
      box,
      h('p', { class: 'compare-title', text: equipped ? t('Po zdjęciu') : t('Po założeniu') }),
      h('p', { class: `verdict verdict-line verdict--${verdict}`, text: t(VERDICTS[verdict].line) }),
      rows.length > 0 &&
        h(
          'ul',
          { class: 'preview-list' },
          rows.map(([key, change]) => {
            const [label, unit] = changeName(key);
            return h(
              'li',
              { class: change > 0 ? 'preview-up' : 'preview-down' },
              h('span', { text: label }),
              h('span', { class: 'num', text: `${change > 0 ? '+' : '−'}${formatPrecise(Math.abs(change))}${unit}` }),
            );
          }),
        ),
    );
  } catch {
    fill(box);
  }
}

export function itemSummary(item, { stats = false } = {}) {
  const text = h(
    'span',
    { class: 'item-summary' },
    h('span', { class: 'item-name', vars: { '--rarity': item.color }, text: itemTitle(item) }),
    h('span', { class: 'item-meta', text: `${item.rarityName} · ${item.slotName} · ${t('poz. {level}', { level: item.level })}` }),
    // With `stats`, its numbers in one line too, to tell items of one name apart.
    stats && item.properties?.length > 0 && h('span', { class: 'item-stats', text: item.properties.join(' · ') }),
  );
  const art = itemSprite(item);
  return art ? h('span', { class: 'item-summary-art' }, art, text) : text;
}

export function itemDetails(item, { small = false } = {}) {
  const title = h(small ? 'p' : 'h2', { class: 'item-title', vars: { '--rarity': item.color }, text: itemTitle(item) });
  const meta = h('p', { class: 'item-meta', text: [item.rarityName, item.slotName, t('poz. {level}', { level: item.level }), item.tier].filter(Boolean).join(' · ') });
  // The card of an item shows its sprite large, on a frame in its rarity colour.
  const art = !small && itemSprite(item);
  return h(
    'div',
    { class: `item-details${small ? ' item-details--small' : ''}` },
    art ? h('div', { class: 'item-head' }, h('span', { class: 'item-art', vars: { '--rarity': item.color } }, art), h('div', {}, title, meta)) : [title, meta],
    h(
      'ul',
      { class: 'item-properties' },
      item.properties.map((line) => h('li', { text: line })),
      // The gem set in it in Jubilerstwo, which the values above include; a
      // tap on its line folds out what it means (gemView in items.js).
      item.gem &&
        h(
          'li',
          { class: 'item-gem' },
          h(
            'details',
            { class: 'item-gem-fold' },
            h('summary', { class: 'item-gem-line', vars: { '--rarity': item.gem.color } }, mineralSprite(item.gem.id), ` ${item.gem.line}`),
            h('p', { class: 'item-gem-help', text: item.gem.help }),
          ),
        ),
      item.classNames && h('li', { class: 'item-classes', text: t(item.classNames.length > 1 ? 'Dla klas: {classes}' : 'Dla klasy: {classes}', { classes: item.classNames.join(', ') }) }),
      item.classLevel && h('li', { class: 'item-classes', text: t('Od poziomu klasy {level}', { level: item.classLevel }) }),
      item.price !== undefined && h('li', { class: 'item-price', text: t('U złomiarza: {gold} złota', { gold: formatNumber(item.price) }) }),
    ),
  );
}

// The small card of an item under the mouse on a computer (item-tip.js,
// 477 A): its name, kind and properties, and what wearing it changes.
setTipRenderer((item) =>
  h(
    'div',
    {},
    itemDetails(item, { small: true }),
    VERDICTS[item.verdict] && h('p', { class: `item-tip-verdict item-tip-verdict--${item.verdict}`, text: t(VERDICTS[item.verdict].line) }),
  ),
);

// The System's words over the bag, with the way to where they point.
function characterMessage(character, busy) {
  if (busy) return [busyText(character)];
  if (character.freePoints > 0 && isUnlocked('stats')) {
    return [
      t('Masz {count} {points} statystyk. Rozdziel je w Statystykach.', {
        count: formatNumber(character.freePoints),
        points: plural(character.freePoints, 'wolny punkt', 'wolne punkty', 'wolnych punktów'),
      }),
      systemLink('#/postac/statystyki', t('Rozdziel punkty')),
    ];
  }
  return [
    t('Doświadczenie: {xp} / {max}. Do poziomu {level} zostało ok. {time} eksploracji.', {
      xp: formatNumber(character.xp),
      max: formatNumber(character.xpToNext),
      level: character.level + 1,
      time: formatHours(character.hoursToNext),
    }),
  ];
}
