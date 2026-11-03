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
  const waiting = skipped > 0 ? ` Na wyższy poziom stołu ${skipped === 1 ? 'czeka' : 'czekają'}: ${countOf(skipped, 'materiał', 'materiały', 'materiałów')}.` : '';
  toast(`${ordered === 1 ? 'Materiał trafił na stół.' : `Na stole: ${countOf(ordered, 'zlecenie', 'zlecenia', 'zleceń')}.`}${waiting}`);
}

// What materials are, while there are none yet (the author's sentence).
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
  const meta = h('p', { class: 'item-meta', text: `${material.rarityName} · ${formatNumber(material.count)} szt.` });
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
    : table && h('a', { class: 'button button--world', href: `#/oboz/${table.id}`, onClick: closeSheet, text: 'Zbuduj Stół rozbiórki' });
  const less = h('button', { type: 'button', class: 'button button--world duration-step', 'aria-label': 'Mniej', text: '−', onClick: () => set(count - 1) });
  const more = h('button', { type: 'button', class: 'button button--world duration-step', 'aria-label': 'Więcej', text: '+', onClick: () => set(count + 1) });
  const all = h('button', { type: 'button', class: 'link-button', text: 'wszystkie', onClick: () => set(material.count) });
  function set(next) {
    count = Math.min(material.count, Math.max(1, next));
    value.textContent = `${formatNumber(count)} szt.`;
    makes.textContent = `Stół rozbiórki zrobi z tego: ${material.part} ×${formatNumber(count)}.`;
    if (built) process.textContent = `Przerób ${formatNumber(count)} szt.`;
    sell.textContent = `Sprzedaj za ${formatNumber(price(count))} złota`;
    less.disabled = count === 1;
    more.disabled = count === material.count;
  }
  set(count);
  sell.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const sure = await confirmAction({
      title: 'Sprzedać materiał?',
      text: `Złomiarz kupi: ${materialTitle(material)} ×${formatNumber(count)} za ${formatNumber(price(count))} złota. Stół rozbiórki zrobiłby z tego: ${material.part} ×${formatNumber(count)}.`,
      confirmLabel: 'Sprzedaj',
    });
    // Not sold: back to the material's card as it was, once the
    // confirmation's sheet has finished closing.
    if (!sure) return afterSheet(() => materialSheet(material, count));
    withButton(button, async () => {
      const { sold } = await call('POST', '/api/materials/sell', { key: material.key, count });
      closeSheet();
      playSound('coin');
      toast(`Złomiarz kupił ${formatNumber(sold.count)} szt. za ${formatNumber(sold.gold)} złota.`);
    });
  });
  openSheet(
    h(
      'div',
      { class: 'item-details' },
      art ? h('div', { class: 'item-head' }, h('span', { class: 'item-art', vars: { '--rarity': material.color } }, art), h('div', {}, title, meta)) : [title, meta],
      description && h('p', { class: 'sheet-text', text: description }),
      makes,
      h('p', { class: 'sheet-text', text: `Złomiarz płaci ${formatDecimal(material.price)} złota za sztukę.` }),
      built && needs !== null && h('p', { class: 'system-hint', text: `Ten materiał Stół rozbiórki przerobi od swojego poziomu ${needs}.` }),
      built && needs === null && full && h('p', { class: 'system-hint', text: `Kolejka stołu jest pełna (${crafting.limit} zleceń). Poczekaj, aż skończy się pierwsze.` }),
    ),
    h('div', { class: 'herb-count' }, less, value, more, all),
    h('div', { class: 'sheet-actions' }, process, sell),
  );
}

// The table's tab shown, and the marks on its Materiały and Przedmioty,
// kept while the screen draws again.
let tableTab = 'materials';
const markedMaterials = new Set();
const markedItems = new Set();

