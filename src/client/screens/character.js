// The character screen: a 3:4 portrait with five equipment slots on each side,
// an eye that hides the slots, and the bag with items that are not worn.

import { fill, h, icon } from '../dom.js';
import { formatDecimal, formatHours, formatNumber, plural } from '../format.js';
import { SLOT_ICONS, itemIcon } from '../icons.js';
import { portrait } from '../portraits.js';
import { call, isUnlocked, state, unlockInfo } from '../state.js';
import { closeSheet, confirmAction, openSheet, pageHeading, systemPanel, withButton } from '../ui.js';

const POSITION_NAMES = { front: 'przód', middle: 'środek', back: 'tył' };

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
    frame.append(h('div', { class: 'portrait-art' }, portrait(character.classId)), column('left'), column('right'), eye);

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
        { type: 'button', class: 'slot slot--empty', 'aria-label': `${slot.name}: pusty slot`, onClick: () => emptySlotSheet(slot) },
        icon(SLOT_ICONS[slot.id], { size: 24 }),
      );
    }
    return h(
      'button',
      {
        type: 'button',
        class: 'slot',
        vars: { '--rarity': item.color },
        'aria-label': `${slot.name}: ${item.name}, ${item.rarityName}`,
        onClick: () => itemSheet(item, { equipped: true }),
      },
      icon(itemIcon(item), { size: 24 }),
    );
  }

  function bagSection(bag) {
    const count = h('span', { class: 'section-count', text: `(${formatNumber(bag.length)})` });
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
                    'aria-label': `${item.name}, ${item.rarityName}, ${item.slotName}, poziom ${item.level}`,
                    onClick: () => itemSheet(item, { equipped: false }),
                  },
                  icon(itemIcon(item), { size: 24 }),
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
      text: `${item.name} zniknie na zawsze.`,
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
  return h(
    'span',
    { class: 'item-summary' },
    h('span', { class: 'item-name', vars: { '--rarity': item.color }, text: item.name }),
    h('span', { class: 'item-meta', text: `${item.rarityName} · ${item.slotName} · poz. ${item.level}` }),
  );
}

export function itemDetails(item, { small = false } = {}) {
  return h(
    'div',
    { class: `item-details${small ? ' item-details--small' : ''}` },
    h(small ? 'p' : 'h2', { class: 'item-title', vars: { '--rarity': item.color }, text: item.name }),
    h('p', { class: 'item-meta', text: `${item.rarityName} · ${item.slotName} · poz. ${item.level}` }),
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
