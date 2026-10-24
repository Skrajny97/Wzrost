// The character screen: a 3:4 portrait with five equipment slots on each side,
// an eye that hides the slots, and the bag with items that are not worn.
// The item card also upgrades the item on the camp's Kowadło.

import { itemSprite, portraitSprite } from '../art.js';
import { fill, h, icon } from '../dom.js';
import { formatDecimal, formatHours, formatNumber, plural } from '../format.js';
import { RESOURCE_ICONS, SLOT_ICONS, itemIcon } from '../icons.js';
import { portrait } from '../portraits.js';
import { playSound } from '../sound.js';
import { call, isUnlocked, state, unlockInfo, walletEntries } from '../state.js';
import { closeSheet, confirmAction, openSheet, pageHeading, systemPanel, toast, withButton } from '../ui.js';

const POSITION_NAMES = { front: 'przód', middle: 'środek', back: 'tył' };

// An item's name with its upgrade, e.g. "Miecz Mgły +3".
export const itemTitle = (item) => (item.upgrade > 0 ? `${item.name} +${item.upgrade}` : item.name);

// The number in the corner of a slot: the upgrade level.
const upgradeBadge = (item) => item.upgrade > 0 && h('span', { class: 'slot-level', text: `+${item.upgrade}` });

// The eye toggle is remembered while the page is open.
let gearHidden = false;

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
    const count = h('span', {
      class: `section-count${bag.length >= capacity ? ' section-count--full' : ''}`,
      text: `(${formatNumber(bag.length)}/${formatNumber(capacity)})`,
    });
    return h(
      'section',
      { class: 'bag', 'aria-labelledby': 'bag-title' },
      h('h2', { class: 'section-title', id: 'bag-title' }, 'Plecak ', count),
      bag.length === 0
        ? h('p', { class: 'muted', text: 'Plecak jest pusty. Łupy z wypraw trafiają tutaj.' })
        : h(
            'ul',
            { class: 'bag-grid' },
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
          ),
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

  const preview = h('div', { class: 'preview', 'aria-live': 'polite' }, h('p', { class: 'muted', text: 'Liczenie zmian…' }));
  openSheet(
    itemDetails(item),
    preview,
    worn && h('div', { class: 'compare' }, h('p', { class: 'compare-title', text: 'Założony teraz' }), itemDetails(worn, { small: true })),
    anvilSection(item, busy),
    busy && h('p', { class: 'muted', text: 'Postać jest na wyprawie. Ekwipunek zmienisz po jej powrocie.' }),
    !usable && h('p', { class: 'region-warning', text: 'Twoja klasa nie może używać tego przedmiotu. Sprzedasz go złomiarzowi.' }),
    h(
      'div',
      { class: 'sheet-actions' },
      equipped
        ? h('button', { type: 'button', class: 'button button--world', disabled: busy, onClick: act('unequip'), text: 'Zdejmij' })
        : [
            h('button', { type: 'button', class: 'button button--world', disabled: busy, onClick: discard, text: 'Wyrzuć' }),
            h('button', { type: 'button', class: 'button button--system', disabled: busy || !usable, onClick: act('equip'), text: 'Załóż' }),
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
    const rows = [
      ['Obrażenia', now.damage, after.damage, after.damageAverage - now.damageAverage],
      ['Redukcja obrażeń', `${now.reduction}%`, `${after.reduction}%`, after.reduction - now.reduction],
      ['Maks. HP', now.maxHp, after.maxHp, after.maxHp - now.maxHp],
      ['Unik', `${formatDecimal(now.dodge)}%`, `${formatDecimal(after.dodge)}%`, after.dodge - now.dodge],
      ['Trafienie krytyczne', `${formatDecimal(now.crit)}%`, `${formatDecimal(after.crit)}%`, after.crit - now.crit],
    ].filter(([, , , change]) => Math.abs(change) > 1e-9);
    fill(
      box,
      h('p', { class: 'compare-title', text: equipped ? 'Po zdjęciu' : 'Po założeniu' }),
      rows.length === 0
        ? h('p', { class: 'muted', text: 'Bez zmian w obrażeniach, redukcji, HP, uniku i krytykach.' })
        : h(
            'ul',
            { class: 'preview-list' },
            rows.map(([label, before, then, change]) =>
              h(
                'li',
                { class: change > 0 ? 'preview-up' : 'preview-down' },
                h('span', { text: label }),
                h('span', { class: 'num', text: `${before} → ${then}` }),
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
      item.price !== undefined && h('li', { class: 'item-price', text: `U złomiarza: ${formatNumber(item.price)} złota` }),
    ),
  );
}

function characterMessage(character, busy) {
  if (busy) return 'Postać jest na wyprawie. Ekwipunek zmienisz po jej powrocie.';
  if (character.freePoints > 0 && isUnlocked('stats')) {
    return `Masz ${formatNumber(character.freePoints)} ${plural(character.freePoints, 'wolny punkt', 'wolne punkty', 'wolnych punktów')} statystyk. Rozdziel je w Statystykach.`;
  }
  return `Doświadczenie: ${formatNumber(character.xp)} / ${formatNumber(character.xpToNext)}. Do poziomu ${
    character.level + 1
  } zostało ok. ${formatHours(character.hoursToNext)} eksploracji.`;
}
