// The character screen: a 3:4 portrait with five equipment slots on each side,
// an eye that hides the slots, and the bag with items that are not worn.
// The item card also upgrades the item on the camp's Kowadło and takes a bag
// item apart on the Stół rzemieślniczy.

import { herbSprite, itemSprite, materialSprite, portraitSprite } from '../art.js';
import { MATERIALS_HINT, materialIcon } from '../craft-table.js';
import { fill, h, icon } from '../dom.js';
import { formatDecimal, formatHours, formatMinutes, formatNumber, plural, timeFormat } from '../format.js';
import { RESOURCE_ICONS, SLOT_ICONS, itemIcon } from '../icons.js';
import { portrait } from '../portraits.js';
import { playSound } from '../sound.js';
import { call, isUnlocked, state, unlockInfo, walletEntries } from '../state.js';
import { closeSheet, confirmAction, openSheet, pageHeading, systemPanel, toast, withButton } from '../ui.js';

const POSITION_NAMES = { front: 'przód', middle: 'środek', back: 'tył' };

// An item's name with its upgrade, e.g. "Miecz Rysia +3".
export const itemTitle = (item) => (item.upgrade > 0 ? `${item.name} +${item.upgrade}` : item.name);

// The number in the corner of a slot: the upgrade level.
const upgradeBadge = (item) => item.upgrade > 0 && h('span', { class: 'slot-level', text: `+${item.upgrade}` });

// The eye toggle is remembered while the page is open.
let gearHidden = false;
// Which half of the backpack shows: the items, or the materials, which take
// no room in it. Remembered while the page is open too.
let bagTab = 'items';

// "Rzadka skóra wilka" for a stack above its species' rarity.
const materialTitle = (material) => material.label.charAt(0).toUpperCase() + material.label.slice(1);

// Why the gear cannot change now: the character is away.
const busyText = (character) =>
  character.activity?.kind === 'herbs'
    ? 'Postać zbiera zioła. Plecak i ekwipunek zmienisz po jej powrocie z Zagajnika.'
    : 'Postać jest na wyprawie. Ekwipunek zmienisz po jej powrocie.';

