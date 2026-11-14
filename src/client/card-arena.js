// The Arena's "Karty" (src/server/card-arena.js; DECISIONS.md, "Karty z
// innymi graczami, z mieszkańcami Osady i z nowych źródeł", 900 A; the
// mock-ups 907.1–907.3 the author accepted), mounted by the Arena's panel
// (pvp-arena.js) in two parts, as its tabs ask for them.
//
// "play", the tab "Karty" (907.1): the card rating on its plaque with the
// place in the week's table and the day's matches as card backs, on the
// Arena's picture; the player's deck, which defends it while it is away,
// with its strength, the saved decks to play another with a tap (938), its
// types and the hero card, and "Ułóż talię" leading
// to the Salon Gier; the deck's last defences, folded (open while some are
// new), each in words with when it was; the three rivals, each with its
// bust, class, level and card rating, its deck's strength, what a win
// brings and a loss costs, and "Graj"; "Losuj innych"; the rules under "Jak
// to działa?". While a match runs, the table instead (907.2): the same
// table as Szczęsny's (cards.js), the rival's bust, class, level, card
// rating and hero card at its head, the rating at stake on its divider, the
// rival's cards laid first and its hero's skill marked before the player
// answers; the reserve, the player's hero card, "Walcz" and "Poddaj
// partię". A tap on a reserve's card and then on an empty line lays it
// there; every blow of the round shows on its target before "Walcz", as the
// server counts it (roundHits in src/engine/cards.js, with the rival's
// skill), and the table moves as the Salon's (cards-fx.js). At the end its
// card: the result and the card rating's move, until "Dalej".
//
// "table", under the week's table's switch "Karty" (907.3): the rewards
// waiting for "Odbierz", this week's card table (all of its places, at most
// 50, the character's own row lit), the rewards of the places, half of the
// duels', and the season.
//
// The words are the data's (data/settlement.json, arena.cards.texts), in
// the page's language; the few of the table shared with the Salon's go
// through t(). The panel lives while the Arena's does, so a match being laid
// survives the Arena's redraws and tabs.

import { placeArt, portraitSprite } from './art.js';
import { cardFace } from './cards.js';
import { createCardsFx } from './cards-fx.js';
import { deckSlotsRow } from './deck-slots.js';
import { h, icon } from './dom.js';
import { countOf, dateTimeFormat, formatHours, formatNumber, timeFormat } from './format.js';
import { chestContents } from './guild-trials.js';
import { language, t } from './i18n.js';
import { CLASS_ICONS } from './icons.js';
import { openProfile } from './profile.js';
import { playSound } from './sound.js';
import { call, serverNow } from './state.js';
import { confirmAction, howItWorks, systemPanel, toast, withButton } from './ui.js';
import { bust } from './screens/select.js';

// One of the texts with its {…} filled in: numbers as the game writes them,
// words as they are.
const say = (text, values = {}) =>
  text.replace(/\{(\w+)\}/g, (whole, key) => (Object.hasOwn(values, key) ? (typeof values[key] === 'number' ? formatNumber(values[key]) : values[key]) : whole));

// "[a|]" in a text: the ending of a woman's word and of a man's.
const gendered = (text, female) => text.replace(/\[([^[\]|]*)\|([^[\]|]*)\]/g, (_, woman, man) => (female ? woman : man));

// A rating's move with its sign: "+16", "−9", "0".
const signed = (change) => (change > 0 ? `+${formatNumber(change)}` : change < 0 ? `−${formatNumber(-change)}` : '0');

// The words of a defence by its result, from the deck's side.
const DEFENCE_TEXTS = { win: 'defenceWin', loss: 'defenceLoss', draw: 'defenceDraw' };

// What is left of a week or a month: days, then hours.
function timeLeft(ms) {
  const hours = Math.max(0, ms) / 3600000;
  const days = Math.floor(hours / 24);
  return days > 0 ? countOf(days, 'dzień', 'dni', 'dni') : formatHours(Math.max(hours, 1 / 60));
}

// A week by its Monday ("2026-11-09") as "9.11", in English "9/11".
const weekLabel = (key) => {
  const [, month, day] = key.split('-').map(Number);
  return language() === 'en' ? `${day}/${month}` : `${day}.${month}`;
};

// When a defence was: "dziś, 10:42", "wczoraj, 21:15", or the date.
function when(at) {
  const date = new Date(at);
  const today = new Date(serverNow());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return t('dziś, {time}', { time: timeFormat.format(date) });
  if (date.toDateString() === yesterday.toDateString()) return t('wczoraj, {time}', { time: timeFormat.format(date) });
  return dateTimeFormat.format(date);
}

// A character's name that opens its card, as in the Ranking.
const nameButton = (name) =>
  h('button', {
    type: 'button',
    class: 'chat-name',
    text: name,
    'aria-label': t('{name}: zobacz postać', { name }),
    onClick: (event) => withButton(event.currentTarget, () => openProfile(name)),
  });

// A card type's badge: its colour and icon.
const typeBadge = (type, size = 14) => h('span', { class: `tcard-type tcard-type--${type.id}`, title: type.name, 'aria-label': type.name }, icon(type.icon ?? 'unknown', { size }));

