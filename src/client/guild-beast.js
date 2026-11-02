// The Bestia Gildii's card for the Gildia's page (src/server/guild-beast.js;
// DECISIONS.md, "Bestia Gildii"; the author: "344 A"): the guild's beast of
// the week with its sprite, name, level and region and its HP bar, shared
// by the whole guild; "Atakuj" with the attacks left today, the last
// attack's damage and the lines of its fight; the "Wkład tygodnia"; the
// Skrzynie Bestii to open; and the rules under "Jak to działa?". While the
// character is on an exploration, or its report waits, the beast waits
// too. The card asks for the Bestia itself and takes its words from the
// answer (data/guilds.json, beast.texts). mountGuildBeast(container) adds
// the card to the container and gives { unmount() }, which takes it away.

import { createArena } from './arena.js';
import { monsterSprite } from './art.js';
import { fill, h } from './dom.js';
import { dateTimeFormat, formatNumber, plural } from './format.js';
import { activityFinished, call, onCharacterChange, state } from './state.js';
import { howItWorks, openSheet, toast, withButton } from './ui.js';

const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));

// "26.10–1.11": a week from the date of its Monday, its key.
function weekLabel(key) {
  const monday = new Date(`${key}T12:00:00Z`);
  const sunday = new Date(monday.getTime() + 6 * 86400000);
  const day = (date) => `${date.getUTCDate()}.${date.getUTCMonth() + 1}`;
  return `${day(monday)}–${day(sunday)}`;
}

// The last day a chest opens: the day before the midnight it waits until.
const dayFormat = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'numeric' });
const lastDay = (until) => dayFormat.format(new Date(until - 1));

