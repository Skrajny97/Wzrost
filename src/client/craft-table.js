// The Stół rozbiórki on its building screen, in tabs (the author: "Trzeba
// tez zwinac te wszystkie opcje jakos w zakladki zeby nie trzeba bylo tyle
// scrollować"): the materials waiting, the bag's items to take apart, the
// queue of orders and the parts made. The table turns each material into one
// part of the same rarity and taken-apart items into several, for free, one
// order after another (src/engine/crafting.js). The server settles the queue;
// app.js fetches the character again when an order ends.

import { materialSprite } from './art.js';
import { h, icon } from './dom.js';
import { countOf, formatCountdown, formatDecimal, formatMinutes, formatNumber, saleGold, timeFormat } from './format.js';
import { t } from './i18n.js';
import { reorderable } from './reorder.js';
import { playSound } from './sound.js';
import { call, state, testModeOn } from './state.js';
import { afterSheet, closeSheet, confirmAction, openSheet, systemPanel, toast, withButton } from './ui.js';

// A material's picture, or the line icon of the family of creatures that
// leaves it until the picture is drawn; a part's picture or a hammer.
export function materialIcon(materialId, size = 24) {
  const family = state.content.materials?.find((material) => material.id === materialId)?.family;
  return materialSprite(materialId) ?? icon(family ?? 'hammer', { size });
}

// Materials to the table's queue, from its screen or from the bag (the
// author: "dodac przerób tak jak przedmioty z pozycji plecaka samego").
export async function craft(body) {
  const { ordered, skipped } = await call('POST', '/api/craft/materials', body);
  playSound('build');
  const materials = skipped > 0 && countOf(skipped, 'materiał', 'materiały', 'materiałów');
  const waiting = materials && (skipped === 1 ? t('Na wyższy poziom stołu czeka: {materials}.', { materials }) : t('Na wyższy poziom stołu czekają: {materials}.', { materials }));
  toast(
    [ordered === 1 ? t('Materiał trafił na stół.') : t('Na stole: {orders}.', { orders: countOf(ordered, 'zlecenie', 'zlecenia', 'zleceń') }), waiting]
      .filter(Boolean)
      .join(' '),
  );
}

// What materials are, while there are none yet (the author's sentence),
// shown in the page's language (t(), i18n.js) where it is used.
export const MATERIALS_HINT = 'Z pokonanych stworów zdobędziesz różne materiały, które można przerobić na części do rzemiosła.';

// A material's name as a title: "Skóra wilka", or "Rzadka skóra wilka" for
// a stack above its species' rarity.
export const materialTitle = (material) => material.label.charAt(0).toUpperCase() + material.label.slice(1);

