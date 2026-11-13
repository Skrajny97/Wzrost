// Talia Systemu, the Salon Gier's third tab "Karty" (src/server/cards.js,
// src/engine/cards.js; DECISIONS.md, "Talia Systemu: gra karciana w Salonie
// Gier", 871–877), where the game has it on. Before a match: Szczęsny's
// table on the Salon's picture with the day's staked matches, his starter
// deck to take, the player's deck with "Ułóż talię", the hero's card, his
// five tiers with their stakes and rewards, and the rules under "Jak to
// działa?". The deck is built from the collection, twelve cards. A match is
// the table: Szczęsny's three lines over the player's, the reserve under
// them, the hero's skill and "Walcz". A tap on a reserve's card and then on
// an empty line lays it there (a tap on a card laid this turn takes it
// back); every blow of the round shows on its target before "Walcz", as the
// server counts it (the engine's roundHits), so the player sees what the
// round will do; the rival's cards laid this round are marked new. After
// "Walcz" the round's account, and at the end what the match gave.
//
// The cards are the creatures' sprites of the Bestiariusz in frames of their
// rarity's colour, with Atak, Życie, the type's icon and the level. Every
// turn is one request; the page keeps the turn being laid until "Walcz". The
// words of the data come with the server's view (data/cards.json), the rest
// is the page's (t()).
//
// The table moves (cards-fx.js, the author's pick 895 C „Widowiskowe”): a
// card laid flies to its line, the round plays blow by blow before the table
// is drawn anew, Szczęsny's cards and the reserve's are dealt, and the end
// and the cards won come in. With the game's animations off ("Animacje",
// motion.js) every change shows at once.
//
// The residents of the Osada play at their own places (904 B, mock-ups
// 910.1 and 910.2): mounted with `resident`, the same panel is that
// resident's table under its bust ("Karty z Jagną"): the day's staked
// matches, its deck's style and place among Szczęsny's tiers, its first
// cards, the stake and what a win gives, "Zagraj o … zł" and "Trening",
// and its match on the same table as Szczęsny's. A match is played at its
// own table: elsewhere the panel says where it waits.

import { areaArtUrl, monsterSprite, placeArt, portraitSprite, residentBust } from './art.js';
import { mountDuel } from './card-duel.js';
import { createCardsFx, fxDroppedCards } from './cards-fx.js';
import { h, icon } from './dom.js';
import { countOf, formatNumber } from './format.js';
import { t } from './i18n.js';
import { playSound } from './sound.js';
import { call, serverNow, state } from './state.js';
import { confirmAction, howItWorks, systemPanel, toast, withButton } from './ui.js';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

// A card's name on its face, with the letters of its longest piece a line
// cannot break (between spaces, or after a hyphen), for the size of its
// letters: that piece whole on the card (styles.css, .tcard-name).
function cardName(name) {
  const pieces = String(name).replace(/-/g, '- ').split(/\s+/);
  const chars = Math.max(1, ...pieces.map((piece) => [...piece].length));
  return h('span', { class: 'tcard-name', vars: { '--name-chars': String(chars) }, text: name });
}

// A card's type as its badge shows it: the data's (`types`), or the card's
// own name and icon.
const typeInfo = (card, types) => types.find((type) => type.id === card.type) ?? (card.typeIcon ? { id: card.type, name: card.typeName, icon: card.typeIcon } : null);

// A card type's badge: its colour, icon and name.
const typeBadge = (id, size, type) => h('span', { class: `tcard-type tcard-type--${id}`, title: type?.name, 'aria-label': type?.name }, icon(type?.icon ?? 'unknown', { size }));

// A card's face: its rarity's frame, the creature's sprite, its name, Atak,
// Życie (with its bar once hurt), type and level. `marks` adds the blow it
// will take (−N), "nowa" and the choices of the turn. `types`: the data's
// types, for a card without its own type's name and icon (cardView in the
// engine gives them). Every card of the game is shown through it: the
// Salon's tab, the report's cards and the Encyklopedia's "Karty".
export function cardFace(card, { compact = false, marks = {}, onClick = null, label = null, types = [] } = {}) {
  const type = typeInfo(card, types);
  const hurt = card.max && card.life < card.max;
  const body = [
    h('span', { class: 'tcard-top' }, typeBadge(card.type, compact ? 12 : 14, type), h('span', { class: 'tcard-level', title: t('Poziom karty'), text: String(card.level) })),
    h('span', { class: 'tcard-art' }, monsterSprite(card.id) ?? icon('beast', { size: 32 })),
    cardName(card.name),
    h(
      'span',
      { class: 'tcard-stats' },
      h('span', { class: 'tcard-attack', title: t('Atak') }, icon('sword', { size: 12 }), formatNumber(card.attack)),
      h('span', { class: 'tcard-life', title: t('Życie') }, icon('heart', { size: 12 }), formatNumber(card.life)),
    ),
    hurt && h('span', { class: 'tcard-bar' }, h('span', { class: 'tcard-bar-fill', vars: { '--share': `${Math.max(0, card.life / card.max) * 100}%` } })),
    marks.blow > 0 && h('span', { class: `tcard-blow${marks.blow >= card.life ? ' tcard-blow--down' : ''}${marks.advantage ? ' tcard-blow--strong' : ''}`, text: `−${formatNumber(marks.blow)}` }),
    marks.fresh && h('span', { class: 'tcard-chip', text: t('nowa') }),
    marks.skill && h('span', { class: 'tcard-chip tcard-chip--skill', text: marks.skill }),
    marks.chosen && h('span', { class: 'tcard-check' }, icon('check', { size: 14 })),
    card.shifted && h('span', { class: 'tcard-chip tcard-chip--shift', text: t('przemiana') }),
  ];
  const className = [
    'tcard',
    `tcard--${card.rarity}`,
    compact && 'tcard--compact',
    marks.picked && 'tcard--picked',
    marks.target && 'tcard--target',
    marks.chosen && 'tcard--chosen',
    marks.blow >= card.life && 'tcard--falling',
    marks.dim && 'tcard--dim',
  ]
    .filter(Boolean)
    .join(' ');
  const ariaLabel =
    label ??
    t('{name}, {type}, poziom {level}: Atak {attack}, Życie {life}', { name: card.name, type: type?.name ?? '', level: card.level, attack: card.attack, life: card.life });
  // The place of the creature's first home behind it (885 C, 12.11.2026).
  const scene = card.area ? areaArtUrl(card.area) : null;
  const vars = { '--rarity': card.color, ...(scene && { '--scene': scene }) };
  return onClick
    ? h('button', { type: 'button', class: className, vars, 'aria-label': ariaLabel, onClick }, body)
    : h('span', { class: className, vars, role: 'img', 'aria-label': ariaLabel }, body);
}

