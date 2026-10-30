// The Osada, part I (src/server/settlement.js): the Tablica zleceń with its
// three orders and the week's big one, the brotherhoods' standings, the
// residents with their greetings, the Zaklinaczka's reforging and the
// Pustelnik's prices. A list for now: the board of places in the camp's
// style comes with its art (question 73).
//
// Where the deployment has no Osada yet, or the character is below its
// level, the tab says so as the other locked modules do.

import { fill, h } from '../dom.js';
import { formatCountdown, formatHours, formatNumber } from '../format.js';
import { call, serverNow, state, unlockInfo } from '../state.js';
import { closeSheet, confirmAction, openSheet, pageHeading, systemPanel, toast, withButton } from '../ui.js';

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
    if (!gone) render();
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
      h('p', { class: 'settlement-story', text: `„${order.story}”` }),
      h('p', { class: 'settlement-ask', text: `${formatNumber(order.count)} × ${order.label} (masz ${formatNumber(order.have)})` }),
      h('p', { class: 'muted', text: `Zapłata: ${formatNumber(order.gold)} złota, +${order.reputation} reputacji: ${order.brotherhoodName}` }),
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
          goods.length === 0 ? ' (handel na Targu, wkrótce)' : '',
        ),
      ),
    );

  function reforgeSheet() {
    const items = data.reforge.items;
    if (items.length === 0) {
      toast('Nie masz przedmiotów z afiksami do przekucia.');
      return;
    }
    let item = items[0];
    let affix = 0;
    const body = h('div', { class: 'settlement-reforge' });
    const draw = () => {
      const stacks = item.materials?.stacks ?? [];
      const material = h('select', { class: 'input', 'aria-label': 'Materiał' }, stacks.map((stack) => h('option', { value: stack.key, text: `${stack.label} (${stack.count})` })));
      const enough = state.character.gold >= item.gold && (!item.materials || stacks.length > 0);
      fill(
        body,
        h('label', { class: 'field-label', text: 'Przedmiot' }),
        h(
          'select',
          {
            class: 'input',
            onChange: (event) => {
              item = items.find((one) => String(one.id) === event.currentTarget.value);
              affix = 0;
              draw();
            },
          },
          items.map((one) => h('option', { value: String(one.id), selected: one === item, text: `${one.name}${one.equipped ? ' (założony)' : ''}` })),
        ),
        h('label', { class: 'field-label', text: 'Afiks do przekucia' }),
        h(
          'select',
          { class: 'input', onChange: (event) => (affix = Number(event.currentTarget.value)) },
          item.affixes.map((label, index) => h('option', { value: String(index), selected: index === affix, text: label })),
        ),
        item.materials && h('label', { class: 'field-label', text: `Materiał: ${item.materials.count} szt., ${item.materials.rarityName}` }),
        item.materials && (stacks.length > 0 ? material : h('p', { class: 'muted', text: 'Nie masz dość materiałów tej rzadkości.' })),
        h('p', { class: 'muted', text: `Koszt: ${formatNumber(item.gold)} złota.` }),
        data.reforge.choices > 1 && h('p', { class: 'muted', text: `Zaklinaczka wylosuje ${data.reforge.choices} nowe afiksy, a Ty zatrzymasz jeden z nich.` }),
        h('button', {
          type: 'button',
          class: 'button button--world',
          text: 'Przekuj',
          disabled: !enough,
          onClick: (event) =>
            withButton(event.currentTarget, async () => {
              const answer = await call('POST', '/api/settlement/reforge', { itemId: item.id, affix, material: item.materials ? material.value : undefined });
              closeSheet();
              toast(answer.pending ? 'Wybierz jeden z nowych afiksów.' : 'Zaklinaczka przekuła afiks.');
              load();
            }),
        }),
      );
    };
    draw();
    openSheet(h('h2', { class: 'sheet-title', text: 'Przekucie afiksu' }), body);
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

  // The affixes a reforging drew, waiting for the one the player keeps.
  function choiceCard({ name, old, options }) {
    return h(
      'div',
      { class: 'settlement-choice' },
      h('p', {}, h('strong', { text: name }), `: zamiast „${old}” wybierz jeden afiks.`),
      h(
        'div',
        { class: 'settlement-actions' },
        options.map((label, option) =>
          h('button', {
            type: 'button',
            class: 'button button--world button--small',
            text: label,
            onClick: (event) =>
              withButton(event.currentTarget, async () => {
                await call('POST', '/api/settlement/reforge/choose', { option });
                toast('Zaklinaczka przekuła afiks.');
                load();
              }),
          }),
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
              hermitButton('path', `Wyzeruj ścieżkę (${formatNumber(data.hermit.path)} zł.)`, 'Umiejętności klasy wrócą jako Punkty Umiejętności, a ścieżki wybierzesz od nowa.'),
              data.hermit.stats !== null && hermitButton('stats', `Wyzeruj statystyki (${formatNumber(data.hermit.stats)} zł.)`, 'Wszystkie rozdane punkty statystyk wrócą do rozdania.'),
            )
          : null;
    return h(
      'div',
      { class: `card settlement-resident${place?.soon ? ' settlement-resident--soon' : ''}` },
      h('p', {}, h('strong', { text: `${resident.name}, ${resident.title}` }), place ? ` · ${place.name}${place.soon ? ' (wkrótce)' : ''}` : ''),
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