// A material's card, from the bag or from the table's Materiały: what it is
// and what the table makes of it, as many pieces as chosen to the table's
// queue (the author: "Powinna być mozliwosc przerobienia pojedynczej sztuki
// danego materiału nie wszystkie danej jakości") or to the scrapper
// (proposal 1: "Skup złomu kupuje materiały"), one to start with, as for
// herbs and potions; a sale once the player confirms (the author:
// "delikatne, ale zeby trzeba bylo potwierdzic").
export function materialSheet(material, start = 1) {
  const description = state.content.materials?.find((candidate) => candidate.id === material.materialId)?.description;
  const table = state.character.camp.buildings.find((building) => building.crafts);
  const crafting = state.character.crafting;
  const built = crafting?.pace > 0;
  const full = Boolean(crafting) && crafting.queue.length >= crafting.limit;
  const needs = crafting?.materials.find((one) => one.key === material.key)?.needs ?? null;
  const art = materialSprite(material.materialId);
  const title = h('h2', { class: 'item-title', vars: { '--rarity': material.color }, text: materialTitle(material) });
  const meta = h('p', { class: 'item-meta', text: t('{rarity} · {count} szt.', { rarity: material.rarityName, count: formatNumber(material.count) }) });
  let count = start;
  const price = (amount) => saleGold(material.price, amount);
  const value = h('output', { class: 'herb-count-value' });
  const makes = h('p', { class: 'sheet-text' });
  const sell = h('button', { type: 'button', class: 'button button--system' });
  const process = built
    ? h('button', {
        type: 'button',
        class: 'button button--world',
        disabled: full || needs !== null,
        onClick: (event) =>
          withButton(event.currentTarget, async () => {
            await craft({ key: material.key, count });
            closeSheet();
          }),
      })
    : table && h('a', { class: 'button button--world', href: `#/oboz/${table.id}`, onClick: closeSheet, text: t('Zbuduj Stół rozbiórki') });
  const less = h('button', { type: 'button', class: 'button button--world duration-step', 'aria-label': t('Mniej'), text: '−', onClick: () => set(count - 1) });
  const more = h('button', { type: 'button', class: 'button button--world duration-step', 'aria-label': t('Więcej'), text: '+', onClick: () => set(count + 1) });
  const all = h('button', { type: 'button', class: 'link-button', text: t('wszystkie'), onClick: () => set(material.count) });
  function set(next) {
    count = Math.min(material.count, Math.max(1, next));
    value.textContent = t('{count} szt.', { count: formatNumber(count) });
    makes.textContent = t('Stół rozbiórki zrobi z tego: {part} ×{count}.', { part: material.part, count: formatNumber(count) });
    if (built) process.textContent = t('Przerób {count} szt.', { count: formatNumber(count) });
    sell.textContent = t('Sprzedaj za {gold} złota', { gold: formatNumber(price(count)) });
    less.disabled = count === 1;
    more.disabled = count === material.count;
  }
  set(count);
  sell.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const sure = await confirmAction({
      title: t('Sprzedać materiał?'),
      text: t('Złomiarz kupi: {name} ×{count} za {gold} złota. Stół rozbiórki zrobiłby z tego: {part} ×{count}.', {
        name: materialTitle(material),
        count: formatNumber(count),
        gold: formatNumber(price(count)),
        part: material.part,
      }),
      confirmLabel: t('Sprzedaj'),
    });
    // Not sold: back to the material's card as it was, once the
    // confirmation's sheet has finished closing.
    if (!sure) return afterSheet(() => materialSheet(material, count));
    withButton(button, async () => {
      const { sold } = await call('POST', '/api/materials/sell', { key: material.key, count });
      closeSheet();
      playSound('coin');
      toast(t('Złomiarz kupił {count} szt. za {gold} złota.', { count: formatNumber(sold.count), gold: formatNumber(sold.gold) }));
    });
  });
  openSheet(
    h(
      'div',
      { class: 'item-details' },
      art ? h('div', { class: 'item-head' }, h('span', { class: 'item-art', vars: { '--rarity': material.color } }, art), h('div', {}, title, meta)) : [title, meta],
      description && h('p', { class: 'sheet-text', text: description }),
      makes,
      h('p', { class: 'sheet-text', text: t('Złomiarz płaci {price} złota za sztukę.', { price: formatDecimal(material.price) }) }),
      built && needs !== null && h('p', { class: 'system-hint', text: t('Ten materiał Stół rozbiórki przerobi od swojego poziomu {level}.', { level: needs }) }),
      built && needs === null && full && h('p', { class: 'system-hint', text: t('Kolejka stołu jest pełna ({limit} zleceń). Poczekaj, aż skończy się pierwsze.', { limit: crafting.limit }) }),
    ),
    h('div', { class: 'herb-count' }, less, value, more, all),
    h('div', { class: 'sheet-actions' }, process, sell),
  );
}

// The table's tab shown, and the marks on its Materiały (each stack with the
// pieces chosen for it under its row, the whole stack at first) and
// Przedmioty, kept while the screen draws again.
let tableTab = 'materials';
const markedMaterials = new Map();
const markedItems = new Set();

