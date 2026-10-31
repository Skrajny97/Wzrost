// The Osada, part I (src/server/settlement.js): a board of places to tap in
// the camp's style (question 73 A), twice as tall as the camp's, and a
// screen for each place with its resident's bust, story and greeting
// (question 76): the Tablica zleceń with its three orders, the week's big
// one and the brotherhoods' standings, the Zaklinaczka's reforging, the
// Pustelnik's prices and the Karczma's rumors (part II). The places of the
// later parts show what is to come.
//
// Where the deployment has no Osada yet, or the character is below its
// level, the tab says so as the other locked modules do.

import { companionBust, residentBust, settlementGround, settlementPlaceArt, settlementTorchArt } from '../art.js';
import { materialIcon } from '../craft-table.js';
import { fill, h, icon } from '../dom.js';
import { formatCountdown, formatDecimal, formatHours, formatNumber } from '../format.js';
import { leaveView, openView } from '../history.js';
import { setMusicPlace } from '../music.js';
import { dayPart } from '../scenes.js';
import { call, serverNow, state, unlockInfo } from '../state.js';
import { closeSheet, confirmAction, openSheet, pageHeading, systemPanel, toast, withButton } from '../ui.js';
import { itemSummary } from './character.js';
import { mountMarket } from './market.js';

// What is left of an order's week on the board: days, then hours.
function timeLeft(ms) {
  const hours = Math.max(0, ms) / 3600000;
  const days = Math.floor(hours / 24);
  return days > 0 ? `${days} ${days === 1 ? 'dzień' : 'dni'}` : formatHours(Math.max(hours, 1 / 60));
}

const SETTLEMENT = '#/osada';
const HISTORY_KEY = 'osada'; // a place's screen lies one view below the board
// The board's ground, in its pixels: a place's picture keeps its own size on it.
const BOARD_WIDTH = 384;

