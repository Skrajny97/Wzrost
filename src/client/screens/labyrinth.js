// The Labirynt Systemu in the Walka (src/server/labyrinth.js; DECISIONS.md,
// "Labirynt Systemu i Rdzeń", 850–866), from character level 30, where the
// game has it on: the day's level (1–3, then Piekielny) over its picture,
// the fighters with the HP they carry from fight to fight, the blessings
// taken, the map of the level (rows of rooms with the roads between them,
// the party's place, the rooms it may enter lit) and the day's rewards. A
// tap on a room open next tells what waits there and enters it: a fight's
// result with its playback in the report, a spring's healing, the choice of
// a blessing (after an elite, a guardian, at an altar) and the merchant's
// wares wait over the map until chosen. The words are shown in the page's
// language (t(), i18n.js).

import { labyrinthArt, roomPlaceholder } from '../art.js';
import { fill, h, icon } from '../dom.js';
import { formatNumber } from '../format.js';
import { t } from '../i18n.js';
import { call, isUnlocked, reportCache, state, unlockInfo } from '../state.js';
import { closeSheet, howItWorks, meter, openSheet, systemLink, systemPanel, withButton } from '../ui.js';
import { combatModes } from './towers.js';

// The height of a row of the map, in pixels: the room's circle, its name
// and the room between them for the roads.
const ROW = 78;
const ROOM_ART = 32;

