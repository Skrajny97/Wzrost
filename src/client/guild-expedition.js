// The Wyprawa Gildii's tab on the Gildia's page (src/server/guild-expedition.js;
// DECISIONS.md, "Wyprawa Gildii (621 A)"; the author: "621 A", "624
// akcept"), as on the mock-up 624: the card "Wyprawa tygodnia: <kraina>"
// with the route of seven stops winding over it (the stages done in gold,
// the stage now ringed, its guardian's picture in its stop once it bars the
// way, the last one's picture at the end, a gift over a stop whose chest
// waits), "Etap 3 z 7: 1 240 z 2 000 minut wypraw" with its bar, the
// minutes kept at a guardian and the rules under "Jak to działa?"; the
// Skrzynie Wyprawy to open ("Odbierz"), and what one held as icons to tap,
// as in the Bestia's; the guardian of the stage now with its picture,
// level, HP bar and "Atakuj" with the attacks left today (for those who
// added minutes this week), its fight played back in the arena as an
// attack on the Bestia; and the "Wkład tygodnia", who added how many
// minutes. The tab asks for the Wyprawa itself and takes its words from the
// answer (data/guilds.json, expedition.texts). mountGuildExpedition
// (container) adds the cards to the container and gives { unmount() },
// which takes them away.

import { createArena } from './arena.js';
import { itemSprite, monsterSprite } from './art.js';
import { checkGuildTodo } from './chat-news.js';
import { materialIcon, materialSheet, materialTitle } from './craft-table.js';
import { fill, h, icon } from './dom.js';
import { dateTimeFormat, formatNumber } from './format.js';
import { call, state } from './state.js';
import { foldPart, howItWorks, openSheet, toast, withButton } from './ui.js';
import { itemSheet } from './screens/character.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));

// Where the stops of the route stand, in per cent of its box: evenly from
// the left to the right, up and down as a path through the land (the
// mock-up 624).
const STOPS_Y = [74, 42, 70, 28, 62, 26, 50];
const stopX = (index, count) => (count > 1 ? 8 + (index * 83) / (count - 1) : 50);
const stopY = (index) => STOPS_Y[index % STOPS_Y.length];

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

// A bar of `value` of `max`, as the Próby's and the Bestia's, read aloud
// by `name` (else its label).
function bar({ label, value, max, text, kind, className = '', name = label }) {
  const fillBar = h('div', { class: 'meter-fill' });
  fillBar.style.width = `${max > 0 ? Math.max(0, Math.min(1, value / max)) * 100 : 0}%`;
  return h(
    'div',
    { class: `meter meter--${kind} ${className}` },
    h('div', { class: 'meter-label' }, h('span', { text: label }), text && h('span', { class: 'meter-value', text })),
    h('div', { class: 'meter-track', role: 'progressbar', 'aria-label': name, 'aria-valuemin': 0, 'aria-valuemax': max, 'aria-valuenow': value }, fillBar),
  );
}

