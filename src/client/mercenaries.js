// Najemnicy in the Karczma (src/server/mercenaries.js; the author,
// 5.11.2026: 633.1 A, 633.2 A, 633.3 A). The Karczma's tab, where a
// character offers itself for some hours at a price for each hour of an
// exploration, waits, and claims its pay, and where the others waiting to
// be hired now are listed, to take one along (the author: "Daj też opcję
// wynajęcia z pozycji Karczmy"); and the Najemnik in "Opcje wyprawy", who
// goes along on one exploration for that price. The words come from the
// data (settlement.json, mercenaries), the rules from the server
// (character.mercenaries).

import { fill, h } from './dom.js';
import { formatMinutes, formatNumber, timeFormat } from './format.js';
import { activityFinished, call, serverNow, state } from './state.js';
import { closeSheet, confirmAction, openSheet, systemPanel, toast, withButton } from './ui.js';

const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (all, name) => (name in vars ? String(vars[name]) : all));
const at = (time) => timeFormat.format(new Date(time));
const hoursText = (hours) => (hours === 1 ? '1 godzinę' : `${hours} ${hours % 10 >= 2 && hours % 10 <= 4 && (hours < 10 || hours > 20) ? 'godziny' : 'godzin'}`);

// The Karczma's tab with the character's offer and the mercenaries to take
// along (settlement.js), where the top bar and "Do Karczmy" lead.
export const MERCENARIES_HASH = '#/osada/tavern/mercenaries';

// What an exploration of `minutes` costs at `perHour`, as the server counts
// it (mercenaryFee in the engine): at least one gold.
export const mercenaryFee = (perHour, minutes) => Math.max(1, Math.round((perHour * minutes) / 60));

// The words of the character's offer or service now (its activity of the
// kind 'mercenary'), the server's with the time filled in here.
export function serviceText(activity) {
  const t = state.character.mercenaries?.texts;
  const { service } = activity;
  if (!t || !service) return '';
  if (activityFinished(activity)) return service.hired ? filled(t.done, { gold: formatNumber(service.hired.gold) }) : t.expired;
  return filled(service.text, { time: at(activity.endsAt) });
}

// While the offer's hours or the service are over, the pay (or the close
// of an offer nobody took) waits in the Karczma: the words of the dot on
// its tab, as the Osada's dot lights for it (serviceEnded on the server);
// otherwise null.
export function serviceWaiting(character = state.character) {
  const activity = character?.activity;
  const t = character?.mercenaries?.texts;
  if (!t || activity?.kind !== 'mercenary' || !activityFinished(activity)) return null;
  return activity.service?.hired ? t.dotPay : t.dotClose;
}

// The offer or the service on the Walka screen: it lives in the Karczma.
export function servicePanel(activity) {
  return systemPanel(serviceText(activity), h('a', { class: 'button button--system', href: MERCENARIES_HASH, text: 'Do Karczmy' }));
}