export function mountLabyrinth(container, { navigate }) {
  let view = null;
  let gone = false;

  const heading = () => [h('div', { class: 'page-heading' }, h('h1', { class: 'page-title', tabindex: '-1', text: t('Walka') })), combatModes('labyrinth', navigate)];

  function show(message) {
    if (gone) return;
    if (message) {
      fill(container, ...heading(), systemPanel(message));
      return;
    }
    fill(container, ...heading(), hero(), overPanel(), pendingCard(), partyCard(), mapCard(), gainsCard(), aboutCard());
  }

  const levelOf = () => view.levels[view.level - 1];
  const roomRule = (type) => view.rooms.find((room) => room.id === type);

  // The day's level over its picture (art/places/labyrinth.png, Piekielny's
  // its own), and the levels of the day, the cleared ones ticked.
  function hero() {
    const hell = levelOf().hell;
    const head = h(
      'div',
      { class: 'tower-head tower-head--art labyrinth-head' },
      h('div', { class: 'labyrinth-head-text' }, h('h2', { class: 'card-title', text: t('Labirynt Systemu') }), h('p', { class: 'labyrinth-level', text: levelOf().name })),
    );
    head.style.setProperty('--place-art', `url("/art/places/${hell ? 'labyrinth-hell' : 'labyrinth'}.png")`);
    const steps = h(
      'ol',
      { class: 'labyrinth-steps', 'aria-label': t('Poziomy Labiryntu') },
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
    return h(
      'section',
      { class: `card tower-card labyrinth-hero${hell ? ' labyrinth-hero--hell' : ''}`, 'aria-label': t('Labirynt Systemu') },
      head,
      steps,
      h('p', { class: 'muted', text: t('Stwory na poziomie {level}. Nowy Labirynt o północy.', { level: view.charLevel }) }),
    );
  }

  // The day over: a fight lost, or every level cleared.
  function overPanel() {
    if (!view.over) return null;
    return systemPanel(view.over === 'done' ? t('Labirynt na dziś zdobyty do końca. Nowy o północy.') : t('Walka przegrana. Labirynt na dziś się skończył, a zdobyte nagrody zostają. Nowy o północy.'));
  }

  // A choice waiting over the map: three blessings, or the merchant.
  function pendingCard() {
    const pending = view.pending;
    if (!pending) return null;
    const choices = pending.choices.length > 0 && blessingChoices(pending.choices);
    if (pending.kind === 'blessing') {
      const title = { elite: t('Elita pokonana'), guardian: t('Strażnik pokonany'), altar: t('Ołtarz') }[pending.from] ?? t('Błogosławieństwo');
      return h('section', { class: 'card labyrinth-choice', 'aria-labelledby': 'labyrinth-choice-title' }, h('h2', { class: 'section-title', id: 'labyrinth-choice-title', text: title }), h('p', { text: t('Wybierz jedno z trzech błogosławieństw. Działa do końca dzisiejszego Labiryntu.') }), choices);
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
    return h(
      'section',
      { class: 'card labyrinth-choice', 'aria-labelledby': 'labyrinth-choice-title' },
      h('h2', { class: 'section-title section-title--art', id: 'labyrinth-choice-title' }, roomArt('merchant'), t('Kupiec Systemu')),
      h('p', { text: t('Kupiec sprzedaje każdą rzecz raz. Twoje złoto: {gold}.', { gold: formatNumber(gold) }) }),
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
    );
  }

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

  // The fighters with their HP, and the blessings taken as chips.
  function partyCard() {
    const meters = view.fighters.map((fighter) => {
      const bar = meter({ label: fighter.companion ? fighter.name : t('{name} (postać)', { name: fighter.name }), value: fighter.hp, max: fighter.maxHp, kind: 'hp' });
      if (fighter.hp <= 0) bar.element.classList.add('meter--down');
      return bar.element;
    });
    const blessings =
      view.blessings.length > 0
        ? h(
            'div',
            { class: 'labyrinth-chips' },
            view.blessings.map((blessing) =>
              h(
                'button',
                {
                  type: 'button',
                  class: 'chip labyrinth-chip',
                  onClick: () => openSheet(h('h2', { class: 'sheet-title', text: blessing.name }), h('p', { class: 'sheet-text', text: blessing.text }), blessing.count > 1 && h('p', { class: 'muted', text: t('Wybrane {count} razy: działa tyle razy.', { count: blessing.count }) })),
                },
                blessing.count > 1 ? `${blessing.name} ×${blessing.count}` : blessing.name,
              ),
            ),
          )
        : h('p', { class: 'muted', text: t('Bez błogosławieństw. Zdobędziesz je po elicie, po strażniku i na ołtarzu.') });
    return h(
      'section',
      { class: 'card labyrinth-party', 'aria-labelledby': 'labyrinth-party-title' },
      h('h2', { class: 'section-title', id: 'labyrinth-party-title', text: t('Drużyna') }),
      meters,
      h('p', { class: 'muted small', text: t('Rany zostają między walkami. Leczą źródła, kupiec i niektóre błogosławieństwa.') }),
      h('h3', { class: 'labyrinth-subtitle', text: t('Błogosławieństwa') }),
      blessings,
    );
  }

  // A room's picture (art/labyrinth/room-<type>.png), or its placeholder.
  const roomArt = (type) => labyrinthArt(`room-${type}`, ROOM_ART, roomPlaceholder(type));

  // The level's map: the rows from the entrance down to the guardian, each
  // room at its place in its row, the roads drawn behind them; the rooms
  // taken, the one the party stands in and those it may enter now.
  function mapCard() {
    const rows = view.map;
    const height = rows.length * ROW;
    const x = (index, count) => ((index + 0.5) / count) * 100;
    const y = (row) => row * ROW + ROW / 2 - 8;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'labyrinth-roads');
    svg.setAttribute('viewBox', `0 0 100 ${height}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    const taken = (row, index) => view.path[row] === index && row <= view.row;
    rows.forEach((rooms, row) => {
      if (row + 1 >= rows.length) return;
      rooms.forEach((room, index) => {
        for (const next of room.links) {
          const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          line.setAttribute('x1', String(x(index, rooms.length)));
          line.setAttribute('y1', String(y(row)));
          line.setAttribute('x2', String(x(next, rows[row + 1].length)));
          line.setAttribute('y2', String(y(row + 1)));
          const walked = taken(row, index) && taken(row + 1, next);
          const open = row === view.row && index === view.room && view.reachable.includes(next);
          line.setAttribute('class', `labyrinth-road${walked ? ' labyrinth-road--walked' : open ? ' labyrinth-road--open' : ''}`);
          line.setAttribute('vector-effect', 'non-scaling-stroke');
          svg.append(line);
        }
      });
    });
    const buttons = rows.flatMap((rooms, row) =>
      rooms.map((room, index) => {
        const here = row === view.row && index === view.room;
        const open = row === view.row + 1 && view.reachable.includes(index);
        const done = taken(row, index) && !here;
        const rule = roomRule(room.type);
        const button = h(
          'button',
          {
            type: 'button',
            class: ['labyrinth-room', `labyrinth-room--${room.type}`, here && 'labyrinth-room--here', open && 'labyrinth-room--open', done && 'labyrinth-room--done', !open && !here && 'labyrinth-room--shut'].filter(Boolean).join(' '),
            'aria-label': [rule?.name ?? room.type, here ? t('tu stoi drużyna') : open ? t('można wejść') : done ? t('zdobyta') : null].filter(Boolean).join(', '),
            'aria-disabled': open ? undefined : 'true',
            onClick: () => (open ? roomSheet(row, index, room) : roomInfo(room)),
          },
          h('span', { class: 'labyrinth-room-circle' }, roomArt(room.type), done && h('span', { class: 'labyrinth-room-check' }, icon('check', { size: 14 }))),
          h('span', { class: 'labyrinth-room-name', text: rule?.name ?? room.type }),
        );
        button.style.left = `${x(index, rooms.length)}%`;
        button.style.top = `${row * ROW}px`;
        return button;
      }),
    );
    const board = h('div', { class: 'labyrinth-map' }, svg, buttons);
    board.style.height = `${height}px`;
    return h(
      'section',
      { class: `card labyrinth-map-card${levelOf().hell ? ' labyrinth-map-card--hell' : ''}`, 'aria-labelledby': 'labyrinth-map-title' },
      h('h2', { class: 'section-title', id: 'labyrinth-map-title', text: t('Mapa: {level}', { level: levelOf().name }) }),
      h('p', { class: 'muted small', text: view.over ? t('Labirynt na dziś się skończył.') : view.pending ? t('Najpierw wybierz, co dalej (wyżej).') : t('Stuknij świecącą komnatę, żeby do niej wejść.') }),
      board,
    );
  }

  // A room not open now: what it is.
  function roomInfo(room) {
    const rule = roomRule(room.type);
    if (!rule) return;
    openSheet(h('h2', { class: 'sheet-title sheet-title--art' }, roomArt(room.type), rule.name), h('p', { class: 'sheet-text', text: rule.text }));
  }

  // A room open next: what waits there, and the way in.
  function roomSheet(row, index, room) {
    const rule = roomRule(room.type);
    const foes = room.foes?.length > 0 && h('p', { class: 'sheet-text', text: t('Przeciwnicy: {foes}.', { foes: room.foes.map((foe) => t('{name} (poz. {level})', { name: foe.name, level: foe.level })).join(', ') }) });
    openSheet(
      h('h2', { class: 'sheet-title sheet-title--art' }, roomArt(room.type), rule?.name ?? room.type),
      h('p', { class: 'sheet-text', text: rule?.text ?? '' }),
      foes,
      h('div', { class: 'sheet-actions' }, h('button', {
        type: 'button',
        class: 'button button--system',
        text: t('Wejdź'),
        onClick: (event) => withButton(event.currentTarget, () => enter(row, index)),
      })),
    );
  }

  async function enter(row, index) {
    const result = await fresh(() => call('POST', '/api/labyrinth/room', { level: view.level, row, room: index }));
    view = result.labyrinth;
    if (result.report) reportCache.set(String(result.report.id), result.report);
    show();
    resultSheet(result.room, result.report);
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
  // treasure's lines.
  function resultSheet(room, report) {
    const rule = roomRule(room.type);
    const fight = room.won !== null;
    const title = !fight ? rule?.name ?? '' : room.won ? t('Komnata zdobyta') : t('Walka przegrana');
    const lines = room.lines.length > 0 ? room.lines : fight ? [] : [rule?.text ?? ''];
    if (!fight && (room.type === 'altar' || room.type === 'merchant')) {
      closeSheet();
      return;
    }
    openSheet(
      h('h2', { class: 'sheet-title sheet-title--art' }, roomArt(room.type), title),
      // An ordinary fight's XP and gold; an elite's and a guardian's gains
      // are in their lines.
      room.type === 'fight' && room.won && h('p', { class: 'sheet-text', text: t('+{xp} XP, +{gold} złota.', { xp: formatNumber(room.gains.xp), gold: formatNumber(room.gains.gold) }) }),
      lines.map((line) => h('p', { class: 'sheet-text', text: line })),
      room.artifact && artifactLine(room.artifact),
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
        h('button', { type: 'button', class: 'button button--system', text: t('Dalej'), onClick: closeSheet }),
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

  // The day's rewards so far, and the way to the Rdzeń once it is open.
  function gainsCard() {
    const { xp, gold, shards, artifacts } = view.gains;
    const rows = [
      [t('XP postaci'), `+${formatNumber(xp)}`],
      [t('Złoto'), `+${formatNumber(gold)}`],
      [t('Odłamki Rdzenia'), `+${formatNumber(shards)}`],
      [t('Artefakty'), formatNumber(artifacts)],
    ];
    return h(
      'section',
      { class: 'card labyrinth-gains', 'aria-labelledby': 'labyrinth-gains-title' },
      h('h2', { class: 'section-title', id: 'labyrinth-gains-title', text: t('Nagrody dnia') }),
      h('dl', { class: 'status-list' }, rows.map(([label, value]) => h('div', { class: 'status-row' }, h('dt', { text: label }), h('dd', { text: value })))),
      isUnlocked('core') ? systemLink('#/postac/rdzen', t('Do Rdzenia')) : h('p', { class: 'muted small', text: t('Rdzeń otworzy się, gdy postać pokona pierwszego strażnika Labiryntu.') }),
    );
  }

  function aboutCard() {
    return h(
      'section',
      { class: 'card towers-intro' },
      howItWorks(
        t('Codziennie nowy Labirynt: trzy poziomy, a po trzecim tego samego dnia Piekielny. Mapa jest ta sama dla wszystkich.'),
        t(
          'Wchodzi postać i do dwóch towarzyszy z Kwater, jak na wyprawę, o każdej porze, także w czasie wyprawy i pracy w profesji. Poziom to sześć rzędów komnat i strażnik na końcu; z komnaty prowadzą drogi do dwóch albo trzech komnat następnego rzędu. HP przechodzi z walki do walki, bez mikstur. Walka nie wygrana kończy Labirynt na dziś, a zdobyte nagrody zostają. Za zwykłą walkę zgarniesz PD i złoto, za elitę i skarb Odłamki Rdzenia i złoto, a za strażnika Artefakt do Rdzenia. Po elicie, strażniku i na ołtarzu wybierasz jedno z trzech błogosławieństw, które działa do końca dnia. Postęp przepada o północy.',
        ),
      ),
    );
  }

  // A choice made (a blessing, the merchant): the Labirynt as saved.
  async function act(path, body) {
    const result = await fresh(() => call('POST', path, body));
    view = result.labyrinth;
    show();
  }

  if (!isUnlocked('labyrinth')) {
    const unlock = unlockInfo('labyrinth');
    show(unlock ? t('Labirynt Systemu odblokujesz na poziomie postaci {level}. Twój poziom: {own}.', { level: unlock.level, own: state.character.level }) : t('Nie znaleziono.'));
    return { unmount() {} };
  }

  fill(container, ...heading(), h('p', { class: 'muted', text: t('Wczytywanie…') }));
  call('GET', '/api/labyrinth')
    .then(({ labyrinth }) => {
      view = labyrinth;
      show();
    })
    .catch((error) => show(error.message ?? t('Nie udało się wczytać Labiryntu.')));

  return {
    // The character changed (its gold for the merchant, its level): the
    // screen again, as it is now.
    update() {
      if (view && !document.querySelector('#sheet[open]')) show();
    },
    unmount() {
      gone = true;
    },
  };
}

// An Artefakt's placeholder: a diamond in its element's colour.
export function artifactPlaceholder(color) {
  const mark = h('span', { class: 'artifact-placeholder' });
  mark.style.setProperty('--element', color);
  return mark;
}

