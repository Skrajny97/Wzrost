// The code review of 13.11.2026, on the page (src/client): what a few
// screens offer and say, on just enough of a page for them
// (helpers/narrator-page.js). Each test failed on the code before its fix.
// The names are synthetic.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, test } from 'node:test';
import { narratorPage, settled } from './helpers/narrator-page.js';

const page = narratorPage();
const data = (name) => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url), 'utf8'));
const settlement = data('settlement');
// The Sala prób's words as the server sends them (trialHallView).
const { fightStart: _a, eliteStart: _b, defeat: _c, won: _d, lost: _e, ...hallTexts } = settlement.trialHall.texts;
const mercenaryTexts = settlement.mercenaries.texts;
const HOUR = 3600000;

let state;
let trialHallCards;
let mountTowers;
before(async () => {
  await page.ready;
  ({ state } = page);
  // The levels the parts of the game open at, for the Walka's switch of
  // its modes over the towers (screens/towers.js).
  state.content = { ...state.content, unlocks: data('unlocks') };
  ({ trialHallCards } = await import('../src/client/trial-hall.js'));
  ({ mountTowers } = await import('../src/client/screens/towers.js'));
});

// The character busy with `activity`: an exploration under way or back, an
// offer as a mercenary, a service, or a service over with its pay waiting.
function busyWith(kind) {
  const now = Date.now();
  const away = { startedAt: now - HOUR, endsAt: now + HOUR };
  const over = { startedAt: now - 2 * HOUR, endsAt: now - HOUR };
  const hired = { name: 'Najmita', area: 'Omszałe Głazy', gold: 300 };
  return {
    none: null,
    exploring: { kind: 'hunt', ...away },
    back: { kind: 'hunt', ...over },
    offered: { kind: 'mercenary', ...away, service: { perHour: 100, hired: null, text: mercenaryTexts.waiting } },
    serving: { kind: 'mercenary', ...away, service: { perHour: 100, hired, text: mercenaryTexts.hired } },
    paid: { kind: 'mercenary', ...over, service: { perHour: 100, hired, text: mercenaryTexts.hired } },
  }[kind];
}

const character = (activity) => ({ name: 'Próbna', level: 60, classLevel: 40, features: ['towers'], activity, mercenaries: { texts: mercenaryTexts } });
const box = (...nodes) => {
  const holder = globalThis.document.createElement('div');
  holder.append(...nodes.flat().filter(Boolean));
  return holder;
};
const buttonsOf = (holder) => holder.find((node) => node.tagName === 'BUTTON');
const disabled = (button) => button.getAttribute('disabled') !== null;

// Why the trial and the towers wait, by what the character is busy with:
// the words the server refuses with (requireNotExploring), the hall's own
// for an exploration.
const reasons = {
  exploring: hallTexts.exploring,
  back: hallTexts.claimFirst,
  offered: mercenaryTexts.busy,
  serving: mercenaryTexts.busyHired,
  paid: mercenaryTexts.claimFirst,
};

describe("the Sala prób's trial and the Wieże wait for a mercenary too, and say why", () => {
  const hall = {
    used: false,
    texts: hallTexts,
    target: { areaId: 'mossy-boulders', name: 'Omszałe Głazy', regionName: null, levels: '12–15', unlockClassLevel: 11, passed: false, fights: [{ monsterId: 'wolf', name: 'Wilk', elite: false }] },
  };

  test('the trial: its button off with the reason, as the server refuses', () => {
    for (const [kind, reason] of [['none', null], ...Object.entries(reasons)]) {
      state.character = character(busyWith(kind));
      const cards = box(trialHallCards(hall, { id: 'trial-hall' }, () => {}));
      const [start] = buttonsOf(cards);
      assert.equal(start.textContent, hallTexts.start, kind);
      assert.equal(disabled(start), reason !== null, kind);
      if (reason) assert.ok(cards.textContent.includes(reason), `${kind}: ${cards.textContent}`);
    }
  });

  describe('the towers', () => {
    const towers = {
      left: 3,
      perDay: 3,
      firstFloorLevel: 50,
      strength: [1.5, 2],
      championEvery: 25,
      chestEvery: 10,
      eliteEvery: 5,
      eliteLapEvery: 1,
      cycle: [{ id: 'mossy-boulders', name: 'Omszałe Głazy', regionName: 'Wiatrołomy', elite: true, champion: true }],
      loot: null,
      towers: [{ id: 'solo', name: 'Wieża Solo', top: 1, best: 0, chests: [], champions: [], partners: [], companions: [], missing: null, place: null }],
    };
    let fetchBefore;
    beforeEach(() => {
      fetchBefore = globalThis.fetch;
      globalThis.fetch = async () => new Response(JSON.stringify({ towers }), { status: 200 });
    });
    after(() => {
      if (fetchBefore) globalThis.fetch = fetchBefore;
    });

    test('a floor is entered only when the character may, and the screen says why not', async () => {
      for (const [kind, reason] of [['none', null], ...Object.entries(reasons)]) {
        state.character = character(busyWith(kind));
        const screen = globalThis.document.createElement('main');
        const mounted = mountTowers(screen, { navigate() {} });
        await settled();
        const enter = buttonsOf(screen).find((button) => button.textContent.startsWith('Wejdź na piętro'));
        assert.ok(enter, kind);
        assert.equal(disabled(enter), reason !== null, kind);
        // The towers' own words for an exploration (towers.js).
        const said = kind === 'exploring' ? 'Postać jest na wyprawie.' : kind === 'back' ? 'Wyprawa się skończyła.' : reason;
        if (said) assert.ok(screen.textContent.includes(said), `${kind}: ${screen.textContent}`);
        // A mercenary's wait ends in the Karczma.
        if (kind in { offered: 1, serving: 1, paid: 1 }) assert.ok(screen.find((node) => node.tagName === 'A' && node.getAttribute('href') === '#/osada/tavern/mercenaries').length === 1, kind);
        mounted.unmount();
      }
    });
  });
});

