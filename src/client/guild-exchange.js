// The Wymiana in the Gildia (src/server/guild-exchange.js; DECISIONS.md,
// "Wymiana zasobów w Gildii"; the author: "Dodatkowa funkcja w Gildii ->
// wymiana zasobów"): the card of the Gildia page's "Wymiana" tab with the
// character's own offers (the open ones with "Wycofaj", the last closed
// ones with how they ended) and "Wystaw ofertę", then the others' open
// offers, each "Daje X · Chce Y" with the resources' pictures and the
// poster's name, and "Wymień", or why it cannot be taken. The sheet of a new
// offer picks the resource given and the one wanted from the game's own
// buttons, each with its picture and the pieces held (as the list of
// "Poproś gildię" does, guild-requests.js), or gold for one side (the
// author: "Daj też mozliwość wymiany i wystawiania ofert w Gildii zasoby za
// złoto"), and takes the two counts; with the rules' sameCount the second
// one follows the first. Below the players' Wymiana's level (826 A) both
// "Wystaw ofertę" and "Wymień" only say so in a toast. The words come with
// the answer (data/guilds.json, exchange.texts), in the page's language;
// the card's own few go through t() (i18n.js).
// mountGuildExchange(container) adds the card to the container and gives
// { unmount() }, which takes it away.

import { goldArt, resourceArt } from './art.js';
import { fill, h, icon } from './dom.js';
import { dateTimeFormat, formatNumber } from './format.js';
import { t } from './i18n.js';
import { CLASS_ICONS } from './icons.js';
import { openProfile } from './profile.js';
import { call, state } from './state.js';
import { closeSheet, confirmAction, foldPart, framedName, howItWorks, openSheet, toast, withButton } from './ui.js';

const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
const resourceName = (id) => state.content.resources.find((resource) => resource.id === id)?.name ?? id;
// A side's picture: the resource's, or the gold coin.
const goodArt = (id) => (id === 'gold' ? goldArt(24) : resourceArt(id, 24));
// "Kamień × 50", as the answers name a side of an offer, never broken
// before the count.
const sideText = (side) => `${side.name} × ${formatNumber(side.count)}`;

// A side of an offer with its resource's picture.
function amount(side) {
  return h(
    'span',
    { class: 'guild-exchange-amount' },
    h('span', { class: 'guild-goods-art', 'aria-hidden': 'true' }, goodArt(side.resource)),
    h('span', { text: sideText(side) }),
  );
}

// "Daje X · Chce Y", or "Dajesz X · Chcesz Y" for the character's own; on
// a narrow phone the second side goes under the first, without the dot
// (styles.css).
function deal(offer, giveLabel, wantLabel) {
  const side = (label, one) => h('span', { class: 'guild-exchange-side' }, h('span', { class: 'guild-exchange-label', text: label }), amount(one));
  return h('p', { class: 'guild-exchange-deal' }, h('span', { class: 'guild-exchange-sides' }, side(giveLabel, offer.give), side(wantLabel, offer.want)));
}