// A herb's stacks in the bag: full ones, then the rest.
function herbStacks(herb, stack) {
  const stacks = Array.from({ length: Math.floor(herb.count / stack) }, () => stack);
  if (herb.count % stack > 0) stacks.push(herb.count % stack);
  return stacks;
}

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
    const figure = portraitSprite(character.classId, character.appearance);
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
    return h(
      'section',
      { class: 'bag', 'aria-labelledby': 'bag-title' },
      h('h2', { class: 'section-title', id: 'bag-title' }, 'Plecak ', count),
      h(
        'div',
        { class: 'segmented bag-tabs', role: 'group', 'aria-label': 'Zawartość plecaka' },
        tab('items', 'Przedmioty'),
        tab('materials', stacked > 0 ? `Materiały (${formatNumber(stacked)})` : 'Materiały'),
      ),
      bagTab === 'materials' ? materialsGrid(materials) : itemsGrid(bag),
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
        h('p', { class: 'sheet-text', text: `Stół rzemieślniczy zrobi z tego: ${material.part} ×${formatNumber(material.count)}.` }),
      ),
      table && h('a', { class: 'button button--world', href: `#/oboz/${table.id}`, onClick: closeSheet, text: table.level > 0 ? 'Do stołu rzemieślniczego' : 'Zbuduj stół w obozie' }),
    );
  }

  function itemsGrid(bag) {
    const herbs = state.character.herbs ?? [];
    if (bag.length === 0 && herbs.length === 0) return h('p', { class: 'muted', text: 'Plecak jest pusty. Łupy z wypraw trafiają tutaj.' });
    return h(
      'ul',
      { class: 'bag-grid' },
      herbs.flatMap((herb) =>
        herbStacks(herb, state.character.herbStack).map((count) =>
          h(
            'li',
            {},
            h(
              'button',
              {
                type: 'button',
                class: 'slot slot--bag slot--herb',
                'aria-label': `${herb.name}, ${formatNumber(count)} szt.`,
                onClick: () => herbSheet(herb),
              },
              herbSprite(herb.id) ?? icon('leaf', { size: 24 }),
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
              'aria-label': `${itemTitle(item)}, ${item.rarityName}, ${item.slotName}, poziom ${item.level}`,
              onClick: () => itemSheet(item, { equipped: false }),
            },
            itemSprite(item) ?? icon(itemIcon(item), { size: 24 }),
            upgradeBadge(item),
          ),
        ),
      ),
    );
  }

  // A herb's card: what it is, what the scrapper pays, and selling or
  // throwing away as many as chosen.
  function herbSheet(herb) {
    const character = state.character;
    const busy = Boolean(character.activity);
    let count = herb.count;
    const price = (amount) => Math.max(1, Math.round(herb.price * amount));
    const value = h('output', { class: 'herb-count-value' });
    const sell = h('button', { type: 'button', class: 'button button--system', disabled: busy });
    const less = h('button', { type: 'button', class: 'button button--world duration-step', 'aria-label': 'Mniej', text: '−', onClick: () => set(count - 1) });
    const more = h('button', { type: 'button', class: 'button button--world duration-step', 'aria-label': 'Więcej', text: '+', onClick: () => set(count + 1) });
    const all = h('button', { type: 'button', class: 'link-button', text: 'wszystkie', onClick: () => set(herb.count) });
    function set(next) {
      count = Math.min(herb.count, Math.max(1, next));
      value.textContent = `${formatNumber(count)} szt.`;
      sell.textContent = `Sprzedaj za ${formatNumber(price(count))} złota`;
      less.disabled = count === 1;
      more.disabled = count === herb.count;
    }
    set(count);
    const act = (path, done) => async (event) =>
      withButton(event.currentTarget, async () => {
        const result = await call('POST', `/api/herbs/${path}`, { herbId: herb.id, count });
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
        title: 'Wyrzucić zioła?',
        text: `${herb.name}: ${formatNumber(count)} szt. zniknie na zawsze.`,
        confirmLabel: 'Wyrzuć',
        danger: true,
      });
      if (sure) await act('discard')({ currentTarget: button });
    };
    const art = herbSprite(herb.id);
    const title = h('h2', { class: 'item-title', text: herb.name });
    const stacks = Math.ceil(herb.count / character.herbStack);
    const meta = h('p', { class: 'item-meta', text: `${formatNumber(herb.count)} szt. · ${stacks} ${plural(stacks, 'miejsce', 'miejsca', 'miejsc')} w plecaku` });
    openSheet(
      h(
        'div',
        { class: 'item-details' },
        art ? h('div', { class: 'item-head' }, h('span', { class: 'item-art' }, art), h('div', {}, title, meta)) : [title, meta],
        h('p', { class: 'sheet-text', text: herb.description }),
        h('p', { class: 'sheet-text', text: `Jedno miejsce mieści ${character.herbStack} szt. Złomiarz płaci ${formatDecimal(herb.price)} złota za sztukę.` }),
      ),
      busy
        ? h('p', { class: 'muted', text: busyText(character) })
        : [
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
// changes, and the actions.
export function itemSheet(item, { equipped }) {
  const character = state.character;
  const busy = Boolean(character.activity);
  const usable = !item.classIds || item.classIds.includes(character.classId);
  // A later base of its kind waits for its class level (a Metin2-like tier).
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

  const preview = h('div', { class: 'preview', 'aria-live': 'polite' }, h('p', { class: 'muted', text: 'Liczenie zmian…' }));
  openSheet(
    itemDetails(item),
    preview,
    worn && h('div', { class: 'compare' }, h('p', { class: 'compare-title', text: 'Założony teraz' }), itemDetails(worn, { small: true })),
    anvilSection(item, busy),
    !equipped && salvageSection(item, busy),
    busy && h('p', { class: 'muted', text: busyText(character) }),
    !usable && h('p', { class: 'region-warning', text: 'Twoja klasa nie może używać tego przedmiotu. Sprzedasz go złomiarzowi.' }),
    early && h('p', { class: 'region-warning', text: `Ten przedmiot założysz od poziomu klasy ${item.classLevel}.` }),
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
            h('button', { type: 'button', class: 'button button--system', disabled: busy || !usable || early, onClick: act('equip'), text: 'Załóż' }),
          ],
    ),
  );
  showPreview(preview, item, equipped);
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

// The Stół rzemieślniczy part of a bag item's card: the parts that taking it
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
      text: `${itemTitle(item)} zniknie, a stół zrobi z niego: ${salvage.part} ×${salvage.parts}, w ${formatMinutes(salvage.minutes)}.`,
      confirmLabel: 'Rozbierz',
    });
    if (!sure) return;
    await withButton(button, async () => {
      const { salvage: order } = await call('POST', `/api/items/${item.id}/salvage`);
      closeSheet();
      playSound('build');
      toast(`Na stole: ${order.name}. ${order.part} ×${order.parts} będą gotowe o ${timeFormat.format(new Date(order.endsAt))}.`);
    });
  };
  return h(
    'div',
    { class: 'compare' },
    h('p', { class: 'compare-title', text: table?.name ?? 'Stół rzemieślniczy' }),
    h('p', { class: 'anvil-step' }, 'Rozbiórka: ', h('span', { class: 'item-name', vars: { '--rarity': salvage.color }, text: `${salvage.part} ×${salvage.parts}` }), salvage.minutes !== null ? ` · ${formatMinutes(salvage.minutes)}` : ''),
    !built && h('p', { class: 'muted', text: 'Zbuduj w obozie Stół rzemieślniczy, żeby rozbierać przedmioty na części.' }),
    needs && h('p', { class: 'muted', text: `Ta rzadkość wymaga Stołu rzemieślniczego na poziomie ${needs}.` }),
    built && !needs && full && h('p', { class: 'muted', text: 'Kolejka stołu jest pełna. Poczekaj, aż skończy się pierwsze zlecenie.' }),
    h('button', { type: 'button', class: 'button button--world', disabled: busy || !built || Boolean(needs) || full, onClick: takeApart, text: 'Rozbierz' }),
  );
}