// The Karczma's card (`done` re-renders the place): the form to offer the
// character, or its offer and service with their buttons.
export function mercenariesCard(done) {
  const rules = state.character.mercenaries;
  if (!rules) return null;
  const t = rules.texts;
  const activity = state.character.activity;
  const head = [h('h2', { class: 'section-title', text: t.offerTitle }), h('p', { class: 'muted', text: t.intro })];
  if (activity?.kind === 'mercenary') {
    const finished = activityFinished(activity);
    const hired = activity.service?.hired;
    const act = (path, label, after) =>
      h('button', {
        type: 'button',
        class: 'button button--system',
        text: label,
        onClick: (event) =>
          withButton(event.currentTarget, async () => {
            const answer = await call('POST', path);
            if (answer.text) toast(answer.text);
            after?.();
            done();
          }),
      });
    return h(
      'section',
      { class: 'stack', 'data-guide': 'tavern-mercenaries' },
      ...head,
      systemPanel(
        serviceText(activity),
        finished ? act('/api/mercenary/claim', hired ? t.claim : t.close) : hired ? null : act('/api/mercenary/withdraw', t.withdraw),
      ),
    );
  }
  // The form: the hours as buttons, the price a number in its range.
  let hours = rules.hours.includes(4) ? 4 : rules.hours[0];
  const { min, max, suggested } = rules.price;
  const hourButtons = rules.hours.map((one) =>
    h('button', {
      type: 'button',
      class: 'button button--world button--small',
      'aria-pressed': String(one === hours),
      text: `${one} h`,
      onClick: (event) => {
        hours = one;
        for (const button of event.currentTarget.parentElement.children) button.setAttribute('aria-pressed', String(button === event.currentTarget));
      },
    }),
  );
  const price = h('input', { type: 'number', class: 'mercenary-price', inputmode: 'numeric', min, max, step: 1, value: suggested, 'aria-label': t.priceLabel });
  const busy = Boolean(activity);
  return h(
    'section',
    { class: 'stack', 'data-guide': 'tavern-mercenaries' },
    ...head,
    h('p', { class: 'mercenary-label', text: t.hoursLabel }),
    h('div', { class: 'mercenary-hours' }, hourButtons),
    h('label', { class: 'mercenary-label' }, h('span', { text: `${t.priceLabel} (${formatNumber(min)}–${formatNumber(max)} zł)` }), price),
    busy && h('p', { class: 'muted', text: t.offerBusy }),
    h('button', {
      type: 'button',
      class: 'button button--system',
      text: t.offer,
      disabled: busy,
      onClick: async (event) => {
        const button = event.currentTarget;
        const perHour = Math.round(Number(price.value));
        if (!Number.isFinite(perHour) || perHour < min || perHour > max) {
          toast(filled(t.invalidPrice, { min: formatNumber(min), max: formatNumber(max) }));
          return;
        }
        const sure = await confirmAction({ title: t.confirmTitle, text: filled(t.confirm, { hours: hoursText(hours) }), confirmLabel: t.offer });
        if (!sure) return;
        await withButton(button, async () => {
          await call('POST', '/api/mercenary/offer', { hours, perHour });
          done();
        });
      },
    }),
  );
}

// The mercenary taken along from the Karczma ("Weź na wyprawę") or picked
// in "Opcje wyprawy": chosen in the options of whatever place the player
// opens next, until it goes, the player takes it off ("Bez najemnika"),
// its offer ends, or "Wyrusz" finds it gone. On this page only, for the
// character that took it (names are the game's own, one each).
export function takenMercenary() {
  const taken = state.mercenary;
  if (!taken || taken.by !== state.character?.name || taken.one.until <= serverNow()) return null;
  return taken.one;
}
const keepMercenary = (one) => {
  state.mercenary = one ? { by: state.character.name, one } : null;
};

// Why the character cannot take a mercenary along now, as "Wyrusz" would
// not let it (the server's requireIdle): its own offer or service, or
// anything else it is doing; null when it can. Below the mercenaries'
// level the Karczma has no such tab.
function hireBlocked(character, t) {
  if (character.activity?.kind === 'mercenary') return t.hireOwnOffer;
  return character.activity ? t.hireBusy : null;
}

// The Karczma's list of those waiting to be hired now, as "Opcje wyprawy"
// lists them (GET /api/mercenaries: of other accounts, the class levels
// within the Drużyna's spread), each with its price an hour and "Weź na
// wyprawę", which keeps it for the next exploration (takenMercenary) and
// opens Walka, to choose the place and the length; the fee is paid at
// "Wyrusz". When the character cannot take one now, why, in place of the
// buttons. Mounted once in `holder` and kept while the Karczma redraws
// itself: refresh() draws it again from what it has, reload() asks again.
export function mountMercenaryHire(holder) {
  let list = null;
  let failure = null;
  let gone = false;
  let asking = 0;

  async function reload() {
    const ask = ++asking;
    try {
      const { mercenaries } = await call('GET', '/api/mercenaries');
      if (ask !== asking) return;
      list = mercenaries;
      failure = null;
    } catch (error) {
      if (ask !== asking) return;
      failure = error;
    }
    if (!gone) render();
  }

  function take(one) {
    keepMercenary(one);
    toast(filled(state.character.mercenaries.texts.hireToast, { name: one.name }));
    location.hash = '#/walka';
  }

  function render() {
    const t = state.character.mercenaries?.texts;
    if (!t) {
      fill(holder);
      return;
    }
    const why = hireBlocked(state.character, t);
    fill(
      holder,
      h('h2', { class: 'section-title', text: t.hireTitle }),
      h('p', { class: 'muted', text: t.hireIntro }),
      why && h('p', { class: 'region-warning', text: why }),
      failure
        ? h('p', { class: 'chat-error', role: 'status', text: failure.message })
        : list === null
          ? h('p', { class: 'muted', text: 'Wczytywanie…' })
          : list.length === 0
            ? h('p', { class: 'muted', text: t.none })
            : h(
                'ul',
                { class: 'stack mercenary-offers' },
                list.map((one) =>
                  h(
                    'li',
                    { class: 'mercenary-offer' },
                    h('span', { class: 'mercenary-row-name', text: `${one.name}, ${one.className}` }),
                    h('span', { class: 'mercenary-row-line', text: filled(t.row, { level: one.level, classLevel: one.classLevel, price: formatNumber(one.perHour) }) }),
                    !why && h('button', { type: 'button', class: 'button button--world button--small mercenary-offer-take', text: t.hire, onClick: () => take(one) }),
                  ),
                ),
              ),
    );
  }

  render();
  reload();
  return {
    refresh: () => {
      if (!gone) render();
    },
    reload,
    unmount() {
      gone = true;
    },
  };
}