// Szczęsny's words after a match, or a resident's, one of the data's.
const oneOf = (lines) => lines[Math.floor(Math.random() * lines.length)];

// `resident`: the resident whose table this is (904 B), at its place in the
// Osada; none for Szczęsny's tab in the Salon Gier.
export function mountCards(holder, { onLayout = () => {}, resident = null } = {}) {
  let view = null;
  let failure = null;
  let gone = false;
  let timer = null;
  // The deck builder open, with the cards chosen and the type shown.
  let building = false;
  let chosen = new Set();
  let shown = 'all';
  // The turn being laid: its round, the player's lines, the hero's skill,
  // and the reserve's card picked to lay.
  let plan = null;
  let picked = null;
  // The hero's skill being set: its step and what is chosen so far.
  let aiming = null;
  // A match just ended, shown until "Dalej".
  let ended = null;
  // The pack just bought at Szczęsny's (902 C): its cards on the table
  // until „Dalej”.
  let opened = null;
  // Whether the table took the whole tab last time (onLayout).
  let wasPlaying = false;
  // The table's motion (cards-fx.js), with the game's animations on, and a
  // redraw asked for while it plays.
  const fx = createCardsFx(holder);
  let deferred = false;

  // A live match with another player (901 B, card-duel.js) takes the table
  // while it runs; once its end is seen, Szczęsny's tab comes back. Only the
  // Salon's table has it: a resident's table in the Osada (904 B) never
  // shows a live match.
  const duel = resident ? { on: () => false, unmount: () => {} } : mountDuel(holder, { cardFace, onLayout: () => onLayout(), onEnd: () => load() });
  // Whether a match is this table's: a resident's at its own, Szczęsny's in
  // the Salon. Another table's waits there.
  const own = (match) => Boolean(match) && (resident ? match.resident === resident : !match.resident);
  const playing = () => duel.on() || (own(view?.match) && !building);
  // A resident's table as the view brings it (the residents' tables, 904 B).
  const tableOf = (id) => view?.residents?.find((one) => one.id === id) ?? null;
  // Who sits across a match or its end: Szczęsny with his tier, or a
  // resident with its deck; the bust's id, the name and the line under it.
  function whoOf(match) {
    const table = match?.resident ? tableOf(match.resident) : null;
    if (table) return { id: table.id, name: table.name, line: table.deck, of: table.of };
    return { id: 'gamehost', name: t('Szczęsny'), line: view?.tiers?.find((one) => one.number === match?.tier)?.name ?? null, of: null };
  }
  // The rival's words after a match: a resident's own, or Szczęsny's.
  function wordsFor(end) {
    const key = { won: 'win', lost: 'loss', drawn: 'draw' }[end.result];
    const lines = end.resident ? tableOf(end.resident)?.texts[key] : view.texts[key];
    return lines?.length ? oneOf(lines) : null;
  }

  // The tab brought up under the top bar, which stays over the page
  // (styles.css, .topbar), once the screen has laid itself out anew.
  const showTab = () =>
    requestAnimationFrame(() => {
      const bar = document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0;
      const top = holder.getBoundingClientRect().top - Math.max(0, bar) - 8;
      if (Math.abs(top) > 4) window.scrollBy({ top });
    });

  function take(answer) {
    view = answer.cards;
    if (answer.character) state.character = answer.character;
    if (!view.match || plan?.round !== view.match.round) {
      plan = null;
      picked = null;
      aiming = null;
    }
  }

  async function load() {
    try {
      take(await call('GET', '/api/cards'));
      failure = null;
    } catch (error) {
      if (view) {
        clearTimeout(timer);
        timer = setTimeout(load, 30000);
        return;
      }
      failure = error;
    }
    if (!gone) render();
  }

  // An action's answer: the tab after it.
  const apply = (answer) => {
    take(answer);
    if (!gone) render();
  };

  // --- Cards ---------------------------------------------------------------

  const typeOf = (id) => view.types.find((type) => type.id === id);
  const beats = (a, b) => typeOf(a)?.target === b;
  const typeIcon = (id, size = 14) => typeBadge(id, size, typeOf(id));
  // The tab's card faces, with its view's types.
  const face = (card, options = {}) => cardFace(card, { ...options, types: view.types });
  // A card of the match marked with its side and key, for its motion.
  const withKey = (element, side, key) => {
    element.dataset.fx = `${side}:${key}`;
    return element;
  };

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
      // The motion never stops the game: its table is drawn as it is.
      console.error('cards-fx', error);
      run.skip();
    }
    fx.finish(run);
    if (deferred && !gone) {
      deferred = false;
      render();
    }
  }

  // "Walcz" with the animations on: the round played on the table as it
  // stood, then the table drawn anew with what came after it (the rival's
  // new cards, the reserve dealt) or the match's end.
  async function foughtWithFx(answer, goldBefore) {
    const end = answer.end ?? null;
    const said = end ? wordsFor(end) : null;
    const played = end ? answer.played : answer.cards.match;
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
    if (end?.mode === 'staked' && end.result !== 'lost') fx.holdGold(goldBefore, answer.character?.gold ?? goldBefore);
    let sounded = false;
    const endSound = () => {
      if (sounded || !end) return;
      sounded = true;
      playSound(end.result === 'won' ? 'chest' : 'tick');
    };
    const run = fx.begin();
    let coinsDone = false;
    try {
      ({ coinsDone } = await fx.round(run, { last: played?.last, shown, after: played, end: end && { ...end, words: said, who: whoOf(end) }, types: view.types, onEnd: endSound }));
    } catch (error) {
      console.error('cards-fx', error);
      run.skip();
    }
    endSound();
    if (end) ended = { ...end, words: said };
    plan = null;
    deferred = false;
    // The table drawn anew in between, the run going on over it.
    fx.finish(run);
    apply(answer);
    if (end) showTab();
    await fxPlay((next) => {
      if (run.skipped) next.skip();
      return end ? fx.ended(next, { end, coinsDone }) : fx.enter(next, { previous, match: view.match });
    });
  }

  // Card backs (886 D): Szczęsny's hidden reserve, a card each, and a
  // deck's pile.
  const backs = (count) => h('span', { class: 'cards-backs', 'aria-hidden': 'true' }, Array.from({ length: Math.max(0, Math.min(count, 4)) }, () => h('span', { class: 'cards-back' })));

  // An empty place on the table, a tap to lay the picked card there.
  const slot = (label, onClick = null, ready = false) =>
    onClick
      ? h('button', { type: 'button', class: `tcard-slot${ready ? ' tcard-slot--ready' : ''}`, onClick }, h('span', { text: label }))
      : h('span', { class: 'tcard-slot' }, h('span', { text: label }));

  // --- Before a match ------------------------------------------------------

  // Szczęsny's table on the Salon's picture: his words, the day's staked
  // matches, and his starter deck while it waits.
  function tableHead() {
    const art = placeArt('casino-hall');
    const card = h(
      'section',
      { class: `card cards-head place-card${art ? ' place-card--art' : ''}`, 'data-guide': 'cards-head' },
      // Szczęsny's own card stands right above, with his bust.
      h('div', { class: 'cards-head-text' }, h('h2', { class: 'card-title cards-title', text: view.name }), h('p', { class: 'cards-intro', text: view.starter ? view.texts.intro : view.texts.starterOffer })),
      view.starter &&
        h(
          'div',
          { class: 'cards-plaque' },
          icon('dice', { size: 18, className: 'cards-plaque-icon' }),
          h('span', { text: t('Partie o stawkę dziś: {used} z {limit}', { used: view.staked.today, limit: view.staked.limit }) }),
        ),
      !view.starter &&
        h('button', {
          type: 'button',
          class: 'button button--world',
          'data-guide': 'cards-starter',
          text: t('Weź talię od Szczęsnego'),
          onClick: (event) =>
            withButton(event.currentTarget, async () => {
              const answer = await call('POST', '/api/cards/starter');
              playSound('chest');
              apply(answer);
              toast(view.texts.starterTaken);
              if (fx.on()) await fxPlay((run) => fx.dealt(run, [...holder.querySelectorAll('.cards-deck .tcard')], { show: true }));
            }),
        }),
    );
    if (art) card.style.setProperty('--place-art', `url("${art}")`);
    return card;
  }

  // The player's deck: its twelve cards small, and the collection's size.
  function deckCard() {
    if (!view.starter) return null;
    const byId = new Map(view.collection.map((card) => [card.id, card]));
    const cards = (view.deck ?? []).map((id) => byId.get(id)).filter(Boolean);
    return h(
      'section',
      { class: 'card stack cards-deck', 'data-guide': 'cards-deck' },
      h(
        'div',
        { class: 'cards-section-head' },
        h('h3', { class: 'section-title', text: t('Twoja talia') }),
        h('span', { class: 'muted', text: t('Kolekcja: {count}', { count: formatNumber(view.collection.length) }) }),
      ),
      cards.length > 0
        ? h('div', { class: 'tcard-grid tcard-grid--deck' }, cards.map((card) => face(card, { compact: true })))
        : h('p', { class: 'muted', text: t('Talia nie jest ułożona. Wybierz {count} kart z kolekcji.', { count: view.deckSize }) }),
      h('button', {
        type: 'button',
        class: 'button button--world',
        text: t('Ułóż talię'),
        onClick: () => {
          building = true;
          chosen = new Set(view.deck ?? []);
          render();
          showTab();
        },
      }),
    );
  }

  // Names one after another: „A, B i C”.
  const listOf = (words) => (words.length > 1 ? `${words.slice(0, -1).join(', ')}${t(' i ')}${words.at(-1)}` : (words[0] ?? ''));

  // The day's pack at Szczęsny's (902 C), under the hero's card: three
  // cards of the creatures of the lands lower than the character's own,
  // those it misses first, for the gold of an hour of exploring; once
  // bought, its cards on the table until „Dalej”.
  function packCard() {
    const pack = view.pack;
    if (!pack) return null;
    const head = (state) =>
      h('div', { class: 'cards-section-head' }, h('h3', { class: 'section-title', text: t('Pakiet z niższych krain') }), h('span', { class: 'muted', text: state }));
    if (opened) {
      const fresh = opened.filter((card) => card.fresh).map((card) => card.name);
      const higher = opened.filter((card) => !card.fresh).map((card) => card.name);
      return h(
        'section',
        { class: 'card stack cards-pack', 'data-guide': 'cards-pack' },
        head(t('kupiony')),
        h('p', { text: view.texts.pack.opened }),
        h('div', { class: 'tcard-grid tcard-grid--reserve' }, opened.map((card) => face(card, { marks: { fresh: card.fresh } }))),
        h('p', {
          class: 'muted',
          text: [
            fresh.length > 0 && t('Nowe w kolekcji: {cards}.', { cards: listOf(fresh) }),
            higher.length > 0 && t('Na wyższy poziom wchodzą: {cards}.', { cards: listOf(higher) }),
            pack.missing > 0 ? t('W niższych krainach brakuje Ci jeszcze {cards}.', { cards: countOf(pack.missing, 'karty', 'kart', 'kart') }) : t('Masz już wszystkie karty z niższych krain.'),
          ]
            .filter(Boolean)
            .join(' '),
        }),
        h('p', { class: 'muted', text: t('Następny pakiet jutro.') }),
        h('button', {
          type: 'button',
          class: 'button button--system',
          text: t('Dalej'),
          onClick: () => {
            opened = null;
            render();
          },
        }),
      );
    }
    const gold = state.character?.gold ?? 0;
    const missingGold = pack.price - gold;
    return h(
      'section',
      { class: 'card stack cards-pack', 'data-guide': 'cards-pack' },
      head(pack.bought ? t('kupiony') : t('raz dziennie')),
      h('div', { class: 'cards-pack-row' }, h('span', { class: 'cards-pack-backs', 'aria-hidden': 'true' }, Array.from({ length: pack.count }, () => h('span', { class: 'cards-back' }))), h('p', { text: view.texts.pack.offer })),
      h('p', {
        class: 'muted',
        text: [
          t('Krainy niższe niż Twoja: {lands}.', { lands: listOf(pack.lands) }),
          pack.missing > 0 ? t('Brakuje Ci tam jeszcze {cards}.', { cards: countOf(pack.missing, 'karty', 'kart', 'kart') }) : t('Masz już wszystkie karty z tych krain.'),
        ].join(' '),
      }),
      pack.bought
        ? h('p', { class: 'muted', text: t('Pakiet na dziś już kupiony. Następny jutro.') })
        : pack.empty
          ? h('p', { class: 'muted', text: t('Masz już wszystkie karty z niższych krain na najwyższym poziomie.') })
          : [
              h('button', {
                type: 'button',
                class: 'button button--world',
                disabled: missingGold > 0,
                text: t('Kup pakiet za {gold} zł', { gold: formatNumber(pack.price) }),
                onClick: (event) =>
                  withButton(event.currentTarget, async () => {
                    const answer = await call('POST', '/api/cards/pack');
                    playSound('chest');
                    opened = answer.pack;
                    apply(answer);
                  }),
              }),
              missingGold > 0 && h('p', { class: 'muted small', text: t('Brakuje: {what}.', { what: t('{gold} złota', { gold: formatNumber(missingGold) }) }) }),
            ],
    );
  }

  // The hero's card (872 A): the character's portrait, its class or
  // evolution, and its skill once a match.
  function heroCard(hero, { compact = false } = {}) {
    const skill = hero.skill;
    return h(
      'section',
      { class: `card cards-hero${compact ? ' cards-hero--compact' : ''}`, 'data-guide': 'cards-hero' },
      h('span', { class: 'cards-hero-portrait' }, portraitSprite(hero.classId, hero.appearance, { bust: true, skin: hero.skin, evolution: hero.evolution ?? undefined }) ?? icon(hero.classId, { size: 40 })),
      h(
        'div',
        { class: 'cards-hero-text' },
        h('p', { class: 'cards-hero-label', text: t('Karta bohatera: {title}', { title: hero.title }) }),
        skill && h('p', { class: 'cards-hero-skill', text: skill.name }),
        skill && !compact && h('p', { class: 'muted cards-hero-about', text: skill.text }),
      ),
    );
  }

  // Szczęsny's tiers (873 A): each with its stake and what a win gives,
  // its reward of the day and its card for the first win (taken or still
  // waiting), and "Zagraj o stawkę" and "Trening".
  function tiersCard() {
    if (!view.starter) return null;
    const gold = state.character.gold;
    const noDeck = !view.deck;
    const limit = view.staked.today >= view.staked.limit;
    // A match at a resident's table waits there (elsewhere).
    const busy = Boolean(view.match);
    const start = (tier, staked) => (event) =>
      withButton(event.currentTarget, async () => {
        const answer = await call('POST', '/api/cards/match', { tier: tier.number, staked });
        ended = null;
        playSound('swing');
        apply(answer);
        showTab();
        if (fx.on()) await fxPlay((run) => fx.enter(run, { previous: null, match: view.match }));
      });
    return h(
      'section',
      { class: 'stack cards-tiers', 'data-guide': 'cards-tiers' },
      h('h3', { class: 'section-title', text: t('Stopnie Szczęsnego') }),
      noDeck && h('p', { class: 'region-warning', text: t('Najpierw ułóż talię z {count} kart.', { count: view.deckSize }) }),
      view.tiers.map((tier) =>
        h(
          'article',
          { class: `card cards-tier${tier.beaten ? ' cards-tier--beaten' : ''}` },
          h(
            'div',
            { class: 'cards-tier-head' },
            h('span', { class: 'cards-tier-number', text: ROMAN[tier.number - 1] ?? String(tier.number) }),
            h('div', { class: 'cards-tier-title' }, h('h4', { class: 'cards-tier-name', text: tier.name }), h('p', { class: 'muted cards-tier-text', text: tier.text })),
          ),
          // The stake and what a win gives, then the reward of the day and
          // the first win's card, each taken or still waiting.
          h(
            'p',
            { class: 'cards-tier-facts' },
            h('span', {}, t('Stawka partii'), ' ', h('strong', { text: t('{gold} zł', { gold: formatNumber(tier.stake) }) })),
            h('span', {}, t('Za wygraną zgarniesz'), ' ', h('strong', { text: t('{gold} zł', { gold: formatNumber(tier.win) }) })),
          ),
          h(
            'p',
            { class: 'cards-tier-facts' },
            tier.rewarded
              ? h('span', { class: 'cards-tier-done' }, icon('check', { size: 14 }), t('Nagroda dnia odebrana'))
              : h('span', {}, t('Nagroda dnia'), ' ', h('strong', { text: t('+{gold} zł', { gold: formatNumber(tier.reward) }) })),
            tier.beaten
              ? h('span', { class: 'cards-tier-done' }, icon('check', { size: 14 }), t('Stopień pokonany'))
              : h('span', {}, t('Pierwsza wygrana'), ' ', h('strong', { class: 'cards-rarity', vars: { '--rarity': tier.firstWin.color }, text: t('karta: {rarity}', { rarity: tier.firstWin.name }) })),
          ),
          h(
            'div',
            { class: 'cards-tier-actions' },
            h('button', {
              type: 'button',
              class: 'button button--world',
              text: gold < tier.stake ? t('Brakuje złota') : t('Zagraj o {gold} zł', { gold: formatNumber(tier.stake) }),
              disabled: noDeck || busy || limit || gold < tier.stake,
              onClick: start(tier, true),
            }),
            h('button', { type: 'button', class: 'button button--system', text: t('Trening'), disabled: noDeck || busy, onClick: start(tier, false) }),
          ),
        ),
      ),
      limit && h('p', { class: 'muted', text: t('Na dziś to już wszystkie partie o stawkę. Trening jest bez limitu.') }),
    );
  }

  // The last match's end (until "Dalej"): won, lost or a draw, the rival's
  // words, the gold, the reward of the day and the card won (a tier's first
  // win, or a resident's: its first staked win or its chance).
  function endCard() {
    if (!ended) return null;
    const title = { won: t('Wygrana!'), lost: t('Przegrana'), drawn: t('Remis') }[ended.result];
    const words = ended.words;
    // At a resident's table (904 B): its name and deck, and the card of its
    // first staked win or of its chance at a later one.
    const who = whoOf(ended);
    const reward = !ended.resident
      ? t('Za pierwsze pokonanie stopnia Szczęsny daje ci kartę:')
      : ended.first
        ? t('Za pierwszą wygraną o stawkę {name} daje Ci kartę:', { name: who.name })
        : t('{name} daje Ci też kartę ze swojej talii:', { name: who.name });
    const rows = [
      ended.mode === 'staked' && ended.result === 'won' && [t('Za wygraną zgarniasz'), t('+{gold} zł', { gold: formatNumber(ended.gold) })],
      ended.mode === 'staked' && ended.result === 'drawn' && [t('Stawka wraca'), t('+{gold} zł', { gold: formatNumber(ended.gold) })],
      ended.mode === 'staked' && ended.result === 'lost' && [t('Stawka przepada'), t('−{gold} zł', { gold: formatNumber(ended.stake) })],
      ended.daily > 0 && [t('Nagroda dnia'), t('+{gold} zł', { gold: formatNumber(ended.daily) })],
      ended.mode === 'training' && [t('Trening'), t('bez stawki i nagród')],
      [t('Rundy'), formatNumber(ended.rounds)],
    ].filter(Boolean);
    return h(
      'section',
      { class: `card cards-end cards-end--${ended.result}`, role: 'status', 'data-guide': 'cards-end' },
      h('p', { class: 'cards-end-title', text: title }),
      ended.tierName && h('p', { class: 'muted', text: t('Szczęsny, stopień {number}: {name}', { number: ROMAN[ended.tier - 1] ?? ended.tier, name: ended.tierName }) }),
      ended.resident && ended.deck && h('p', { class: 'muted', text: `${who.name}, ${ended.deck}` }),
      words && h('p', { class: 'settlement-greeting', text: words }),
      h('dl', { class: 'status-list' }, rows.map(([label, value]) => h('div', { class: 'status-row' }, h('dt', { text: label }), h('dd', { text: value })))),
      ended.card && h('div', { class: 'cards-reward' }, h('p', { class: 'cards-reward-text', text: reward }), face(ended.card)),
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

  // --- The residents' tables (904 B) ---------------------------------------

  // A match at another table: one match at a time, played where it started
  // (Szczęsny's in the Salon, a resident's at its place). Where it waits,
  // and the way there.
  function elsewhere() {
    const match = view.match;
    if (!match || own(match)) return null;
    const table = match.resident ? tableOf(match.resident) : null;
    const href = !match.resident ? '#/osada/casino/cards' : table?.place ? `#/osada/${table.place}/cards` : null;
    return h(
      'section',
      { class: 'card stack cards-elsewhere', role: 'status', 'data-guide': 'cards-elsewhere' },
      h('p', { text: table ? t('Trwa Twoja partia {with}. Dokończ ją, zanim zaczniesz następną.', { with: table.with }) : t('Trwa Twoja partia ze Szczęsnym. Dokończ ją, zanim zaczniesz następną.') }),
      href && h('a', { class: 'button button--world', href, text: t('Wróć do partii') }),
    );
  }

  // A resident's table under its bust (904 B, mock-up 910.2): "Karty z
  // Jagną", the day's staked matches, its deck's name, style and place
  // among Szczęsny's tiers, its first cards, the stake and what a win gives,
  // the card of the first staked win and the chance of one after it, and
  // "Zagraj o … zł" and "Trening". Before Szczęsny's starter deck, or
  // without a whole deck, the way to the Salon instead; with a match at
  // another table, where it waits.
  function residentSection() {
    const table = tableOf(resident);
    if (!table) return null;
    const gold = state.character.gold;
    const ready = view.starter && Boolean(view.deck);
    const busy = Boolean(view.match);
    const limit = view.staked.today >= view.staked.limit;
    const female = table.gender === 'f';
    const roman = (number) => ROMAN[number - 1] ?? String(number);
    const start = (staked) => (event) =>
      withButton(event.currentTarget, async () => {
        const answer = await call('POST', '/api/cards/match', { resident, staked });
        ended = null;
        playSound('swing');
        apply(answer);
        showTab();
        if (fx.on()) await fxPlay((run) => fx.enter(run, { previous: null, match: view.match }));
      });
    // Its place among Szczęsny's tiers: between two, or above them all.
    const place = table.top
      ? female
        ? t('Jest mocniejsza nawet od {top} stopnia Szczęsnego.', { top: roman(table.after) })
        : t('Jest mocniejszy nawet od {top} stopnia Szczęsnego.', { top: roman(table.after) })
      : female
        ? t('Jest mocniejsza niż {lower} stopień Szczęsnego i słabsza niż {upper}.', { lower: roman(table.after), upper: roman(table.after + 1) })
        : t('Jest mocniejszy niż {lower} stopień Szczęsnego i słabszy niż {upper}.', { lower: roman(table.after), upper: roman(table.after + 1) });
    const percent = formatNumber(Math.round(table.chance * 100));
    const fact = (label, value) => h('p', { class: 'cards-tier-facts' }, h('span', {}, label, ' ', h('strong', { text: value })));
    // The card of the first staked win and the chance after it, while any
    // card of the deck can still come (below its top level).
    const cardsToWin =
      table.left > 0
        ? [
            table.beaten
              ? h('p', { class: 'cards-tier-facts' }, h('span', { class: 'cards-tier-done' }, icon('check', { size: 14 }), t('Karta za pierwszą wygraną odebrana')))
              : fact(t('Pierwsza wygrana o stawkę:'), table.missing > 0 ? t('karta z talii {of}, której nie masz', { of: table.of }) : t('karta z talii {of}', { of: table.of })),
            fact(t('Każda następna wygrana o stawkę:'), female ? t('{percent}% szansy na kartę z jej talii', { percent }) : t('{percent}% szansy na kartę z jego talii', { percent })),
          ]
        : h('p', { class: 'muted', text: t('Wszystkie karty z tej talii masz już na najwyższym poziomie.') });
    return h(
      'section',
      { class: 'stack resident-cards', 'data-guide': 'resident-cards' },
      h('h3', { class: 'section-title', text: t('Karty {with}', { with: table.with }) }),
      view.starter &&
        h(
          'div',
          { class: 'cards-plaque' },
          icon('dice', { size: 18, className: 'cards-plaque-icon' }),
          h('span', { text: t('Partie o stawkę dziś: {used} z {limit}', { used: view.staked.today, limit: view.staked.limit }) }),
        ),
      elsewhere(),
      h(
        'article',
        { class: `card cards-tier${table.beaten ? ' cards-tier--beaten' : ''}`, 'data-guide': 'resident-table' },
        h(
          'div',
          { class: 'cards-tier-head' },
          h('span', { class: 'cards-tier-number' }, icon(table.icon, { size: 16 })),
          h('div', { class: 'cards-tier-title' }, h('h4', { class: 'cards-tier-name', text: table.deck }), h('p', { class: 'muted cards-tier-text', text: `${table.style} ${place}` })),
        ),
        h('div', { class: 'tcard-grid tcard-grid--deck' }, table.cards.map((card) => face(card, { compact: true }))),
        h('p', { class: 'muted', text: t('To {shown} z {size} kart {of}. Resztę zobaczysz przy stole.', { shown: table.cards.length, size: table.size, of: table.of }) }),
        h(
          'p',
          { class: 'cards-tier-facts' },
          h('span', {}, t('Stawka partii'), ' ', h('strong', { text: t('{gold} zł', { gold: formatNumber(table.stake) }) })),
          h('span', {}, t('Za wygraną zgarniesz'), ' ', h('strong', { text: t('{gold} zł', { gold: formatNumber(table.win) }) })),
        ),
        cardsToWin,
        !view.starter && h('p', { class: 'region-warning', text: t('Najpierw weź talię od Szczęsnego w Salonie Gier.') }),
        view.starter && !view.deck && h('p', { class: 'region-warning', text: t('Najpierw ułóż talię z {count} kart.', { count: view.deckSize }) }),
        ready && limit && h('p', { class: 'muted', text: t('Na dziś to już wszystkie partie o stawkę. Trening jest bez limitu.') }),
        ready
          ? h(
              'div',
              { class: 'cards-tier-actions' },
              h('button', {
                type: 'button',
                class: 'button button--world',
                text: gold < table.stake ? t('Brakuje złota') : t('Zagraj o {gold} zł', { gold: formatNumber(table.stake) }),
                disabled: busy || limit || gold < table.stake,
                onClick: start(true),
              }),
              h('button', { type: 'button', class: 'button button--system', text: t('Trening'), disabled: busy, onClick: start(false) }),
            )
          : h('a', { class: 'button button--world', href: '#/osada/casino/cards', text: t('Talia Systemu w Salonie Gier') }),
      ),
    );
  }

  // --- The deck builder ----------------------------------------------------

  function builder() {
    const order = { strength: 0, dexterity: 1, intellect: 2 };
    const rarityOrder = (id) => state.content.rarities.findIndex((rarity) => rarity.id === id);
    const cards = [...view.collection]
      .filter((card) => shown === 'all' || card.type === shown)
      .sort((a, b) => (order[a.type] ?? 9) - (order[b.type] ?? 9) || rarityOrder(b.rarity) - rarityOrder(a.rarity) || b.level - a.level || a.name.localeCompare(b.name));
    const count = chosen.size;
    const ready = count === view.deckSize;
    const save = (event) =>
      withButton(event.currentTarget, async () => {
        const answer = await call('POST', '/api/cards/deck', { cards: [...chosen] });
        building = false;
        apply(answer);
        toast(t('Talia zapisana.'));
      });
    const filter = (id, label) =>
      h(
        'button',
        {
          type: 'button',
          class: 'chat-tab',
          role: 'tab',
          'aria-selected': String(shown === id),
          onClick: () => {
            shown = id;
            render();
          },
        },
        id !== 'all' && typeIcon(id, 14),
        h('span', { class: 'chat-tab-name', text: label }),
      );
    const bar = () =>
      h(
        'div',
        { class: 'cards-builder-bar' },
        h('p', { class: `cards-count${ready ? ' cards-count--ready' : ''}`, text: t('Wybrane: {count} z {size}', { count, size: view.deckSize }) }),
        h('div', { class: 'cards-builder-actions' }, h('button', { type: 'button', class: 'button button--world', text: t('Zapisz talię'), disabled: !ready, onClick: save }), h('button', {
          type: 'button',
          class: 'button button--system',
          text: t('Wróć'),
          onClick: () => {
            building = false;
            render();
          },
        })),
      );
    return h(
      'section',
      { class: 'card stack cards-builder', 'data-guide': 'cards-builder' },
      h('h3', { class: 'section-title', text: t('Ułóż talię') }),
      h('p', { class: 'muted', text: t('Wybierz {size} kart z kolekcji. Najlepiej po kilka każdego typu: Siła bije Zręczność, Zręczność Magię, a Magia Siłę.', { size: view.deckSize }) }),
      bar(),
      h('div', { class: 'chat-tabs market-tabs cards-filter', role: 'tablist', 'aria-label': t('Typ karty') }, filter('all', t('Wszystkie')), view.types.map((type) => filter(type.id, type.name))),
      h(
        'div',
        { class: 'tcard-grid tcard-grid--collection' },
        cards.map((card) =>
          face(card, {
            marks: { chosen: chosen.has(card.id), dim: !chosen.has(card.id) && ready },
            label: t('{name}, poziom {level}: {state}', { name: card.name, level: card.level, state: chosen.has(card.id) ? t('w talii') : t('poza talią') }),
            onClick: () => {
              if (chosen.has(card.id)) chosen.delete(card.id);
              else if (chosen.size < view.deckSize) chosen.add(card.id);
              else toast(t('Talia ma już {size} kart. Najpierw zdejmij którąś.', { size: view.deckSize }));
              render();
            },
          }),
        ),
      ),
      bar(),
    );
  }

  // --- The match -----------------------------------------------------------

  // The turn being laid, at first the lines as they stand.
  function planOf(match) {
    if (!plan || plan.round !== match.round) plan = { round: match.round, lines: match.me.lines.map((card) => card?.key ?? null), skill: null };
    return plan;
  }

  // My cards by key: those on my lines and in my reserve.
  const myCards = (match) => new Map([...match.me.lines.filter(Boolean), ...match.me.hand].map((card) => [card.key, card]));
  const standingKeys = (match) => match.me.lines.map((card) => card?.key ?? null);
  // The reserve's cards not laid this turn (the Cień's skill takes one).
  const reserveLeft = (match) => match.me.hand.filter((card) => !plan.lines.includes(card.key));

  // The blows of the round as the turn stands, as the server counts them
  // (roundHits in src/engine/cards.js): each card on the table hits the card
  // opposite, or the other side's first card from the front, half again
  // harder against a type it beats and by the hero's skill's power for the
  // card it boosts. Returns, for each side's line, the blow it takes.
  function blows(match) {
    const mine = myCards(match);
    const skill = plan.skill;
    const power = view.match.me.hero?.skill?.power ?? 0;
    const lines = {
      me: plan.lines.map((key) => {
        if (key === null) return null;
        const card = mine.get(key);
        return skill?.kind === 'shift' && skill.card === key ? { ...card, type: skill.type } : card;
      }),
      foe: match.foe.lines,
    };
    const boost = (card) => {
      if (!skill) return 0;
      if (skill.kind === 'fury' && skill.card === card.key) return power;
      if ((skill.kind === 'aim' || skill.kind === 'shift') && skill.card === card.key) return power;
      if (skill.kind === 'swap' && skill.swap === card.key) return power;
      return 0;
    };
    const taken = { me: [0, 0, 0], foe: [0, 0, 0] };
    const strong = { me: [false, false, false], foe: [false, false, false] };
    for (const side of ['me', 'foe']) {
      const other = side === 'me' ? 'foe' : 'me';
      lines[side].forEach((card, line) => {
        if (!card) return;
        const aimed = side === 'me' && skill?.kind === 'aim' && skill.card === card.key && lines.foe[skill.target] ? skill.target : null;
        const at = aimed ?? (lines[other][line] ? line : lines[other].findIndex(Boolean));
        if (at === null || at < 0) return;
        const target = lines[other][at];
        const advantage = beats(card.type, target.type);
        const extra = side === 'me' ? boost(card) : 0;
        taken[other][at] += Math.max(1, Math.round(card.attack * (1 + (advantage ? view.typeBonus : 0)) * (1 + extra)));
        if (advantage) strong[other][at] = true;
      });
    }
    return { taken, strong, lines };
  }

  // The hero's skill: its steps, as its kind asks.
  const skillKind = () => view.match.me.hero?.skill?.kind ?? null;
  function aimHint() {
    if (!aiming) return null;
    const kind = skillKind();
    if (aiming.step === 'target') {
      const of = whoOf(view.match).of;
      return of ? t('Wskaż kartę {of}, w którą uderzy Twoja karta.', { of }) : t('Wskaż kartę Szczęsnego, w którą uderzy Twoja karta.');
    }
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
    const standing = standingKeys(view.match)[line];
    if (key === null) {
      if (picked === null) {
        toast(t('Najpierw wybierz kartę z rezerwy.'));
        return;
      }
      plan.lines[line] = picked;
      picked = null;
    } else if (key !== standing && plan.skill?.swap !== key) {
      // Laid this turn: back to the reserve (and a skill on it undone).
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
  function linesRow(side, match, blowsNow) {
    const names = view.lines;
    const placed = side === 'foe' ? (match.last?.placed ?? []) : [];
    const mine = myCards(match);
    return h(
      'div',
      { class: `cards-lines cards-lines--${side}` },
      names.map((name, line) => {
        const card = side === 'foe' ? match.foe.lines[line] : plan.lines[line] === null ? null : mine.get(plan.lines[line]);
        const shownCard = side === 'me' && card && plan.skill?.kind === 'shift' && plan.skill.card === card.key ? { ...card, type: plan.skill.type, shifted: true } : card;
        const blow = blowsNow.taken[side][line];
        const fresh = side === 'foe' ? placed.includes(line) : card && card.key !== standingKeys(match)[line];
        const skillMark = side === 'me' && card && (plan.skill?.card === card.key || plan.skill?.swap === card.key) ? match.me.hero?.skill?.name : null;
        const target = side === 'foe' ? aiming?.step === 'target' && card : aiming?.step === 'card' && card;
        const aimedAt = side === 'foe' && plan.skill?.kind === 'aim' && plan.skill.target === line;
        const content = shownCard
          ? withKey(
              face(shownCard, {
                marks: { blow, advantage: blowsNow.strong[side][line], fresh, skill: skillMark ?? (aimedAt ? t('cel') : null), target },
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

  // The last round's account: each blow, and the cards beaten.
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
    return h(
      'details',
      { class: 'how-more cards-account' },
      h('summary', { class: 'how-toggle', text: t('Runda {round}: zbite {count}', { round: last.round, count: beaten.length }) }),
      h('ul', { class: 'cards-hits' }, lines),
      beaten.length > 0 && h('p', { class: 'muted', text: t('Zbite: {names}.', { names: beaten.join(', ') }) }),
    );
  }

  function matchCard() {
    const match = view.match;
    planOf(match);
    const blowsNow = blows(match);
    const hero = match.me.hero;
    const skill = hero?.skill;
    // Szczęsny with his tier on the Salon's picture, or a resident with its
    // deck at its own place (904 B).
    const who = whoOf(match);
    const art = match.resident ? null : placeArt('casino-hall');
    const reserve = reserveLeft(match);
    const ready = turnReady(match);
    const table = h(
      'section',
      { class: `cards-table place-card${art ? ' place-card--art' : ''}`, 'data-guide': 'cards-table', 'aria-label': t('Stół') },
      h(
        'div',
        { class: 'cards-table-head' },
        h('span', { class: 'cards-table-bust' }, residentBust(who.id)),
        h(
          'div',
          { class: 'cards-table-who' },
          h('p', { class: 'cards-table-name', text: who.name }),
          who.line && h('p', { class: 'cards-table-tier', text: who.line }),
          h('p', { class: 'muted cards-table-count' }, backs(match.foe.hand), h('span', { text: t('Rezerwa {hand} · talia {deck} · zbite {out}', { hand: match.foe.hand, deck: match.foe.deck, out: match.foe.out }) })),
        ),
        h('span', { class: 'cards-round', text: t('Runda {round}/{cap}', { round: match.round, cap: match.cap }) }),
      ),
      linesRow('foe', match, blowsNow),
      h('div', { class: 'cards-divider', 'aria-hidden': 'true' }, h('span', { text: match.mode === 'staked' ? t('Stawka: {gold} zł', { gold: formatNumber(match.stake) }) : t('Trening') })),
      linesRow('me', match, blowsNow),
      h('p', { class: 'muted cards-table-count cards-table-count--me' }, match.me.deck > 0 && backs(1), h('span', { text: t('Twoja talia {deck} · zbite {out}', { deck: match.me.deck, out: match.me.out }) })),
    );
    if (art) table.style.setProperty('--place-art', `url("${art}")`);
    const hint = aimHint() ?? (picked !== null ? t('Wskaż pustą linię dla tej karty.') : !ready ? t('Dołóż karty z rezerwy na puste linie.') : null);
    return h(
      'div',
      { class: 'stack cards-match', 'data-guide': 'cards-match' },
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
                  typeIcon(type.id, 16),
                  type.name,
                ),
              ),
          ),
      ),
      hero &&
        h(
          'section',
          { class: 'card cards-skill', 'data-guide': 'cards-skill' },
          heroCard({ ...view.hero, skill }, { compact: true }),
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
          'data-guide': 'cards-fight',
          text: t('Walcz'),
          disabled: !ready || Boolean(aiming),
          onClick: (event) =>
            withButton(event.currentTarget, async () => {
              const goldBefore = state.character.gold;
              const answer = await call('POST', '/api/cards/turn', { round: plan.round, lines: plan.lines, skill: plan.skill ? { card: plan.skill.card, target: plan.skill.target, type: plan.skill.type, swap: plan.skill.swap } : null });
              playSound('swing');
              if (fx.on() && !gone) {
                await foughtWithFx(answer, goldBefore);
                return;
              }
              if (answer.end) {
                ended = { ...answer.end, words: wordsFor(answer.end) };
                playSound(answer.end.result === 'won' ? 'chest' : 'tick');
              }
              plan = null;
              apply(answer);
              // The end over the tab, Szczęsny's card back above it.
              if (answer.end) showTab();
            }),
        }),
        h('button', {
          type: 'button',
          class: 'button button--system button--small',
          text: t('Poddaj partię'),
          onClick: async (event) => {
            const button = event.currentTarget;
            const sure = await confirmAction({
              title: t('Poddać partię?'),
              text:
                match.mode !== 'staked'
                  ? t('Trening skończy się przegraną.')
                  : who.of
                    ? t('Partia przepada, a stawka zostaje u {of}.', { of: who.of })
                    : t('Partia przepada, a stawka zostaje u Szczęsnego.'),
              confirmLabel: t('Poddaj'),
              danger: true,
            });
            if (!sure) return;
            await withButton(button, async () => {
              const answer = await call('POST', '/api/cards/surrender');
              ended = { ...answer.end, words: wordsFor(answer.end) };
              apply(answer);
              showTab();
            });
          },
        }),
      ),
      roundAccount(match),
    );
  }

  // --- The tab -------------------------------------------------------------

  function render() {
    // The live match draws the tab itself (card-duel.js).
    if (duel.on()) return;
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
    if (building) body = [builder()];
    else if (own(view.match)) body = [endCard(), matchCard()];
    else if (resident) body = [endCard(), residentSection()];
    else
      body = [
        endCard(),
        elsewhere(),
        tableHead(),
        deckCard(),
        view.starter && heroCard(view.hero),
        view.starter && packCard(),
        tiersCard(),
        h('section', { class: 'card' }, howItWorks(null, view.texts.rules)),
      ];
    fx.cancelFlights();
    holder.replaceChildren(h('div', { class: `stack cards-tab${fx.on() ? ' cfx-on' : ''}` }, body));
    // The table takes the whole tab while a match is on: the Salon's
    // resident card folds away, and at a resident's table its card and its
    // services (screens/settlement.js).
    if (playing() !== wasPlaying) {
      wasPlaying = playing();
      onLayout();
    }
    // A new day: the counters and rewards are asked again.
    if (view.endsAt) timer = setTimeout(load, Math.max(5000, view.endsAt - serverNow() + 60000));
  }

  render();
  load();
  return {
    refresh: () => {
      if (!gone) render();
    },
    playing,
    unmount() {
      gone = true;
      clearTimeout(timer);
      fx.stop();
      duel.unmount();
    },
  };
}

// The cards an exploration, a room of the Labirynt or a profession's work
// left, in its report (hunts.js, labyrinth.js, the professions' claims):
// each card's face small, new or with its level now, and the way to the
// Salon's tab.
export function droppedCardsSection(cards) {
  if (!cards?.length) return null;
  const section = h(
    'section',
    { class: 'report-section', 'aria-labelledby': 'cards-title', 'data-guide': 'report-cards' },
    h('h2', { class: 'section-title section-title--art', id: 'cards-title' }, icon('dice', { size: 20 }), t('Karty ({count})', { count: cards.length })),
    h(
      'ul',
      { class: 'cards-dropped' },
      cards.map((card) =>
        h(
          'li',
          { class: 'cards-dropped-row' },
          cardFace(card, { compact: true, label: card.name }),
          h(
            'span',
            { class: 'craft-text' },
            h('span', { class: 'item-name', vars: { '--rarity': card.color }, text: card.name }),
            h('span', { class: 'item-meta', text: card.fresh ? t('Nowa karta · {rarity}', { rarity: card.rarityName }) : t('Karta na poziomie {level} · {rarity}', { level: card.level, rarity: card.rarityName }) }),
          ),
        ),
      ),
    ),
    h('a', { class: 'button button--world', href: '#/osada/casino/cards', text: t('Talia Systemu w Salonie Gier') }),
  );
  // With the animations on, the cards turn face up once in sight.
  fxDroppedCards(section);
  return section;
}