// A room of the Labirynt fought, its report's "Wróć do Labiryntu" leads to
// the board, where the next room waits, not to the Sala prób's door a tap
// away from it (labyrinth.js, LABYRINTH_BOARD).
describe('the report of a room of the Labirynt', () => {
  test('"Wróć do Labiryntu" opens the board', async () => {
    const { mountReport } = await import('../src/client/screens/report.js');
    const { reportCache } = await import('../src/client/state.js');
    state.content = { ...state.content, resources: [] };
    state.character = { ...character(null), features: [], huntDurations: [5], bag: [], camp: { buildings: [] }, tutorial: null };
    reportCache.set('labirynt-1', {
      labyrinth: { levelName: 'Poziom I', typeName: 'Walka', companions: [] },
      endsAt: Date.now(),
      minutes: 0,
      result: 'success',
      resultText: 'Wygrana.',
      summary: { xp: 10, classXp: 10, gold: 5, resources: {}, materials: [], fights: 1, hpStart: 90, hpEnd: 80, maxHp: 100, timePoints: 0, bestFind: null },
      system: [],
      fights: [],
      items: [],
      entries: [],
    });
    const screen = globalThis.document.createElement('main');
    const mounted = mountReport(screen, { params: { id: 'labirynt-1' }, navigate() {} });
    const back = screen.find((node) => node.tagName === 'A' && node.textContent === 'Wróć do Labiryntu');
    assert.equal(back.length, 1);
    assert.equal(back[0].getAttribute('href'), '#/labirynt');
    mounted.unmount();
  });
});

// The Tablica zleceń in the Osada (screens/settlement.js): an empty slot's
// countdown moves with the screen's tick instead of standing still, and
// the week's order's "Zapłata" tells its Punkty Systemu as a special
// order's does.
describe("the Osada's Tablica zleceń", () => {
  const order = (id, extra = {}) => ({
    id,
    kind: 'resource',
    key: 'wood',
    count: 10,
    have: 0,
    gold: 120,
    reputation: 2,
    brotherhood: 'hunters',
    brotherhoodName: 'Bractwo Łowców',
    story: 'Most na brodzie znowu się sypie.',
    label: 'Drewno',
    systemPoints: 0,
    ...extra,
  });
  const readyAt = Date.now() + 3 * HOUR;
  const osada = {
    name: 'Osada',
    places: [{ id: 'board', name: 'Tablica zleceń' }],
    residents: [],
    brotherhoods: [],
    board: { slots: [{ readyAt }, { order: order(2, { special: true, systemPoints: 1 }) }, { order: order(3) }], weekly: order('weekly', { systemPoints: 5 }), weeklyDone: false, refillMinutes: 180 },
  };
  let kept;
  before(() => {
    kept = { fetch: globalThis.fetch, remove: globalThis.window.removeEventListener };
    globalThis.fetch = async () => new Response(JSON.stringify({ settlement: osada }), { status: 200 });
    globalThis.window.removeEventListener = () => {};
  });
  after(() => {
    globalThis.fetch = kept.fetch;
    globalThis.window.removeEventListener = kept.remove;
  });

  // The board's place on the screen, and its lines that begin with `start`.
  async function board() {
    const { mountSettlement } = await import('../src/client/screens/settlement.js');
    state.character = character(null);
    const screen = globalThis.document.createElement('main');
    const mounted = mountSettlement(screen, { params: { place: 'board' } });
    await settled();
    const lines = (start) => screen.find((node) => node.tagName === 'P' && node.textContent.startsWith(start)).map((node) => node.textContent);
    return { mounted, lines };
  }

  test('an empty slot counts down every second', async () => {
    const { mounted, lines } = await board();
    mounted.tick(readyAt - 2 * HOUR);
    assert.deepEqual(lines('Nowe zlecenie'), ['Nowe zlecenie za 2:00:00.']);
    mounted.tick(readyAt - 61000);
    assert.deepEqual(lines('Nowe zlecenie'), ['Nowe zlecenie za 01:01.']);
    mounted.unmount();
  });

  test('each order says the Punkty Systemu it pays, the week\'s order too', async () => {
    const { mounted, lines } = await board();
    assert.deepEqual(lines('Zapłata'), [
      'Zapłata: 120 złota, +2 reputacji: Bractwo Łowców, +1 PS',
      'Zapłata: 120 złota, +2 reputacji: Bractwo Łowców',
      'Zapłata: 120 złota, +2 reputacji: Bractwo Łowców, +5 PS',
    ]);
    mounted.unmount();
  });
});