// The Materiały tab: a tap on a material opens its card for as many pieces
// as chosen, and its tick marks it to go to the table with the others marked
// (the author: "Dodajmy jeszcze opcje zaznaczania roznych materialow w Stole
// rozbiórki"), each a whole stack and an order of its own.
function materialsTab(crafting, built, full) {
  if (crafting.materials.length === 0) return h('p', { class: 'system-hint', text: MATERIALS_HINT });
  const takes = (material) => material.needs === null;
  // Marks only on the stacks still there that the table takes.
  for (const key of [...markedMaterials]) if (!crafting.materials.some((material) => material.key === key && takes(material))) markedMaterials.delete(key);
  const room = Math.max(0, crafting.limit - crafting.queue.length);
  const roomNote = h('p', { class: 'region-warning', hidden: true });
  const processMarked = h('button', {
    type: 'button',
    class: 'button button--world',
    onClick: (event) =>
      withButton(event.currentTarget, async () => {
        const keys = [...markedMaterials];
        markedMaterials.clear();
        try {
          await craft({ keys });
        } catch (error) {
          for (const key of keys) markedMaterials.add(key);
          throw error;
        }
      }),
  });
  const update = () => {
    const marked = markedMaterials.size;
    const tooMany = marked > room;
    processMarked.textContent = marked > 0 ? `Przerób zaznaczone (${formatNumber(marked)})` : 'Przerób zaznaczone';
    processMarked.disabled = !built || full || marked === 0 || tooMany;
    roomNote.hidden = !built || full || !tooMany;
    roomNote.textContent = `Każdy materiał to osobne zlecenie stołu. Zaznaczone potrzebują ich: ${formatNumber(marked)}, a wolne miejsca w kolejce: ${formatNumber(room)}.`;
  };
  const row = (material) => {
    const mark = h(
      'button',
      {
        type: 'button',
        class: 'craft-mark',
        'aria-pressed': String(markedMaterials.has(material.key)),
        'aria-label': `Zaznacz: ${material.name} ×${material.count}`,
        disabled: !built || !takes(material),
        onClick: () => {
          if (markedMaterials.has(material.key)) markedMaterials.delete(material.key);
          else markedMaterials.add(material.key);
          mark.setAttribute('aria-pressed', String(markedMaterials.has(material.key)));
          update();
        },
      },
      icon('check', { size: 16 }),
    );
    return h(
      'li',
      { class: 'craft-row craft-row--pick' },
      h(
        'button',
        { type: 'button', class: 'craft-open', 'aria-label': `${material.name} ×${material.count}: wybierz liczbę sztuk`, onClick: () => materialSheet(material) },
        h('span', { class: 'craft-art' }, materialIcon(material.materialId)),
        h(
          'span',
          { class: 'craft-text' },
          h('span', { class: 'item-name', vars: { '--rarity': material.color }, text: `${material.name} ×${formatNumber(material.count)}` }),
          h('span', {
            class: 'item-meta',
            text: [material.rarityName, `daje: ${material.part} ×${formatNumber(material.count)}`, material.needs ? `od poziomu ${material.needs} stołu` : built && formatMinutes(material.minutes)]
              .filter(Boolean)
              .join(' · '),
          }),
        ),
      ),
      mark,
    );
  };
  update();
  return [
    built && h('p', { class: 'craft-note', text: 'Stuknij materiał, żeby przerobić albo sprzedać wybraną liczbę sztuk. Zaznacz kilka, żeby przerobić je naraz w całości.' }),
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
            text: 'Przerób wszystko',
            onClick: (event) => withButton(event.currentTarget, () => craft({ all: true })),
          }),
      ),
    !built && h('p', { class: 'system-hint', text: 'Zbuduj stół, żeby przerabiać materiały i rozbierać przedmioty.' }),
    built && full && h('p', { class: 'system-hint', text: `Kolejka jest pełna (${crafting.limit} zleceń). Poczekaj, aż skończy się pierwsze.` }),
  ];
}

// The Przedmioty tab: the bag's items to take apart from the table's own
// screen too (the author: "rozbieranie przedmiotów dostepne tez z pozycji
// stolu rozbiorki"), with the bag's "Rozbierz kilka" (`picker`, from
// character.js).
function itemsTab(built, picker) {
  const bag = state.character.bag.filter((item) => item.salvage);
  for (const id of [...markedItems]) if (!bag.some((item) => item.id === id)) markedItems.delete(id);
  if (!built) return h('p', { class: 'system-hint', text: 'Zbuduj stół, żeby przerabiać materiały i rozbierać przedmioty.' });
  if (bag.length === 0) return h('p', { class: 'system-hint', text: 'W plecaku nie ma przedmiotów do rozbiórki. Łupy z wypraw trafiają do plecaka.' });
  const { nodes, update } = picker(markedItems, { inline: true });
  update();
  return [h('p', { class: 'craft-note', text: 'Zaznacz przedmioty z plecaka, które stół ma rozebrać. Ponowne stuknięcie odznacza przedmiot.' }), ...nodes];
}