// The Materiały tab: a tap on a material opens its card for as many pieces
// as chosen, and its tick marks it to go to the table with the others marked
// (the author: "Dodajmy jeszcze opcje zaznaczania roznych materialow w Stole
// rozbiórki"), each an order of its own: the whole stack, or fewer pieces
// chosen under its row once marked (a player on the chat, 6.11.2026: "nie
// da się wybrać ilości pojedynczego materiału do przerobienia, tylko wrzuca
// od razu wszystkie").
function materialsTab(crafting, built, full) {
  if (crafting.materials.length === 0) return h('p', { class: 'system-hint', text: t(MATERIALS_HINT) });
  const takes = (material) => material.needs === null;
  // Marks only on the stacks still there that the table takes.
  for (const [key, count] of [...markedMaterials]) {
    const stack = crafting.materials.find((material) => material.key === key && takes(material));
    if (!stack) markedMaterials.delete(key);
    else if (count > stack.count) markedMaterials.set(key, stack.count);
  }
  const room = Math.max(0, crafting.limit - crafting.queue.length);
  const roomNote = h('p', { class: 'region-warning', hidden: true });
  const processMarked = h('button', {
    type: 'button',
    class: 'button button--world',
    onClick: (event) =>
      withButton(event.currentTarget, async () => {
        const marked = [...markedMaterials];
        markedMaterials.clear();
        try {
          await craft({ keys: marked.map(([key]) => key), counts: Object.fromEntries(marked) });
        } catch (error) {
          for (const [key, count] of marked) markedMaterials.set(key, count);
          throw error;
        }
      }),
  });
  const update = () => {
    const marked = markedMaterials.size;
    const tooMany = marked > room;
    processMarked.textContent = marked > 0 ? t('Przerób zaznaczone ({count})', { count: formatNumber(marked) }) : t('Przerób zaznaczone');
    processMarked.disabled = !built || full || marked === 0 || tooMany;
    roomNote.hidden = !built || full || !tooMany;
    roomNote.textContent = t('Każdy materiał to osobne zlecenie stołu. Zaznaczone potrzebują ich: {count}, a wolne miejsca w kolejce: {room}.', {
      count: formatNumber(marked),
      room: formatNumber(room),
    });
  };
  const row = (material) => {
    // The pieces to go, under the row of a marked stack.
    const value = h('output', { class: 'herb-count-value' });
    const less = h('button', { type: 'button', class: 'button button--world duration-step', 'aria-label': t('Mniej'), text: '−', onClick: () => pick(markedMaterials.get(material.key) - 1) });
    const more = h('button', { type: 'button', class: 'button button--world duration-step', 'aria-label': t('Więcej'), text: '+', onClick: () => pick(markedMaterials.get(material.key) + 1) });
    const all = h('button', { type: 'button', class: 'link-button', text: t('wszystkie'), onClick: () => pick(material.count) });
    const pieces = h('div', { class: 'herb-count craft-count' }, less, value, more, all);
    // What the row says the table makes: the pieces chosen of a marked stack.
    const meta = h('span', { class: 'item-meta' });
    const describe = (count) => {
      meta.textContent = [
        material.rarityName,
        t('daje: {what}', { what: `${material.part} ×${formatNumber(count)}` }),
        material.needs ? t('od poziomu {level} stołu', { level: material.needs }) : built && formatMinutes(material.minutes),
      ]
        .filter(Boolean)
        .join(' · ');
    };
    function pick(next) {
      const count = Math.min(material.count, Math.max(1, next));
      markedMaterials.set(material.key, count);
      value.textContent = t('{count} szt.', { count: formatNumber(count) });
      less.disabled = count === 1;
      more.disabled = count === material.count;
      describe(count);
    }
    const shown = () => {
      pieces.hidden = !markedMaterials.has(material.key);
      if (markedMaterials.has(material.key)) pick(markedMaterials.get(material.key));
      else describe(material.count);
    };
    const mark = h(
      'button',
      {
        type: 'button',
        class: 'craft-mark',
        'aria-pressed': String(markedMaterials.has(material.key)),
        'aria-label': t('Zaznacz: {name} ×{count}', { name: material.name, count: material.count }),
        disabled: !built || !takes(material),
        onClick: () => {
          if (markedMaterials.has(material.key)) markedMaterials.delete(material.key);
          else markedMaterials.set(material.key, material.count);
          mark.setAttribute('aria-pressed', String(markedMaterials.has(material.key)));
          shown();
          update();
        },
      },
      icon('check', { size: 16 }),
    );
    const line = h(
      'li',
      { class: 'craft-row craft-row--pick' },
      h(
        'button',
        { type: 'button', class: 'craft-open', 'aria-label': t('{name} ×{count}: wybierz liczbę sztuk', { name: material.name, count: material.count }), onClick: () => materialSheet(material) },
        h('span', { class: 'craft-art' }, materialIcon(material.materialId)),
        h(
          'span',
          { class: 'craft-text' },
          h('span', { class: 'item-name', vars: { '--rarity': material.color }, text: `${material.name} ×${formatNumber(material.count)}` }),
          meta,
        ),
      ),
      mark,
      pieces,
    );
    shown();
    return line;
  };
  update();
  return [
    built && h('p', { class: 'craft-note', text: t('Stuknij materiał, żeby przerobić albo sprzedać wybraną liczbę sztuk. Zaznacz kilka, żeby przerobić je naraz: pod zaznaczonym wybierzesz, ile sztuk.') }),
    h('ul', { class: 'craft-list' }, crafting.materials.map(row)),
    built &&
      h(
        'div',
        { class: 'craft-actions' },
        roomNote,
        processMarked,
        crafting.materials.length > 1 &&
          h('button', {
            type: 'button',
            class: 'button button--system',
            disabled: full || !crafting.materials.some(takes),
            text: t('Przerób wszystko'),
            onClick: (event) => withButton(event.currentTarget, () => craft({ all: true })),
          }),
      ),
    !built && h('p', { class: 'system-hint', text: t('Zbuduj stół, żeby przerabiać materiały i rozbierać przedmioty.') }),
    built && full && h('p', { class: 'system-hint', text: t('Kolejka jest pełna ({limit} zleceń). Poczekaj, aż skończy się pierwsze.', { limit: crafting.limit }) }),
  ];
}

