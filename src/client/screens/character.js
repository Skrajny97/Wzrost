// The character screen: a 3:4 portrait with five equipment slots on each side,
// an eye that hides the slots, and the bag with items that are not worn.
// The item card also upgrades the item on the camp's Kowadło and takes a bag
// item apart on the Stół rozbiórki.

import { herbSprite, itemSprite, materialSprite, portraitSprite, potionSprite, resourceArt } from '../art.js';
import { MATERIALS_HINT, materialIcon } from '../craft-table.js';
import { fill, h, icon } from '../dom.js';
import { formatDecimal, formatHours, formatMinutes, formatNumber, formatPrecise, plural, timeFormat } from '../format.js';
import { SLOT_ICONS, itemIcon } from '../icons.js';
import { portrait } from '../portraits.js';
import { playSound } from '../sound.js';
import { call, isUnlocked, state, unlockInfo, walletEntries } from '../state.js';
import { closeSheet, confirmAction, openSheet, pageHeading, systemPanel, toast, withButton } from '../ui.js';

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
    : h('span', { class: `verdict verdict--${verdict}`, text: VERDICTS[verdict].text });
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

// "Rzadka skóra wilka" for a stack above its species' rarity.
const materialTitle = (material) => material.label.charAt(0).toUpperCase() + material.label.slice(1);

// Why the gear cannot change now: the character is away.
const BUSY_TEXTS = {
  herbs: 'Postać zbiera zioła. Plecak i ekwipunek zmienisz po jej powrocie z Zagajnika.',
  potions: 'Postać warzy mikstury. Plecak i ekwipunek zmienisz po jej powrocie z Pracowni.',
  items: 'Postać wykonuje przedmioty. Plecak i ekwipunek zmienisz po jej powrocie z Warsztatu.',
};
const busyText = (character) => BUSY_TEXTS[character.activity?.kind] ?? 'Postać jest na wyprawie. Ekwipunek zmienisz po jej powrocie.';

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