// The dotted path between the stops, under them: in the box's per cent,
// stretched with it, its line as thick at any width.
function routePath(count) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  for (const [key, value] of Object.entries({ class: 'expedition-path', viewBox: '0 0 100 100', preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' })) svg.setAttribute(key, value);
  const line = document.createElementNS(SVG_NS, 'polyline');
  line.setAttribute('points', Array.from({ length: count }, (_, index) => `${stopX(index, count)},${stopY(index)}`).join(' '));
  line.setAttribute('vector-effect', 'non-scaling-stroke');
  svg.append(line);
  return svg;
}

export function mountGuildExpedition(container) {
  let view = null;
  // The last attack's answer and the last chest opened (its words, the item
  // as the bag showed it then and the materials with the chest's counts),
  // while the tab stays.
  let last = null;
  let opened = null;
  let gone = false;
  const body = h('div', { class: 'guild-expedition' }, h('section', { class: 'card' }, h('p', { class: 'muted', text: 'Wczytywanie…' })));
  container.append(body);

  function show(next) {
    if (gone) return;
    view = next;
    render();
  }

  async function attack() {
    const answer = await call('POST', '/api/guild/expedition/attack');
    checkGuildTodo({ now: true });
    last = answer.attack;
    opened = null;
    show(answer);
    const { texts } = answer;
    const words = [filled(texts.lastAttack, { damage: formatNumber(answer.attack.damage) }), answer.attack.fell && (answer.attack.last ? texts.fellLast : texts.fell)].filter(Boolean).join(' ');
    // The fight played back at once, as an attack on the Bestia's.
    if (answer.attack.fight) {
      const arena = createArena(answer.attack.fight, { autoplay: 'now' });
      const dialog = openSheet(h('h2', { class: 'sheet-title', text: texts.fightTitle }), h('p', { class: 'sheet-text', text: words }), arena.element);
      dialog.addEventListener('close', () => arena.stop(), { once: true });
    }
    if (answer.attack.fell) toast(answer.attack.last ? texts.fellLast : texts.fell);
  }

  async function claim(week, stage) {
    const answer = await call('POST', '/api/guild/expedition/claim', { week, stage });
    checkGuildTodo({ now: true });
    const { chest, character } = answer;
    opened = { text: chest.text, item: chest.item && character.bag.find((one) => one.id === chest.item.id), materials: chest.materials };
    show(answer);
    toast(chest.text);
  }

  // A tap on the chest's item or material: its card as the bag has it now,
  // or the item's as worn once put on; a word when it is gone.
  function openItem(id) {
    const { bag, equipment } = state.character;
    const inBag = bag.find((one) => one.id === id);
    if (inBag) return itemSheet(inBag, { equipped: false });
    const worn = Object.values(equipment).find((one) => one?.id === id);
    if (worn) return itemSheet(worn, { equipped: true });
    toast(view.texts.notInBag);
  }

  function openMaterial(key) {
    const stack = state.character.crafting?.materials.find((one) => one.key === key);
    if (stack) materialSheet(stack);
    else toast(view.texts.notInBag);
  }

  // The route: seven stops on a winding path, each the guardian at the end
  // of its stage.
  function routePart() {
    const { expedition: route, chests, texts } = view;
    const waiting = new Set(chests.filter((chest) => chest.week === route.week).map((chest) => chest.stage));
    const stops = route.guardians.map((guardian, index) => {
      const now = !route.done && guardian.stage === route.stage;
      const pictured = guardian.state === 'standing' || guardian.item;
      const stop = h(
        'li',
        {
          class: [
            'expedition-stop',
            `expedition-stop--${guardian.state}`,
            now && 'expedition-stop--now',
            guardian.item && 'expedition-stop--last',
            pictured && 'expedition-stop--art',
          ]
            .filter(Boolean)
            .join(' '),
          vars: { '--x': `${stopX(index, route.guardians.length)}%`, '--y': `${stopY(index)}%` },
          'aria-label': filled(texts.stop, { stage: guardian.stage, name: guardian.name, state: texts.states[guardian.state] }),
        },
        pictured ? h('span', { class: 'expedition-stop-art', 'aria-hidden': 'true' }, monsterSprite(guardian.monsterId)) : h('span', { class: 'expedition-stop-number', 'aria-hidden': 'true', text: String(guardian.stage) }),
        waiting.has(guardian.stage) && h('span', { class: 'expedition-stop-gift', 'aria-hidden': 'true' }, icon('gift', { size: 16 })),
      );
      return stop;
    });
    return h('div', { class: 'expedition-route' }, routePath(route.guardians.length), h('ol', { class: 'expedition-stops' }, stops));
  }

  // The route's card: the land, the route, the stage now with its bar, the
  // minutes kept at a guardian, and the rules.
  function routeCard() {
    const { expedition: route, texts } = view;
    const how = howItWorks(texts.lead, texts.how);
    return h(
      'section',
      { class: 'card guild-expedition-card', 'aria-labelledby': 'guild-expedition-title' },
      h('h2', { class: 'card-title expedition-title', id: 'guild-expedition-title' }, icon('tent', { size: 22 }), filled(texts.route, { land: route.land.name })),
      routePart(),
      route.done
        ? [h('p', { class: 'expedition-done', text: texts.done }), lastFall()]
        : [
            bar({
              label: filled(texts.stage, { stage: route.stage, stages: route.stages, progress: formatNumber(route.progress), need: formatNumber(route.need) }),
              value: route.progress,
              max: route.need,
              text: '',
              kind: 'xp',
              className: 'guild-meter expedition-meter',
            }),
            route.barred && route.banked > 0 && h('p', { class: 'expedition-banked', text: filled(texts.banked, { minutes: formatNumber(route.banked) }) }),
            h('p', { class: 'muted expedition-note', text: texts.counts }),
          ],
      how,
    );
  }

  // When and by whose hit the last guardian fell, once the route is done.
  function lastFall() {
    const { expedition: route, texts } = view;
    const guardian = route.guardians.at(-1);
    if (!guardian?.fallenAt) return null;
    return h('p', { class: 'muted expedition-note', text: [filled(texts.fallen, { at: dateTimeFormat.format(new Date(guardian.fallenAt)) }), guardian.fallenBy && filled(texts.lastBlow, { name: guardian.fallenBy })].filter(Boolean).join(' ') });
  }

  // The guardian of the stage now: barring the way with its HP bar and
  // "Atakuj", or ahead with the minutes still to it.
  function guardianCard() {
    const { expedition: route, attacks, contributor, texts } = view;
    if (route.done) return null;
    const guardian = route.guardians[route.stage - 1];
    const standing = guardian.state === 'standing';
    const head = h(
      'div',
      { class: 'guild-beast-head' },
      h('span', { class: `guild-beast-art${standing ? '' : ' expedition-art--ahead'}` }, monsterSprite(guardian.monsterId)),
      h(
        'div',
        { class: 'guild-beast-who' },
        h('p', { class: 'guild-beast-name', text: guardian.name }),
        h('p', { class: 'guild-beast-meta', text: [filled(texts.level, { level: guardian.level }), standing && route.placeName].filter(Boolean).join(' · ') }),
      ),
    );
    const hp =
      standing &&
      bar({ label: 'HP', value: guardian.hp, max: guardian.maxHp, text: `${formatNumber(guardian.hp)} / ${formatNumber(guardian.maxHp)}`, kind: 'hp', className: 'guild-beast-hp', name: `${guardian.name}: HP` });
    // "Atakuj" shut, with the words of why, while the character offers
    // itself or serves as a mercenary (attacks.blocked).
    const actions = standing
      ? contributor
        ? [
            h('p', { class: 'guild-beast-attacks', text: [filled(texts.attacksLeft, { left: attacks.left, perDay: attacks.perDay }), attacks.left === 0 && texts.newAttacks].filter(Boolean).join('. ') }),
            attacks.blocked && h('p', { class: 'muted', text: attacks.blocked }),
            h('button', {
              type: 'button',
              class: 'button button--system',
              text: texts.attack,
              disabled: attacks.left === 0 || Boolean(attacks.blocked),
              onClick: (event) => withButton(event.currentTarget, attack),
            }),
          ]
        : h('p', { class: 'muted', text: texts.contributeFirst })
      : null;
    return h(
      'section',
      { class: 'card guild-expedition-card', 'aria-labelledby': 'guild-guardian-title' },
      h('h2', { class: 'card-title', id: 'guild-guardian-title', text: filled(texts.guardianTitle, { stage: guardian.stage }) }),
      head,
      hp,
      h('p', { class: standing ? 'expedition-standing' : 'muted', text: standing ? texts.standing : filled(texts.ahead, { minutes: formatNumber(Math.max(0, route.need - route.progress)) }) }),
      actions,
      lastPart(),
    );
  }

  // The last attack: what it took off the bar and the lines of its fight.
  function lastPart() {
    if (!last) return null;
    const { texts } = view;
    return h(
      'div',
      { class: 'guild-beast-last' },
      h('p', { text: [filled(texts.lastAttack, { damage: formatNumber(last.damage) }), last.fell && (last.last ? texts.fellLast : texts.fell)].filter(Boolean).join(' ') }),
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

  // What the chest held, as the bag shows it, with the chest's counts.
  function lootPart() {
    const { item, materials } = opened;
    return h(
      'ul',
      { class: 'bag-grid guild-beast-loot' },
      item &&
        h(
          'li',
          {},
          h(
            'button',
            { type: 'button', class: 'slot slot--bag', vars: { '--rarity': item.color }, 'aria-label': `${item.name}, ${item.rarityName}`, onClick: () => openItem(item.id) },
            itemSprite(item) ?? icon('sword', { size: 24 }),
          ),
        ),
      materials.map((material) =>
        h(
          'li',
          {},
          h(
            'button',
            {
              type: 'button',
              class: 'slot slot--bag',
              vars: { '--rarity': material.color },
              'aria-label': `${materialTitle(material)}, ${material.rarityName}, ${formatNumber(material.count)}`,
              onClick: () => openMaterial(material.key),
            },
            materialIcon(material.materialId),
            h('span', { class: 'slot-level', text: formatNumber(material.count) }),
          ),
        ),
      ),
    );
  }

  // The Skrzynie Wyprawy to open, and the one opened last.
  function chestsCard() {
    const { chests, texts } = view;
    if (chests.length === 0 && !opened) return null;
    const week = view.expedition?.week;
    return h(
      'section',
      { class: 'card guild-expedition-card', 'aria-labelledby': 'guild-expedition-chests' },
      h('h2', { class: 'card-title', id: 'guild-expedition-chests', text: texts.chestTitle }),
      opened && h('p', { class: 'guild-beast-opened', text: opened.text }),
      opened && lootPart(),
      chests.length > 0 &&
        h(
          'ul',
          { class: 'expedition-chests' },
          chests.map((chest) =>
            h(
              'li',
              { class: 'expedition-chest' },
              h('span', { class: 'expedition-chest-art', 'aria-hidden': 'true' }, monsterSprite(chest.monsterId)),
              h(
                'div',
                { class: 'expedition-chest-body' },
                h('p', { class: 'expedition-chest-name', text: [chest.week !== week && filled(texts.chestWeek, { week: weekLabel(chest.week) }), filled(texts.chest, { stage: chest.stage, name: chest.name })].filter(Boolean).join(' · ') }),
                chest.item && h('p', { class: 'expedition-chest-rare' }, icon('gift', { size: 14 }), texts.chestRare),
                h('p', { class: 'muted expedition-note', text: filled(texts.chestUntil, { until: lastDay(chest.until) }) }),
              ),
              h('button', { type: 'button', class: 'button button--system button--small', text: texts.claim, onClick: (event) => withButton(event.currentTarget, () => claim(chest.week, chest.stage)) }),
            ),
          ),
        ),
    );
  }

  // The "Wkład tygodnia": who added how many minutes, folded under the
  // number of them once someone has.
  function contributionCard() {
    const { contribution, own, texts } = view;
    const card = (...children) => h('section', { class: 'card guild-expedition-card', 'aria-label': texts.contribution }, children);
    if (contribution.length === 0) return card(h('h2', { class: 'card-title', text: texts.contribution }), h('p', { class: 'muted', text: texts.noMinutes }));
    return card(
      foldPart(
        { key: 'guild-expedition-contribution', title: texts.contribution, card: true, line: filled(texts.contributionLine, { count: formatNumber(contribution.length) }), open: false },
        own.minutes > 0 && h('p', { class: 'guild-beast-own', text: filled(texts.own, { minutes: formatNumber(own.minutes) }) }),
        h(
          'ol',
          { class: 'guild-ranking' },
          contribution.map((entry) =>
            h(
              'li',
              { class: `guild-row${entry.own ? ' guild-row--own' : ''}` },
              h('span', { class: 'guild-row-name', text: entry.name }),
              h('span', { class: 'guild-row-value', text: filled(texts.minutes, { minutes: formatNumber(entry.minutes) }) }),
            ),
          ),
        ),
      ),
    );
  }

  function render() {
    const { texts } = view;
    if (!view.expedition) {
      fill(
        body,
        h(
          'section',
          { class: 'card guild-expedition-card', 'aria-labelledby': 'guild-expedition-title' },
          h('h2', { class: 'card-title expedition-title', id: 'guild-expedition-title' }, icon('tent', { size: 22 }), texts.title),
          h('p', { class: 'muted', text: texts.noGuild }),
          howItWorks(texts.lead, texts.how),
        ),
        chestsCard(),
      );
      return;
    }
    fill(body, routeCard(), chestsCard(), guardianCard(), contributionCard());
  }

  call('GET', '/api/guild/expedition')
    .then(show)
    .catch((error) => {
      if (!gone) fill(body, h('section', { class: 'card' }, h('p', { class: 'muted', text: error.message ?? 'Nie udało się wczytać Wyprawy Gildii.' })));
    });

  return {
    unmount() {
      gone = true;
      body.remove();
    },
  };
}