// The Przedmioty tab: the bag's items to take apart from the table's own
// screen too (the author: "rozbieranie przedmiotów dostepne tez z pozycji
// stolu rozbiorki"), with the bag's "Rozbierz kilka" (`picker`, from
// character.js).
function itemsTab(built, picker) {
  const bag = state.character.bag.filter((item) => item.salvage);
  for (const id of [...markedItems]) if (!bag.some((item) => item.id === id)) markedItems.delete(id);
  if (!built) return h('p', { class: 'system-hint', text: t('Zbuduj stół, żeby przerabiać materiały i rozbierać przedmioty.') });
  if (bag.length === 0) return h('p', { class: 'system-hint', text: t('W plecaku nie ma przedmiotów do rozbiórki. Łupy z wypraw trafiają do plecaka.') });
  const { nodes, update } = picker(markedItems, { inline: true });
  update();
  return [h('p', { class: 'craft-note', text: t('Zaznacz przedmioty z plecaka, które stół ma rozebrać. Ponowne stuknięcie odznacza przedmiot.') }), ...nodes];
}

// An order as its row names it: "Skóra wilka ×12".
const orderLabel = (order) => (order.count > 1 ? `${order.name} ×${formatNumber(order.count)}` : order.name);

const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));

// What else goes with orders leaving the queue: the gems and ores
// jewellery gave at once, the patterns their items taught, and what the
// quests and the Próby Gildii counted for an order made before the work of
// the table counted at its end (`counted`); a newer order counted nothing.
function goingBack(orders, confirm) {
  const minerals = new Map();
  for (const order of orders) for (const { name, count } of order.minerals) minerals.set(name, (minerals.get(name) ?? 0) + count);
  const patterns = [...new Set(orders.flatMap((order) => order.patterns))];
  return [
    minerals.size > 0 && filled(confirm.minerals, { minerals: [...minerals].map(([name, count]) => `${name} ×${formatNumber(count)}`).join(', ') }),
    patterns.length > 0 && filled(patterns.length === 1 ? confirm.pattern : confirm.patterns, { patterns: patterns.join(', ') }),
    orders.some((order) => order.counted) && (state.character.guildTag ? confirm.countedGuild : confirm.counted),
  ];
}

// "Usuń z kolejki" (the author: „nie wiem czy jest sens karania za takie
// pomyłki”): after a question, the order leaves the queue and all it took
// comes back; the one at work loses its work so far, and those after it
// come sooner.
async function cancelOrder(crafting, order) {
  const { confirm } = crafting.texts;
  const index = crafting.queue.indexOf(order);
  const sure = await confirmAction({
    title: confirm.title,
    text: [
      // Items from the Przechowalnia go back there (storage.js).
      filled(order.stored ? confirm.backStored : confirm.back, { what: orderLabel(order) }),
      index === 0 && confirm.running,
      index < crafting.queue.length - 1 && confirm.later,
      ...goingBack([order], confirm),
    ]
      .filter(Boolean)
      .join(' '),
    confirmLabel: confirm.yes,
    cancelLabel: confirm.no,
  });
  if (!sure) return;
  await call('POST', '/api/craft/cancel', { id: order.id });
  toast(filled(order.stored ? crafting.texts.doneStored : crafting.texts.done, { what: orderLabel(order) }));
}

// "Usuń wszystkie": every order that can leave, at once, after a question.
async function cancelAll(crafting) {
  const { confirm } = crafting.texts;
  const leaving = crafting.queue.filter((order) => order.cancellable);
  const sure = await confirmAction({
    title: confirm.titleAll,
    text: [
      filled(leaving.some((order) => order.stored) ? confirm.backAllStored : confirm.backAll, { count: formatNumber(leaving.length) }),
      crafting.queue[0].cancellable && confirm.runningAll,
      leaving.length < crafting.queue.length && confirm.kept,
      ...goingBack(leaving, confirm),
    ]
      .filter(Boolean)
      .join(' '),
    confirmLabel: confirm.yes,
    cancelLabel: confirm.no,
  });
  if (!sure) return;
  const { cancelled, stored } = await call('POST', '/api/craft/cancel', { all: true });
  toast(filled(stored > 0 ? crafting.texts.doneAllStored : crafting.texts.doneAll, { count: formatNumber(cancelled) }));
}