export function mountGuildExchange(container) {
  let view = null;
  let gone = false;
  const card = h('section', { class: 'card guild-exchange', 'aria-labelledby': 'guild-exchange-title' }, h('p', { class: 'muted', text: t('Wczytywanie…') }));
  container.append(card);

  function show(next) {
    if (gone) return;
    view = next;
    render();
  }

  // An action answered with the Wymiana anew, its words in a toast.
  async function act(path, body) {
    const answer = await call('POST', path, body);
    show(answer);
    if (answer.text) toast(answer.text);
  }

  const title = () => h('h2', { class: 'card-title', id: 'guild-exchange-title', text: view.texts.title });
  const subtitle = (text) => h('h3', { class: 'guild-subtitle', text });
  const who = (person) =>
    h(
      'span',
      { class: 'guild-who' },
      icon(CLASS_ICONS[person.classId] ?? 'person', { size: 16, className: 'chat-class' }),
      framedName(
        h('button', { type: 'button', class: 'chat-name', text: person.name, 'aria-label': t('{name}: zobacz postać', { name: person.name }), onClick: (event) => withButton(event.currentTarget, () => openProfile(person.name)) }),
        person.nameColor,
      ),
    );

  // The sheet of a new offer: the resource or the gold given and the one
  // wanted, picked from the game's own buttons with what is held, and the
  // two counts, each up to its own limit.
  function openPostSheet() {
    const { texts, rules, resources } = view;
    const gold = rules.gold.id;
    const ids = [...rules.resources, gold];
    const held = (id) => (id === gold ? view.gold : (resources[id] ?? 0));
    const nameOf = (id) => (id === gold ? rules.gold.name : resourceName(id));
    const most = (id) => (id === gold ? rules.gold.most : rules.most);
    const range = (id) => `1–${formatNumber(most(id))}`;
    // The resource held most is given first, another one wanted.
    let give = rules.resources.reduce((best, id) => (held(id) > held(best) ? id : best));
    let want = rules.resources.find((id) => id !== give);
    const number = (id) => h('input', { type: 'number', id, class: 'trade-number', min: '1', step: '1', inputmode: 'numeric' });
    const giveCount = number('guild-offer-give');
    const wantCount = number('guild-offer-want');
    const label = (input) => h('label', { for: input.id, class: 'trade-field-label' });
    const giveLabel = label(giveCount);
    const wantLabel = label(wantCount);
    // Each field's limit and its label follow the side's pick.
    const limits = () => {
      for (const [input, labelled, id] of [
        [giveCount, giveLabel, give],
        [wantCount, wantLabel, want],
      ]) {
        input.max = String(most(id));
        input.placeholder = range(id);
        labelled.textContent = `${texts.count} (${range(id)})`;
      }
    };
    if (rules.sameCount) {
      wantCount.readOnly = true;
      giveCount.addEventListener('input', () => {
        wantCount.value = giveCount.value;
      });
    }
    const givePicker = h('div', { class: 'guild-exchange-picker', role: 'group', 'aria-label': texts.give });
    const wantPicker = h('div', { class: 'guild-exchange-picker', role: 'group', 'aria-label': texts.want });
    const choice = (id, picked, pick, disabled = false) =>
      h(
        'button',
        { type: 'button', class: 'guild-ask-choice guild-exchange-choice', 'aria-pressed': String(id === picked), disabled, onClick: () => pick(id) },
        h('span', { class: 'guild-goods-art', 'aria-hidden': 'true' }, goodArt(id)),
        h('span', { class: 'guild-exchange-name', text: nameOf(id) }),
        h('span', { class: 'guild-ask-have', text: filled(texts.have, { have: formatNumber(held(id)) }) }),
      );
    // The good wanted is another than the one given: never gold for gold.
    const draw = () => {
      limits();
      fill(
        givePicker,
        ids.map((id) =>
          choice(id, give, (next) => {
            give = next;
            if (want === give) want = ids.find((one) => one !== give);
            draw();
          }),
        ),
      );
      fill(
        wantPicker,
        ids.map((id) =>
          choice(
            id,
            want,
            (next) => {
              want = next;
              draw();
            },
            id === give,
          ),
        ),
      );
    };
    draw();
    const send = h('button', {
      type: 'button',
      class: 'button button--system',
      text: texts.send,
      onClick: (event) =>
        withButton(event.currentTarget, async () => {
          const [given, wanted] = [giveCount, wantCount].map((field) => Number(field.value));
          for (const [count, id] of [
            [given, give],
            [wanted, want],
          ]) {
            if (!(Number.isInteger(count) && count >= 1 && count <= most(id))) throw new Error(`${nameOf(id)}: ${texts.count.toLowerCase()} ${range(id)}.`);
          }
          const answer = await call('POST', '/api/guild/exchange', { give: { resource: give, count: given }, want: { resource: want, count: wanted } });
          closeSheet();
          show(answer);
          toast(answer.text);
        }),
    });
    const field = (input, labelled) => h('div', { class: 'trade-field' }, labelled, input);
    openSheet(
      h('h2', { class: 'sheet-title', text: texts.post }),
      h(
        'div',
        { class: 'guild-ask-sheet guild-offer-sheet' },
        h('p', { class: 'sheet-text', text: texts.postLead }),
        h('p', { class: 'field-label', text: texts.give }),
        givePicker,
        field(giveCount, giveLabel),
        h('p', { class: 'field-label', text: texts.want }),
        wantPicker,
        field(wantCount, wantLabel),
        h('div', { class: 'sheet-actions' }, h('button', { type: 'button', class: 'button button--world', text: t('Anuluj'), onClick: closeSheet }), send),
      ),
    );
  }

  // Below the level to post and take (826 A), the words why in a toast, as
  // the players' Wymiana tells it (trade.js), before any sheet or question.
  const levelLocked = () => {
    if (view.locked) toast(view.texts.level);
    return view.locked;
  };

  // The character's own offers: the open ones with "Wycofaj", then the last
  // closed ones with how they ended; "Wystaw ofertę" under them, or why
  // there is no room for another.
  function minePart() {
    const { mine, texts, rules } = view;
    const stateText = (offer) =>
      offer.state === 'open' ? filled(texts.states.open, { until: dateTimeFormat.format(new Date(offer.endsAt)) }) : filled(texts.states[offer.state], { name: offer.taker?.name ?? '?' });
    const withdraw = (offer) =>
      h('button', {
        type: 'button',
        class: 'button button--world button--small',
        text: texts.withdraw,
        onClick: (event) =>
          withButton(event.currentTarget, async () => {
            if (!(await confirmAction({ title: texts.withdrawTitle, text: filled(texts.withdrawText, { give: sideText(offer.give) }), confirmLabel: texts.withdraw }))) return;
            await act('/api/guild/exchange/withdraw', { offerId: offer.id });
          }),
      });
    return h(
      'div',
      // The narrator's line about the Wymiana rings this part and the
      // others' (narrator.js).
      { class: 'guild-part guild-mine', 'data-guide': 'guild-exchange' },
      subtitle(texts.mine),
      mine.length === 0
        ? h('p', { class: 'muted', text: texts.mineEmpty })
        : h(
            'ul',
            { class: 'guild-requests-list' },
            mine.map((offer) =>
              h(
                'li',
                { class: `guild-request guild-offer${offer.state === 'open' ? '' : ' guild-offer--closed'}` },
                deal(offer, texts.give, texts.want),
                h('div', { class: 'guild-offer-foot' }, h('p', { class: 'guild-request-state', text: stateText(offer) }), offer.state === 'open' && withdraw(offer)),
              ),
            ),
          ),
      view.open < rules.offers
        ? h('button', { type: 'button', class: 'button button--system guild-offer-post', text: texts.post, onClick: () => levelLocked() || openPostSheet() })
        : h('p', { class: 'muted', text: texts.full }),
    );
  }

  // Another member's offer: who offers it, what it gives and wants, and
  // "Wymień" with the pieces held, or what is missing.
  function offerRow(offer) {
    const { texts } = view;
    const take = h('button', {
      type: 'button',
      class: 'button button--system button--small',
      text: texts.take,
      onClick: (event) =>
        withButton(event.currentTarget, async () => {
          if (levelLocked()) return;
          if (!(await confirmAction({ title: texts.takeTitle, text: filled(texts.takeText, { give: sideText(offer.give), want: sideText(offer.want) }), confirmLabel: texts.take }))) return;
          await act('/api/guild/exchange/take', { offerId: offer.id });
        }),
    });
    const foot = offer.sameAccount
      ? h('p', { class: 'muted', text: texts.sameAccount })
      : offer.canTake
        ? h('div', { class: 'guild-offer-foot' }, h('p', { class: 'guild-request-state', text: filled(texts.have, { have: formatNumber(offer.have) }) }), take)
        : h('p', { class: 'guild-request-state', text: filled(texts.short, { have: formatNumber(offer.have), missing: formatNumber(offer.missing) }) });
    return h('li', { class: 'guild-request guild-offer' }, h('div', { class: 'guild-request-head' }, who(offer.poster)), deal(offer, texts.gives, texts.wants), foot);
  }

  // The members' offers, folded under their number once there are some.
  function othersPart() {
    const { offers, texts } = view;
    const others = offers.filter((offer) => !offer.own);
    if (others.length === 0) return h('div', { class: 'guild-part', 'data-guide': 'guild-exchange' }, subtitle(texts.others), h('p', { class: 'muted', text: texts.empty }));
    return h(
      'div',
      { class: 'guild-part', 'data-guide': 'guild-exchange' },
      foldPart(
        { key: 'guild-exchange-others', title: texts.others, line: filled(texts.othersLine, { count: formatNumber(others.length) }) },
        h('ul', { class: 'guild-requests-list' }, others.map(offerRow)),
      ),
    );
  }

  function render() {
    const { texts } = view;
    const how = howItWorks(texts.intro, texts.how);
    if (!view.guild) {
      fill(card, title(), h('p', { class: 'muted', text: texts.noGuild }), how);
      return;
    }
    fill(card, title(), how, minePart(), othersPart());
  }

  call('GET', '/api/guild/exchange')
    .then(show)
    .catch((error) => {
      if (!gone) fill(card, h('p', { class: 'muted', text: error.message ?? t('Nie udało się wczytać Wymiany.') }));
    });

  return {
    unmount() {
      gone = true;
      card.remove();
    },
  };
}