export function mountGuildBeast(container) {
  let view = null;
  // The last attack's answer and the last chest's words, while the card stays.
  let last = null;
  let opened = null;
  let gone = false;
  const card = h('section', { class: 'card guild-beast', 'aria-labelledby': 'guild-beast-title' }, h('p', { class: 'muted', text: 'Wczytywanie…' }));
  container.append(card);

  function show(next) {
    if (gone) return;
    view = next;
    render();
  }

  // Why the beast waits: an exploration under way, or its report to claim
  // (the server's rule, as for the Wieże); null when the character may attack.
  function waiting() {
    const activity = state.character?.activity;
    if (activity?.kind !== 'hunt') return null;
    return activityFinished(activity) ? view.texts.claimFirst : view.texts.exploring;
  }

  async function attack() {
    const answer = await call('POST', '/api/guild/beast/attack');
    last = answer.attack;
    opened = null;
    show(answer);
    // The fight played back at once, as a report's (the author: "Po Atakuj
    // w Bestii Gildii niech pokaże się ta walka symulacja").
    if (answer.attack.fight) {
      const arena = createArena(answer.attack.fight, { autoplay: 'now' });
      const dialog = openSheet(
        h('h2', { class: 'sheet-title', text: answer.texts.fightTitle }),
        h('p', { class: 'sheet-text', text: [filled(answer.texts.lastAttack, { damage: formatNumber(answer.attack.damage) }), answer.attack.fell && answer.texts.fell].filter(Boolean).join(' ') }),
        arena.element,
      );
      dialog.addEventListener('close', () => arena.stop(), { once: true });
    }
    if (answer.attack.fell) toast(answer.texts.fell);
  }

  async function claim(week) {
    const answer = await call('POST', '/api/guild/beast/claim', { week });
    opened = answer.chest.text;
    show(answer);
    toast(answer.chest.text);
  }

  const title = () => h('h2', { class: 'card-title', id: 'guild-beast-title', text: view.texts.title });

  function hpBar(beast) {
    const bar = h('div', { class: 'meter-fill' });
    bar.style.width = `${beast.maxHp > 0 ? Math.max(0, Math.min(1, beast.hp / beast.maxHp)) * 100 : 0}%`;
    return h(
      'div',
      { class: 'meter meter--hp guild-beast-hp' },
      h('div', { class: 'meter-label' }, h('span', { text: 'HP' }), h('span', { class: 'meter-value', text: `${formatNumber(beast.hp)} / ${formatNumber(beast.maxHp)}` })),
      h('div', { class: 'meter-track', role: 'progressbar', 'aria-label': `${beast.name}: HP`, 'aria-valuemin': 0, 'aria-valuemax': beast.maxHp, 'aria-valuenow': beast.hp }, bar),
    );
  }

  // The beast, its bar, and "Atakuj" with the attacks left today.
  function beastPart() {
    const { beast, attacks, texts } = view;
    const reason = waiting();
    const button = h('button', {
      type: 'button',
      class: 'button button--system',
      text: texts.attack,
      disabled: beast.fallen || attacks.left === 0 || Boolean(reason),
      onClick: (event) => withButton(event.currentTarget, attack),
    });
    return [
      h(
        'div',
        { class: 'guild-beast-head' },
        h('span', { class: 'guild-beast-art' }, monsterSprite(beast.monsterId)),
        h(
          'div',
          { class: 'guild-beast-who' },
          h('p', { class: 'guild-beast-name', text: beast.name }),
          h('p', { class: 'guild-beast-meta', text: [filled(texts.level, { level: beast.level }), beast.regionName].filter(Boolean).join(' · ') }),
        ),
      ),
      hpBar(beast),
      beast.fallen
        ? h('p', { class: 'guild-beast-fallen', text: [filled(texts.fallen, { at: dateTimeFormat.format(new Date(beast.fallenAt)) }), beast.fallenBy && filled(texts.lastBlow, { name: beast.fallenBy })].filter(Boolean).join(' ') })
        : h('p', { class: 'muted', text: texts.until }),
      !beast.fallen && [
        h('p', { class: 'guild-beast-attacks', text: [filled(texts.attacksLeft, { left: attacks.left, perDay: attacks.perDay }), attacks.left === 0 && texts.newAttacks].filter(Boolean).join('. ') }),
        reason && h('p', { class: 'guild-beast-waiting', text: reason }),
        button,
      ],
    ];
  }

  // The last attack: what it took off the bar and the lines of its fight.
  function lastPart() {
    if (!last) return null;
    const { texts } = view;
    return h(
      'div',
      { class: 'guild-beast-last' },
      h('p', { text: [filled(texts.lastAttack, { damage: formatNumber(last.damage) }), last.fell && texts.fell].filter(Boolean).join(' ') }),
      last.log.length > 0 &&
        h(
          'details',
          { class: 'guild-beast-log' },
          h('summary', { class: 'how-toggle', text: texts.log }),
          h(
            'ol',
            {},
            last.log.map((line) => h('li', { text: line })),
          ),
        ),
    );
  }

  function chestsPart() {
    const { chests, texts } = view;
    if (chests.length === 0 && !opened) return null;
    return h(
      'div',
      { class: 'guild-beast-chests' },
      h('h3', { class: 'guild-beast-subtitle', text: texts.chestTitle }),
      opened && h('p', { class: 'guild-beast-opened', text: opened }),
      chests.map((chest) =>
        h(
          'div',
          { class: 'guild-beast-chest' },
          h('p', { text: filled(chest.fallen ? texts.chestFallen : texts.chestShare, { week: weekLabel(chest.week), share: chest.share }) }),
          h('p', { class: 'muted', text: filled(texts.chestUntil, { until: lastDay(chest.until) }) }),
          h('button', { type: 'button', class: 'button button--system', text: texts.open, onClick: (event) => withButton(event.currentTarget, () => claim(chest.week)) }),
        ),
      ),
    );
  }

  // The "Wkład tygodnia": who hit the beast, how much and how often.
  function contributionPart() {
    const { contribution, own, texts } = view;
    const [one, few, many] = texts.attackForms;
    return [
      h('h3', { class: 'guild-beast-subtitle', text: texts.contribution }),
      own.hits > 0 && h('p', { class: 'guild-beast-own', text: filled(texts.own, { damage: formatNumber(own.damage) }) }),
      contribution.length === 0
        ? h('p', { class: 'muted', text: texts.noHits })
        : h(
            'ol',
            { class: 'guild-beast-ranking' },
            contribution.map((entry) =>
              h(
                'li',
                { class: `guild-beast-row${entry.own ? ' guild-beast-row--own' : ''}` },
                h('span', { class: 'guild-beast-row-name', text: entry.name }),
                h('span', { class: 'guild-beast-row-damage', text: `${formatNumber(entry.damage)} HP · ${formatNumber(entry.hits)} ${plural(entry.hits, one, few, many)}` }),
              ),
            ),
          ),
    ];
  }

  function render() {
    const { texts } = view;
    const how = howItWorks(texts.lead, texts.rules);
    if (!view.beast) {
      fill(card, title(), h('p', { class: 'muted', text: texts.noGuild }), chestsPart(), how);
      return;
    }
    fill(card, title(), how, beastPart(), lastPart(), chestsPart(), contributionPart());
  }

  // The character changed (an exploration began or its report was
  // claimed): the card again, as it is now.
  const unsubscribe = onCharacterChange(() => {
    if (view && !gone) render();
  });

  call('GET', '/api/guild/beast')
    .then(show)
    .catch((error) => {
      if (!gone) fill(card, h('p', { class: 'muted', text: error.message ?? 'Nie udało się wczytać Bestii Gildii.' }));
    });

  return {
    unmount() {
      gone = true;
      unsubscribe();
      card.remove();
    },
  };
}