// An order waiting dragged by its ≡ to a new place, or moved by the arrows
// on it (the author's 905 C, after a player's note: „Do zrobienia w stole
// do rozbiórki jakiś shuffle w kolejce”; reorder.js): it goes right before
// the order now after it, or last. The server counts the "Gotowe o" anew
// (moveOrder in crafting.js), and the page draws the queue again from its
// answer, the arrows' focus still on the order moved.
async function moveQueued(row, next, { keyboard }) {
  const id = row.dataset.order;
  try {
    await call('POST', '/api/craft/move', { id, before: next?.dataset.order ?? null });
  } catch (error) {
    toast(error.message);
    throw error;
  }
  if (keyboard) document.querySelector(`.craft-row[data-order="${CSS.escape(id)}"] .craft-handle`)?.focus();
}

// The orders, the first one at work with its countdown; `ticks` gets its
// update. Each that can leave the queue has "Usuń z kolejki", and two or
// more such have "Usuń wszystkie" under them. While two or more wait, each
// of them has its ≡ to move it (moveQueued), with a line on how under them;
// the order at work stays first.
function queueCard(crafting, ticks) {
  const [first, ...waiting] = crafting.queue;
  const { texts } = crafting;
  const moving = waiting.length > 1;
  const countdown = h('strong', { class: 'craft-countdown' });
  const progress = h('div', { class: 'bar-fill bar-fill--gold' });
  ticks.push((now) => {
    countdown.textContent = formatCountdown(first.endsAt - now);
    const done = (now - first.startsAt) / (first.endsAt - first.startsAt);
    progress.style.width = `${Math.min(100, Math.max(0, done * 100))}%`;
  });
  const cancel = (order) =>
    order.cancellable
      ? h('button', {
          type: 'button',
          class: 'craft-cancel',
          text: texts.cancel,
          'aria-label': `${texts.cancel}: ${orderLabel(order)}`,
          onClick: (event) => withButton(event.currentTarget, () => cancelOrder(crafting, order)),
        })
      : h('span', { class: 'item-meta', text: texts.old });
  const handle = (order) =>
    h('button', {
      type: 'button',
      class: 'craft-handle',
      text: '≡',
      'aria-label': filled(texts.move, { what: orderLabel(order) }),
      'aria-keyshortcuts': 'ArrowUp ArrowDown',
    });
  const row = (order, extra, moves = false) =>
    h(
      'li',
      { class: moves ? 'craft-row craft-row--moves' : 'craft-row', 'data-order': order.id },
      moves && handle(order),
      h('span', { class: 'craft-art' }, order.materialId ? materialIcon(order.materialId) : icon('hammer', { size: 24 })),
      h(
        'span',
        { class: 'craft-text' },
        h('span', { class: 'item-name', vars: { '--rarity': order.color }, text: orderLabel(order) }),
        h('span', {
          class: 'item-meta',
          text: `${order.kind === 'material' ? t('przeróbka') : t('rozbiórka')} · ${t('daje: {what}', { what: `${order.part} ×${formatNumber(order.parts)}` })}`,
        }),
        // Its time and its button in one line, the button below on a narrow screen.
        h('span', { class: 'craft-foot' }, extra, cancel(order)),
      ),
    );
  const leaving = crafting.queue.filter((order) => order.cancellable).length;
  const list = h(
    'ol',
    { class: 'craft-list' },
    row(first, h('span', { class: 'craft-progress' }, h('div', { class: 'bar' }, progress), countdown)),
    waiting.map((order) => row(order, h('span', { class: 'item-meta', text: t('Gotowe o {time}', { time: timeFormat.format(new Date(order.endsAt)) }) }), moving)),
  );
  if (moving) reorderable(list, { row: '.craft-row--moves', handle: '.craft-handle', onDrop: moveQueued });
  return h(
    'section',
    { class: 'craft-card', 'aria-label': t('Kolejka ({count} z {limit})', { count: crafting.queue.length, limit: crafting.limit }) },
    list,
    moving && h('p', { class: 'craft-note', text: texts.moveHint }),
    leaving > 1 &&
      h('button', {
        type: 'button',
        class: 'button button--world',
        text: texts.cancelAll,
        onClick: (event) => withButton(event.currentTarget, () => cancelAll(crafting)),
      }),
    testSkip(),
  );
}

