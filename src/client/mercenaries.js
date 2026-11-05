// Najemnicy in the Karczma (src/server/mercenaries.js; the author,
// 5.11.2026: 633.1 A, 633.2 A, 633.3 A). The Karczma's card, where a
// character offers itself for some hours at a price for each hour of an
// exploration, waits, and claims its pay; and the Najemnik in "Opcje
// wyprawy", who goes along on one exploration for that price. The words
// come from the data (settlement.json, mercenaries), the rules from the
// server (character.mercenaries).

import { fill, h } from './dom.js';
import { formatMinutes, formatNumber, timeFormat } from './format.js';
import { activityFinished, call, state } from './state.js';
import { closeSheet, confirmAction, openSheet, systemPanel, toast, withButton } from './ui.js';

const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (all, name) => (name in vars ? String(vars[name]) : all));
const at = (time) => timeFormat.format(new Date(time));
const hoursText = (hours) => (hours === 1 ? '1 godzinę' : `${hours} ${hours % 10 >= 2 && hours % 10 <= 4 && (hours < 10 || hours > 20) ? 'godziny' : 'godzin'}`);

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

// The offer or the service on the Walka screen: it lives in the Karczma.
export function servicePanel(activity) {
  return systemPanel(serviceText(activity), h('a', { class: 'button button--system', href: '#/osada/tavern', text: 'Do Karczmy' }));
}

// The Karczma's card (`done` re-renders the place): the form to offer the
// character, or its offer and service with their buttons.
export function mercenariesCard(done) {
  const rules = state.character.mercenaries;
  if (!rules) return null;
  const t = rules.texts;
  const activity = state.character.activity;
  const head = [h('h2', { class: 'section-title', text: t.title }), h('p', { class: 'muted', text: t.intro })];
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
    busy && h('p', { class: 'muted', text: 'Postać jest teraz zajęta. Usługi wystawisz, gdy wróci.' }),
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

// The Najemnik in "Opcje wyprawy": `minutesNow()` the length chosen,
// `onChange()` after a pick. chosen() gives what "Wyrusz" sends, or null.
export function mercenaryChoice(minutesNow, onChange) {
  const t = state.character.mercenaries.texts;
  let chosen = null;
  const element = h('div', { class: 'mercenary-choice' });
  const feeOf = (one) => mercenaryFee(one.perHour, minutesNow());
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
                      chosen = one;
                      closeSheet();
                      render();
                      onChange();
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
            h('button', { type: 'button', class: 'button button--world button--small', text: t.change, onClick: pick }),
            h('button', {
              type: 'button',
              class: 'button button--world button--small',
              text: t.remove,
              onClick: () => {
                chosen = null;
                render();
                onChange();
              },
            }),
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
  };
}
