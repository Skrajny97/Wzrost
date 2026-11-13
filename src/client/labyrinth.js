// The Labirynt Systemu (src/server/labyrinth.js; DECISIONS.md, "Labirynt
// Systemu i Rdzeń", 850–866), from character level 30, where the game has it
// on. Two faces of one Labirynt:
//
// - its entrance, the first tab of the Sala prób in the Osada (the author:
//   "można by podzielic Salę Prób w Osadzie - na zakładkę Labiryntu i samych
//   Prób", screens/settlement.js): the day's level over its picture, the
//   levels of the day, the way in, the fighters' HP and the day's rewards,
//   all on one screen;
// - its board, a screen of its own over the whole page (#/labirynt; the
//   author, 13.11.2026: "tu miała się otwierać osobna plansza ... a nie takie
//   gówienko", "dużo scrollowania, nieintuicyjne"): the level's rooms as
//   stone platforms on the floor of an underground hall, from the entrance
//   at the bottom to the guardian at the top, with what waits on each (the
//   creatures of a fight, an elite, the guardian; a chest, a spring, an
//   altar, the merchant), the roads between them, the party's figure where
//   it stands and the rooms it may enter lit. A tap on a lit room tells what
//   waits there and enters it; the figure walks there and the result comes:
//   a fight's with its playback in the report, a spring's healing, the
//   choice of a blessing (after an elite, a guardian, at an altar) and the
//   merchant's wares in a sheet before the player's eyes. The fighters, the
//   blessings, the rewards and the rules are a tap away at the bottom of a
//   phone's screen, and beside the board on a computer's.
//
// The words are shown in the page's language (t(), i18n.js). The narrator's
// Labirynt chapter (878, narrator.js) points at the entrance's way in, its
// fighters, the day's levels and its rewards by their `data-guide` marks.
//
// The Osada's place screen mounts the entrance once and keeps it while it
// redraws itself, as the Salon Gier's (casino.js), so a redraw never asks the
// server again.

import { companionPortrait, companionWalkerSheet, goldArt, labyrinthArt, monsterSprite, portraitSprite, roomPlaceholder, walkerSheet } from './art.js';
import { fill, h, icon } from './dom.js';
import { formatCompact, formatNumber, formatShort } from './format.js';
import { t } from './i18n.js';
import { motionOn } from './motion.js';
import { call, isUnlocked, reportCache, serverNow, state, unlockInfo } from './state.js';
import { closeSheet, howItWorks, meter, openSheet, systemLink, systemPanel, withButton } from './ui.js';

// The size of a room's picture in the sheets.
const ROOM_ART = 32;
// The entrance's address in the Sala prób, where the board's "Wyjdź" leads.
export const LABYRINTH_ENTRANCE = '#/osada/trial-hall/labyrinth';
export const LABYRINTH_BOARD = '#/labirynt';
// How long the party's figure walks from one platform to the next, in ms.
const WALK_MS = 650;

// The danger of a fight room against the party as it is now (899 A, the
// server's roomDanger): the ring's colour, its name and words.
const DANGER = {
  get easy() {
    return { name: t('łatwa walka'), text: t('Łatwa walka: Twoja drużyna powinna poradzić sobie bez problemu.') };
  },
  get even() {
    return { name: t('wyrównana walka'), text: t('Wyrównana walka: Twoja drużyna raczej wygra, ale może stracić sporo HP.') };
  },
  get deadly() {
    return { name: t('groźna walka'), text: t('Groźna walka: Twoja drużyna może przegrać, a porażka kończy dzisiejszy Labirynt.') };
  },
};

// The entrance in the Sala prób.
export function mountLabyrinth(container, { navigate }) {
  return mountView(container, { navigate, board: false });
}

// The board, a screen of its own (app.js, #/labirynt).
export function mountLabyrinthBoard(container, { navigate }) {
  return mountView(container, { navigate, board: true });
}