// Test mode only: every order ends at once.
function testSkip() {
  if (!state.user.testMode || !testModeOn()) return null;
  return h(
    'div',
    { class: 'test-tools' },
    h('p', { class: 'test-tools-text', text: t('Tryb testowy: kolejka skończy się od razu.') }),
    h('button', {
      type: 'button',
      class: 'button button--test',
      text: t('Pomiń czas'),
      onClick: (event) => withButton(event.currentTarget, () => call('POST', '/api/test/skip-craft')),
    }),
  );
}

function partsCard(crafting) {
  return h(
    'section',
    { class: 'craft-card', 'aria-label': t('Części') },
    h(
      'ul',
      { class: 'craft-list craft-list--parts' },
      crafting.parts.map((part) =>
        h(
          'li',
          { class: `craft-row${part.count === 0 ? ' craft-row--none' : ''}` },
          h('span', { class: 'craft-art' }, materialSprite(part.id) ?? icon('hammer', { size: 24 })),
          h(
            'span',
            { class: 'craft-text' },
            h('span', { class: 'item-name', vars: { '--rarity': part.color }, text: part.name }),
            h('span', { class: 'item-meta', text: part.description }),
          ),
          h('strong', { class: 'craft-count', text: formatNumber(part.count) }),
        ),
      ),
    ),
    h('p', { class: 'system-hint', text: t('Z części powstaną przedmioty w profesjach, które dojdą później.') }),
  );
}

// The table's section of its building screen: four tabs, the one chosen
// shown. `picker` is the bag's "Rozbierz kilka" for the Przedmioty tab.
export function craftTableSection(ticks, picker) {
  const crafting = state.character.crafting;
  const built = crafting.pace > 0;
  const full = crafting.queue.length >= crafting.limit;
  const pieces = crafting.materials.reduce((sum, material) => sum + material.count, 0);
  const items = state.character.bag.filter((item) => item.salvage).length;
  const parts = crafting.parts.reduce((sum, part) => sum + part.count, 0);
  const tabs = {
    materials: { label: pieces > 0 ? t('Materiały ({count})', { count: formatNumber(pieces) }) : t('Materiały'), body: () => materialsTab(crafting, built, full) },
    items: { label: items > 0 ? t('Przedmioty ({count})', { count: formatNumber(items) }) : t('Przedmioty'), body: () => itemsTab(built, picker) },
    queue: {
      label: t('Kolejka ({count}/{limit})', { count: crafting.queue.length, limit: crafting.limit }),
      body: () =>
        crafting.queue.length > 0
          ? queueCard(crafting, tableTicks)
          : h('p', { class: 'system-hint', text: t('Kolejka jest pusta. Przerób materiały albo rozbierz przedmioty, a zlecenia staną tutaj.') }),
    },
    parts: { label: parts > 0 ? t('Części ({count})', { count: formatNumber(parts) }) : t('Części'), body: () => partsCard(crafting) },
  };
  const shown = tabs[tableTab] ? tableTab : 'materials';
  const body = h('div', { class: 'craft-tab' });
  // The queue's countdown, while its tab is in sight.
  const tableTicks = [];
  ticks.push((now) => {
    for (const update of tableTicks) update(now);
  });
  const tab = (id) =>
    h('button', {
      type: 'button',
      class: 'segmented-option',
      'aria-pressed': String(id === shown),
      text: tabs[id].label,
      onClick: (event) => {
        tableTab = id;
        for (const option of event.currentTarget.parentElement.children) option.setAttribute('aria-pressed', String(option === event.currentTarget));
        tableTicks.length = 0;
        body.replaceChildren(...[tabs[id].body()].flat().filter(Boolean));
      },
    });
  body.replaceChildren(...[tabs[shown].body()].flat().filter(Boolean));
  return [
    built &&
      crafting.materials.length === 0 &&
      crafting.queue.length === 0 &&
      items === 0 &&
      systemPanel(t('Stół czeka na materiały i przedmioty z plecaka. Zdobędziesz je na wyprawach.')),
    h(
      'section',
      { class: 'card craft-card', 'aria-label': t('Stół rozbiórki') },
      h('div', { class: 'segmented craft-tabs', role: 'group', 'aria-label': t('Stół rozbiórki') }, Object.keys(tabs).map(tab)),
      body,
    ),
  ];
}