export function mountCharacter(container) {
  function render() {
    const character = state.character;
    const busy = Boolean(character.activity);
    const slots = state.content.slots;

    const frame = h('div', { class: `portrait${gearHidden ? ' portrait--bare' : ''}` });
    const eye = h(
      'button',
      {
        type: 'button',
        class: 'eye-toggle',
        'aria-pressed': gearHidden,
        'aria-label': gearHidden ? 'Pokaż ekwipunek' : 'Ukryj ekwipunek',
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
    // The forest, and over it the class's figure in the character's look.
    const figure = portraitSprite(character.classId, character.appearance, { skin: character.skin });
    const art = figure ? [portrait(character.classId, { figure: false }), figure] : [portrait(character.classId)];
    frame.append(h('div', { class: 'portrait-art' }, art), column('left'), column('right'), eye);

    fill(container,
      pageHeading(character.name, `${character.className} · ${POSITION_NAMES[character.position]} · solo`),
      h('div', { class: 'portrait-wrap' }, frame),
      systemPanel(characterMessage(character, busy)),
      bagSection(character.bag),
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
          'aria-label': `${slot.name}: zablokowany`,
          onClick: () =>
            openSheet(
              h('h2', { class: 'sheet-title', text: slot.name }),
              systemPanel(`${core.name} odblokuje się ${core.condition}.`),
            ),
        },
        icon('core', { size: 24 }),
      );
    }
    if (!item) {
      return h(
        'button',
        { type: 'button', class: 'slot slot--empty', 'data-guide': `slot-${slot.id}`, 'aria-label': `${slot.name}: pusty slot`, onClick: () => emptySlotSheet(slot) },
        icon(SLOT_ICONS[slot.id], { size: 24 }),
      );
    }
    return h(
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
    const grids = { items: () => itemsGrid(bag), materials: () => materialsGrid(materials), parts: () => partsGrid(parts) };
    return h(
      'section',
      { class: 'bag', 'aria-labelledby': 'bag-title' },
      h('h2', { class: 'section-title', id: 'bag-title' }, 'Plecak ', count),
      h(
        'div',
        { class: 'segmented bag-tabs', role: 'group', 'aria-label': 'Zawartość plecaka' },
        tab('items', 'Przedmioty'),
        tab('materials', stacked > 0 ? `Materiały (${formatNumber(stacked)})` : 'Materiały'),
        tab('parts', partCount > 0 ? `Części (${formatNumber(partCount)})` : 'Części'),
      ),
      (grids[bagTab] ?? grids.items)(),
    );
  }

  // The parts for the Warsztat, a slot for each, outside the bag's room too.
  function partsGrid(parts) {
    if (parts.length === 0) return h('p', { class: 'muted', text: 'Nie masz jeszcze części. Stół rozbiórki robi je z materiałów i rozebranych przedmiotów.' });
    return [
      h('p', { class: 'bag-note', text: 'Części nie zajmują miejsca w plecaku.' }),
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
                'aria-label': `${part.name}, ${formatNumber(part.count)} szt.`,
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
    const meta = h('p', { class: 'item-meta', text: `${formatNumber(part.count)} szt.` });
    const workshop = state.character.professions?.workshop;
    openSheet(
      h(
        'div',
        { class: 'item-details' },
        art ? h('div', { class: 'item-head' }, h('span', { class: 'item-art', vars: { '--rarity': part.color } }, art), h('div', {}, title, meta)) : [title, meta],
        part.description && h('p', { class: 'sheet-text', text: part.description }),
        h('p', { class: 'sheet-text', text: 'Z części Warsztat wykonuje przedmioty, a przy wymianie 10 części daje 1 część rzadszą.' }),
      ),
      workshop && h('a', { class: 'button button--world', href: '#/profesje/rzemieslnictwo', onClick: closeSheet, text: 'Do Warsztatu' }),
    );
  }

  // The materials from beaten creatures, a slot for each stack, outside the bag's room.
  function materialsGrid(materials) {
    if (materials.length === 0) return h('p', { class: 'muted', text: MATERIALS_HINT });
    return [
      h('p', { class: 'bag-note', text: 'Materiały nie zajmują miejsca w plecaku.' }),
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

  function materialSheet(material) {
    const description = state.content.materials?.find((candidate) => candidate.id === material.materialId)?.description;
    const table = state.character.camp.buildings.find((building) => building.crafts);
    const art = materialSprite(material.materialId);
    const title = h('h2', { class: 'item-title', vars: { '--rarity': material.color }, text: materialTitle(material) });
    const meta = h('p', { class: 'item-meta', text: `${material.rarityName} · ${formatNumber(material.count)} szt.` });
    openSheet(
      h(
        'div',
        { class: 'item-details' },
        art ? h('div', { class: 'item-head' }, h('span', { class: 'item-art', vars: { '--rarity': material.color } }, art), h('div', {}, title, meta)) : [title, meta],
        description && h('p', { class: 'sheet-text', text: description }),
        h('p', { class: 'sheet-text', text: `Stół rozbiórki zrobi z tego: ${material.part} ×${formatNumber(material.count)}.` }),
      ),
      table && h('a', { class: 'button button--world', href: `#/oboz/${table.id}`, onClick: closeSheet, text: table.level > 0 ? 'Do Stołu rozbiórki' : 'Zbuduj Stół rozbiórki w obozie' }),
    );
  }

  function itemsGrid(bag) {
    const stacked = Object.keys(STACKS).flatMap((kind) => (state.character[kind] ?? []).map((entry) => ({ kind, entry })));
    if (bag.length === 0 && stacked.length === 0) return h('p', { class: 'muted', text: 'Plecak jest pusty. Łupy z wypraw trafiają tutaj.' });
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
                'aria-label': `${entry.name}, ${formatNumber(count)} szt.`,
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
          h(
            'button',
            {
              type: 'button',
              class: 'slot slot--bag',
              vars: { '--rarity': item.color },
              'aria-label': [itemTitle(item), item.rarityName, item.slotName, `poziom ${item.level}`, verdictMark(item.verdict) && VERDICTS[item.verdict].text]
                .filter(Boolean)
                .join(', '),
              onClick: () => itemSheet(item, { equipped: false }),
            },
            itemSprite(item) ?? icon(itemIcon(item), { size: 24 }),
            verdictMark(item.verdict, { tile: true }),
            upgradeBadge(item),
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
    const busy = Boolean(character.activity);
    let count = 1;
    const price = (amount) => Math.max(1, Math.round(entry.price * amount));
    const value = h('output', { class: 'herb-count-value' });
    const sell = h('button', { type: 'button', class: 'button button--system', disabled: busy });
    const less = h('button', { type: 'button', class: 'button button--world duration-step', 'aria-label': 'Mniej', text: '−', onClick: () => set(count - 1) });
    const more = h('button', { type: 'button', class: 'button button--world duration-step', 'aria-label': 'Więcej', text: '+', onClick: () => set(count + 1) });
    const all = h('button', { type: 'button', class: 'link-button', text: 'wszystkie', onClick: () => set(entry.count) });
    function set(next) {
      count = Math.min(entry.count, Math.max(1, next));
      value.textContent = `${formatNumber(count)} szt.`;
      sell.textContent = `Sprzedaj za ${formatNumber(price(count))} złota`;
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
      toast(`Złomiarz kupił ${formatNumber(sold.count)} szt. za ${formatNumber(sold.gold)} złota.`);
    }));
    const discard = async (event) => {
      const button = event.currentTarget;
      const sure = await confirmAction({
        title: discardTitle,
        text: `${entry.name}: ${formatNumber(count)} szt. zniknie na zawsze.`,
        confirmLabel: 'Wyrzuć',
        danger: true,
      });
      if (sure) await act('discard')({ currentTarget: button });
    };
    const art = artOf(entry.id);
    const title = h('h2', { class: 'item-title', text: entry.name });
    const stacks = Math.ceil(entry.count / character.herbStack);
    const meta = h('p', { class: 'item-meta', text: `${formatNumber(entry.count)} szt. · ${stacks} ${plural(stacks, 'miejsce', 'miejsca', 'miejsc')} w plecaku` });
    openSheet(
      h(
        'div',
        { class: 'item-details' },
        art ? h('div', { class: 'item-head' }, h('span', { class: 'item-art' }, art), h('div', {}, title, meta)) : [title, meta],
        h('p', { class: 'sheet-text', text: entry.description }),
        h('p', { class: 'sheet-text', text: `Jedno miejsce mieści ${character.herbStack} szt. Złomiarz płaci ${formatDecimal(entry.price)} złota za sztukę.` }),
      ),
      busy
        ? h('p', { class: 'muted', text: busyText(character) })
        : [
            // A healing potion or a potion for a time is drunk, or the oil put
            // on the blade, one at a time (potions.js); one from a Wymiana
            // waits for its recipe.
            entry.known === false && h('p', { class: 'region-warning', text: 'Tej mikstury nie użyjesz, póki nie poznasz jej receptury w Alchemii.' }),
            entry.drink &&
              entry.known !== false &&
              h('button', {
                type: 'button',
                class: 'button button--system',
                text: entry.verb,
                onClick: (event) =>
                  withButton(event.currentTarget, async () => {
                    const { text } = await call('POST', '/api/potions/drink', { potionId: entry.id });
                    closeSheet();
                    playSound('potion');
                    toast(text);
                  }),
              }),
            h('div', { class: 'herb-count' }, less, value, more, all),
            h('div', { class: 'sheet-actions' }, h('button', { type: 'button', class: 'button button--world', onClick: discard, text: 'Wyrzuć' }), sell),
          ],
    );
  }

  function emptySlotSheet(slot) {
    const fitting = state.character.bag.filter((item) => item.slot === slot.id);
    openSheet(
      h('h2', { class: 'sheet-title', text: slot.name }),
      h('p', { class: 'sheet-text', text: 'Pusty slot.' }),
      fitting.length === 0
        ? h('p', { class: 'muted', text: 'W plecaku nie ma przedmiotu do tego slotu.' })
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
  return { update: render };
}

// An item from the bag or the equipment: its properties, what wearing it
// changes (for an item the class can wear), the item beside the one worn in
// its slot, and the actions.
export function itemSheet(item, { equipped }) {
  const character = state.character;
  const busy = Boolean(character.activity);
  const usable = !item.classIds || item.classIds.includes(character.classId);
  // A later base of its kind waits for its class level (a Metin2-like tier).
  const early = usable && item.classLevel !== null && character.classLevel < item.classLevel;
  // One from a Wymiana is worn from its own level on (inventory.js).
  const traded = !equipped && item.traded && item.level > character.level;
  const worn = equipped ? null : character.equipment[item.slot];
  const act = (path) => async (event) =>
    withButton(event.currentTarget, async () => {
      await call('POST', `/api/items/${item.id}/${path}`);
      closeSheet();
    });

  const discard = async (event) => {
    const button = event.currentTarget;
    const sure = await confirmAction({
      title: 'Wyrzucić przedmiot?',
      text: `${itemTitle(item)} zniknie na zawsze.`,
      confirmLabel: 'Wyrzuć',
      danger: true,
    });
    if (sure) await withButton(button, () => call('POST', `/api/items/${item.id}/discard`));
  };

  // The scrapper buys a bag item from its card, an upgraded one too.
  const sell = async (event) => {
    const button = event.currentTarget;
    const sure = await confirmAction({
      title: 'Sprzedać przedmiot?',
      text: `Złomiarz kupi: ${itemTitle(item)} za ${formatNumber(item.price)} złota.${item.upgrade > 0 ? ' W tej cenie jest też część złota wydanego na ulepszenia.' : ''}`,
      confirmLabel: 'Sprzedaj',
    });
    if (!sure) return;
    await withButton(button, async () => {
      const { sold } = await call('POST', `/api/items/${item.id}/sell`);
      closeSheet();
      toast(`Sprzedano za ${formatNumber(sold.gold)} złota.`);
    });
  };

  const preview = usable && h('div', { class: 'preview', 'aria-live': 'polite' }, h('p', { class: 'muted', text: 'Liczenie zmian…' }));
  openSheet(
    itemDetails(item),
    preview,
    usable && worn && compareTable(item, worn),
    anvilSection(item, busy),
    !equipped && salvageSection(item, busy),
    busy && h('p', { class: 'muted', text: busyText(character) }),
    !usable && h('p', { class: 'region-warning', text: 'Twoja klasa nie może używać tego przedmiotu. Sprzedasz go złomiarzowi.' }),
    early && h('p', { class: 'region-warning', text: `Ten przedmiot założysz od poziomu klasy ${item.classLevel}.` }),
    traded && h('p', { class: 'region-warning', text: `Ten przedmiot z wymiany założysz od poziomu postaci ${item.level}.` }),
    !equipped &&
      item.price !== undefined &&
      h('button', { type: 'button', class: 'button button--world', disabled: busy, onClick: sell, text: `Sprzedaj za ${formatNumber(item.price)} złota` }),
    h(
      'div',
      { class: 'sheet-actions' },
      equipped
        ? h('button', { type: 'button', class: 'button button--world', disabled: busy, onClick: act('unequip'), text: 'Zdejmij' })
        : [
            h('button', { type: 'button', class: 'button button--world', disabled: busy, onClick: discard, text: 'Wyrzuć' }),
            h('button', { type: 'button', class: 'button button--system', disabled: busy || !usable || early || traded, onClick: act('equip'), text: 'Załóż' }),
          ],
    ),
  );
  if (preview) showPreview(preview, item, equipped);
}

// The item beside the one worn in its slot, number by number: the damage of
// a weapon, the armor and each stat, and by how much the item has more or
// less of it (for damage, of its average).
function compareTable(item, worn) {
  const ids = [...new Set([...item.lines, ...worn.lines].map((line) => line.id))];
  const lineOf = (of, id) => of.lines.find((line) => line.id === id);
  return h(
    'div',
    { class: 'compare' },
    h('p', { class: 'compare-title', text: 'Porównanie z założonym' }),
    h(
      'p',
      { class: 'compare-worn' },
      'Założony: ',
      h('span', { class: 'item-name', vars: { '--rarity': worn.color }, text: itemTitle(worn) }),
      ` · ${worn.rarityName} · poz. ${worn.level}`,
    ),
    h(
      'table',
      { class: 'compare-table' },
      h(
        'thead',
        {},
        h('tr', {}, h('th', { scope: 'col' }, h('span', { class: 'visually-hidden', text: 'Wartość' })), ['Ten', 'Założony', 'Różnica'].map((text) => h('th', { scope: 'col', text }))),
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
      title: 'Rozebrać przedmiot?',
      text: `${itemTitle(item)} zniknie, a stół zrobi z niego: ${salvage.part} ×${salvage.parts}, w ${formatMinutes(salvage.minutes)}.${
        salvage.pattern ? ` System odsłoni Ci wzór w Warsztacie: ${salvage.pattern}.` : ''
      }`,
      confirmLabel: 'Rozbierz',
    });
    if (!sure) return;
    await withButton(button, async () => {
      const { salvage: order } = await call('POST', `/api/items/${item.id}/salvage`);
      closeSheet();
      playSound('build');
      toast(
        `Na stole: ${order.name}. ${order.part} ×${order.parts} będą gotowe o ${timeFormat.format(new Date(order.endsAt))}.${
          order.pattern ? ` Nowy wzór w Warsztacie: ${order.pattern}.` : ''
        }`,
      );
    });
  };
  return h(
    'div',
    { class: 'compare' },
    h('p', { class: 'compare-title', text: table?.name ?? 'Stół rozbiórki' }),
    h('p', { class: 'anvil-step' }, 'Rozbiórka: ', h('span', { class: 'item-name', vars: { '--rarity': salvage.color }, text: `${salvage.part} ×${salvage.parts}` }), salvage.minutes !== null ? ` · ${formatMinutes(salvage.minutes)}` : ''),
    !built && h('p', { class: 'muted', text: 'Zbuduj w obozie Stół rozbiórki, żeby rozbierać przedmioty na części.' }),
    needs && h('p', { class: 'muted', text: `Ta rzadkość wymaga Stołu rozbiórki na poziomie ${needs}.` }),
    salvage.pattern && h('p', { class: 'system-hint', text: `Rozbiórka odsłoni wzór w Warsztacie: ${salvage.pattern}.` }),
    built && !needs && full && h('p', { class: 'muted', text: 'Kolejka stołu jest pełna. Poczekaj, aż skończy się pierwsze zlecenie.' }),
    h('button', { type: 'button', class: 'button button--world', disabled: busy || !built || Boolean(needs) || full, onClick: takeApart, text: 'Rozbierz' }),
  );
}

// The Kowadło part of the item card: the next upgrade with its price, chance
// and risk, or why there is none, and where the item may break, a Zwój
// ochronny from the Warsztat to put on the Kowadło. The server rolls the
// outcome.
function anvilSection(item, busy) {
  const anvil = item.anvil;
  if (!anvil) return null;
  const title = h('p', { class: 'compare-title', text: 'Kowadło' });
  if (anvil.level >= anvil.max) {
    return h('div', { class: 'compare' }, title, h('p', { class: 'muted', text: `Przedmiot ma najwyższe ulepszenie: +${anvil.max}.` }));
  }
  const { next } = anvil;
  if (!next) {
    const hint =
      anvil.cap === 0
        ? 'Zbuduj Kowadło w obozie, żeby ulepszać przedmioty.'
        : `Kowadło na poziomie ${anvil.cap} ulepsza do +${anvil.cap}. Rozbuduj je w obozie, żeby iść wyżej.`;
    return h('div', { class: 'compare' }, title, h('p', { class: 'system-hint', text: hint }));
  }
  const have = Object.fromEntries(walletEntries().map((entry) => [entry.id, entry]));
  const missing = Object.entries(next.cost).some(([resource, amount]) => (have[resource]?.amount ?? 0) < amount);
  const risk =
    anvil.level === 0
      ? 'Porażka zabiera tylko złoto i rudę.'
      : `Porażka zabiera złoto i rudę, a przedmiot spada do +${anvil.level - 1}${
          next.breakChance > 0 ? `. Z szansą ${percent(next.breakChance)} przedmiot rozpada się` : ''
        }.`;
  // The scroll only where the item may break; the box starts empty, so a
  // scroll goes only when the player says so.
  const scrolls = state.character.scrolls ?? 0;
  const ward =
    next.breakChance > 0 && scrolls > 0 ? h('input', { type: 'checkbox', class: 'avoid-rare-box', id: `ward-${item.id}`, 'aria-describedby': `ward-note-${item.id}` }) : null;
  const upgrade = (event) =>
    withButton(event.currentTarget, async () => {
      const { upgrade: done } = await call('POST', `/api/items/${item.id}/upgrade`, { ward: Boolean(ward?.checked) });
      if (done.result === 'success') {
        playSound('done');
        toast(`Udało się: ${done.name} +${done.to}.`);
      } else {
        playSound('defeat');
        toast(
          done.result === 'broken'
            ? `Przedmiot rozpadł się na kowadle: ${done.name} +${done.from}.`
            : done.saved
              ? `Nie udało się: ${done.name} spada do +${done.to}. Zwój ochronny uchronił przedmiot przed rozpadem.`
              : done.to < done.from
                ? `Nie udało się: ${done.name} spada do +${done.to}.`
                : `Nie udało się: ${done.name} zostaje na +0.`,
        );
      }
      const owned = ownedItem(done.itemId);
      if (owned) itemSheet(owned.item, { equipped: owned.equipped });
      else closeSheet();
    });
  return h(
    'div',
    { class: 'compare anvil' },
    title,
    h('p', { class: 'anvil-step', text: `Ulepszenie +${anvil.level} → +${next.level}` }),
    h('ul', { class: 'preview-list' }, next.properties.map((line) => h('li', { class: 'preview-up', text: line }))),
    h('p', { class: 'anvil-chance', text: `Szansa powodzenia: ${percent(next.chance)}` }),
    h(
      'ul',
      { class: 'cost-list', 'aria-label': 'Koszt ulepszenia' },
      Object.entries(next.cost).map(([resource, amount]) =>
        h(
          'li',
          { class: `cost${(have[resource]?.amount ?? 0) < amount ? ' cost--missing' : ''}` },
          resourceArt(resource, 16),
          h('span', { text: have[resource]?.name ?? resource }),
          h('strong', { text: `${formatNumber(have[resource]?.amount ?? 0)} / ${formatNumber(amount)}` }),
        ),
      ),
    ),
    h('p', { class: 'muted', text: risk }),
    ward &&
      h(
        'label',
        { class: 'avoid-rare', for: `ward-${item.id}` },
        ward,
        h('span', { text: `Użyj Zwoju ochronnego (masz ${formatNumber(scrolls)})` }),
      ),
    ward && h('p', { class: 'muted', id: `ward-note-${item.id}`, text: 'Zwój chroni przed rozpadem, ale nie przed spadkiem ulepszenia. Przepada przy tej próbie.' }),
    next.breakChance > 0 &&
      !ward &&
      state.character.professions?.workshop &&
      h('p', { class: 'system-hint', text: 'Zwój ochronny z Systemowego Warsztatu chroni przed rozpadem na Kowadle.' }),
    h('button', {
      type: 'button',
      class: 'button button--system',
      disabled: busy || missing,
      onClick: upgrade,
      text: missing ? 'Brakuje złota albo rudy żelaza' : `Ulepsz do +${next.level}`,
    }),
  );
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
const changeName = (key) => CHANGES[key] ?? [state.content.elements.find((element) => `resist.${element.id}` === key)?.resistance ?? key, '%'];

// What wearing (or taking off) the item changes, counted by the server: the
// verdict on the whole, then each change, as the author asked: "+2,5", "−4",
// "+1%".
async function showPreview(box, item, equipped) {
  try {
    const { changes, verdict } = await call('GET', `/api/items/${item.id}/preview`);
    const rows = Object.entries(changes);
    fill(
      box,
      h('p', { class: 'compare-title', text: equipped ? 'Po zdjęciu' : 'Po założeniu' }),
      h('p', { class: `verdict verdict-line verdict--${verdict}`, text: VERDICTS[verdict].line }),
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

export function itemSummary(item) {
  const text = h(
    'span',
    { class: 'item-summary' },
    h('span', { class: 'item-name', vars: { '--rarity': item.color }, text: itemTitle(item) }),
    h('span', { class: 'item-meta', text: `${item.rarityName} · ${item.slotName} · poz. ${item.level}` }),
  );
  const art = itemSprite(item);
  return art ? h('span', { class: 'item-summary-art' }, art, text) : text;
}

export function itemDetails(item, { small = false } = {}) {
  const title = h(small ? 'p' : 'h2', { class: 'item-title', vars: { '--rarity': item.color }, text: itemTitle(item) });
  const meta = h('p', { class: 'item-meta', text: `${item.rarityName} · ${item.slotName} · poz. ${item.level}` });
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
      item.classNames && h('li', { class: 'item-classes', text: `${item.classNames.length > 1 ? 'Dla klas' : 'Dla klasy'}: ${item.classNames.join(', ')}` }),
      item.classLevel && h('li', { class: 'item-classes', text: `Od poziomu klasy ${item.classLevel}` }),
      item.price !== undefined && h('li', { class: 'item-price', text: `U złomiarza: ${formatNumber(item.price)} złota` }),
    ),
  );
}

function characterMessage(character, busy) {
  if (busy) return busyText(character);
  if (character.freePoints > 0 && isUnlocked('stats')) {
    return `Masz ${formatNumber(character.freePoints)} ${plural(character.freePoints, 'wolny punkt', 'wolne punkty', 'wolnych punktów')} statystyk. Rozdziel je w Statystykach.`;
  }
  return `Doświadczenie: ${formatNumber(character.xp)} / ${formatNumber(character.xpToNext)}. Do poziomu ${
    character.level + 1
  } zostało ok. ${formatHours(character.hoursToNext)} eksploracji.`;
}