// The Walka's place (screens/combat.js): with "Z drużyną" ticked the threat
// is still counted for the character alone, and a line under it says so
// (the author's 926 B, 13.11.2026); unticked, or out of a party, no line.
describe("the Walka's threat with \"Z drużyną\"", () => {
  const area = { id: 'windfalls-edge', name: 'Skraj Wiatrołomów', minLevel: 1, maxLevel: 5, unlockClassLevel: 1, description: 'Polana.', dangers: [] };
  const region = { id: 'windfalls', name: 'Wiatrołomy', minLevel: 1, maxLevel: 10, areas: [area] };
  const member = (name, own) => ({ name, own, leader: own, status: 'free' });
  const leading = { members: [member('Próbna', true), member('Druhna', false)], limits: { minutes: 60, minutesBy: 'Druhna', classLevel: 30, classLevelBy: 'Druhna', mount: { shorter: 0, by: 'Druhna' } } };
  let kept;
  let party;
  before(() => {
    kept = { fetch: globalThis.fetch, content: state.content, user: state.user };
    state.content = { ...state.content, regions: [region], lengths: [{ upTo: 30, name: 'krótka' }, { name: 'długa' }] };
    state.user = { testMode: false };
    globalThis.fetch = async (path) => {
      const answer = String(path).startsWith('/api/party')
        ? { party }
        : { areas: [{ id: area.id, threat: { 5: 'low', 15: 'low', 30: 'moderate' }, threatAvoiding: { 5: 'low', 15: 'low', 30: 'low' }, threatSeeking: { 5: 'low', 15: 'moderate', 30: 'high' } }] };
      return new Response(JSON.stringify(answer), { status: 200 });
    };
  });
  after(() => {
    globalThis.fetch = kept.fetch;
    state.content = kept.content;
    state.user = kept.user;
  });

  // The place on the screen, as the party answers `answer`.
  async function place(answer) {
    party = answer;
    const { mountCombat } = await import('../src/client/screens/combat.js');
    state.character = {
      ...character(null),
      level: 30,
      classLevel: 30,
      xp: 100,
      tutorial: null,
      features: ['party'],
      hp: 100,
      maxHp: 100,
      regen: null,
      timePoints: 0,
      timePointsGain: { since: Date.now(), minutes: 30 },
      stats: [],
      equipment: {},
      skills: [],
      buffs: [],
      huntDurations: [5, 15, 30],
      huntNext: null,
      mount: null,
      mercenaries: null,
      quickHunts: null,
      hardHunt: null,
      wanted: null,
    };
    // On the page: the party's box draws only into a screen still there.
    const screen = globalThis.document.createElement('main');
    globalThis.document.body.append(screen);
    const view = mountCombat(screen, { params: { region: region.id, area: area.id }, navigate() {} });
    await settled();
    const [note] = screen.find((node) => node.classList.contains('threat-alone'));
    const mounted = {
      unmount() {
        view.unmount?.();
        screen.remove();
      },
    };
    return { screen, mounted, note };
  }
  // Shown: hidden by the screen neither as it was drawn nor since.
  const shown = (node) => (node.hidden === undefined ? node.getAttribute('hidden') === null : !node.hidden);

  test('ticked, the line says the threat is the character\'s alone; unticked, it goes', async () => {
    const { screen, mounted, note } = await place(leading);
    assert.ok(note, 'the line under the threat');
    assert.equal(note.textContent, 'Zagrożenie liczone dla Ciebie samego.');
    assert.equal(shown(note), true);
    const [box] = screen.find((node) => node.getAttribute('id') === 'party-along');
    box.checked = false;
    box.dispatchEvent({ type: 'change' });
    assert.equal(shown(note), false);
    box.checked = true;
    box.dispatchEvent({ type: 'change' });
    assert.equal(shown(note), true);
    mounted.unmount();
  });

  test('out of a party the line never shows', async () => {
    const { mounted, note } = await place(null);
    assert.equal(shown(note), false);
    mounted.unmount();
  });
});