// The Kowadło part of the item card: the next upgrade with its price, chance
// and risk, or why there is none. The server rolls the outcome.
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
  const upgrade = (event) =>
    withButton(event.currentTarget, async () => {
      const { upgrade: done } = await call('POST', `/api/items/${item.id}/upgrade`);
      if (done.result === 'success') {
        playSound('done');
        toast(`Udało się: ${done.name} +${done.to}.`);
      } else {
        playSound('defeat');
        toast(
          done.result === 'broken'
            ? `Przedmiot rozpadł się na kowadle: ${done.name} +${done.from}.`
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
          icon(RESOURCE_ICONS[resource] ?? 'unknown', { size: 16 }),
          h('span', { text: have[resource]?.name ?? resource }),
          h('strong', { text: `${formatNumber(have[resource]?.amount ?? 0)} / ${formatNumber(amount)}` }),
        ),
      ),
    ),
    h('p', { class: 'muted', text: risk }),
    h('button', {
      type: 'button',
      class: 'button button--system',
      disabled: busy || missing,
      onClick: upgrade,
      text: missing ? 'Brakuje złota albo rudy żelaza' : `Ulepsz do +${next.level}`,
    }),
  );
}

// What wearing (or taking off) the item changes, counted by the server.
async function showPreview(box, item, equipped) {
  try {
    const { now, after } = await call('GET', `/api/items/${item.id}/preview`);
    // Only the change, as the author asked: "+2,5", "−4", "+1%".
    const rows = [
      ['Średnie obrażenia', after.damageAverage - now.damageAverage, ''],
      ['Redukcja obrażeń', after.reduction - now.reduction, '%'],
      ['Maks. HP', after.maxHp - now.maxHp, ''],
      ['Unik', after.dodge - now.dodge, '%'],
      ['Trafienie krytyczne', after.crit - now.crit, '%'],
    ].filter(([, change]) => Math.abs(change) >= 0.05);
    fill(
      box,
      h('p', { class: 'compare-title', text: equipped ? 'Po zdjęciu' : 'Po założeniu' }),
      rows.length === 0
        ? h('p', { class: 'muted', text: 'Bez zmian w obrażeniach, redukcji, HP, uniku i krytykach.' })
        : h(
            'ul',
            { class: 'preview-list' },
            rows.map(([label, change, unit]) =>
              h(
                'li',
                { class: change > 0 ? 'preview-up' : 'preview-down' },
                h('span', { text: label }),
                h('span', { class: 'num', text: `${change > 0 ? '+' : '−'}${formatDecimal(Math.abs(change))}${unit}` }),
              ),
            ),
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
