// The Osada, part I (src/server/settlement.js): the Tablica zleceń with its
// three orders and the week's big one, the brotherhoods' standings, the
// residents with their greetings, the Zaklinaczka's reforging and the
// Pustelnik's prices. A list for now: the board of places in the camp's
// style comes with its art (question 73).
//
// Where the deployment has no Osada yet, or the character is below its
// level, the tab says so as the other locked modules do.

import { materialIcon } from '../craft-table.js';
import { fill, h, icon } from '../dom.js';
import { formatCountdown, formatHours, formatNumber } from '../format.js';
import { setMusicPlace } from '../music.js';
import { call, serverNow, state, unlockInfo } from '../state.js';
import { closeSheet, confirmAction, openSheet, pageHeading, systemPanel, toast, withButton } from '../ui.js';
import { itemSummary } from './character.js';

// What is left of an order's week on the board: days, then hours.
function timeLeft(ms) {
  const hours = Math.max(0, ms) / 3600000;
  const days = Math.floor(hours / 24);
  return days > 0 ? `${days} ${days === 1 ? 'dzień' : 'dni'}` : formatHours(Math.max(hours, 1 / 60));
}

export function mountSettlement(container) {
  let data = null;
  let failure = null;
  let gone = false;
  let timer = null;

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
    // Herbs and potions wait in the bag until the report is claimed.
    const away = order.home && Boolean(state.character.activity);
    const deliver = h('button', {
      type: 'button',
      class: 'button button--world',
      text: 'Oddaj',
      disabled: !enough || away,
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
    return h(
      'div',
      { class: 'card settlement-order' },
      order.weekly && h('p', { class: 'settlement-weekly', text: 'Zlecenie tygodnia' }),
      order.special && h('p', { class: 'settlement-weekly', text: 'Zlecenie specjalne' }),
      h('p', { class: 'settlement-story', text: `„${order.story}”` }),
      h('p', { class: 'settlement-ask', text: `${formatNumber(order.count)} × ${order.label} (masz ${formatNumber(order.have)})` }),
      h('p', { class: 'muted', text: `Zapłata: ${formatNumber(order.gold)} złota, +${order.reputation} reputacji: ${order.brotherhoodName}${order.special ? ', +1 PS' : ''}` }),
      order.expiresAt && h('p', { class: 'muted', text: `Termin: jeszcze ${timeLeft(order.expiresAt - serverNow())}` }),
      order.kind === 'craft' && h('p', { class: 'muted', text: 'Wyroby z Warsztatu oddajesz z plecaka, najpierw najsłabsze.' }),
      away && h('p', { class: 'muted', text: order.kind === 'craft' ? 'Wyroby oddasz po odebraniu raportu z wyprawy albo pracy.' : 'Zioła i mikstury oddasz po odebraniu raportu z wyprawy albo pracy.' }),
      h('div', { class: 'settlement-actions' }, deliver, reject),
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
          goods.length === 0 ? ' (handel na Targowisku, wkrótce)' : '',
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
  function reforgeSheet() {
    const body = h('div', { class: 'settlement-reforge' });
    openSheet(h('h2', { class: 'sheet-title', text: 'Przekucie afiksu' }), body);
    if (data.reforge.pending) choose(data.reforge.pending);
    else pickItem();

    function pickItem() {
      const items = data.reforge.items;
      fill(
        body,
        items.length === 0
          ? h('p', { class: 'muted', text: 'Nie masz przedmiotów z afiksami do przekucia.' })
          : [
              h('p', { class: 'sheet-text', text: 'Wybierz przedmiot. Zaklinaczka przekuje jeden jego afiks: wylosuje go od nowa.' }),
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
          h('p', { class: 'field-label', text: 'Afiks do przekucia' }),
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
            text: chosen === null ? 'Wybierz afiks' : 'Przekuj',
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
        h('p', { class: 'settlement-result-title', text: 'Zaklinaczka przekuła afiks' }),
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
          h('button', { type: 'button', class: 'button button--world', text: 'Przekuj ponownie', onClick: () => pickAffix(result.itemId, affix, material) }),
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

  function residentCard(resident) {
    const place = data.places.find((one) => one.resident === resident.id);
    const action =
      resident.service === 'reforge'
        ? data.reforge.pending
          ? choiceCard(data.reforge.pending)
          : h('button', { type: 'button', class: 'button button--world', text: 'Przekuj afiks', onClick: reforgeSheet })
        : resident.service === 'hermit'
          ? h(
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
            )
          : null;
    return h(
      'div',
      { class: `card settlement-resident${place?.soon ? ' settlement-resident--soon' : ''}` },
      h('p', {}, h('strong', { text: `${resident.name}, ${resident.title}` }), place ? ` · ${place.name}${place.soon ? ' (wkrótce)' : ''}` : ''),
      h('p', { class: 'muted', text: resident.story }),
      h('p', { class: 'settlement-greeting', text: `„${resident.greeting}”` }),
      h('p', { class: 'muted', text: `Relacja: ${resident.standing.name}` }),
      !place?.soon && action,
    );
  }

  function render() {
    clearTimeout(timer);
    if (failure && (failure.status === 403 || failure.status === 404)) return locked();
    if (failure) return fill(container, pageHeading('Osada'), systemPanel(failure.message));
    if (!data) return fill(container, pageHeading('Osada'), h('p', { class: 'muted', text: 'Wczytywanie…' }));
    fill(
      container,
      pageHeading(`Osada: ${data.name}`, data.description),
      boardCard(),
      brotherhoodsCard(),
      h('section', { class: 'settlement-residents' }, h('h2', { class: 'section-title', text: 'Mieszkańcy' }), data.residents.map(residentCard)),
    );
    // An empty slot fills when its time comes.
    const next = Math.min(...data.board.slots.filter((slot) => slot.readyAt).map((slot) => slot.readyAt));
    if (Number.isFinite(next)) timer = setTimeout(load, Math.max(1000, next - serverNow() + 1000));
  }

  render();
  load();
  return {
    update: render,
    unmount() {
      gone = true;
      clearTimeout(timer);
    },
  };
}