// The Najemnik in "Opcje wyprawy": `minutesNow()` the length chosen,
// `onChange()` after a pick. The one taken from the Karczma, or picked
// before, is chosen at first (takenMercenary). chosen() gives what
// "Wyrusz" sends, or null; after the start went with it, forget(); when
// the start failed, failed(error) lets go of one whose offer is gone or
// changed meanwhile (the server's words say so).
const GONE = new Set(['mercenary_gone', 'mercenary_changed', 'mercenary_spread', 'own_mercenary', 'invalid_mercenary']);
export function mercenaryChoice(minutesNow, onChange) {
  const t = state.character.mercenaries.texts;
  let chosen = takenMercenary();
  const element = h('div', { class: 'mercenary-choice' });
  const feeOf = (one) => mercenaryFee(one.perHour, minutesNow());
  const choose = (one) => {
    chosen = one;
    keepMercenary(one);
    render();
    onChange();
  };
  const pick = (event) =>
    withButton(event.currentTarget, async () => {
      const minutes = minutesNow();
      const { mercenaries } = await call('GET', `/api/mercenaries?minutes=${minutes}`);
      const gold = state.character.gold;
      openSheet(
        h('h2', { class: 'sheet-title', text: t.pickTitle }),
        h('p', { class: 'sheet-text', text: `Cena za ${formatMinutes(minutes)} wyprawy. Masz ${formatNumber(gold)} zł.` }),
        mercenaries.length === 0
          ? h('p', { class: 'muted', text: t.none })
          : h(
              'div',
              { class: 'stack mercenary-list' },
              mercenaries.map((one) =>
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'mercenary-row',
                    disabled: gold < feeOf(one),
                    onClick: () => {
                      closeSheet();
                      choose(one);
                    },
                  },
                  h('span', { class: 'mercenary-row-name', text: `${one.name}, ${one.className}` }),
                  h('span', { class: 'mercenary-row-line', text: filled(t.row, { level: one.level, classLevel: one.classLevel, price: formatNumber(one.perHour) }) }),
                  h('span', { class: 'mercenary-row-fee', text: `${formatNumber(feeOf(one))} zł` }),
                ),
              ),
            ),
        h('div', { class: 'sheet-actions' }, h('button', { type: 'button', class: 'button button--world', text: 'Zamknij', onClick: closeSheet })),
      );
    });
  function render() {
    fill(
      element,
      h('p', { class: 'mercenary-choice-title', text: t.pickTitle }),
      h('p', { class: 'muted mercenary-choice-note', text: t.pickHint }),
      chosen
        ? h(
            'div',
            { class: 'mercenary-chosen' },
            h('span', { text: filled(t.chosen, { name: chosen.name, gold: formatNumber(feeOf(chosen)) }) }),
            // The length chosen may ask more than the character has.
            state.character.gold < feeOf(chosen) && h('span', { class: 'region-warning mercenary-chosen-short', text: t.noGold }),
            h('button', { type: 'button', class: 'button button--world button--small', text: t.change, onClick: pick }),
            h('button', { type: 'button', class: 'button button--world button--small', text: t.remove, onClick: () => choose(null) }),
          )
        : h('button', { type: 'button', class: 'button button--world button--small', text: t.pick, onClick: pick }),
    );
  }
  render();
  return {
    element,
    chosen: () => chosen && { id: chosen.id, perHour: chosen.perHour },
    // After a start: who went and for how much.
    hired: () => chosen && { name: chosen.name, gold: feeOf(chosen) },
    update: () => render(),
    forget: () => keepMercenary(null),
    failed: (error) => {
      if (chosen && GONE.has(error?.code)) choose(null);
    },
  };
}