// `place`: the Arena's place of the Osada, whose backdrop is the status
// card's picture. `onDue(count)`: the weeks whose card rewards wait, told
// to the Arena's panel for the dot on its table's tab whenever it changes.
export function mountCardArena(holder, { place = null, onDue = () => {} } = {}) {
  let view = null;
  let failure = null;
  let gone = false;
  let timer = null;
  let part = 'play';
  let due = null;
  // The deck's last defences of the newest look, the ids of those new at
  // any look while the panel lives, and whether their fold is open (at
  // first: while some are new).
  let defences = null;
  const unseen = new Set();
  let defencesOpen = null;
  // The turn being laid: its round, the player's lines, the hero's skill,
  // and the reserve's card picked to lay; the hero's skill being set.
  let plan = null;
  let picked = null;
  let aiming = null;
  // A match just ended, shown until "Dalej".
  let ended = null;
  // The newest answer's number, so an older one never draws over it.
  let asked = 0;
  // The table's motion (cards-fx.js), with the game's animations on, and a
  // redraw asked for while it plays.
  const fx = createCardsFx(holder);
  let deferred = false;

  function take(answer) {
    view = answer.arena;
    if (view.defences) {
      defences = view.defences;
      for (const one of defences) if (one.unseen) unseen.add(one.id);
    }
    if (!view.match || plan?.round !== view.match.round) {
      plan = null;
      picked = null;
      aiming = null;
    }
  }

  async function load() {
    asked += 1;
    const mine = asked;
    try {
      const answer = await call('GET', '/api/cards/arena');
      if (mine !== asked) return;
      take(answer);
      failure = null;
    } catch (error) {
      if (mine !== asked) return;
      // With the Karty already on the screen, they stay and the game asks
      // again in half a minute, as the Arena does.
      if (view && error.status !== 403 && error.status !== 404) {
        if (gone) return;
        clearTimeout(timer);
        timer = setTimeout(load, 30000);
        return;
      }
      failure = error;
    }
    if (!gone) render();
  }

  // An action's answer is the Karty after it, newer than any on its way.
  const apply = (answer) => {
    asked += 1;
    take(answer);
    if (!gone) render();
  };

  // An action refused because the Karty changed meanwhile (a rival gone, a
  // week frozen, a turn played in another tab: 409): its message shows, and
  // the Karty come again as they are now.
  const orAgain = async (action) => {
    try {
      await action();
    } catch (error) {
      if (error.status === 409) load();
      throw error;
    }
  };

  // The table brought up under the top bar once the screen is laid out anew.
  const showTop = () =>
    requestAnimationFrame(() => {
      const bar = document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0;
      const top = holder.getBoundingClientRect().top - Math.max(0, bar) - 8;
      if (Math.abs(top) > 4) window.scrollBy({ top });
    });

  // --- The tab ---------------------------------------------------------------

  // The card rating on its plaque with the place this week, and the day's
  // matches as card backs, on the Arena's picture (907.1).
  function statusCard() {
    const { texts, matches } = view;
    const art = place?.backdrop ? placeArt(place.backdrop) : null;
    const card = h(
      'section',
      { class: `card stack pvp-arena-status card-arena-status${art ? ' place-card place-card--art' : ''}`, 'data-guide': 'card-arena-status' },
      h('p', { class: 'pvp-arena-intro', text: texts.intro }),
      h(
        'div',
        { class: 'pvp-arena-plaque' },
        icon('trophy', { size: 30, className: 'pvp-arena-plaque-icon' }),
        h(
          'div',
          { class: 'pvp-arena-plaque-text' },
          h('p', { class: 'pvp-arena-rating', text: say(texts.rating, { rating: view.rating }) }),
          h('p', { class: 'pvp-arena-place', text: view.place ? say(texts.place, { place: view.place }) : texts.noPlace }),
        ),
      ),
      h(
        'div',
        { class: 'pvp-arena-pips' },
        h('span', { class: 'pvp-arena-pips-label', text: say(texts.matchesLeft, { left: matches.left, perDay: matches.perDay }) }),
        h(
          'span',
          { class: 'pvp-arena-pips-row', 'aria-hidden': 'true' },
          Array.from({ length: matches.perDay }, (_, index) => h('span', { class: `pvp-arena-pip${index < matches.left ? ' pvp-arena-pip--on' : ''}` }, h('span', { class: 'card-arena-pip-card' }))),
        ),
      ),
      matches.left === 0 && h('p', { class: 'muted', text: texts.used }),
    );
    if (art) card.style.setProperty('--place-art', `url("${art}")`);
    return card;
  }

  // The hero card (872 A): the character's portrait, its class or
  // evolution, and its skill.
  const heroRow = (hero) =>
    h(
      'div',
      { class: 'card-arena-hero' },
      h('span', { class: 'cards-hero-portrait' }, portraitSprite(hero.classId, hero.appearance, { bust: true, skin: hero.skin, evolution: hero.evolution ?? undefined }) ?? icon(CLASS_ICONS[hero.classId] ?? 'person', { size: 40 })),
      h('div', { class: 'cards-hero-text' }, h('p', { class: 'cards-hero-label', text: t('Karta bohatera: {title}', { title: hero.title }) }), hero.skill && h('p', { class: 'cards-hero-skill', text: hero.skill.name })),
    );

  // The player's deck, which plays for it while it is away: its strength,
  // its hero card, its cards of each type, and the way to the Salon Gier,
  // where it is built.
  function deckCard() {
    const { texts, deck } = view;
    return h(
      'section',
      { class: 'card stack card-arena-deck', 'data-guide': 'card-arena-deck' },
      h('div', { class: 'cards-section-head' }, h('h3', { class: 'section-title', text: texts.deck }), deck && h('span', { class: 'muted', text: say(texts.strength, { strength: deck.strength }) })),
      // The saved decks, one played with a tap (938); the Karty come anew.
      deckSlotsRow(view.decks, { onPlay: () => load() }),
      heroRow(view.hero),
      deck
        ? h(
            'p',
            { class: 'card-arena-types' },
            deck.types.map((type) => h('span', { class: 'card-arena-type' }, typeBadge(type), say(texts.typeCount, { count: type.count, type: type.name }))),
          )
        : h('p', { class: 'region-warning', text: view.starter ? texts.noDeck : texts.noStarter }),
      h('p', { class: 'muted', text: texts.deckNote }),
      h('a', { class: 'button button--world', href: '#/osada/casino/cards', text: view.starter ? t('Ułóż talię') : t('Weź talię od Szczęsnego') }),
    );
  }

  // A defence in words, from the deck's side: who played against it, how it
  // went and the rating's move.
  const defenceLine = (one) => say(gendered(view.texts[DEFENCE_TEXTS[one.result]], one.female), { name: one.name, className: one.className, level: one.level, change: signed(one.change) });

  // The deck's last defences, as the server told them at the look, folded
  // under their title with the count of the new ones; open at first while
  // some are new.
  function defencesCard() {
    if (!defences) return null;
    const { texts } = view;
    const newOnes = defences.filter((one) => unseen.has(one.id)).length;
    defencesOpen ??= newOnes > 0;
    const fold = h(
      'details',
      {
        class: 'card fold-part pvp-arena-defences card-arena-defences',
        open: defencesOpen,
        onToggle: () => {
          defencesOpen = fold.open;
        },
      },
      h('summary', { class: 'fold-part-summary', text: newOnes > 0 ? say(texts.defencesNew, { count: newOnes }) : texts.defences }),
      defences.length === 0
        ? h('p', { class: 'muted', text: texts.noDefences })
        : h(
            'ul',
            { class: 'pvp-arena-list' },
            defences.map((one) =>
              h(
                'li',
                { class: `pvp-arena-defence pvp-arena-defence--${one.result}` },
                h(
                  'div',
                  { class: 'pvp-arena-defence-text' },
                  h('p', {}, unseen.has(one.id) && h('span', { class: 'pvp-arena-new', text: texts.defenceNew }), defenceLine(one)),
                  h('p', { class: 'muted pvp-arena-defence-time', text: when(one.at) }),
                ),
              ),
            ),
          ),
    );
    return fold;
  }

  // A rival: its bust, its name (its card at a tap), class, level and card
  // rating, its deck's strength with what a win and a loss would bring,
  // and "Graj".
  function rivalCard(rival) {
    const { texts, matches } = view;
    const shut = matches.left === 0 || !view.deck;
    return h(
      'li',
      { class: 'card pvp-arena-rival' },
      h('span', { class: 'select-portrait pvp-arena-portrait', 'aria-hidden': 'true' }, bust(rival)),
      h(
        'div',
        { class: 'pvp-arena-rival-text' },
        h('p', { class: 'pvp-arena-rival-name' }, nameButton(rival.name)),
        h('p', { class: 'pvp-arena-rival-line', text: say(texts.rival, { className: rival.className, level: rival.level, rating: rival.rating }) }),
        h('p', { class: 'muted pvp-arena-stake', text: say(texts.stake, { strength: rival.strength, win: rival.stakes.win, loss: Math.abs(rival.stakes.loss) }) }),
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'button button--world pvp-arena-fight',
          disabled: shut,
          'aria-label': `${texts.play}: ${rival.name}`,
          onClick: (event) =>
            withButton(event.currentTarget, () =>
              orAgain(async () => {
                const answer = await call('POST', '/api/cards/arena/match', { rivalId: rival.id });
                ended = null;
                playSound('swing');
                apply(answer);
                showTop();
                if (fx.on()) await fxPlay((run) => fx.enter(run, { previous: null, match: view.match }));
              }),
            ),
        },
        icon('dice', { size: 18 }),
        h('span', { text: texts.play }),
      ),
    );
  }

  // "Losuj innych": other rivals of a similar card rating, with the draws
  // left today; with none left, a line says when they come back.
  function rerollPart() {
    const { texts, rerolls } = view;
    return h(
      'div',
      { class: 'pvp-arena-reroll' },
      h(
        'button',
        {
          type: 'button',
          class: 'button button--world button--small pvp-arena-reroll-button',
          disabled: rerolls.left === 0,
          onClick: (event) => withButton(event.currentTarget, () => orAgain(async () => apply(await call('POST', '/api/cards/arena/reroll')))),
        },
        icon('dice', { size: 16 }),
        h('span', { text: say(texts.reroll, { left: rerolls.left }) }),
      ),
      rerolls.left === 0 && h('p', { class: 'muted', text: texts.rerollsUsed }),
    );
  }

  function rivalsPart() {
    const { texts } = view;
    return h(
      'section',
      { class: 'stack pvp-arena-rivals', 'aria-labelledby': 'card-arena-rivals-title', 'data-guide': 'card-arena-rivals' },
      h(
        'h2',
        { class: 'pvp-arena-heading', id: 'card-arena-rivals-title' },
        icon('swords', { size: 18, className: 'pvp-arena-ornament' }),
        h('span', { text: texts.rivals }),
        icon('swords', { size: 18, className: 'pvp-arena-ornament' }),
      ),
      view.rivals.length === 0 ? h('p', { class: 'muted', text: texts.noRivals }) : [h('ul', { class: 'pvp-arena-list stack' }, view.rivals.map(rivalCard)), rerollPart()],
    );
  }

  const rules = () => {
    const { texts, numbers } = view;
    return howItWorks(
      null,
      texts.rules.map((line) => say(line, { perDay: numbers.perDay, rerolls: numbers.rerolls, start: numbers.start, share: numbers.share, defence: numbers.defence })),
    );
  };

  // The end of the match just played (until "Dalej"): the result, the rival
  // and the card rating's move.
  function endCard() {
    if (!ended) return null;
    const { texts } = view;
    const title = { won: t('Wygrana!'), lost: t('Przegrana'), drawn: t('Remis') }[ended.result];
    const rows = [
      [texts.endRating, say(texts.endChange, { before: ended.before, after: ended.after, change: signed(ended.change) })],
      [t('Rundy'), formatNumber(ended.rounds)],
    ];
    return h(
      'section',
      { class: `card cards-end cards-end--${ended.result}`, role: 'status', 'data-guide': 'card-arena-end' },
      h('p', { class: 'cards-end-title', text: title }),
      ended.rival && h('p', { class: 'muted', text: say(texts.endWith, { name: ended.rival.name }) }),
      h('dl', { class: 'status-list' }, rows.map(([label, value]) => h('div', { class: 'status-row' }, h('dt', { text: label }), h('dd', { text: value })))),
      h('button', {
        type: 'button',
        class: 'button button--system',
        text: t('Dalej'),
        onClick: () => {
          ended = null;
          render();
        },
      }),
    );
  }

  // --- The week's card table (907.3) -------------------------------------------

  // A reward of a frozen week waiting for "Odbierz".
  function dueCard(reward) {
    const { texts } = view;
    return h(
      'section',
      { class: 'card stack pvp-arena-due', 'data-guide': 'card-arena-reward' },
      h('p', { text: say(texts.due, { place: reward.place, date: weekLabel(reward.week) }) }),
      chestContents({ gold: reward.gold, timePoints: 0, materials: [], systemPoints: reward.systemPoints }, texts.rewards),
      h('button', {
        type: 'button',
        class: 'button button--system',
        text: texts.claim,
        onClick: (event) =>
          withButton(event.currentTarget, () =>
            orAgain(async () => {
              const answer = await call('POST', '/api/cards/arena/claim', { week: reward.week });
              apply(answer);
              toast(texts.claimed);
            }),
          ),
      }),
    );
  }

  // This week's card table, as a page of the Ranking: all of its places (at
  // most 50), the character's own row lit.
  function tableCard() {
    const { texts, table } = view;
    return h(
      'section',
      { class: 'card ranking pvp-arena-table card-arena-table', 'data-guide': 'card-arena-table' },
      h('p', { class: 'muted', text: say(texts.tableEnds, { time: timeLeft(table.endsAt - serverNow()) }) }),
      table.own ? h('p', { class: 'ranking-place', text: say(texts.ownPlace, { place: table.own.place, rating: table.own.rating }) }) : h('p', { class: 'muted', text: texts.noPlace }),
      table.rows.length === 0
        ? h('p', { class: 'muted', text: texts.tableEmpty })
        : h(
            'table',
            { class: 'ranking-table' },
            h(
              'thead',
              {},
              h(
                'tr',
                {},
                h('th', { scope: 'col', 'aria-label': t('Miejsce'), text: '#' }),
                h('th', { scope: 'col', text: t('Postać') }),
                h('th', { scope: 'col', text: t('Poziom') }),
                h('th', { scope: 'col', class: 'ranking-sorted', 'aria-sort': 'descending', text: texts.column }),
              ),
            ),
            h(
              'tbody',
              {},
              table.rows.map((row) =>
                h(
                  'tr',
                  { class: row.own ? 'ranking-own' : undefined },
                  h('td', { class: 'ranking-number', text: formatNumber(row.place) }),
                  h('td', { class: 'ranking-name' }, h('span', { class: 'ranking-who' }, icon(CLASS_ICONS[row.classId] ?? 'person', { size: 14, className: 'chat-class' }), nameButton(row.name))),
                  h('td', { text: formatNumber(row.level) }),
                  h('td', { class: 'ranking-sorted', text: formatNumber(row.rating) }),
                ),
              ),
            ),
          ),
    );
  }

  // The rewards of the places at the character's level, half of the duels'.
  function rewardsCard() {
    const { texts, rewards } = view;
    const places = ({ from, to }) => (to === null ? say(texts.tierRest, { from }) : to === from ? say(texts.tierOne, { from }) : say(texts.tierMany, { from, to }));
    return h(
      'section',
      { class: 'card stack pvp-arena-rewards', 'aria-labelledby': 'card-arena-rewards-title' },
      h('h2', { class: 'card-title', id: 'card-arena-rewards-title', text: texts.rewards }),
      h(
        'ul',
        { class: 'pvp-arena-list pvp-arena-tiers' },
        rewards.tiers.map((tier) => h('li', { class: 'pvp-arena-tier' }, h('span', { class: 'pvp-arena-tier-places', text: places(tier) }), chestContents({ ...tier, timePoints: 0, materials: [] }, places(tier)))),
      ),
      h('p', { class: 'muted', text: texts.rewardsNote }),
    );
  }

  function tablePart() {
    const { texts, numbers } = view;
    return [
      ...view.rewards.due.map(dueCard),
      tableCard(),
      rewardsCard(),
      h('p', { class: 'muted pvp-arena-season', text: say(texts.season, { time: timeLeft(view.season.endsAt - serverNow()), share: numbers.share, start: numbers.start }) }),
      howItWorks(null, texts.tableRules),
    ];
  }

  // --- The match (907.2) -------------------------------------------------------

  const typeOf = (id) => view.types.find((type) => type.id === id);
  const beats = (a, b) => typeOf(a)?.target === b;
  // The table's card faces, with its view's types.
  const face = (card, options = {}) => cardFace(card, { ...options, types: view.types });
  // A card of the match marked with its side and key, for its motion.
  const withKey = (element, side, key) => {
    element.dataset.fx = `${side}:${key}`;
    return element;
  };
  // Card backs (886 D): the rival's hidden reserve, a card each, and a
  // deck's pile.
  const backs = (count) => h('span', { class: 'cards-backs', 'aria-hidden': 'true' }, Array.from({ length: Math.max(0, Math.min(count, 4)) }, () => h('span', { class: 'cards-back' })));
  // An empty place on the table, a tap to lay the picked card there.
  const slot = (label, onClick = null, ready = false) =>
    onClick
      ? h('button', { type: 'button', class: `tcard-slot${ready ? ' tcard-slot--ready' : ''}`, onClick }, h('span', { text: label }))
      : h('span', { class: 'tcard-slot' }, h('span', { text: label }));

  // A redraw after a card laid or taken back: with the animations on, the
  // cards that changed their place fly there.
  function renderLaid() {
    const before = fx.on() ? fx.measure() : null;
    render();
    if (before) fx.lay(before);
  }

  // One run of the table's motion; a redraw asked for meanwhile follows it.
  async function fxPlay(play) {
    const run = fx.begin();
    try {
      await play(run);
    } catch (error) {
      console.error('cards-fx', error);
      run.skip();
    }
    fx.finish(run);
    if (deferred && !gone) {
      deferred = false;
      render();
    }
  }

  // The turn being laid, at first the lines as they stand.
  function planOf(match) {
    if (!plan || plan.round !== match.round) plan = { round: match.round, lines: match.me.lines.map((card) => card?.key ?? null), skill: null };
    return plan;
  }

  // My cards by key: those on my lines and in my reserve.
  const myCards = (match) => new Map([...match.me.lines.filter(Boolean), ...match.me.hand].map((card) => [card.key, card]));
  const standingKeys = (match) => match.me.lines.map((card) => card?.key ?? null);
  const reserveLeft = (match) => match.me.hand.filter((card) => !plan.lines.includes(card.key));

  // What a hero's skill does to a card's blow this round: the player's as
  // it is being set, the rival's as the server chose it (rivalSkill).
  const boostOf = (skill, power, card) => {
    if (!skill) return 0;
    if (skill.kind === 'fury' && skill.card === card.key) return power;
    if ((skill.kind === 'aim' || skill.kind === 'shift') && skill.card === card.key) return power;
    if (skill.kind === 'swap' && skill.swap === card.key) return power;
    return 0;
  };

  // The blows of the round as the turn stands, as the server counts them
  // (roundHits): each card hits the card opposite, or the other side's
  // first card from the front, half again harder against a type it beats
  // and by its side's hero's skill. Returns, for each side's line, the blow
  // it takes.
  function blows(match) {
    const mine = myCards(match);
    const skill = plan.skill;
    const rival = match.foe.plan ?? null;
    const power = { me: match.me.hero?.skill?.power ?? 0, foe: match.foe.hero?.skill?.power ?? 0 };
    const lines = {
      me: plan.lines.map((key) => {
        if (key === null) return null;
        const card = mine.get(key);
        return skill?.kind === 'shift' && skill.card === key ? { ...card, type: skill.type } : card;
      }),
      foe: match.foe.lines,
    };
    const taken = { me: [0, 0, 0], foe: [0, 0, 0] };
    const strong = { me: [false, false, false], foe: [false, false, false] };
    for (const side of ['me', 'foe']) {
      const other = side === 'me' ? 'foe' : 'me';
      const own = side === 'me' ? skill : rival;
      lines[side].forEach((card, line) => {
        if (!card) return;
        const aimed = own?.kind === 'aim' && own.card === card.key && lines[other][own.target] ? own.target : null;
        const at = aimed ?? (lines[other][line] ? line : lines[other].findIndex(Boolean));
        if (at === null || at < 0) return;
        const target = lines[other][at];
        const advantage = beats(card.type, target.type);
        const extra = boostOf(own, power[side], card);
        taken[other][at] += Math.max(1, Math.round(card.attack * (1 + (advantage ? view.typeBonus : 0)) * (1 + extra)));
        if (advantage) strong[other][at] = true;
      });
    }
    return { taken, strong };
  }

  // The hero's skill: its steps, as its kind asks.
  const skillKind = () => view.match.me.hero?.skill?.kind ?? null;
  function aimHint() {
    if (!aiming) return null;
    const kind = skillKind();
    if (aiming.step === 'target') return view.texts.aim;
    if (aiming.step === 'type') return t('Wybierz nowy typ karty.');
    if (aiming.step === 'swap') return t('Wskaż kartę z rezerwy, która zajmie jej miejsce.');
    if (kind === 'swap') return t('Wskaż swoją kartę w linii, którą zabierasz do rezerwy.');
    return t('Wskaż swoją kartę w linii.');
  }
  function startAiming() {
    aiming = { step: 'card' };
    picked = null;
    render();
  }
  function cancelSkill() {
    if (plan.skill?.kind === 'swap') {
      const line = plan.lines.indexOf(plan.skill.swap);
      if (line >= 0) plan.lines[line] = plan.skill.card;
    }
    plan.skill = null;
    aiming = null;
    renderLaid();
  }
  function chooseOwn(key) {
    const kind = skillKind();
    const line = plan.lines.indexOf(key);
    if (kind === 'swap') {
      if (standingKeys(view.match)[line] !== key) {
        toast(t('Podmiana zabiera kartę, która stała już w linii.'));
        return;
      }
      aiming = { step: 'swap', card: key };
    } else if (kind === 'aim') aiming = { step: 'target', card: key };
    else if (kind === 'shift') aiming = { step: 'type', card: key };
    else {
      plan.skill = { kind, card: key };
      aiming = null;
    }
    render();
  }

  // A tap on a card of the reserve: picked to lay (again: put down), or the
  // Cień's card swapped in.
  function tapReserve(card) {
    if (aiming?.step === 'swap') {
      const line = plan.lines.indexOf(aiming.card);
      plan.lines[line] = card.key;
      plan.skill = { kind: 'swap', card: aiming.card, swap: card.key };
      aiming = null;
      renderLaid();
      return;
    }
    if (aiming) return;
    const empty = plan.lines.map((key, line) => (key === null ? line : -1)).filter((line) => line >= 0);
    if (empty.length === 0) {
      toast(t('Wszystkie Twoje linie są zajęte.'));
      return;
    }
    picked = picked === card.key ? null : card.key;
    // With one empty line it goes there at once.
    if (picked !== null && empty.length === 1) {
      plan.lines[empty[0]] = picked;
      picked = null;
    }
    renderLaid();
  }

  // A tap on one of my lines: a card laid there, a card laid this turn
  // taken back, or a card chosen for the hero's skill.
  function tapMine(line) {
    const key = plan.lines[line];
    if (aiming) {
      if (key !== null && aiming.step === 'card') chooseOwn(key);
      return;
    }
    const standingKey = standingKeys(view.match)[line];
    if (key === null) {
      if (picked === null) {
        toast(t('Najpierw wybierz kartę z rezerwy.'));
        return;
      }
      plan.lines[line] = picked;
      picked = null;
    } else if (key !== standingKey && plan.skill?.swap !== key) {
      plan.lines[line] = null;
      if (plan.skill?.card === key) plan.skill = null;
    } else return;
    renderLaid();
  }

  function tapFoe(line) {
    if (aiming?.step !== 'target' || !view.match.foe.lines[line]) return;
    plan.skill = { kind: 'aim', card: aiming.card, target: line };
    aiming = null;
    render();
  }

  // Whether the turn can be played: every empty line filled while the
  // reserve has cards.
  function turnReady(match) {
    const empty = plan.lines.filter((key) => key === null).length;
    return empty === 0 || reserveLeft(match).length === 0;
  }

  // One side's three lines: the rival's on top, the player's under them.
  // The rival's cards laid this round are new, and the one its hero's skill
  // works on carries the skill's name; the player's card the rival aims at
  // is its target.
  function linesRow(side, match, blowsNow) {
    const placed = side === 'foe' ? (match.last?.placed ?? []) : [];
    const mine = myCards(match);
    const rival = match.foe.plan ?? null;
    const rivalSkill = match.foe.hero?.skill?.name ?? null;
    return h(
      'div',
      { class: `cards-lines cards-lines--${side}` },
      view.lines.map((name, line) => {
        const card = side === 'foe' ? match.foe.lines[line] : plan.lines[line] === null ? null : mine.get(plan.lines[line]);
        const shownCard = side === 'me' && card && plan.skill?.kind === 'shift' && plan.skill.card === card.key ? { ...card, type: plan.skill.type, shifted: true } : card;
        const fresh = side === 'foe' ? placed.includes(line) : card && card.key !== standingKeys(match)[line];
        let skillMark = null;
        if (side === 'me' && card && (plan.skill?.card === card.key || plan.skill?.swap === card.key)) skillMark = match.me.hero?.skill?.name;
        else if (side === 'foe' && card && rival && (rival.kind === 'swap' ? rival.swap === card.key : rival.card === card.key)) skillMark = rivalSkill;
        else if (side === 'foe' && plan.skill?.kind === 'aim' && plan.skill.target === line) skillMark = t('cel');
        else if (side === 'me' && card && rival?.kind === 'aim' && rival.target === line) skillMark = t('cel');
        const target = side === 'foe' ? aiming?.step === 'target' && card : aiming?.step === 'card' && card;
        const content = shownCard
          ? withKey(
              face(shownCard, {
                marks: { blow: blowsNow.taken[side][line], advantage: blowsNow.strong[side][line], fresh, skill: skillMark, target },
                onClick: side === 'foe' ? (aiming?.step === 'target' ? () => tapFoe(line) : null) : () => tapMine(line),
              }),
              side,
              shownCard.key,
            )
          : side === 'me'
            ? slot(t('Puste'), () => tapMine(line), picked !== null)
            : slot(t('Puste'));
        return h('div', { class: 'cards-line' }, h('span', { class: 'cards-line-name', text: name.name }), content);
      }),
    );
  }

  // The last round's account: each blow, the cards beaten and the rival's
  // skill used.
  function roundAccount(match) {
    const last = match.last;
    if (!last || last.round === 0 || last.hits.length === 0) return null;
    const known = {
      me: new Map([...match.me.lines.filter(Boolean), ...match.me.hand, ...last.beatenCards.me].map((card) => [card.key, card.name])),
      foe: new Map([...match.foe.lines.filter(Boolean), ...last.beatenCards.foe].map((card) => [card.key, card.name])),
    };
    const lines = last.hits.map((hit) => {
      const other = hit.side === 'me' ? 'foe' : 'me';
      const who = known[hit.side].get(hit.key) ?? '?';
      const whom = known[other].get(hit.target.key) ?? '?';
      return h('li', { class: `cards-hit cards-hit--${hit.side}` }, t('{who} → {whom}: {damage}', { who, whom, damage: hit.damage }), hit.advantage && h('span', { class: 'cards-hit-note', text: t(' (przewaga typu)') }));
    });
    const beaten = [...last.beatenCards.foe.map((card) => card.name), ...last.beatenCards.me.map((card) => card.name)];
    const rivalSkill = last.rivalSkill && match.foe.hero?.skill?.name;
    return h(
      'details',
      { class: 'how-more cards-account' },
      h('summary', { class: 'how-toggle', text: t('Runda {round}: zbite {count}', { round: last.round, count: beaten.length }) }),
      h('ul', { class: 'cards-hits' }, lines),
      beaten.length > 0 && h('p', { class: 'muted', text: t('Zbite: {names}.', { names: beaten.join(', ') }) }),
      rivalSkill && h('p', { class: 'muted', text: say(view.texts.rivalSkillUsed, { skill: rivalSkill }) }),
    );
  }

  // "Walcz" with the animations on: the round played on the table as it
  // stood, then the table drawn anew with the rival's new cards and the
  // reserve dealt, or the match's end.
  async function foughtWithFx(answer) {
    const end = answer.end ?? null;
    const played = end ? answer.played : answer.arena.match;
    const previous = view.match;
    const mine = myCards(previous);
    const shown = {
      me: new Map(
        plan.lines
          .filter((key) => key !== null)
          .map((key) => {
            const card = mine.get(key);
            return [key, plan.skill?.kind === 'shift' && plan.skill.card === key ? { ...card, type: plan.skill.type } : card];
          }),
      ),
      foe: new Map(previous.foe.lines.filter(Boolean).map((card) => [card.key, card])),
    };
    const run = fx.begin();
    try {
      await fx.round(run, { last: played?.last, shown, after: played, end: null, types: view.types });
    } catch (error) {
      console.error('cards-fx', error);
      run.skip();
    }
    if (end) {
      playSound(end.result === 'won' ? 'chest' : 'tick');
      ended = end;
    }
    plan = null;
    deferred = false;
    fx.finish(run);
    apply(answer);
    if (end) showTop();
    await fxPlay((next) => {
      if (run.skipped) next.skip();
      return end ? fx.ended(next, { end: { ...end, mode: 'arena' }, coinsDone: false }) : fx.enter(next, { previous, match: view.match });
    });
  }

  function matchCard() {
    const match = view.match;
    const { texts } = view;
    planOf(match);
    const blowsNow = blows(match);
    const hero = match.me.hero;
    const skill = hero?.skill;
    const rival = match.rival;
    const rivalHero = match.foe.hero;
    const reserve = reserveLeft(match);
    const ready = turnReady(match);
    const art = place?.backdrop ? placeArt(place.backdrop) : null;
    const table = h(
      'section',
      { class: `cards-table card-arena-match-table${art ? ' place-card place-card--art' : ''}`, 'data-guide': 'card-arena-table-match', 'aria-label': t('Stół') },
      h(
        'div',
        { class: 'cards-table-head' },
        h('span', { class: 'cards-table-bust' }, bust(rival)),
        h(
          'div',
          { class: 'cards-table-who' },
          h('p', { class: 'cards-table-name', text: rival.name }),
          h('p', { class: 'cards-table-tier', text: say(texts.rival, { className: rival.className, level: rival.level, rating: rival.rating }) }),
          h('p', { class: 'muted cards-table-count' }, backs(match.foe.hand), h('span', { text: t('Rezerwa {hand} · talia {deck} · zbite {out}', { hand: match.foe.hand, deck: match.foe.deck, out: match.foe.out }) })),
          rivalHero?.skill && h('p', { class: 'card-arena-rival-hero', title: rivalHero.skill.text, text: say(rivalHero.used && !match.foe.plan ? texts.rivalHeroUsed : texts.rivalHero, { skill: rivalHero.skill.name }) }),
        ),
        h('span', { class: 'cards-round', text: t('Runda {round}/{cap}', { round: match.round, cap: match.cap }) }),
      ),
      match.foe.plan && rivalHero?.skill && h('p', { class: 'card-arena-rival-now', role: 'status', text: say(texts.rivalSkillNow, { skill: rivalHero.skill.name }) }),
      linesRow('foe', match, blowsNow),
      h('div', { class: 'cards-divider', 'aria-hidden': 'true' }, h('span', { text: say(texts.divider, { win: match.stakes.win, loss: Math.abs(match.stakes.loss) }) })),
      linesRow('me', match, blowsNow),
      h('p', { class: 'muted cards-table-count cards-table-count--me' }, match.me.deck > 0 && backs(1), h('span', { text: t('Twoja talia {deck} · zbite {out}', { deck: match.me.deck, out: match.me.out }) })),
    );
    if (art) table.style.setProperty('--place-art', `url("${art}")`);
    const hint = aimHint() ?? (picked !== null ? t('Wskaż pustą linię dla tej karty.') : !ready ? t('Dołóż karty z rezerwy na puste linie.') : null);
    return h(
      'div',
      { class: 'stack cards-match', 'data-guide': 'card-arena-match' },
      table,
      h(
        'section',
        { class: 'card cards-reserve', 'aria-label': t('Rezerwa') },
        h('div', { class: 'cards-section-head' }, h('h3', { class: 'section-title', text: t('Rezerwa') }), hint && h('p', { class: 'cards-hint', role: 'status', text: hint })),
        reserve.length > 0
          ? h(
              'div',
              { class: 'tcard-grid tcard-grid--reserve' },
              reserve.map((card) => withKey(face(card, { marks: { picked: picked === card.key, target: aiming?.step === 'swap' }, onClick: () => tapReserve(card) }), 'me', card.key)),
            )
          : h('p', { class: 'muted', text: t('Rezerwa pusta.') }),
        aiming?.step === 'type' &&
          h(
            'div',
            { class: 'cards-types' },
            view.types
              .filter((type) => type.id !== myCards(match).get(aiming.card)?.type)
              .map((type) =>
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'button button--world',
                    onClick: () => {
                      plan.skill = { kind: 'shift', card: aiming.card, type: type.id };
                      aiming = null;
                      render();
                    },
                  },
                  typeBadge(type, 16),
                  type.name,
                ),
              ),
          ),
      ),
      hero &&
        h(
          'section',
          { class: 'card cards-skill', 'data-guide': 'card-arena-skill' },
          heroRow({ ...view.hero, skill }),
          h('p', { class: 'muted cards-skill-text', text: skill?.text ?? '' }),
          hero.used
            ? h('p', { class: 'chip chip--dashed', text: t('Umiejętność użyta w tej partii') })
            : plan.skill
              ? h('p', { class: 'cards-skill-set' }, h('span', { class: 'chip chip--success', text: t('{skill}: w tej rundzie', { skill: skill.name }) }), h('button', { type: 'button', class: 'link-button', text: t('Anuluj'), onClick: cancelSkill }))
              : aiming
                ? h('button', { type: 'button', class: 'button button--system', text: t('Anuluj'), onClick: cancelSkill })
                : h('button', { type: 'button', class: 'button button--system', text: t('Użyj: {skill}', { skill: skill?.name ?? '' }), onClick: startAiming }),
        ),
      h(
        'div',
        { class: 'cards-actions' },
        h('button', {
          type: 'button',
          class: 'button button--world cards-fight',
          'data-guide': 'card-arena-fight',
          text: t('Walcz'),
          disabled: !ready || Boolean(aiming),
          onClick: (event) =>
            withButton(event.currentTarget, () =>
              orAgain(async () => {
                const answer = await call('POST', '/api/cards/arena/turn', {
                  round: plan.round,
                  lines: plan.lines,
                  skill: plan.skill ? { card: plan.skill.card, target: plan.skill.target, type: plan.skill.type, swap: plan.skill.swap } : null,
                });
                playSound('swing');
                if (fx.on() && !gone) {
                  await foughtWithFx(answer);
                  return;
                }
                if (answer.end) {
                  ended = answer.end;
                  playSound(answer.end.result === 'won' ? 'chest' : 'tick');
                }
                plan = null;
                apply(answer);
                if (answer.end) showTop();
              }),
            ),
        }),
        h('button', {
          type: 'button',
          class: 'button button--system button--small',
          text: t('Poddaj partię'),
          onClick: async (event) => {
            const button = event.currentTarget;
            const sure = await confirmAction({ title: t('Poddać partię?'), text: say(texts.surrender, { loss: Math.abs(match.stakes.loss) }), confirmLabel: t('Poddaj'), danger: true });
            if (!sure) return;
            await withButton(button, () =>
              orAgain(async () => {
                const answer = await call('POST', '/api/cards/arena/surrender');
                ended = answer.end;
                apply(answer);
                showTop();
              }),
            );
          },
        }),
      ),
      roundAccount(match),
    );
  }

  // --- The panel -------------------------------------------------------------

  function render() {
    // While the table's motion plays, the redraw waits for its end.
    if (fx.holding()) {
      deferred = true;
      return;
    }
    clearTimeout(timer);
    if (failure) {
      holder.replaceChildren(systemPanel(failure.message));
      return;
    }
    if (!view) {
      holder.replaceChildren(h('p', { class: 'muted', text: t('Wczytywanie kart…') }));
      return;
    }
    let body;
    if (part === 'table') body = tablePart();
    else if (view.match) body = [endCard(), matchCard()];
    else body = [endCard(), statusCard(), deckCard(), defencesCard(), rivalsPart(), rules()];
    fx.cancelFlights();
    holder.replaceChildren(h('div', { class: `stack cards-tab card-arena${fx.on() ? ' cfx-on' : ''}` }, body));
    // The weeks whose rewards wait, for the dot on the Arena's table tab.
    if (view.rewards.due.length !== due) {
      due = view.rewards.due.length;
      onDue(due);
    }
    // At midnight the matches come back, on Monday the table closes: the
    // Karty are asked again then.
    const next = Math.min(view.matches.endsAt, view.table.endsAt);
    timer = setTimeout(load, Math.max(5000, next - serverNow() + 60000));
  }

  render();
  load();
  return {
    holder,
    // Which part to show: the tab "Karty" ("play") or the week's card table
    // ("table").
    show(next) {
      if (next === part) return;
      part = next;
      if (!gone) render();
    },
    refresh: () => {
      if (!gone) render();
    },
    unmount() {
      gone = true;
      clearTimeout(timer);
      fx.stop();
    },
  };
}