// The orders, the first one at work with its countdown; `ticks` gets its update.
function queueCard(crafting, ticks) {
  const [first, ...waiting] = crafting.queue;
  const countdown = h('strong', { class: 'craft-countdown' });
  const progress = h('div', { class: 'bar-fill bar-fill--gold' });
  ticks.push((now) => {
    countdown.textContent = formatCountdown(first.endsAt - now);
    const done = (now - first.startsAt) / (first.endsAt - first.startsAt);
    progress.style.width = `${Math.min(100, Math.max(0, done * 100))}%`;
  });
  const row = (order, extra) =>
    h(
      'li',
      { class: 'craft-row' },
      h('span', { class: 'craft-art' }, order.materialId ? materialIcon(order.materialId) : icon('hammer', { size: 24 })),
      h(
        'span',
        { class: 'craft-text' },
        h('span', { class: 'item-name', vars: { '--rarity': order.color }, text: order.count > 1 ? `${order.name} ×${order.count}` : order.name }),
        h('span', { class: 'item-meta', text: `${order.kind === 'material' ? 'przeróbka' : 'rozbiórka'} · daje: ${order.part} ×${formatNumber(order.parts)}` }),
        extra,
      ),
    );
  return h(
    'section',
    { class: 'craft-card', 'aria-label': `Kolejka (${crafting.queue.length} z ${crafting.limit})` },
    h(
      'ol',
      { class: 'craft-list' },
      row(first, h('span', { class: 'craft-progress' }, h('div', { class: 'bar' }, progress), countdown)),
      waiting.map((order) => row(order, h('span', { class: 'item-meta', text: `Gotowe o ${timeFormat.format(new Date(order.endsAt))}` }))),
    ),
    testSkip(),
  );
}

// Test mode only: every order ends at once.
function testSkip() {
  if (!state.user.testMode || !testModeOn()) return null;
  return h(
    'div',
    { class: 'test-tools' },
    h('p', { class: 'test-tools-text', text: 'Tryb testowy: kolejka skończy się od razu.' }),
    h('button', {
      type: 'button',
      class: 'button button--test',
      text: 'Pomiń czas',
      onClick: (event) => withButton(event.currentTarget, () => call('POST', '/api/test/skip-craft')),
    }),
  );
}

function partsCard(crafting) {
  return h(
    'section',
    { class: 'craft-card', 'aria-label': 'Części' },
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
    h('p', { class: 'system-hint', text: 'Z części powstaną przedmioty w profesjach, które dojdą później.' }),
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
    materials: { label: pieces > 0 ? `Materiały (${formatNumber(pieces)})` : 'Materiały', body: () => materialsTab(crafting, built, full) },
    items: { label: items > 0 ? `Przedmioty (${formatNumber(items)})` : 'Przedmioty', body: () => itemsTab(built, picker) },
    queue: {
      label: `Kolejka (${crafting.queue.length}/${crafting.limit})`,
      body: () =>
        crafting.queue.length > 0 ? queueCard(crafting, tableTicks) : h('p', { class: 'system-hint', text: 'Kolejka jest pusta. Przerób materiały albo rozbierz przedmioty, a zlecenia staną tutaj.' }),
    },
    parts: { label: parts > 0 ? `Części (${formatNumber(parts)})` : 'Części', body: () => partsCard(crafting) },
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
      systemPanel('Stół czeka na materiały i przedmioty z plecaka. Zdobędziesz je na wyprawach.'),
    h(
      'section',
      { class: 'card craft-card', 'aria-label': 'Stół rozbiórki' },
      h('div', { class: 'segmented craft-tabs', role: 'group', 'aria-label': 'Stół rozbiórki' }, Object.keys(tabs).map(tab)),
      body,
    ),
  ];
}