export function mountSettlement(container, { params = {} } = {}) {
  const placeId = params.place ?? null;
  let data = null;
  let failure = null;
  let gone = false;
  let timer = null;
  // The orders the player unfolded: the Tablica lists them folded to their
  // names (the author: "powinny być zwinięte do nazw").
  const unfolded = new Set();
  // The Targowisko's panel, mounted once and kept while the screen redraws
  // itself, so that a redraw does not ask the server for it again.
  let market = null;
  const marketPanel = () => {
    if (!market) {
      const holder = h('div', { class: 'market' });
      market = { holder, ...mountMarket(holder) };
    } else market.refresh();
    return market.holder;
  };

  async function load() {
    try {
      data = (await call('GET', '/api/settlement')).settlement;
      failure = null;
    } catch (error) {
      failure = error;
    }
    if (gone) return;
    // The Osada's own music (the author's, question 78 A), once it is open.
    if (data) setMusicPlace(['settlement']);
    render();
  }

  // What an action answers with: the Osada as it is after it.
  const apply = (answer) => {
    if (answer.settlement) data = answer.settlement;
    if (!gone) render();
  };

  function locked() {
    const unlock = unlockInfo('settlement');
    const message =
      failure.status === 403
        ? `Dostęp zablokowany. ${unlock.name}: od poziomu postaci ${unlock.level}. Twój poziom: ${state.character.level}.`
        : `Moduł ${unlock.name} pojawi się w jednej z kolejnych aktualizacji gry.`;
    fill(container, pageHeading('Osada'), systemPanel(message));
  }

  function orderCard(order) {
    const enough = order.have >= order.count;
    const deliver = h('button', {
      type: 'button',
      class: 'button button--world',
      text: 'Oddaj',
      disabled: !enough,
      onClick: (event) =>
        withButton(event.currentTarget, async () => {
          const answer = await call('POST', '/api/settlement/deliver', { orderId: order.id });
          const { gold, systemPoints } = answer.delivered;
          toast(`Zlecenie oddane: +${formatNumber(gold)} złota${systemPoints ? `, +${systemPoints} PS` : ''}.`);
          apply(answer);
        }),
    });
    const reject =
      order.id !== 'weekly' &&
      h('button', {
        type: 'button',
        class: 'button button--small',
        text: 'Odrzuć',
        onClick: async (event) => {
          const button = event.currentTarget;
          if (!(await confirmAction({ title: 'Odrzucić zlecenie?', text: 'Nowe zlecenie przyjdzie za kilka godzin.', confirmLabel: 'Odrzuć' }))) return;
          withButton(button, async () => apply(await call('POST', '/api/settlement/reject', { orderId: order.id })));
        },
      });
    // Folded, an order shows its name, and a gold dot when it can be delivered.
    return h(
      'details',
      {
        class: 'card settlement-order settlement-fold',
        open: unfolded.has(order.id),
        onToggle: (event) => (event.currentTarget.open ? unfolded.add(order.id) : unfolded.delete(order.id)),
      },
      h(
        'summary',
        { class: 'settlement-fold-head' },
        h(
          'span',
          { class: 'settlement-fold-name' },
          order.weekly && h('span', { class: 'settlement-weekly', text: 'Zlecenie tygodnia' }),
          order.special && h('span', { class: 'settlement-weekly', text: 'Zlecenie specjalne' }),
          h('span', { class: 'settlement-ask', text: `${formatNumber(order.count)} × ${order.label}` }),
        ),
        enough && [h('span', { class: 'settlement-fold-dot', 'aria-hidden': 'true' }), h('span', { class: 'visually-hidden', text: 'Można oddać' })],
        icon('chevron', { size: 18, className: 'settlement-fold-chevron' }),
      ),
      h(
        'div',
        { class: 'settlement-fold-body' },
        h('p', { class: 'settlement-story', text: `„${order.story}”` }),
        h('p', { class: 'settlement-ask', text: `Masz ${formatNumber(order.have)} z ${formatNumber(order.count)}` }),
        h('p', { class: 'muted', text: `Zapłata: ${formatNumber(order.gold)} złota, +${order.reputation} reputacji: ${order.brotherhoodName}${order.special ? ', +1 PS' : ''}` }),
        order.expiresAt && h('p', { class: 'muted', text: `Termin: jeszcze ${timeLeft(order.expiresAt - serverNow())}` }),
        order.kind === 'craft' && h('p', { class: 'muted', text: 'Wyroby z Warsztatu oddajesz z plecaka, najpierw najsłabsze.' }),
        h('div', { class: 'settlement-actions' }, deliver, reject),
      ),
    );
  }

  function boardCard() {
    const slots = data.board.slots.map((slot) =>
      slot.order
        ? orderCard(slot.order)
        : h('div', { class: 'card settlement-order settlement-order--empty' }, h('p', { class: 'muted', text: `Nowe zlecenie za ${formatCountdown(slot.readyAt - serverNow())}.` })),
    );
    const weekly = data.board.weekly ? orderCard({ ...data.board.weekly, weekly: true }) : data.board.weeklyDone && h('p', { class: 'muted', text: 'Zlecenie tygodnia oddane. Następne w poniedziałek.' });
    return h('section', { class: 'settlement-board' }, h('h2', { class: 'section-title', text: 'Tablica zleceń' }), slots, weekly);
  }

  const brotherhoodsCard = () =>
    h(
      'section',
      { class: 'card settlement-brotherhoods' },
      h('h2', { class: 'section-title', text: 'Bractwa' }),
      data.brotherhoods.map(({ name, standing, goods }) =>
        h(
          'p',
          {},
          h('strong', { text: name }),
          `: ${standing.name}`,
          standing.next ? `, ${formatNumber(standing.toNext)} pkt do stopnia ${standing.next.name}` : '',
          goods.length === 0 ? ' (handel na Targowisku)' : '',
        ),
      ),
    );

  // An item the Zaklinaczka can reforge as the bag and the equipment show
  // it, with its picture and rarity, or its name alone.
  const itemView = (id) => (state.character.bag ?? []).find((one) => one.id === id) ?? Object.values(state.character.equipment ?? {}).find((one) => one?.id === id);
  const itemHead = (item) => {
    const view = itemView(item.id);
    return view ? itemSummary(view) : h('span', { class: 'item-name', text: item.name });
  };
  const pickMark = () => h('span', { class: 'trade-pick-mark', 'aria-hidden': 'true' }, icon('check', { size: 18 }));

  // The Zaklinaczka's reforging in a sheet, a step at a time, in the game's
  // own rows (the author: "ekran wyboru przy afiksie powinien być
  // ingameowy"): the item, then its affix and the material, then what the
  // affix became, or the affixes she drew to keep one of.
  // The zaklęcie żywiołu in a sheet (part III, question 101 A): a weapon or
  // a body armour, then its element, each with what it gives and costs.
  function imbueSheet() {
    const body = h('div', { class: 'settlement-reforge' });
    const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);
    openSheet(h('h2', { class: 'sheet-title', text: 'Zaklęcie żywiołu' }), body);
    pickItem();

    function pickItem() {
      const { items } = data.imbue;
      fill(
        body,
        items.length === 0
          ? h('p', { class: 'muted', text: 'Nie masz broni ani pancerza do zaklęcia.' })
          : [
              h('p', { class: 'sheet-text', text: 'Wybierz broń albo pancerz. Broń zamieni część obrażeń na żywioł, a pancerz dostanie odporność na niego.' }),
              h(
                'ul',
                { class: 'item-list' },
                items.map((item) =>
                  h(
                    'li',
                    {},
                    h('button', { type: 'button', class: 'item-row', onClick: () => pickElement(item.id) }, itemHead(item), item.equipped && h('span', { class: 'chip', text: 'Założony' })),
                  ),
                ),
              ),
            ],
      );
    }

    function pickElement(itemId) {
      const item = data.imbue.items.find((one) => one.id === itemId);
      if (!item) return pickItem();
      const now = item.element && data.imbue.elements.find((one) => one.element === item.element);
      fill(
        body,
        h('button', { type: 'button', class: 'link-button settlement-back', onClick: pickItem }, icon('back', { size: 16 }), 'Inny przedmiot'),
        h('div', { class: 'settlement-reforge-item' }, itemHead(item)),
        now && h('p', { class: 'muted', text: `Ma już żywioł: ${now.name}. Nowy zastąpi stary.` }),
        data.imbue.elements.map((element) => {
          const effect = item.effects[element.element];
          const gives = effect.share ? `${Math.round(effect.share * 100)}% obrażeń jako ${element.name}` : `odporność na ${element.name} +${effect.value}`;
          const ready = element.have >= element.count && state.character.gold >= item.gold && item.element !== element.element;
          return h(
            'div',
            { class: 'settlement-choice' },
            h('p', {}, h('strong', { text: capital(element.name) }), ` · ${gives}`),
            h('p', { class: 'muted', text: `${formatNumber(item.gold)} zł. i ${element.count} × ${element.material} (masz ${formatNumber(element.have)})` }),
            h('button', {
              type: 'button',
              class: 'button button--world button--small',
              text: `Zaklnij: ${element.name}`,
              disabled: !ready,
              onClick: (event) =>
                withButton(event.currentTarget, async () => {
                  const answer = await call('POST', '/api/settlement/imbue', { itemId: item.id, element: element.element });
                  apply(answer);
                  closeSheet();
                  toast(`Zaklinaczka zaklęła żywioł w przedmiot ${answer.imbued.item}: ${answer.imbued.element}.`);
                }),
            }),
          );
        }),
      );
    }
  }

  function reforgeSheet() {
    const body = h('div', { class: 'settlement-reforge' });
    openSheet(h('h2', { class: 'sheet-title', text: 'Zaklęcie afiksu' }), body);
    if (data.reforge.pending) choose(data.reforge.pending);
    else pickItem();

    function pickItem() {
      const items = data.reforge.items;
      fill(
        body,
        items.length === 0
          ? h('p', { class: 'muted', text: 'Nie masz przedmiotów z afiksami do zaklęcia.' })
          : [
              h('p', { class: 'sheet-text', text: 'Wybierz przedmiot. Zaklinaczka zaklnie jeden jego afiks: wylosuje go od nowa.' }),
              h(
                'ul',
                { class: 'item-list' },
                items.map((item) =>
                  h(
                    'li',
                    {},
                    h('button', { type: 'button', class: 'item-row', onClick: () => pickAffix(item.id) }, itemHead(item), item.equipped && h('span', { class: 'chip', text: 'Założony' })),
                  ),
                ),
              ),
            ],
      );
    }

    function pickAffix(itemId, affix = null, stack = null) {
      const item = data.reforge.items.find((one) => one.id === itemId);
      if (!item) return pickItem();
      const stacks = item.materials?.stacks ?? [];
      // An item with one affix has nothing to choose.
      let chosen = affix ?? (item.affixes.length === 1 ? 0 : null);
      let material = stacks.some((one) => one.key === stack) ? stack : (stacks[0]?.key ?? null);
      const draw = () => {
        const short = item.gold - state.character.gold;
        const ready = chosen !== null && short <= 0 && (!item.materials || material !== null);
        fill(
          body,
          h('button', { type: 'button', class: 'link-button settlement-back', onClick: pickItem }, icon('back', { size: 16 }), 'Inny przedmiot'),
          h('div', { class: 'settlement-reforge-item' }, itemHead(item)),
          h('p', { class: 'field-label', text: 'Afiks do zaklęcia' }),
          h(
            'div',
            { class: 'settlement-picks' },
            item.affixes.map((label, index) =>
              h(
                'button',
                {
                  type: 'button',
                  class: 'item-row trade-pick settlement-pick',
                  'aria-pressed': String(index === chosen),
                  onClick: () => {
                    chosen = index;
                    draw();
                  },
                },
                h('span', { class: 'settlement-pick-text', text: label }),
                pickMark(),
              ),
            ),
          ),
          item.materials && h('p', { class: 'field-label', text: `Materiał: ${item.materials.count} szt., ${item.materials.rarityName}` }),
          item.materials &&
            (stacks.length > 0
              ? h(
                  'div',
                  { class: 'settlement-picks' },
                  stacks.map((one) =>
                    h(
                      'button',
                      {
                        type: 'button',
                        class: 'item-row trade-pick settlement-pick',
                        'aria-pressed': String(one.key === material),
                        onClick: () => {
                          material = one.key;
                          draw();
                        },
                      },
                      h('span', { class: 'settlement-pick-art' }, materialIcon(one.key.slice(0, one.key.lastIndexOf(':')), 28)),
                      h('span', { class: 'settlement-pick-text', text: `${one.label} (${formatNumber(one.count)})` }),
                      pickMark(),
                    ),
                  ),
                )
              : h('p', { class: 'muted', text: 'Nie masz dość materiałów tej rzadkości.' })),
          h('p', { class: 'muted', text: `Koszt: ${formatNumber(item.gold)} złota${short > 0 ? `, brakuje Ci ${formatNumber(short)}` : ''}.` }),
          data.reforge.choices > 1 && h('p', { class: 'muted', text: `Zaklinaczka wylosuje ${data.reforge.choices} nowe afiksy, a Ty zatrzymasz jeden z nich.` }),
          h('button', {
            type: 'button',
            class: 'button button--world',
            text: chosen === null ? 'Wybierz afiks' : 'Zaklnij',
            disabled: !ready,
            onClick: (event) =>
              withButton(event.currentTarget, async () => {
                const answer = await call('POST', '/api/settlement/reforge', { itemId, affix: chosen, material: item.materials ? material : undefined });
                await load();
                if (answer.pending) choose(answer.pending, { affix: chosen, material });
                else showResult(answer.result, { affix: chosen, material });
              }),
          }),
        );
      };
      draw();
    }

    // The affixes she drew: the one tapped goes on the item.
    function choose(pending, again = {}) {
      fill(
        body,
        h('div', { class: 'settlement-reforge-item' }, itemHead({ id: pending.itemId, name: pending.name })),
        h('p', { class: 'sheet-text', text: `Zaklinaczka wylosowała ${pending.options.length} afiksy. Wybierz ten, który zastąpi „${pending.old}”.` }),
        h(
          'div',
          { class: 'settlement-picks' },
          pending.options.map((label, option) =>
            h(
              'button',
              {
                type: 'button',
                class: 'item-row settlement-pick',
                onClick: (event) =>
                  withButton(event.currentTarget, async () => {
                    const answer = await call('POST', '/api/settlement/reforge/choose', { option });
                    await load();
                    showResult(answer.result, again);
                  }),
              },
              h('span', { class: 'settlement-pick-text', text: label }),
              icon('chevron', { size: 18 }),
            ),
          ),
        ),
      );
    }

    // What the affix became; the same affix can be reforged again at once.
    function showResult(result, { affix = null, material = null } = {}) {
      fill(
        body,
        h('p', { class: 'settlement-result-title', text: 'Zaklinaczka zaklęła afiks' }),
        h('div', { class: 'settlement-reforge-item' }, itemHead({ id: result.itemId, name: result.name })),
        h(
          'p',
          { class: 'settlement-change' },
          h('span', { class: 'settlement-change-old', text: result.old }),
          icon('chevron', { size: 18 }),
          h('span', { class: 'settlement-change-new', text: result.new }),
        ),
        h(
          'div',
          { class: 'sheet-actions' },
          h('button', { type: 'button', class: 'button button--world', text: 'Zaklnij ponownie', onClick: () => pickAffix(result.itemId, affix, material) }),
          h('button', { type: 'button', class: 'button button--system', text: 'Gotowe', onClick: closeSheet }),
        ),
      );
    }
  }

  // A Pustelnik's reset, after the player says yes.
  const hermitButton = (service, label, text) =>
    h('button', {
      type: 'button',
      class: 'button button--small',
      text: label,
      onClick: async (event) => {
        const button = event.currentTarget;
        if (!(await confirmAction({ title: 'Zerowanie u Pustelnika', text, confirmLabel: 'Zeruj' }))) return;
        withButton(button, async () => {
          const answer = await call('POST', '/api/settlement/hermit', { service });
          toast(`Pustelnik wziął ${formatNumber(answer.gold)} złota. Gotowe.`);
          load();
        });
      },
    });

  // The affixes a reforging drew, waiting in the Osada for the one the
  // player keeps: the sheet picks up there.
  const choiceCard = ({ name, old }) =>
    h(
      'div',
      { class: 'settlement-choice' },
      h('p', {}, h('strong', { text: name }), `: Zaklinaczka czeka, aż wybierzesz afiks w miejsce „${old}”.`),
      h('button', { type: 'button', class: 'button button--world', text: 'Wybierz afiks', onClick: reforgeSheet }),
    );

  // The Pustelnik's change of evolution: the class's other evolutions, the
  // first change free.
  function evolutionSheet() {
    const offer = data.hermit.evolution;
    const price = offer.price > 0 ? `${formatNumber(offer.price)} złota` : 'za darmo, pierwszy raz';
    openSheet(
      h('h2', { class: 'sheet-title', text: 'Zmiana ewolucji' }),
      h(
        'div',
        { class: 'settlement-choice' },
        h('p', { class: 'muted', text: `Teraz: ${offer.current}. Zmiana: ${price}. Umiejętności nowej ewolucji zaczniesz od zera, a punkty z nich wrócą do rozdania.` }),
        h(
          'div',
          { class: 'settlement-actions' },
          offer.choices.map((choice) =>
            h('button', {
              type: 'button',
              class: 'button button--world button--small',
              text: choice.name,
              disabled: state.character.gold < offer.price,
              onClick: async (event) => {
                const button = event.currentTarget;
                if (!(await confirmAction({ title: `Zmienić ewolucję na: ${choice.name}?`, text: `Koszt: ${price}.`, confirmLabel: 'Zmień' }))) return;
                withButton(button, async () => {
                  await call('POST', '/api/settlement/hermit', { service: 'evolution', evolutionId: choice.id });
                  closeSheet();
                  toast(`Nowa ewolucja: ${choice.name}.`);
                  load();
                });
              },
            }),
          ),
        ),
      ),
    );
  }

  // The Karczma (question 116): a mug and, with it, today's rumor of an
  // elite or a champion; one a day.
  // The rumor is the innkeeper's words alone: what it means, the player
  // finds out (the author: "nie informuj z pozycji Systemu co oznacza
  // plotka, zeby gracz sie domyślił").
  function tavernCard() {
    const { mug, rumor } = data.tavern;
    if (!rumor) {
      return h(
        'div',
        { class: 'settlement-choice' },
        h('p', { class: 'muted', text: 'Za kufel Zbylut chętnie podzieli się plotką z traktu.' }),
        h('button', {
          type: 'button',
          class: 'button button--world',
          text: `Postaw kufel (${formatNumber(mug)} zł.)`,
          disabled: state.character.gold < mug,
          onClick: (event) =>
            withButton(event.currentTarget, async () => {
              apply(await call('POST', '/api/settlement/tavern'));
            }),
        }),
      );
    }
    return h(
      'div',
      { class: 'settlement-choice' },
      h('p', { class: 'settlement-greeting', text: rumor.text }),
      h('p', { class: 'muted', text: 'Następną plotkę Zbylut usłyszy jutro.' }),
    );
  }

  // A companion or a candidate (questions 104–113): class, level, numbers,
  // traits, skills, gear and story, with what can be done with it.
  // A companion's gift of the week from its profession (question 112 A),
  // into the bag, also while the character is away.
  function giftRow(companion) {
    const { gift } = companion;
    return h(
      'div',
      { class: 'settlement-choice' },
      h('p', { class: 'muted', text: `Prezent tygodnia z profesji: ${gift.count} × ${gift.name}.` }),
      h('button', {
        type: 'button',
        class: 'button button--world button--small',
        text: 'Odbierz prezent',
        onClick: (event) =>
          withButton(event.currentTarget, async () => {
            const answer = await call('POST', '/api/settlement/gift', { companionId: companion.id });
            apply(answer);
            toast(`Odebrano: ${answer.gift.count} × ${answer.gift.name}.`);
          }),
      }),
    );
  }

  // What a companion wears in its three places; one hired has a button to
  // put on an item from the bag (question 108 A), at home as every change
  // of the bag, while a candidate only shows what it comes with.
  function wearList(companion) {
    const hired = Boolean(companion.wearable);
    const away = Boolean(state.character.activity);
    return h(
      'div',
      { class: 'settlement-companion-wear' },
      companion.wear.map((place) =>
        h(
          'div',
          { class: 'settlement-companion-slot' },
          h('span', { class: 'field-label', text: place.slotName }),
          place.item ? itemSummary(place.item) : h('span', { class: 'muted', text: 'Pusto' }),
        ),
      ),
      hired && h('button', { type: 'button', class: 'button button--small', text: 'Załóż z plecaka', disabled: away, onClick: () => wearSheet(companion) }),
      hired && away && h('p', { class: 'muted', text: 'Przedmioty zakłada się po powrocie z wyprawy.' }),
    );
  }

  // The bag's items the companion can wear, to tap one; what it wore in
  // that place goes back to the bag.
  function wearSheet(companion) {
    const items = companion.wearable.map((id) => itemView(id)).filter(Boolean);
    const put = (item) => (event) =>
      withButton(event.currentTarget, async () => {
        apply(await call('POST', '/api/settlement/equip', { companionId: companion.id, itemId: item.id }));
        closeSheet();
        toast(`${companion.name} nosi teraz: ${item.name}.`);
      });
    openSheet(
      h('h2', { class: 'sheet-title', text: `Sprzęt: ${companion.name}` }),
      items.length === 0
        ? h('p', { class: 'sheet-text', text: 'W plecaku nie ma nic, co ten towarzysz może założyć: broni ani pancerza swojej klasy na swój poziom, ani talizmanu.' })
        : [
            h('p', {
              class: 'sheet-text',
              text:
                companion.appearance === 'female'
                  ? 'Wybierz przedmiot. To, co towarzyszka nosiła w tym miejscu, wróci do plecaka, a przy odprawie odda wszystko, co od Ciebie dostała.'
                  : 'Wybierz przedmiot. To, co towarzysz nosił w tym miejscu, wróci do plecaka, a przy odprawie odda wszystko, co od Ciebie dostał.',
            }),
            h(
              'ul',
              { class: 'item-list' },
              items.map((item) => h('li', {}, h('button', { type: 'button', class: 'item-row', onClick: put(item) }, itemSummary(item)))),
            ),
          ],
    );
  }

  function companionCard(companion, action) {
    // Its wounds heal with the character's rest (the author: "Niech rany
    // towarzyszy goją się wraz z ranami postaci").
    const wounded = companion.wounded
      ? `${companion.appearance === 'female' ? 'Ranna' : 'Ranny'}. Wróci do sił, gdy postać ${companion.healsAt ? `odpocznie do pełna HP (jeszcze ${formatCountdown(companion.healsAt - serverNow())})` : 'po wyprawie odpocznie do pełna HP'}.`
      : null;
    // Its own face (question 107 B) beside who it is, as a resident's.
    const bust = companionBust(companion.classId, companion.appearance);
    return h(
      'article',
      { class: 'card settlement-companion' },
      h(
        'div',
        { class: 'settlement-resident-head' },
        bust && h('span', { class: 'settlement-resident-bust' }, bust),
        h(
          'div',
          {},
          h('p', { class: 'settlement-resident-name', text: `${companion.name}, ${companion.className}, poz. ${companion.level}` }),
          h('p', { class: 'muted', text: `HP ${formatNumber(companion.maxHp)} · pancerz ${formatNumber(companion.armor)}${companion.profession ? ` · ${companion.profession}` : ''}` }),
          h('p', { class: 'muted settlement-resident-story', text: companion.story }),
        ),
      ),
      h(
        'ul',
        { class: 'settlement-companion-list' },
        companion.traits.map((trait) => h('li', {}, h('strong', { text: trait.name }), `: ${trait.text}`)),
        companion.skills.map((skill) => h('li', { text: `${skill.name}${skill.level > 0 ? `, poz. ${skill.level}` : ', jeszcze nie umie'}` })),
        !companion.wear && h('li', { class: 'muted', text: `Sprzęt: ${companion.gear.join(', ')}` }),
      ),
      companion.wear && wearList(companion),
      companion.gift && giftRow(companion),
      wounded && h('p', { class: 'region-warning', text: wounded }),
      action,
    );
  }

  // The werbunek: the companions hired (they go on every exploration but a
  // Szybkie Polowanie) and this week's candidates, from the standing with
  // the innkeeper that gives a place and a bed in the camp's Kwatery.
  function companionsCard() {
    const { places, moreBeds, cheaper, hired, candidates } = data.companions;
    const full = hired.length >= places;
    // Every standing with Zbylut may hire, a lower one for more gold; each
    // companion needs a bed in the camp's Kwatery.
    const beds =
      places === 0
        ? ' Towarzysz potrzebuje posłania: zbuduj Kwatery w obozie.'
        : ` Miejsca: ${hired.length} z ${places}.${full && moreBeds ? ' Kolejne posłanie da rozbudowa Kwater w obozie.' : ''}`;
    const intro = `Towarzysze idą z tobą na każdą wyprawę poza Szybkim Polowaniem i rosną razem z tobą. Werbunek to jednorazowa opłata, bez żołdu${cheaper ? ', a im lepiej zna cię Zbylut, tym jest tańszy' : ''}.${beds}`;
    const dismiss = (companion) =>
      h('button', {
        type: 'button',
        class: 'button button--small',
        text: 'Odpraw',
        onClick: async (event) => {
          const button = event.currentTarget;
          const given = companion.wear.some((place) => place.item?.given);
          const got = companion.appearance === 'female' ? 'dostała' : 'dostał';
          const text = `${companion.name} odejdzie na dobre${given ? ` i odda wszystko, co od Ciebie ${got}` : ''}.`;
          if (!(await confirmAction({ title: `Odprawić: ${companion.name}?`, text, confirmLabel: 'Odpraw' }))) return;
          withButton(button, async () => apply(await call('POST', '/api/settlement/dismiss', { companionId: companion.id })));
        },
      });
    const hire = (candidate) =>
      h('button', {
        type: 'button',
        class: 'button button--world button--small',
        text: `Zwerbuj (${formatNumber(candidate.price)} zł.)`,
        disabled: full || state.character.gold < candidate.price,
        onClick: (event) => withButton(event.currentTarget, async () => apply(await call('POST', '/api/settlement/hire', { candidateId: candidate.id }))),
      });
    return h(
      'section',
      { class: 'stack' },
      h('h2', { class: 'section-title', text: 'Towarzysze' }),
      h('p', { class: 'muted', text: intro }),
      hired.map((companion) => companionCard(companion, dismiss(companion))),
      h('h2', { class: 'section-title', text: 'Szukają pracy w tym tygodniu' }),
      candidates.length === 0
        ? h('p', { class: 'muted', text: 'Nikt więcej nie szuka pracy. Nowi przyjdą w poniedziałek.' })
        : candidates.map((candidate) => companionCard(candidate, hire(candidate))),
    );
  }

  // The Chata zielarki (part III, questions 120 A and 121 A): Jagna buys the
  // bag's herbs and potions for more than the scrapper, at home, and the
  // trade raises the relation with her and the herbalists' reputation up to
  // the day's limit.
  function herbalistCard() {
    const { premium, goods, trade } = data.herbalist;
    const sell = (good) => (event) =>
      withButton(event.currentTarget, async () => {
        const answer = await call('POST', '/api/settlement/herbalist', { kind: good.kind, id: good.id, count: good.count });
        apply(answer);
        const { gold, points } = answer.sold;
        toast(`Jagna płaci ${formatNumber(gold)} zł.${points > 0 ? ` Relacja z nią i reputacja Bractwa Zielarzy +${points}.` : ''}`);
      });
    return h(
      'section',
      { class: 'stack' },
      h('h2', { class: 'section-title', text: 'Skup ziół i mikstur' }),
      h('p', {
        class: 'muted',
        text: `Jagna płaci o ${Math.round(premium * 100)}% więcej niż złomiarz, a z lepszą relacją jeszcze więcej. Handel daje relację z nią i reputację Bractwa Zielarzy: dziś ${trade.today} z ${trade.daily} punktów.`,
      }),
      goods.length === 0
        ? h('p', { class: 'muted', text: 'W torbie nie ma ziół ani mikstur.' })
        : h(
            'ul',
            { class: 'settlement-goods' },
            goods.map((good) =>
              h(
                'li',
                { class: 'settlement-good' },
                h('p', {}, h('strong', { text: `${good.name} × ${formatNumber(good.count)}` })),
                h('p', { class: 'muted', text: `${formatDecimal(good.price)} zł. za sztukę, u złomiarza ${formatDecimal(good.scrap)} zł.` }),
                h('button', {
                  type: 'button',
                  class: 'button button--world button--small',
                  text: `Sprzedaj wszystkie (${formatNumber(Math.max(1, Math.round(good.price * good.count)))} zł.)`,
                  onClick: sell(good),
                }),
              ),
            ),
          ),
    );
  }

  // A resident's services, on their place's screen.
  function services(resident) {
    if (resident.service === 'reforge')
      return h(
        'div',
        { class: 'stack' },
        data.reforge.pending ? choiceCard(data.reforge.pending) : h('button', { type: 'button', class: 'button button--world', text: 'Zaklnij afiks', onClick: reforgeSheet }),
        data.imbue && h('button', { type: 'button', class: 'button button--world', text: 'Zaklnij żywioł', onClick: imbueSheet }),
      );
    if (resident.service === 'tavern') return h('div', { class: 'stack' }, tavernCard(), companionsCard());
    if (resident.service === 'herbalist') return herbalistCard();
    if (resident.service !== 'hermit') return null;
    return h(
      'div',
      { class: 'settlement-actions' },
      data.hermit.path !== null &&
        hermitButton('path', `Wyzeruj ścieżkę (${formatNumber(data.hermit.path)} zł.)`, 'Umiejętności klasy wrócą jako Punkty Umiejętności, a ścieżki wybierzesz od nowa.'),
      data.hermit.stats !== null && hermitButton('stats', `Wyzeruj statystyki (${formatNumber(data.hermit.stats)} zł.)`, 'Wszystkie rozdane punkty statystyk wrócą do rozdania.'),
      data.hermit.evolution &&
        h('button', {
          type: 'button',
          class: 'button button--small',
          text: data.hermit.evolution.price > 0 ? `Zmień ewolucję (${formatNumber(data.hermit.evolution.price)} zł.)` : 'Zmień ewolucję (pierwszy raz darmo)',
          onClick: evolutionSheet,
        }),
    );
  }

  // The resident of a place (question 76): the bust, who they are, their
  // story and how they greet the character at its relation.
  const residentCard = (resident) =>
    h(
      'section',
      { class: 'card settlement-resident' },
      h(
        'div',
        { class: 'settlement-resident-head' },
        h('span', { class: 'settlement-resident-bust' }, residentBust(resident.id)),
        h(
          'div',
          {},
          h('p', { class: 'settlement-resident-name', text: `${resident.name}, ${resident.title}` }),
          h('p', { class: 'muted', text: `Relacja: ${resident.standing.name}` }),
          h('p', { class: 'muted settlement-resident-story', text: resident.story }),
        ),
      ),
      h('p', { class: 'settlement-greeting', text: `„${resident.greeting}”` }),
    );

  // Whether the Tablica has an order to deliver now, for its dot on the board.
  const deliverable = () =>
    [...data.board.slots.map((slot) => slot.order), data.board.weekly].some((order) => order && order.have >= order.count);

  // A torch on the board, at its own size, standing on its spot: its flame
  // flickers and glows as the camp's fire does, more at dusk and at night
  // (the author: "pochodnie [...] które będą działać jak małe ogniska");
  // each keeps its own beat. Still with the animations off. By day it is
  // put out (the author: "Niech za dnia beda zgaszone te pochodnie całkiem").
  function torchLight({ x, y }, index, lit) {
    const art = settlementTorchArt(lit);
    if (!art) return null;
    const torch = h(
      'span',
      { class: 'settlement-torch', style: { left: `${x}%`, top: `${y}%` }, 'aria-hidden': 'true' },
      art,
      lit && h('span', { class: 'settlement-torch-glow', style: { animationDelay: `${-index * 0.61}s` } }),
      lit && h('span', { class: 'settlement-torch-flame', style: { animationDelay: `${-index * 0.29}s` } }),
    );
    const size = () => (torch.style.width = `${(art.naturalWidth / BOARD_WIDTH) * 100}%`);
    if (art.complete && art.naturalWidth) size();
    else art.addEventListener('load', size, { once: true });
    return torch;
  }

  // A place on the board: its picture at its own size on the ground, its
  // name, and a dot on the Tablica when an order waits, on the Targowisko
  // when a parcel does.
  function placeLink(place) {
    const hash = `${SETTLEMENT}/${place.id}`;
    const art = settlementPlaceArt(place.id);
    const link = h(
      'a',
      {
        class: `settlement-place${place.soon ? ' settlement-place--soon' : ''}`,
        href: hash,
        style: { left: `${place.x}%`, top: `${place.y}%` },
        'aria-label': place.soon ? `${place.name}, wkrótce` : place.name,
        // Where the narrator's Osada chapter points (narrator.js).
        'data-guide': `osada-${place.id}`,
        onClick: (event) => openView(event, hash, HISTORY_KEY),
      },
      art ? h('span', { class: 'settlement-place-art-box' }, art) : h('span', { class: 'settlement-place-empty' }),
      h('span', { class: 'settlement-place-label', text: place.name }),
      ((place.id === 'board' && deliverable()) || (place.id === 'market' && data.market?.waiting > 0)) && h('span', { class: 'settlement-place-dot', 'aria-hidden': 'true' }),
    );
    if (art) {
      const size = () => (link.style.width = `${(art.naturalWidth / BOARD_WIDTH) * 100}%`);
      if (art.complete && art.naturalWidth) size();
      else art.addEventListener('load', size, { once: true });
    }
    return link;
  }

  // The board (question 73 A): the ground of Rozstaje, twice as tall as the
  // camp's (the author: "Ja to bym dał nawet z 2 razy większą tę Osadę"),
  // scrolling with the page, and its places.
  function boardView() {
    const ground = settlementGround();
    const part = dayPart();
    fill(
      container,
      pageHeading(`Osada: ${data.name}`, data.description),
      h(
        'div',
        // The camp's light of the hour in Poland (scenes.js), as on its board.
        { class: `settlement-map settlement-map--${part}`, role: 'group', 'aria-label': 'Plansza Osady' },
        ground && h('img', { class: 'settlement-map-ground', src: ground, alt: '', decoding: 'async', draggable: 'false' }),
        (data.torches ?? []).map((torch, index) => torchLight(torch, index, part !== 'day')),
        data.places.map(placeLink),
      ),
    );
  }

  // A place's screen: its resident and what they do, the Tablica's orders
  // and the brotherhoods; a place of a later part says so.
  function placeView(place) {
    const resident = data.residents.find((one) => one.id === place.resident);
    fill(
      container,
      h(
        'div',
        { class: 'page-heading page-heading--back' },
        h(
          'div',
          { class: 'page-heading-text' },
          h('h1', { class: 'page-title', tabindex: '-1', text: place.name }),
          h('p', { class: 'page-subtitle', text: resident ? `${resident.name}, ${resident.title}` : `Osada: ${data.name}` }),
        ),
        h('button', { type: 'button', class: 'button button--system back-button', onClick: () => leaveView(SETTLEMENT, 1, HISTORY_KEY) }, icon('back', { size: 20 }), 'Powrót'),
      ),
      place.soon && systemPanel(`${place.name} otworzy się w jednej z kolejnych aktualizacji gry.`),
      resident && residentCard(resident),
      !place.soon && resident && services(resident),
      place.id === 'board' && [boardCard(), brotherhoodsCard()],
      place.id === 'market' && !place.soon && marketPanel(),
    );
  }

  function render() {
    clearTimeout(timer);
    if (failure && (failure.status === 403 || failure.status === 404)) return locked();
    if (failure) return fill(container, pageHeading('Osada'), systemPanel(failure.message));
    if (!data) return fill(container, pageHeading('Osada'), h('p', { class: 'muted', text: 'Wczytywanie…' }));
    const place = placeId && data.places.find((one) => one.id === placeId);
    // An unknown place in the address leads back to the board.
    if (placeId && !place) return location.replace(SETTLEMENT);
    if (place) placeView(place);
    else boardView();
    // An empty slot fills when its time comes, and a wounded companion is
    // ready again when the character has rested to full HP.
    const wounds = (data.companions?.hired ?? []).map((companion) => companion.healsAt).filter((at) => at > serverNow());
    const next = Math.min(...data.board.slots.filter((slot) => slot.readyAt).map((slot) => slot.readyAt), ...wounds);
    if (Number.isFinite(next)) timer = setTimeout(load, Math.max(1000, next - serverNow() + 1000));
  }

  render();
  load();
  return {
    update: render,
    unmount() {
      gone = true;
      clearTimeout(timer);
      market?.unmount();
    },
  };
}