function mountView(container, { navigate, board }) {
  let view = null;
  let gone = false;
  // The platform the party's figure stood on before the last room was
  // entered, as [x %, y %] of the board, for its walk to the new one.
  let walkFrom = null;
  let clock = null;

  function show(message) {
    if (gone) return;
    if (message) {
      fill(container, board ? boardMessage(message) : systemPanel(message));
      return;
    }
    if (board) {
      fill(container, boardView());
      return;
    }
    fill(container, hero(), entryCard(), aboutCard());
  }

  const levelOf = () => view.levels[view.level - 1];
  const roomRule = (type) => view.rooms.find((room) => room.id === type);
  const fightRoom = (type) => type === 'fight' || type === 'elite' || type === 'guardian';

  // The day's level over its picture (art/places/labyrinth.png, Piekielny's
  // its own), the picture itself the way onto the board, and the levels of
  // the day, the cleared ones ticked.
  function hero() {
    const hell = levelOf().hell;
    const started = view.started && !view.over;
    const label = view.over
      ? t('Zobacz planszę')
      : view.pending
        ? t('Wróć do Labiryntu: czeka wybór')
        : started
          ? t('Wróć do Labiryntu')
          : t('Wejdź do Labiryntu');
    const head = h(
      'a',
      { class: `tower-head tower-head--art labyrinth-head labyrinth-door${view.over ? ' labyrinth-door--over' : ''}`, href: LABYRINTH_BOARD, 'data-guide': 'labyrinth-map' },
      h('div', { class: 'labyrinth-head-text' }, h('h2', { class: 'card-title', text: t('Labirynt Systemu') }), h('p', { class: 'labyrinth-level', text: levelOf().name })),
      h('span', { class: 'labyrinth-door-label' }, icon(view.over ? 'eye' : 'swords', { size: 18 }), h('span', { text: label })),
    );
    head.style.setProperty('--place-art', `url("/art/places/${hell ? 'labyrinth-hell' : 'labyrinth'}.png")`);
    return h(
      'section',
      { class: `card tower-card labyrinth-hero${hell ? ' labyrinth-hero--hell' : ''}`, 'aria-label': t('Labirynt Systemu') },
      head,
      overLine(),
      levelSteps(),
      h('p', { class: 'muted small', text: t('Stwory na poziomie {level}. Nowy Labirynt o północy.', { level: view.charLevel }) }),
    );
  }

  function levelSteps() {
    return h(
      'ol',
      { class: 'labyrinth-steps', 'aria-label': t('Poziomy Labiryntu'), 'data-guide': board ? null : 'labyrinth-steps' },
      view.levels.map((level) =>
        h(
          'li',
          {
            class: ['labyrinth-step', level.cleared && 'labyrinth-step--cleared', level.number === view.level && !view.over && 'labyrinth-step--here', level.hell && 'labyrinth-step--hell', !level.open && 'labyrinth-step--shut']
              .filter(Boolean)
              .join(' '),
          },
          level.cleared && icon('check', { size: 14 }),
          h('span', { text: level.hell ? level.name : String(level.number) }),
        ),
      ),
    );
  }

  // The fighters and the day's rewards, on the entrance.
  function entryCard() {
    return h(
      'section',
      { class: 'card labyrinth-entry', 'aria-label': t('Drużyna i nagrody dnia') },
      h('div', { class: 'labyrinth-entry-party', 'data-guide': 'labyrinth-party' }, h('h3', { class: 'labyrinth-subtitle', text: t('Drużyna') }), fighterRow()),
      h('div', { class: 'labyrinth-entry-gains', 'data-guide': 'labyrinth-gains' }, h('h3', { class: 'labyrinth-subtitle', text: t('Nagrody dnia') }), gainsRow(true)),
      coreLine(),
    );
  }

  function overLine() {
    if (!view.over) return null;
    return h('p', { class: 'labyrinth-over', text: view.over === 'done' ? t('Labirynt na dziś zdobyty do końca. Nowy o północy.') : t('Walka przegrana. Labirynt na dziś się skończył, a zdobyte nagrody zostają. Nowy o północy.') });
  }

  // The fighters' small portraits with their HP, in a row.
  function fighterRow() {
    return h(
      'div',
      { class: 'labyrinth-fighters' },
      view.fighters.map((fighter) => {
        const share = fighter.maxHp > 0 ? Math.max(0, Math.min(1, fighter.hp / fighter.maxHp)) : 0;
        const bar = h('span', { class: 'labyrinth-fighter-bar' }, h('span', { class: 'labyrinth-fighter-fill' }));
        bar.firstChild.style.width = `${Math.round(share * 100)}%`;
        return h(
          'span',
          { class: `labyrinth-fighter${fighter.hp <= 0 ? ' labyrinth-fighter--down' : ''}`, title: `${fighter.name}: ${formatNumber(fighter.hp)} / ${formatNumber(fighter.maxHp)} HP` },
          h('span', { class: 'labyrinth-fighter-face' }, fighterFace(fighter)),
          bar,
          h('span', { class: 'labyrinth-fighter-hp', text: `${Math.round(share * 100)}%` }),
        );
      }),
    );
  }

  function fighterFace(fighter) {
    if (fighter.companion) return companionPortrait(fighter.classId, fighter.appearance) ?? icon('person', { size: 20 });
    const character = state.character;
    return portraitSprite(fighter.classId, fighter.appearance, { bust: true, skin: character.skin, evolution: character.evolution?.current?.id, outfit: character.cosmetics?.outfit }) ?? icon('person', { size: 20 });
  }

  // The day's rewards so far, in one row; `compact`, the big numbers short
  // ("48,2 tys."), the whole ones in their boxes' titles.
  function gainsRow(compact = false) {
    const { xp, gold, shards, artifacts } = view.gains;
    const number = compact ? formatCompact : formatNumber;
    // In the entrance's compact row the names stay for screen readers only.
    const cell = (art, label, value, whole = value) =>
      h('span', { class: 'labyrinth-gain', title: `${label}: ${whole}` }, art, h('span', { class: 'labyrinth-gain-value', text: value }), h('span', { class: `labyrinth-gain-label${compact ? ' visually-hidden' : ''}`, text: label }));
    return h(
      'div',
      { class: 'labyrinth-gains-row' },
      cell(icon('star', { size: 18 }), t('XP postaci'), `+${number(xp)}`, `+${formatNumber(xp)}`),
      cell(goldArt(18), t('Złoto'), `+${number(gold)}`, `+${formatNumber(gold)}`),
      cell(labyrinthArt('shards', 18, icon('core', { size: 18 })), t('Odłamki Rdzenia'), `+${formatNumber(shards)}`),
      cell(labyrinthArt('artifact-fire', 18, icon('core', { size: 18 })), t('Artefakty'), formatNumber(artifacts)),
    );
  }

  const coreLine = () => (isUnlocked('core') ? systemLink('#/postac/rdzen', t('Do Rdzenia')) : h('p', { class: 'muted small', text: t('Rdzeń otworzy się, gdy postać pokona pierwszego strażnika Labiryntu.') }));

  function aboutCard() {
    return h('section', { class: 'card towers-intro' }, about());
  }

  const about = () =>
    howItWorks(
      t('Codziennie nowy Labirynt: trzy poziomy, a po trzecim tego samego dnia Piekielny. Mapa jest ta sama dla wszystkich.'),
      t(
        'Wchodzi postać i do dwóch towarzyszy z Kwater, jak na wyprawę, o każdej porze, także w czasie wyprawy i pracy w profesji. Poziom to sześć rzędów komnat i strażnik na końcu; z komnaty prowadzą drogi do dwóch albo trzech komnat następnego rzędu. HP przechodzi z walki do walki, bez mikstur. Walka nie wygrana kończy Labirynt na dziś, a zdobyte nagrody zostają. Za zwykłą walkę zgarniesz PD i złoto, za elitę i skarb Odłamki Rdzenia i złoto, a za strażnika Artefakt do Rdzenia. Po elicie, strażniku i na ołtarzu wybierasz jedno z trzech błogosławieństw, które działa do końca dnia. Postęp przepada o północy.',
      ),
    );

  // ---- The board ----------------------------------------------------------

  // A refusal on the board's own background, with the way out.
  function boardMessage(message) {
    return h('div', { class: 'lab-board' }, boardBar(false), h('div', { class: 'lab-board-message' }, systemPanel(message)));
  }

  function boardView() {
    const hell = levelOf().hell;
    clearInterval(clock);
    const root = h(
      'div',
      { class: `lab-board${hell ? ' lab-board--hell' : ''}`, role: 'region', 'aria-label': t('Plansza Labiryntu') },
      boardBar(true),
      h('div', { class: 'lab-body' }, sideParty(), stage(), sideDay()),
      dock(),
    );
    return root;
  }

  // The bar over the board: the way out, the level, the time to the new
  // Labirynt and the gold for the merchant.
  function boardBar(withLevel) {
    const left = h('span', { class: 'lab-bar-clock' });
    const tick = () => {
      left.textContent = t('Nowy za {time}', { time: untilMidnight(serverNow()) });
    };
    if (withLevel) {
      tick();
      clock = setInterval(() => (gone ? clearInterval(clock) : tick()), 30000);
    }
    return h(
      'header',
      { class: 'lab-bar' },
      h('button', { type: 'button', class: 'lab-bar-back', onClick: () => navigate(LABYRINTH_ENTRANCE) }, icon('back', { size: 18 }), h('span', { text: t('Wyjdź') })),
      h(
        'div',
        { class: 'lab-bar-title' },
        h('span', { class: 'lab-bar-name', text: t('Labirynt Systemu') }),
        withLevel && h('span', { class: 'lab-bar-level' }, h('span', { text: levelOf().name }), h('span', { class: 'lab-bar-dot', 'aria-hidden': 'true', text: '·' }), left),
      ),
      h('span', { class: 'lab-bar-gold', title: t('Twoje złoto') }, goldArt(16), h('span', { text: formatShort(state.character.gold) })),
    );
  }

  // The board itself: the floor of the level's hall, the roads, the rooms on
  // their platforms and the party's figure, scrolled so that the party and
  // the rooms ahead are in sight.
  function stage() {
    const rows = view.map;
    const lanes = rows.length + 1;
    const lane = (row) => rows.length - 1 - row; // the guardian's row at the top, the entrance below the first
    const y = (row) => laneY(lane(row), lanes);
    const x = (index, count) => 50 + (index - (count - 1) / 2) * (count > 2 ? 28 : 32);
    const floor = h('div', { class: 'lab-floor' });
    floor.style.setProperty('--lanes', String(lanes));
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'lab-roads');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    const taken = (row, index) => view.path[row] === index && row <= view.row;
    const road = (x1, y1, x2, y2, kind) => {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(x1));
      line.setAttribute('y1', String(y1));
      line.setAttribute('x2', String(x2));
      line.setAttribute('y2', String(y2));
      line.setAttribute('class', `lab-road${kind ? ` lab-road--${kind}` : ''}`);
      line.setAttribute('vector-effect', 'non-scaling-stroke');
      svg.append(line);
    };
    // From the entrance to every room of the first row.
    const entrance = [50, laneY(lanes - 1, lanes)];
    rows[0].forEach((_, index) => {
      const walked = view.row >= 0 && view.path[0] === index;
      const open = view.row < 0 && view.reachable.includes(index);
      road(entrance[0], entrance[1], x(index, rows[0].length), y(0), walked ? 'walked' : open ? 'open' : view.row >= 0 ? 'past' : null);
    });
    rows.forEach((rooms, row) => {
      if (row + 1 >= rows.length) return;
      rooms.forEach((room, index) => {
        for (const next of room.links) {
          const walked = taken(row, index) && taken(row + 1, next);
          const open = row === view.row && index === view.room && view.reachable.includes(next);
          const past = row < view.row && !walked;
          road(x(index, rooms.length), y(row), x(next, rows[row + 1].length), y(row + 1), walked ? 'walked' : open ? 'open' : past ? 'past' : null);
        }
      });
    });
    // From the guardian's row down: a lower platform, nearer the eye, stands
    // over the one behind it.
    const tiles = rows.flatMap((rooms, row) => rooms.map((room, index) => tile(room, row, index, [x(index, rooms.length), y(row)]))).reverse();
    const here = view.row < 0 ? entrance : [x(view.room, rows[view.row].length), y(view.row)];
    const door = h('span', { class: 'lab-entrance', 'aria-hidden': 'true' });
    door.style.left = `${entrance[0]}%`;
    door.style.top = `${entrance[1]}%`;
    const party = partyFigure(here);
    floor.append(svg, door, ...tiles, party);
    const box = h('div', { class: 'lab-stage' }, floor);
    // Once on the page: the party's lane and the one ahead in sight.
    requestAnimationFrame(() => {
      const ahead = Math.max(0, here[1] / 100 - 1 / lanes);
      box.scrollTop = Math.max(0, floor.offsetHeight * ahead - box.clientHeight * 0.45);
      walkIn(party, here);
    });
    return h('div', { class: 'lab-stage-wrap' }, box, prompt());
  }

  // A room on its platform: what waits there (the creatures of a fight, an
  // elite and the guardian, the piece of a chest, a spring, an altar, the
  // merchant), lit when the party may enter it, faded once behind it.
  function tile(room, row, index, [left, top]) {
    const here = row === view.row && index === view.room;
    const open = !view.over && !view.pending && row === view.row + 1 && view.reachable.includes(index);
    const done = view.path[row] === index && row <= view.row;
    const past = row <= view.row && !done;
    const rule = roomRule(room.type);
    const guardian = room.type === 'guardian';
    const status = here ? t('tu stoi drużyna') : open ? t('można wejść') : done ? t('zdobyta') : past ? t('ominięta') : null;
    // The danger of a fight still ahead (899 A) and the Odłamki of an elite or
    // a treasure not taken yet.
    const ring = !here && !done && !past && DANGER[room.danger] ? room.danger : null;
    const shards = !here && !done && !past && room.shards > 0;
    const button = h(
      'button',
      {
        type: 'button',
        class: ['lab-tile', `lab-tile--${room.type}`, here && 'lab-tile--here', open && 'lab-tile--open', done && 'lab-tile--done', past && 'lab-tile--past'].filter(Boolean).join(' '),
        'aria-label': [rule?.name ?? room.type, room.foes?.length > 0 && room.foes.map((foe) => foe.name).join(', '), ring && DANGER[room.danger].name, shards && t('Odłamki Rdzenia: {count}', { count: room.shards }), status].filter(Boolean).join(', '),
        onClick: () => (open ? roomSheet(row, index, room) : roomInfo(room)),
      },
      h('span', { class: 'lab-tile-base', 'aria-hidden': 'true' }),
      ring && h('span', { class: `lab-tile-ring lab-tile-ring--${ring}`, 'aria-hidden': 'true' }),
      !here && !done && h('span', { class: `lab-tile-piece${fightRoom(room.type) && room.foes?.length > 0 ? '' : ' lab-tile-piece--art'}`, 'aria-hidden': 'true' }, piece(room)),
      !here && !done && room.foes?.length > 1 && h('span', { class: 'lab-tile-count', 'aria-hidden': 'true', text: `×${room.foes.length}` }),
      room.type === 'elite' && !done && !here && h('span', { class: 'lab-tile-mark', 'aria-hidden': 'true' }, icon('star', { size: 12 })),
      shards && h('span', { class: 'lab-tile-shards', 'aria-hidden': 'true' }, labyrinthArt('shards', 14, icon('core', { size: 12 })), formatNumber(room.shards)),
      open && h('span', { class: 'lab-tile-name', text: rule?.name ?? room.type }),
      done && !here && h('span', { class: 'lab-tile-check', 'aria-hidden': 'true' }, icon('check', { size: 14 })),
    );
    button.style.left = `${left}%`;
    button.style.top = `${top}%`;
    if (guardian) button.style.setProperty('--tile-scale', '1.35');
    return button;
  }

  // What stands on a platform: the first creature of a room with a fight,
  // the room's own piece (art/labyrinth/piece-<type>.png) otherwise.
  function piece(room) {
    if (fightRoom(room.type) && room.foes?.length > 0) return monsterSprite(room.foes[0].monsterId) ?? roomPlaceholder(room.type);
    return labyrinthArt(`piece-${room.type}`, 64, roomPlaceholder(room.type));
  }

  // The party's figure: the character walking in its look and skin tone, or
  // its portrait in a ring for a look without a walk.
  function partyFigure([left, top]) {
    const character = state.character;
    const sheet = walkerSheet(character.classId, character.appearance, character.skin, character.evolution?.current?.id, character.cosmetics?.outfit);
    const figure = h('span', { class: `lab-party${sheet ? '' : ' lab-party--face'}`, 'aria-label': t('Drużyna'), role: 'img' });
    if (sheet) figure.style.backgroundImage = `url("/${sheet}")`;
    else figure.append(fighterFace(view.fighters[0] ?? { classId: character.classId, appearance: character.appearance }));
    const mates = view.fighters.filter((fighter) => fighter.companion);
    mates.slice(0, 2).forEach((mate, number) => {
      const own = companionWalkerSheet(mate.classId, mate.appearance);
      if (!own) return;
      const follower = h('span', { class: `lab-party-mate lab-party-mate--${number + 1}`, 'aria-hidden': 'true' });
      follower.style.backgroundImage = `url("/${own}")`;
      figure.append(follower);
    });
    figure.style.left = `${left}%`;
    figure.style.top = `${top}%`;
    return figure;
  }

  // The party's walk from the platform it left to the one it entered.
  function walkIn(figure, [left, top]) {
    const from = walkFrom;
    walkFrom = null;
    if (!from || !motionOn() || !figure.isConnected) return;
    const floor = figure.parentElement;
    const dx = ((from[0] - left) / 100) * floor.offsetWidth;
    const dy = ((from[1] - top) / 100) * floor.offsetHeight;
    figure.classList.add('lab-party--walking');
    if (dx > 0) figure.classList.add('lab-party--left');
    figure.animate([{ translate: `${dx}px ${dy}px` }, { translate: '0 0' }], { duration: WALK_MS, easing: 'ease-in-out' }).finished.then(
      () => figure.classList.remove('lab-party--walking', 'lab-party--left'),
      () => {},
    );
  }

  // Over the board: what to do now.
  function prompt() {
    if (view.over) {
      return h(
        'div',
        { class: 'lab-prompt lab-prompt--over' },
        h('p', { text: view.over === 'done' ? t('Labirynt na dziś zdobyty do końca. Nowy o północy.') : t('Walka przegrana. Labirynt na dziś się skończył, a zdobyte nagrody zostają.') }),
        h('button', { type: 'button', class: 'button button--system button--small', text: t('Wyjdź'), onClick: () => navigate(LABYRINTH_ENTRANCE) }),
      );
    }
    if (view.pending) {
      return h(
        'div',
        { class: 'lab-prompt' },
        h('button', { type: 'button', class: 'button button--system lab-prompt-choice', text: view.pending.kind === 'merchant' ? t('Kupiec czeka') : t('Wybierz błogosławieństwo'), onClick: choiceSheet }),
      );
    }
    return h('p', { class: 'lab-hint', text: view.row < 0 ? t('Stuknij świecącą komnatę, żeby do niej wejść.') : t('Wybierz następną komnatę.') });
  }

  // The phone's bottom bar: the fighters with their HP, the blessings, the
  // day's rewards and the rules.
  function dock() {
    const count = view.blessings.reduce((sum, blessing) => sum + blessing.count, 0);
    const button = (iconName, label, onClick, badge) =>
      h('button', { type: 'button', class: 'lab-dock-button', 'aria-label': label, title: label, onClick }, icon(iconName, { size: 20 }), badge ? h('span', { class: 'lab-dock-badge', text: String(badge) }) : null, h('span', { class: 'lab-dock-label', text: label }));
    return h(
      'footer',
      { class: 'lab-dock' },
      h('button', { type: 'button', class: 'lab-dock-party', 'aria-label': t('Drużyna'), onClick: partySheet }, fighterRow()),
      h('div', { class: 'lab-dock-buttons' }, button('star', t('Błogosławieństwa'), blessingsSheet, count), button('coffer', t('Nagrody'), gainsSheet), button('book', t('Zasady'), rulesSheet)),
    );
  }

  // A computer's panels beside the board.
  function sideParty() {
    return h('aside', { class: 'lab-side lab-side--left' }, h('section', { class: 'card lab-side-card' }, partyParts()), h('section', { class: 'card lab-side-card' }, blessingParts()));
  }

  function sideDay() {
    return h(
      'aside',
      { class: 'lab-side lab-side--right' },
      h('section', { class: 'card lab-side-card' }, h('h2', { class: 'section-title', text: t('Poziomy dnia') }), levelSteps(), h('p', { class: 'muted small', text: t('Stwory na poziomie {level}. Nowy Labirynt o północy.', { level: view.charLevel }) })),
      h('section', { class: 'card lab-side-card' }, h('h2', { class: 'section-title', text: t('Nagrody dnia') }), gainsRow(), coreLine()),
      h('section', { class: 'card lab-side-card' }, legend(), about()),
    );
  }

  function partyParts() {
    const meters = view.fighters.map((fighter) => {
      const bar = meter({ label: fighter.companion ? fighter.name : t('{name} (postać)', { name: fighter.name }), value: fighter.hp, max: fighter.maxHp, kind: 'hp' });
      if (fighter.hp <= 0) bar.element.classList.add('meter--down');
      return bar.element;
    });
    return [h('h2', { class: 'section-title', text: t('Drużyna') }), meters, h('p', { class: 'muted small', text: t('Rany zostają między walkami. Leczą źródła, kupiec i niektóre błogosławieństwa.') })];
  }

  function blessingParts() {
    const list =
      view.blessings.length > 0
        ? h(
            'ul',
            { class: 'lab-blessing-list' },
            view.blessings.map((blessing) =>
              h('li', null, h('strong', { text: blessing.count > 1 ? `${blessing.name} ×${blessing.count}` : blessing.name }), h('span', { class: 'muted', text: blessing.text })),
            ),
          )
        : h('p', { class: 'muted small', text: t('Bez błogosławieństw. Zdobędziesz je po elicie, po strażniku i na ołtarzu.') });
    return [h('h2', { class: 'section-title', text: t('Błogosławieństwa') }), list];
  }

  // What the pieces on the board are.
  function legend() {
    const types = ['fight', 'elite', 'treasure', 'spring', 'altar', 'merchant', 'guardian'];
    return h(
      'ul',
      { class: 'lab-legend', 'aria-label': t('Komnaty') },
      h(
        'li',
        { class: 'lab-legend-danger' },
        h('span', { class: 'lab-danger-swatches', 'aria-hidden': 'true' }, Object.keys(DANGER).map((level) => h('span', { class: `lab-danger-swatch lab-danger-swatch--${level}` }))),
        h('span', null, h('strong', { text: t('Kolor obwódki') }), ' ', h('span', { class: 'muted', text: t('Pokazuje, jak trudna będzie walka dla Twojej drużyny: zielona – łatwa, żółta – wyrównana, czerwona – groźna.') })),
      ),
      types.map((type) => {
        const rule = roomRule(type);
        return h('li', null, roomArt(type), h('span', null, h('strong', { text: rule?.name ?? type }), ' ', h('span', { class: 'muted', text: rule?.text ?? '' })));
      }),
    );
  }

  const partySheet = () => openSheet(partyParts());
  const blessingsSheet = () => openSheet(blessingParts());
  const gainsSheet = () => openSheet(h('h2', { class: 'sheet-title', text: t('Nagrody dnia') }), gainsRow(), coreLine());
  const rulesSheet = () => openSheet(h('h2', { class: 'sheet-title', text: t('Zasady Labiryntu') }), legend(), about());

  // ---- The sheets ---------------------------------------------------------

  // The choice in a sheet over the page; none waiting, the sheet closes.
  function choiceSheet() {
    if (!view?.pending) {
      closeSheet();
      return;
    }
    openSheet(pendingParts());
  }

  // The choice's title, words and buttons: three blessings (after an elite,
  // a guardian, at an altar), or the merchant's wares. It opens before the
  // player's eyes the moment it comes (the author, 12.11.2026: "powinny
  // pojawiać sie graczowi przed twarzą w labiryncie a nie ze musi scrollowac
  // na gore").
  function pendingParts() {
    const pending = view.pending;
    const choices = pending.choices.length > 0 && blessingChoices(pending.choices);
    if (pending.kind === 'blessing') {
      const title = { elite: t('Elita pokonana'), guardian: t('Strażnik pokonany'), altar: t('Ołtarz') }[pending.from] ?? t('Błogosławieństwo');
      return [h('h2', { class: 'sheet-title sheet-title--art' }, roomArt(['elite', 'guardian', 'altar'].includes(pending.from) ? pending.from : 'altar'), title), blessingPrompt(), choices];
    }
    const gold = state.character.gold;
    const ware = (what, label, price, bought) =>
      h('button', {
        type: 'button',
        class: 'button button--world labyrinth-ware',
        disabled: bought || gold < price || Boolean(choices),
        text: bought ? t('{label}: kupione', { label }) : t('{label}: {price} złota', { label, price: formatNumber(price) }),
        onClick: (event) => withButton(event.currentTarget, () => act('/api/labyrinth/merchant', { buy: what })),
      });
    return [
      h('h2', { class: 'sheet-title sheet-title--art' }, roomArt('merchant'), t('Kupiec Systemu')),
      h('p', { class: 'sheet-text', text: t('Kupiec sprzedaje każdą rzecz raz. Twoje złoto: {gold}.', { gold: formatNumber(gold) }) }),
      ware('heal', t('Leczenie wszystkich o {share}% maks. HP', { share: Math.round(pending.healShare * 100) }), pending.prices.heal, pending.heal),
      ware('blessing', t('Wybór błogosławieństwa'), pending.prices.blessing, pending.blessing),
      choices,
      !choices &&
        h('button', {
          type: 'button',
          class: 'button button--system',
          text: t('Idź dalej'),
          onClick: (event) => withButton(event.currentTarget, () => act('/api/labyrinth/merchant', { leave: true })),
        }),
    ];
  }

  const blessingPrompt = () => h('p', { class: 'sheet-text', text: t('Wybierz jedno z trzech błogosławieństw. Działa do końca dzisiejszego Labiryntu.') });

  function blessingChoices(choices) {
    return h(
      'div',
      { class: 'labyrinth-blessings-choice' },
      choices.map((blessing) =>
        h(
          'button',
          {
            type: 'button',
            class: 'labyrinth-blessing-option',
            onClick: (event) => withButton(event.currentTarget, () => act('/api/labyrinth/blessing', { id: blessing.id })),
          },
          h('span', { class: 'labyrinth-blessing-name', text: blessing.name }),
          h('span', { class: 'labyrinth-blessing-text', text: blessing.text }),
        ),
      ),
    );
  }

  // A room's picture (art/labyrinth/room-<type>.png), or its placeholder.
  const roomArt = (type) => labyrinthArt(`room-${type}`, ROOM_ART, roomPlaceholder(type));

  const foesLine = (room) =>
    room.foes?.length > 0 && h('p', { class: 'sheet-text', text: t('Przeciwnicy: {foes}.', { foes: room.foes.map((foe) => t('{name} (poz. {level})', { name: foe.name, level: foe.level })).join(', ') }) });

  // How the room's creatures stand against the party now (899 A), and the
  // Odłamki an elite or a treasure gives.
  const dangerLine = (room) =>
    DANGER[room.danger] && h('p', { class: `sheet-text lab-danger lab-danger--${room.danger}` }, h('span', { class: 'lab-danger-dot', 'aria-hidden': 'true' }), DANGER[room.danger].text);
  const shardsLine = (room) => room.shards > 0 && h('p', { class: 'sheet-text', text: t('Odłamki Rdzenia: {count}.', { count: formatNumber(room.shards) }) });

  // A room not open now: what it is, and who waits in it.
  function roomInfo(room) {
    const rule = roomRule(room.type);
    if (!rule) return;
    openSheet(h('h2', { class: 'sheet-title sheet-title--art' }, roomArt(room.type), rule.name), h('p', { class: 'sheet-text', text: rule.text }), shardsLine(room), foesLine(room), dangerLine(room));
  }

  // A room open next: what waits there, and the way in.
  function roomSheet(row, index, room) {
    const rule = roomRule(room.type);
    openSheet(
      h('h2', { class: 'sheet-title sheet-title--art' }, roomArt(room.type), rule?.name ?? room.type),
      h('p', { class: 'sheet-text', text: rule?.text ?? '' }),
      shardsLine(room),
      foesLine(room),
      dangerLine(room),
      h(
        'div',
        { class: 'sheet-actions' },
        h('button', {
          type: 'button',
          class: 'button button--system',
          text: t('Wejdź'),
          onClick: (event) => withButton(event.currentTarget, () => enter(row, index)),
        }),
      ),
    );
  }

  async function enter(row, index) {
    const before = view;
    const result = await fresh(() => call('POST', '/api/labyrinth/room', { level: view.level, row, room: index }));
    // The figure walks from where it stood, on the same level's board.
    if (board && result.labyrinth.level === before.level) {
      const rows = before.map;
      const lanes = rows.length + 1;
      const lane = (at) => rows.length - 1 - at;
      const x = (at, count) => 50 + (at - (count - 1) / 2) * (count > 2 ? 28 : 32);
      walkFrom = before.row < 0 ? [50, laneY(lanes - 1, lanes)] : [x(before.room, rows[before.row].length), laneY(lane(before.row), lanes)];
    }
    const walking = board && walkFrom !== null && motionOn();
    view = result.labyrinth;
    if (result.report) reportCache.set(String(result.report.id), result.report);
    closeSheet();
    show();
    // The result once the figure has reached the room.
    const then = () => !gone && resultSheet(result.room, result.report);
    if (walking) setTimeout(then, WALK_MS);
    else then();
  }

  // A refusal because the Labirynt is not as the page shows it (a new day
  // at midnight, a tap from another tab): the Labirynt anew, and the
  // refusal's words in the toast (withButton).
  async function fresh(request) {
    try {
      return await request();
    } catch (error) {
      if (error.status === 409) {
        closeSheet();
        const again = await call('GET', '/api/labyrinth').catch(() => null);
        if (again) {
          view = again.labyrinth;
          show();
        }
      }
      throw error;
    }
  }

  // What a room gave: a fight's result with its playback, a spring's or a
  // treasure's lines. The altar's blessings and the merchant's wares open
  // at once in the sheet, and an elite's or a guardian's blessings come in
  // the same sheet as its result, so the choice is before the player's eyes.
  function resultSheet(room, report) {
    const rule = roomRule(room.type);
    const fight = room.won !== null;
    const title = !fight ? rule?.name ?? '' : room.won ? t('Komnata zdobyta') : t('Walka przegrana');
    const lines = room.lines.length > 0 ? room.lines : fight ? [] : [rule?.text ?? ''];
    if (!fight && (room.type === 'altar' || room.type === 'merchant')) {
      choiceSheet();
      return;
    }
    const choosing = view.pending?.kind === 'blessing' && view.pending.choices.length > 0;
    openSheet(
      h('h2', { class: 'sheet-title sheet-title--art' }, roomArt(room.type), title),
      // An ordinary fight's XP and gold; an elite's and a guardian's gains
      // are in their lines.
      room.type === 'fight' && room.won && h('p', { class: 'sheet-text', text: t('+{xp} XP, +{gold} złota.', { xp: formatNumber(room.gains.xp), gold: formatNumber(room.gains.gold) }) }),
      lines.map((line) => h('p', { class: 'sheet-text', text: line })),
      room.artifact && artifactLine(room.artifact),
      choosing && blessingPrompt(),
      choosing && blessingChoices(view.pending.choices),
      h(
        'div',
        { class: 'sheet-actions' },
        report &&
          h('button', {
            type: 'button',
            class: 'button button--world',
            text: t('Obejrzyj walkę'),
            onClick: () => {
              state.freshReport = String(report.id);
              closeSheet();
              navigate(`#/raport/${report.id}`);
            },
          }),
        !choosing && h('button', { type: 'button', class: 'button button--system', text: t('Dalej'), onClick: closeSheet }),
      ),
    );
  }

  const artifactLine = (artifact) =>
    h(
      'p',
      { class: 'labyrinth-artifact' },
      labyrinthArt(`artifact-${artifact.element}`, ROOM_ART, artifactPlaceholder(artifact.color)),
      h('span', { class: 'item-name', vars: { '--rarity': artifact.rarityColor }, text: artifact.name }),
      ` · ${artifact.rarityName}`,
    );

  // A choice made (a blessing, the merchant): the Labirynt as saved. Made in
  // the sheet, the sheet shows what comes next (the merchant's wares again)
  // or closes once nothing waits.
  async function act(path, body) {
    const result = await fresh(() => call('POST', path, body));
    view = result.labyrinth;
    show();
    if (document.querySelector('#sheet[open]')) choiceSheet();
  }

  if (!isUnlocked('labyrinth')) {
    const unlock = unlockInfo('labyrinth');
    show(unlock ? t('Labirynt Systemu odblokujesz na poziomie postaci {level}. Twój poziom: {own}.', { level: unlock.level, own: state.character.level }) : t('Nie znaleziono.'));
    return { refresh() {}, unmount() {} };
  }

  fill(container, board ? h('div', { class: 'lab-board' }, boardBar(false), h('p', { class: 'muted lab-board-message', text: t('Wczytywanie…') })) : h('p', { class: 'muted', text: t('Wczytywanie…') }));
  call('GET', '/api/labyrinth')
    .then(({ labyrinth }) => {
      view = labyrinth;
      show();
      // A choice waiting when the board opens comes before the player's eyes.
      if (board && view.pending && !view.over) choiceSheet();
    })
    .catch((error) => show(error.message ?? t('Nie udało się wczytać Labiryntu.')));

  return {
    // The Osada redrew its screen, or the character changed (its gold for
    // the merchant, its level): the panel again, as it is now, unless a
    // sheet of the Labirynt is open over it.
    refresh() {
      if (view && !document.querySelector('#sheet[open]')) show();
    },
    update() {
      if (board && view && !document.querySelector('#sheet[open]')) show();
    },
    unmount() {
      gone = true;
      clearInterval(clock);
    },
  };
}

// Where the middle of a lane of the board is, in % of its height from the
// top: the lanes between a margin above the guardian's (its tall piece and
// platform) and one below the entrance (the words over the board's foot).
// The entrance, the last lane, stands ENTRANCE_GAP of a lane further below
// the first row than the rows stand apart, so the party waiting there
// leaves the first row's names in sight.
const ENTRANCE_GAP = 0.8;
const laneY = (lane, lanes) => 9 + ((lane + 0.5 + (lane === lanes - 1 ? ENTRANCE_GAP : 0)) / (lanes + ENTRANCE_GAP)) * 82;

// The time to the next Polish midnight, when a new Labirynt comes: "5 h 12
// min", "40 min".
function untilMidnight(now) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(now));
  const part = (type) => Number(parts.find((one) => one.type === type)?.value ?? 0);
  const minutes = Math.max(1, 24 * 60 - part('hour') * 60 - part('minute'));
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? t('{hours} h {minutes} min', { hours, minutes: minutes % 60 }) : t('{minutes} min', { minutes });
}

// An Artefakt's placeholder: a diamond in its element's colour.
export function artifactPlaceholder(color) {
  const mark = h('span', { class: 'artifact-placeholder' });
  mark.style.setProperty('--element', color);
  return mark;
}
