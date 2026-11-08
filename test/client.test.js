// The page has no build step, so a typo in a file name or an import would only
// show up in the browser. These checks catch it earlier: every client module
// must parse, and every relative import must name an existing file and export.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { test } from 'node:test';

const CLIENT = new URL('../src/client/', import.meta.url).pathname;

function modules(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return modules(path);
    return entry.name.endsWith('.js') ? [path] : [];
  });
}

const files = modules(CLIENT);

test('every client module parses', () => {
  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${relative(CLIENT, file)}: ${result.stderr}`);
  }
});

test('relative imports name existing files and exports', () => {
  const importPattern = /import\s*\{([^}]*)\}\s*from\s*'(\.{1,2}\/[^']+)'/g;
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const [, names, target] of source.matchAll(importPattern)) {
      const path = join(dirname(file), target);
      assert.ok(existsSync(path), `${relative(CLIENT, file)} imports a missing file ${target}`);
      const exported = readFileSync(path, 'utf8');
      for (const name of names.split(',').map((part) => part.trim().split(/\s+as\s+/)[0]).filter(Boolean)) {
        const escaped = name.replace(/\$/g, '\\$');
        const pattern = new RegExp(
          `export\\s+(?:async\\s+)?(?:function|const|let|class)\\s+${escaped}(?![\\w$])|export\\s*\\{[^}]*(?:^|[\\s,])${escaped}(?:[\\s,]|$)[^}]*\\}`,
          'm',
        );
        assert.match(exported, pattern, `${relative(CLIENT, file)} imports "${name}", which ${target} does not export`);
      }
    }
  }
});

// The phone's setting for less motion used to stop the narrator's camera and
// parchment on the author's phone; the game's own switch decides (motion.js).
test("animations follow the game's switch, not the phone's setting", () => {
  for (const file of [...files, join(CLIENT, 'styles.css')]) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /prefers-reduced-motion/, `${relative(CLIENT, file)} follows the phone's setting`);
  }
});

test('index.html loads the entry module and the screens it needs exist', () => {
  const html = readFileSync(join(CLIENT, 'index.html'), 'utf8');
  assert.match(html, /<script type="module" src="\/app\.js"><\/script>/);
  for (const id of ['view-loading', 'view-auth', 'view-create', 'view-game', 'topbar', 'screen', 'nav-main', 'nav-character', 'sheet', 'toast']) {
    assert.match(html, new RegExp(`id="${id}"`), `index.html has no #${id}`);
  }
});

test('every inner region has its picture', async () => {
  const { areaArtIds } = await import('../src/client/area-art.js');
  const { SPRITES } = await import('../src/client/art.js');
  const regions = JSON.parse(readFileSync(new URL('../data/regions.json', import.meta.url), 'utf8'));
  const areas = regions.flatMap((region) => region.areas.map((area) => area.id));
  // Its drawn scene (art.js), or a vector one for a place still without it.
  assert.deepEqual(areas.filter((id) => !SPRITES.areas.ids.includes(id) && !areaArtIds.includes(id)), []);
});

test('a camp building whose entrance faces away from its path is mirrored towards it', async () => {
  const art = await import('../src/client/camp-art.js');
  // The author: "Tartak trzeba obrócić o 90 stopni by był zwrócony w stronę
  // ścieżki, tak samo wszystkie inne budowle, wejścia w strone ścieżek".
  const turned = (id, level) => art.plotMarkup(id, { level }).includes('transform="matrix(-1 0 0 1 100 0)"');
  for (const level of [1, 5, 9]) assert.ok(turned('sawmill', level), `the Tartak at level ${level}`);
  assert.ok(turned('loot-shed', 5) && turned('quarters', 1) && turned('scrap-bench', 5) && turned('craft-table', 5));
  assert.ok(art.mirrored('quarters', 2) && !art.mirrored('quarters', 3));
  assert.ok(!turned('anvil', 9) && !turned('quarry', 5) && !turned('mine', 5) && !turned('campfire', 5) && !turned('scrap-bench', 9));
  // A plot nobody has built on yet shows the same turn in grey.
  assert.ok(turned('sawmill', 0));
});

// Nothing of the Warownia goes into the game without its art (CLAUDE.md):
// while one of its buildings lacks the picture of one of its looks (three,
// or as many as its `looks` name), FORTRESS is on in no deployment.
test("the Warownia's buildings wait for their pictures: FORTRESS stays off until they have them", async () => {
  const { SPRITES } = await import('../src/client/art.js');
  const all = JSON.parse(readFileSync(new URL('../data/buildings.json', import.meta.url), 'utf8'));
  const looks = (building) => Math.max(...(building.looks ?? [1, 2, 3]));
  const pictured = (building) => Array.from({ length: looks(building) }, (_, index) => `${building.id}-${index + 1}`).every((id) => SPRITES.camp.ids.includes(id));
  const waiting = all.filter((building) => building.fortress && !pictured(building)).map((building) => building.id);
  const config = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  if (waiting.length > 0) assert.ok(!/"FORTRESS"\s*:\s*"on"/.test(config), `FORTRESS on without the pictures of ${waiting.join(', ')}`);
});

test('every building has its picture and a plot on the camp board, apart from the others', async () => {
  const art = await import('../src/client/camp-art.js');
  const every = JSON.parse(readFileSync(new URL('../data/buildings.json', import.meta.url), 'utf8'));
  // The camp's and the Osada's buildings have their drawings too, for a
  // picture not loaded; the Warownia's have their pictures (the test above).
  const all = every.filter((building) => !building.fortress);
  const buildings = all.map((building) => building.id);
  assert.deepEqual(buildings.filter((id) => !art.campArtIds.includes(id)), []);
  // The board without the Osada has the camp's own buildings; the taller one
  // with it the Osada's too (the Kwatery), and the Warownia's board all of
  // them with the Warownia's seven.
  for (const tall of [false, true, 'fortress']) {
    const plots = art.campPlots(tall);
    const on = every.filter((building) => (tall || !building.settlement) && (tall === 'fortress' || !building.fortress)).map((building) => building.id);
    assert.deepEqual(on.filter((id) => !plots[id]), []);
    // Plots stay on the board and their pictures do not overlap.
    const boxes = on.map((id) => {
      const { x, y } = plots[id];
      return { id, left: x - art.PLOT_WIDTH / 2, right: x + art.PLOT_WIDTH / 2, top: y - art.PLOT_HEIGHT / 2, bottom: y + art.PLOT_HEIGHT / 2 };
    });
    for (const box of boxes) {
      assert.ok(box.left >= 0 && box.right <= art.BOARD_WIDTH && box.top >= 0 && box.bottom <= art.boardHeight(tall), `${box.id} leaves the board`);
    }
    for (const [i, a] of boxes.entries()) {
      for (const b of boxes.slice(i + 1)) {
        const apart = a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
        assert.ok(apart, `${a.id} overlaps ${b.id}${tall === 'fortress' ? " on the Warownia's board" : tall ? ' on the taller board' : ''}`);
      }
    }
  }
  // The look grows with the level: levels 1–3, 4–7 and 8–10.
  assert.deepEqual([1, 3, 4, 7, 8, 10].map(art.buildingTier), [1, 1, 2, 2, 3, 3]);
});

test('every sprite on the list has its file at its size, and every class has its bust', async () => {
  const { SPRITES } = await import('../src/client/art.js');
  const { classArtIds } = await import('../src/client/class-art.js');
  const data = (name) => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url), 'utf8'));
  const looks = data('appearances').map((look) => look.id);
  const known = {
    // The people of the events fight as monsters do.
    monsters: [...data('monsters'), ...data('events').foes].map((monster) => monster.id),
    items: data('item-bases').map((base) => base.id),
    // The classes' portraits and their evolutions' (data/evolutions.json).
    portraits: [...data('classes'), ...data('evolutions').evolutions].flatMap((owner) => looks.map((look) => `${owner.id}-${look}`)),
    // The character walking on the Walka scene, one sheet for each portrait.
    walkers: [...data('classes'), ...data('evolutions').evolutions].flatMap((owner) => looks.map((look) => `${owner.id}-${look}`)),
    // The introduction's one narrator (narrator.js).
    narrator: ['narrator'],
    // Materials, parts and the treasure chest of the report.
    materials: [...data('materials').materials.map((material) => material.id), ...data('materials').parts.map((part) => part.id), 'chest'],
    // The classes' skills and their evolutions' (data/evolutions.json).
    skills: [...data('skills'), ...data('evolutions').skills].map((skill) => skill.id),
    // The figures the evolutions' summoning skills put in fights.
    summons: data('evolutions').skills.filter((skill) => skill.kind === 'summon').map((skill) => skill.id),
    // The Osada's places and torch, its residents' busts and its board; the
    // Duch budowniczego at the Kamień węgielny has a bust like theirs.
    settlement: [...data('settlement').places.map((place) => place.id), ...(data('settlement').torches?.length ? ['torch', 'torch-off'] : [])],
    residents: [...data('settlement').residents.map((resident) => resident.id), ...(data('camp').cornerstone?.spirit ? [data('camp').cornerstone.spirit.art] : [])],
    // The Salon Gier's games on the screen: the wheel and the drum, the
    // ticket and the pointer.
    salon: [data('settlement').casino.show.wheel.art, data('settlement').casino.show.lottery.drum],
    'salon-small': [data('settlement').casino.show.lottery.ticket, data('settlement').casino.show.wheel.pointer],
    // The companions' busts, one for each class and look.
    companions: data('classes').flatMap((cls) => looks.map((look) => `${cls.id}-${look}`)),
    'companion-portraits': data('classes').flatMap((cls) => looks.map((look) => `${cls.id}-${look}`)),
    // The companions walking beside the character on the Walka scene (648).
    'companion-walkers': data('classes').flatMap((cls) => looks.map((look) => `${cls.id}-${look}`)),
    'settlement-board': ['settlement'],
    // The inner regions' circles and the lands' cards on the Walka screen.
    areas: data('regions').flatMap((region) => region.areas.map((area) => area.id)),
    lands: data('regions').map((region) => region.id),
    // The camp board's ground at the camp's three looks.
    board: ['camp-1', 'camp-2', 'camp-3'],
    'board-tall': ['camp-1', 'camp-2', 'camp-3'],
    // The Warownia's board, with stone walls (606 A).
    'board-fortress': ['fortress'],
    // The camp's buildings at their three looks, a fourth for those that go
    // on to level 20 in the Warownia (beyond, 618), the Kamień węgielny
    // Warowni and the Zbieracz Systemu's icon (data/camp.json).
    camp: [
      ...data('buildings').flatMap((building) => [1, 2, 3, ...(building.beyond ? [4] : [])].map((tier) => `${building.id}-${tier}`)),
      ...(data('camp').cornerstone ? ['cornerstone-1'] : []),
      data('camp').collector.art,
    ],
    // Zielarstwo's herbs, Alchemia's potions, the professions' squares, the
    // places they work in, the Ewolucja's spring and the Wieże.
    herbs: data('professions').herbs.map((herb) => herb.id),
    potions: data('professions').potions.map((potion) => potion.id),
    professions: data('professions').professions.map((profession) => profession.id),
    // Górnictwo's gems and ores.
    minerals: data('professions').minerals.map((mineral) => mineral.id),
    places: [
      ...['gathering', 'brewing', 'workshop', 'mining', 'jewelcrafting'].map((work) => data('professions')[work].place.id),
      data('evolutions').place,
      ...data('towers').towers.map((tower) => tower.place),
      ...data('portals').portals.map((portal) => portal.art),
      data('guilds').place,
      ...data('settlement').places.flatMap((place) => place.backdrop ?? []),
      ...(data('settlement').wanted?.backdrop ? [data('settlement').wanted.backdrop] : []),
    ],
    // The Siedziba Gildii's buildings (616 A, 623).
    guild: data('guilds').seat.buildings.map((building) => building.id),
    events: data('events').list.map((event) => event.art),
    'event-scenes': data('events').list.map((event) => event.scene),
    // The camp's resources in place of their line icons.
    resources: data('resources').map((resource) => resource.id),
    // Gold, Punkty Czasu, the Encyclopedia's corner and the Kowadło's two
    // scrolls (the Warsztat's Zwój ochronny and Zwój utrwalenia).
    icons: ['gold', 'time-points', 'encyclopedia', data('professions').workshop.scroll.id, data('professions').workshop.steadyScroll.id],
    // The Stajnia's mounts and the looks a mount can wear (each with its
    // trot, and the Sklep Systemu's mount looks), and the character riding
    // them, one for each walk.
    mounts: [
      ...new Set([
        ...data('settlement').stable.mounts.map((mount) => mount.id),
        ...Object.keys(data('animations').walk.mounts),
        ...data('cosmetics').items.filter((item) => item.kind === 'mountSkin').map((item) => item.art),
      ]),
    ],
    // The Sklep Systemu's frames and backgrounds.
    cosmetics: data('cosmetics').items.filter((item) => item.kind !== 'mountSkin').map((item) => item.art),
    riders: [...data('classes'), ...data('evolutions').evolutions].flatMap((owner) => looks.map((look) => `${owner.id}-${look}`)),
  };
  for (const [kind, { size, width = size, height = size, fit = false, ids }] of Object.entries(SPRITES)) {
    assert.deepEqual(ids.filter((id) => !known[kind].includes(id)), [], `${kind}: no such id in data/`);
    for (const id of ids) {
      const file = join(CLIENT, 'art', kind, `${id}.png`);
      assert.ok(existsSync(file), `${file} is missing`);
      const png = readFileSync(file);
      // A picture cut to its outline (fit) is at most that size.
      if (fit) assert.ok(png.readUInt32BE(16) <= width && png.readUInt32BE(20) <= height, file);
      else assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, `${width}x${height}`, file);
    }
  }
  assert.deepEqual(data('classes').map((cls) => cls.id).filter((id) => !classArtIds.includes(id)), []);
  // Every class has its portraits with all the skin tones.
  assert.deepEqual(
    SPRITES.portraits.toned,
    data('classes').flatMap((cls) => looks.map((look) => `${cls.id}-${look}`)).filter((id) => SPRITES.portraits.ids.includes(id)),
  );
  // So has every evolution's portrait, and every walking figure has its
  // file for each tone too.
  assert.deepEqual(
    [...SPRITES.portraits.tonedEvolutions].sort(),
    data('evolutions').evolutions.flatMap((evolution) => looks.map((look) => `${evolution.id}-${look}`)).filter((id) => SPRITES.portraits.ids.includes(id)).sort(),
  );
  const tones = data('skins').skins.filter((tone) => tone.ramp).map((tone) => tone.id);
  for (const [kind, ids] of [['portraits', [...SPRITES.portraits.toned, ...SPRITES.portraits.tonedEvolutions]], ['walkers', SPRITES.walkers.ids], ['riders', SPRITES.riders.ids]]) {
    for (const id of ids) for (const tone of tones) assert.ok(existsSync(join(CLIENT, 'art', kind, `${id}-${tone}.png`)), `${kind}: ${id}-${tone}.png is missing`);
  }
  // A bust centres on a face inside the portrait.
  for (const [id, face] of Object.entries(SPRITES.portraits.faces)) {
    assert.ok(SPRITES.portraits.ids.includes(id), `faces: no portrait ${id}`);
    assert.ok(face > 24 && face < SPRITES.portraits.width - 24, `faces: ${id} at ${face}`);
  }
  // Every portrait has its shoulder where a pet of the Sklep Systemu perches,
  // left of the face, in the upper half of the portrait.
  assert.deepEqual(Object.keys(SPRITES.portraits.perches).sort(), [...SPRITES.portraits.ids].sort());
  for (const [id, [x, y]] of Object.entries(SPRITES.portraits.perches)) {
    assert.ok(x > 16 && x < (SPRITES.portraits.faces[id] ?? SPRITES.portraits.width / 2) && y > 16 && y < SPRITES.portraits.height / 2, `perches: ${id} at ${x}, ${y}`);
  }
  // A pet's own place on a portrait (petSpots) is for a pet of the Sklep
  // Systemu on a portrait the game has, its 32-pixel frame within the
  // portrait but for its empty edge (3 pixels across, 6 at the top).
  const pets = data('cosmetics').items.filter((item) => item.kind === 'pet');
  for (const [petId, spots] of Object.entries(SPRITES.portraits.petSpots)) {
    const pet = pets.find((item) => item.id === petId);
    assert.ok(pet, `petSpots: no pet ${petId}`);
    const size = pet.pet.portrait.size;
    for (const [id, [x, y]] of Object.entries(spots)) {
      assert.ok(SPRITES.portraits.ids.includes(id), `petSpots: no portrait ${id}`);
      assert.ok(x >= -3 && x <= SPRITES.portraits.width - size + 3 && y >= -6 && y <= SPRITES.portraits.height - size, `petSpots: ${petId} on ${id} at ${x}, ${y}`);
    }
  }
});

// The Walka scene's riding (scenes.js ride): each mount's trot is a row of
// frames with the saddle's place in each, and the rider follows it with the
// keyframes for that many frames.
test("every mount's trot has its sheet, a saddle in each frame and the rider's steps", () => {
  const walk = JSON.parse(readFileSync(new URL('../data/animations.json', import.meta.url), 'utf8')).walk;
  const css = readFileSync(join(CLIENT, 'styles.css'), 'utf8');
  for (const [id, trot] of Object.entries(walk.mounts)) {
    const path = join(CLIENT, trot.file);
    assert.ok(existsSync(path), `${id}: no ${trot.file}`);
    const png = readFileSync(path);
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [trot.width * trot.frames, trot.height], `${id}: the sheet is not ${trot.frames} frames of ${trot.width} × ${trot.height}`);
    assert.equal(trot.seats.length, trot.frames, `${id}: a saddle for each frame`);
    const steps = css.match(new RegExp(`@keyframes ride-${trot.frames} \\{([^@]*)`))?.[1] ?? '';
    for (let i = 0; i < trot.frames; i++) assert.match(steps, new RegExp(`var\\(--rx${i}\\), var\\(--ry${i}\\)`), `${id}: ride-${trot.frames} has no step ${i}`);
  }
});

test('the narrator knows when and where each of its lines shows', () => {
  const tutorial = JSON.parse(readFileSync(new URL('../data/tutorial.json', import.meta.url), 'utf8'));
  const beats = /const BEATS = \{([\s\S]*?)\n\};/.exec(readFileSync(join(CLIENT, 'narrator.js'), 'utf8'))[1];
  for (const line of tutorial.lines) {
    const beat = new RegExp(`(?:^|\\s)'?${line.id}'?: \\{([^}]*)\\}`).exec(beats);
    assert.ok(beat, `narrator.js has no beat for ${line.id}`);
    // A pointer or a tap needs its place.
    if (line.kind !== 'card') assert.match(beat[1], /place:/, `${line.id} has no place to point at`);
  }
});

// The parchment names the Osada's board as the game does (data/settlement.json):
// "Tablica zleceń", not "Tablica Zleceń" (664; the recording stays).
test('the narrator writes the Tablica zleceń as the Osada names it', () => {
  const tutorial = JSON.parse(readFileSync(new URL('../data/tutorial.json', import.meta.url), 'utf8'));
  const settlement = JSON.parse(readFileSync(new URL('../data/settlement.json', import.meta.url), 'utf8'));
  assert.equal(settlement.places.find((place) => place.id === 'board').name, 'Tablica zleceń');
  const said = tutorial.lines.flatMap((line) => [line, line.female, line.desktop, ...Object.values(line.classes ?? {})]).filter(Boolean);
  const texts = said.flatMap((one) => one.text ?? []);
  assert.ok(texts.some((text) => text.includes('Na Tablicy zleceń')));
  assert.ok(!texts.some((text) => /Tablic\p{L}* Zleceń/u.test(text)));
});

test("the narrator's quests sit in the top bar, where his line points", () => {
  const layout = readFileSync(join(CLIENT, 'layout.js'), 'utf8');
  assert.match(layout, /'data-guide': 'quests'/);
  // Between the levels and the gold, with the Sklep Systemu's stall beside
  // him, which opens the shop's page.
  assert.match(layout, /h\('div', \{ class: 'topbar-badges' \}, level, classLevel\),\s*h\('div', \{ class: 'topbar-middle' \}, quests, shop\),/);
  // Its words in the page's language (t(), src/client/i18n.js).
  assert.match(layout, /h\('a', \{ class: 'system-shop', href: '#\/sklep', 'aria-label': t\('Sklep Systemu'\) \}/);
  assert.doesNotMatch(layout, /dojdzie w jednej z kolejnych aktualizacji/);
  assert.match(readFileSync(join(CLIENT, 'app.js'), 'utf8'), /pattern: \/\^#\\\/sklep\b[^\n]*mount: mountShop/);
  const quests = readFileSync(join(CLIENT, 'quests.js'), 'utf8');
  for (const path of ['/api/quests/claim', '/api/quests/claim-all', '/api/quests/chest']) assert.ok(quests.includes(`'${path}'`), path);
});

// On a computer the camp is a tab of the menu under Walka, with no tent in
// the top bar (508 A): the narrator's lead to the camp lights that tab
// there and the tent on a phone, and the keys 1–6 follow the menu.
test('on a computer the camp is a tab of the menu, where the narrator leads', () => {
  const layout = readFileSync(join(CLIENT, 'layout.js'), 'utf8');
  assert.match(layout, /const CAMP_TAB = \{ id: 'oboz', label: 'Obóz', icon: 'tent', href: '#\/oboz' \};/);
  assert.match(layout, /const DESKTOP_TABS = \[\.\.\.MAIN_TABS\.slice\(0, 2\), CAMP_TAB, \.\.\.MAIN_TABS\.slice\(2\)\];/);
  assert.match(readFileSync(join(CLIENT, 'styles.css'), 'utf8'), /:root\[data-layout='desktop'\] \.camp-button \{\s*display: none;/);
  const beats = /const BEATS = \{([\s\S]*?)\n\};/.exec(readFileSync(join(CLIENT, 'narrator.js'), 'utf8'))[1];
  assert.match(beats, /'lead-camp': \{\s*place: '\.camp-button, #nav-main > \.nav-item\[href="#\/oboz"\]'/);
  const keys = readFileSync(join(CLIENT, 'keys.js'), 'utf8');
  assert.match(keys, /const TABS = \['#\/postac', '#\/walka', '#\/oboz', '#\/profesje', '#\/osada', '#\/spolecznosc'\];/);
});

// The Gildia's tabs change the address without a route (replaceState), so
// its page tells the narrator itself, and a route narrates at the address
// its screen has once drawn: the line about the Wyprawa Gildii (646) comes on
// the first look at that tab, also when the page opens on it (664).
test("the narrator hears of the Gildia's tabs, also of the one the page opens on", () => {
  const guild = readFileSync(join(CLIENT, 'screens', 'guild.js'), 'utf8');
  const show = /function show\(id\) \{([\s\S]*?)\n {2}\}/.exec(guild)[1];
  assert.match(show, /history\.replaceState\([\s\S]*narrate\(location\.hash\);/);
  const app = readFileSync(join(CLIENT, 'app.js'), 'utf8');
  const route = /\nfunction route\(\) \{([\s\S]*?)\n\}/.exec(app)[1];
  assert.match(route, /candidate\.mount\([\s\S]*narrate\(location\.hash \|\| hash\);/);
  assert.doesNotMatch(route, /narrate\(hash\);/);
  // "Testuj samouczki" starts the places' lines again: the Gildia's all
  // together, and each of the others on its own (6.11.2026).
  for (const [title, path] of [
    ['Gildia', 'guild-tour'],
    ['Warownia', 'fortress-tour'],
    ['Kamień węgielny', 'cornerstone-tour'],
    ['Drużyna', 'party-tour'],
    ['Trudna wyprawa', 'hard-hunt-tour'],
    ['Skrzynia Konta', 'account-chest-tour'],
    ['Omdlenie', 'faint-tour'],
  ]) {
    assert.match(app, new RegExp(`row\\(t\\('${title}'\\),`));
    assert.ok(app.includes(`'/api/test/${path}'`), path);
  }
});

// The places of the narrator's lines of 6.11.2026 are marked where he looks
// for them (narrator-places.test.js tells the lines on a page of its own).
test("the places of the narrator's lines of 6.11.2026 are marked on their screens", () => {
  const source = (...path) => readFileSync(join(CLIENT, ...path), 'utf8');
  const beats = /const BEATS = \{([\s\S]*?)\n\};/.exec(source('narrator.js'))[1];
  for (const [file, guide] of [
    [['screens', 'guild.js'], 'guild-tabs'],
    [['guild-seat.js'], 'guild-seat-building'],
    [['guild-beast.js'], 'guild-beast'],
    [['guild-trials.js'], 'guild-trials-board'],
    [['guild-requests.js'], 'guild-requests'],
    [['guild-exchange.js'], 'guild-exchange'],
    [['screens', 'camp.js'], 'plot-cornerstone'],
    [['screens', 'chest.js'], 'account-chest'],
    [['screens', 'combat.js'], 'hard-hunt'],
    [['screens', 'report.js'], 'report-summary'],
  ]) {
    assert.ok(source(...file).includes(`'data-guide': '${guide}'`), `${file.join('/')}: ${guide}`);
    assert.ok(beats.includes(`mark('${guide}')`), guide);
  }
  // The Społeczność's tabs, the Drużyna's among them, and the Sklep Systemu's
  // stall in the top bar.
  assert.ok(source('screens', 'community.js').includes("'data-guide': `community-tab-${section.id}`"));
  assert.ok(JSON.parse(readFileSync(new URL('../data/community.json', import.meta.url), 'utf8')).sections.some((section) => section.id === 'party'));
  assert.ok(beats.includes("mark('community-tab-party')"));
  assert.match(source('layout.js'), /h\('a', \{ class: 'system-shop'/);
  assert.ok(beats.includes("'.topbar .system-shop'"));
  // The fold the narrator opens for the Trudna wyprawa says whether it is open.
  assert.match(source('screens', 'combat.js'), /class: 'hunt-options-toggle',\s*'aria-expanded'/);
  // A report fetched after its screen was drawn is shown to the narrator.
  const load = /async function load\(\) \{([\s\S]*?)\n {2}\}/.exec(source('screens', 'report.js'))[1];
  assert.match(load, /reportCache\.set\(params\.id, report\);[\s\S]*if \(!gone\) narrate\(location\.hash\);/);
});

// Each "Testuj samouczki" row that starts a chapter anew forgets the
// chapter's lines passed on this page (narrator.js, forgetPart): the chapter
// comes on the next look at its place, not only once the page is opened
// again (the review of 664; narrator.test.js).
test('each "Testuj samouczki" row forgets its chapter\'s lines passed on the page', () => {
  const app = readFileSync(join(CLIENT, 'app.js'), 'utf8');
  const { chapters } = JSON.parse(readFileSync(new URL('../data/tutorial.json', import.meta.url), 'utf8'));
  for (const chapter of Object.keys(chapters)) {
    assert.ok(app.includes(`await call('POST', '/api/test/${chapter}-tour');\n    forgetPart('${chapter}');`), chapter);
  }
});

// A change of the character reaches the narrator a moment later, at the
// page's address then: a chapter that the claim of a report brings begins
// after the report, not over it (664; narrator.test.js).
test("the narrator hears of the character's change once the page is where it goes", () => {
  const app = readFileSync(join(CLIENT, 'app.js'), 'utf8');
  const change = /\nonCharacterChange\(\(\) => \{([\s\S]*?)\n\}\);/.exec(app)[1];
  assert.match(change, /narrateSoon\(\);/);
  assert.doesNotMatch(change, /narrate\(\);/);
});

// The narrator's line about the settings points at the gear by a class of
// its own: on the author's account its label tells the bug reports waiting,
// and a selector by the label found nothing there, so the line was passed
// over unseen (664).
test('the narrator finds the settings gear whatever its label says', () => {
  const layout = readFileSync(join(CLIENT, 'layout.js'), 'utf8');
  // Its words in the page's language (t(), src/client/i18n.js).
  assert.match(layout, /const settings = h\('button', \{ type: 'button', class: 'icon-button settings-button', 'aria-label': t\('Ustawienia'\)/);
  assert.match(layout, /topbar\.settings\.setAttribute\('aria-label', reports > 0 \? t\('Ustawienia, nowe zgłoszenia błędów: \{count\}', \{ count: reports \}\) : t\('Ustawienia'\)\);/);
  const beats = /const BEATS = \{([\s\S]*?)\n\};/.exec(readFileSync(join(CLIENT, 'narrator.js'), 'utf8'))[1];
  assert.match(beats, /\n {2}settings: \{ place: '\.topbar \.settings-button',/);
  assert.doesNotMatch(beats, /aria-label="Ustawienia"/);
});

test('the page can be added to the home screen as an app', () => {
  const html = readFileSync(join(CLIENT, 'index.html'), 'utf8');
  assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest">/);
  const manifest = JSON.parse(readFileSync(join(CLIENT, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.name, 'Insight');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  // Chrome needs a 192 and a 512 px icon; each file has the size it claims.
  const pngSize = (file) => {
    const png = readFileSync(join(CLIENT, file));
    return `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`;
  };
  for (const icon of manifest.icons) assert.equal(pngSize(icon.src.slice(1)), icon.sizes, icon.src);
  assert.deepEqual(manifest.icons.map((icon) => icon.sizes).sort(), ['192x192', '512x512', '512x512']);
  assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'));
  assert.equal(pngSize('apple-touch-icon.png'), '180x180');
});

test('a service worker makes the game installable and shows a page offline', () => {
  const app = readFileSync(join(CLIENT, 'app.js'), 'utf8');
  assert.match(app, /navigator\.serviceWorker\.register\('\/sw\.js'\)/);
  const worker = readFileSync(join(CLIENT, 'sw.js'), 'utf8');
  // Chrome opens its install dialog only for a worker with a real fetch handler.
  assert.match(worker, /addEventListener\('fetch'/);
  assert.match(worker, /respondWith/);
  // The offline page is asked for as /offline: the static files redirect /offline.html there.
  assert.match(worker, /const OFFLINE_PAGE = '\/offline';/);
  const files = JSON.parse(/const OFFLINE_FILES = (\[[^\]]*\])/.exec(worker)[1].replace(/OFFLINE_PAGE/, "'/offline.html'").replaceAll("'", '"'));
  for (const file of files) assert.ok(existsSync(join(CLIENT, file)), `${file} is missing`);
  // The game's stylesheet never passes through the worker, so an old copy
  // of it cannot stand in for the current one; the offline page has its own.
  assert.ok(!files.includes('/styles.css'));
  const offline = readFileSync(join(CLIENT, 'offline.html'), 'utf8');
  assert.match(offline, /href="\/offline\.css"/);
  assert.doesNotMatch(offline, /styles\.css/);
  assert.match(offline, /href="\/" data-en="Try again">Spróbuj ponownie</);
});

// Google Play (0.2.3): the new account's form asks for "Mam co najmniej 16
// lat" and points to the terms and the privacy policy, in the language shown;
// the login screen and the Ustawienia link to them too.
test('the new account form asks for 16 or over and links the terms and the privacy policy', () => {
  const html = readFileSync(join(CLIENT, 'index.html'), 'utf8');
  const form = /<form id="register-form"[\s\S]*?<\/form>/.exec(html)[0];
  assert.match(form, /<input id="register-adult" name="adult" type="checkbox" required>/);
  assert.match(form, /<span data-i18n>Mam co najmniej 16 lat<\/span>/);
  assert.match(form, /href="\/regulamin" data-href-en="\/terms"/);
  assert.match(form, /href="\/prywatnosc" data-href-en="\/privacy"/);
  assert.match(html, /<p class="version auth-legal">/);
  const app = readFileSync(join(CLIENT, 'app.js'), 'utf8');
  assert.match(app, /adult: data\.adult === 'on'/);
  assert.match(app, /legalLinks\(\)/);
  for (const page of ['regulamin', 'terms', 'prywatnosc', 'privacy', 'usun-konto', 'delete-account']) assert.ok(existsSync(join(CLIENT, `${page}.html`)), page);
});

// The English of what shows outside the game (0.2.2): the offline page, the
// link insightrpg.com/en with its preview, and the app's description.
test('the offline page, the English link and the installed app speak English too', () => {
  const english = JSON.parse(readFileSync(new URL('../data/en/strings.json', import.meta.url), 'utf8'));
  const i18n = readFileSync(join(CLIENT, 'i18n.js'), 'utf8');
  const key = (name) => new RegExp(`const ${name} = '([^']+)'`).exec(i18n)[1];
  // The offline page: every text has its English, and its script reads the
  // language where the game keeps it.
  const offline = readFileSync(join(CLIENT, 'offline.html'), 'utf8');
  assert.match(offline, /<script src="\/offline\.js" defer><\/script>/);
  const texts = [...offline.matchAll(/<(p|a) class="(?:system-text|button[^"]*)"[^>]*>/g)];
  assert.equal(texts.length, 3);
  for (const [tag] of texts) assert.match(tag, /data-en="[^"]+"/, tag);
  const offlineScript = readFileSync(join(CLIENT, 'offline.js'), 'utf8');
  assert.ok(offlineScript.includes(`'${key('LANGUAGE_KEY')}'`) && offlineScript.includes(`'${key('ENGLISH_KEY')}'`));
  // insightrpg.com/en: an English preview, then the game in English.
  const tagline = english['Wejrzyj do miejsca pełnego wyzwań dla śmiałków'];
  const page = readFileSync(join(CLIENT, 'en.html'), 'utf8');
  assert.ok(page.includes(`<meta property="og:description" content="${tagline}">`));
  assert.ok(page.includes(`<meta name="description" content="${tagline}">`));
  assert.match(page, /<meta property="og:url" content="https:\/\/insightrpg\.com\/en">/);
  assert.match(page, /<html lang="en">/);
  assert.doesNotMatch(page, /[ąćęłńóśźż]/i);
  const go = readFileSync(join(CLIENT, 'en.js'), 'utf8');
  assert.ok(go.includes(`localStorage.setItem('${key('LANGUAGE_KEY')}', 'en')`));
  assert.match(go, /location\.replace\('\/'\)/);
  // The installed app's description, the same app in either language.
  const polish = JSON.parse(readFileSync(join(CLIENT, 'manifest.webmanifest'), 'utf8'));
  const englishManifest = JSON.parse(readFileSync(join(CLIENT, 'manifest-en.webmanifest'), 'utf8'));
  assert.deepEqual({ ...englishManifest, description: polish.description, lang: polish.lang }, polish);
  assert.equal(englishManifest.description, tagline);
  assert.equal(englishManifest.lang, 'en');
  assert.match(i18n, /manifest-en\.webmanifest/);
});

// The server's answers as a phone may get them: turned down, lost, or late.
test('the page asks for the character again when an action finds it out of date', async () => {
  const { call, state } = await import('../src/client/state.js');
  const saved = globalThis.fetch;
  const asked = [];
  const answers = [];
  globalThis.fetch = (path, options) => {
    asked.push(`${options.method} ${path}`);
    return answers.shift()();
  };
  const answer = (status, body) => () => Promise.resolve(new Response(JSON.stringify(body), { status }));
  const settled = () => new Promise((resolve) => setTimeout(resolve, 0));
  const home = { name: 'Ala', activity: null, serverTime: 1 };
  const away = { name: 'Ala', activity: { areaId: 'windfalls-edge' }, serverTime: 2 };
  try {
    state.character = home;
    // "Wyrusz" again after the first answer was lost: the server says the
    // character is away, and the page catches up.
    answers.push(answer(409, { error: { code: 'busy', message: 'Postać jest na wyprawie. Poczekaj na jej koniec.' } }), answer(200, { character: away }));
    await assert.rejects(call('POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 30 }), { code: 'busy' });
    await settled();
    assert.deepEqual(asked, ['POST /api/hunts', 'GET /api/character']);
    assert.deepEqual(state.character, away);

    // A lost answer does the same.
    state.character = home;
    asked.length = 0;
    answers.push(() => Promise.reject(new TypeError('Failed to fetch')), answer(200, { character: away }));
    await assert.rejects(call('POST', '/api/hunts', {}), { code: 'network' });
    await settled();
    assert.deepEqual(asked, ['POST /api/hunts', 'GET /api/character']);
    assert.deepEqual(state.character, away);

    // A read sent before an action's answer, back after it, leaves it shown.
    state.character = home;
    let late;
    answers.push(() => new Promise((resolve) => (late = resolve)), answer(200, { character: away }));
    const read = call('GET', '/api/character');
    await call('POST', '/api/hunts', {});
    late(new Response(JSON.stringify({ character: home }), { status: 200 }));
    await read;
    assert.deepEqual(state.character, away);

    // A read turned down, or a page without a character, asks for nothing more.
    asked.length = 0;
    answers.push(answer(409, { error: { code: 'conflict', message: '…' } }));
    await assert.rejects(call('GET', '/api/quests'));
    state.character = null;
    answers.push(answer(409, { error: { code: 'name_taken', message: '…' } }));
    await assert.rejects(call('POST', '/api/character', {}));
    await settled();
    assert.deepEqual(asked, ['GET /api/quests', 'POST /api/character']);
  } finally {
    globalThis.fetch = saved;
    state.character = null;
  }
});

// "Zgłoś błąd" with a screenshot (screenshot.js): a FormData goes as it is,
// and the browser writes its Content-Type with the parts' boundary; any
// other body goes as JSON, as before.
test('a form with a file goes as it is, without a Content-Type of its own', async () => {
  const { request } = await import('../src/client/api.js');
  const saved = globalThis.fetch;
  const sent = [];
  globalThis.fetch = (path, options) => {
    sent.push(options);
    return Promise.resolve(new Response('{"ok":true}', { status: 201 }));
  };
  try {
    const form = new FormData();
    form.append('text', 'Ekran przestał reagować.');
    form.append('image', new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }), 'zrzut-ekranu.jpg');
    assert.deepEqual(await request('POST', '/api/bug-reports', form), { ok: true });
    await request('POST', '/api/bug-reports', { text: 'Ekran przestał reagować.' });
    assert.equal(sent[0].body, form);
    assert.equal(sent[0].headers['Content-Type'], undefined);
    assert.equal(sent[1].headers['Content-Type'], 'application/json');
    assert.equal(sent[1].body, '{"text":"Ekran przestał reagować."}');
  } finally {
    globalThis.fetch = saved;
  }
});

// The Targowisko's filters (the author: "filtracja potrzebna w targowisku zeby
// szukac itemy po kategoriach"): only the categories with goods, in the
// order of the data, each with how many, and "Wszystko" once the chosen one
// is empty.
test("the Targowisko's filters show the categories with goods, in order, with how many", async () => {
  const { ALL, categoriesOf, goodsCategory, inCategory, shownCategory } = await import('../src/client/categories.js');
  const slots = JSON.parse(readFileSync(new URL('../data/slots.json', import.meta.url), 'utf8'));
  const slotName = (id) => slots.find((slot) => slot.id === id).name;
  const order = [...slots.map(({ id, name }) => ({ id, name })), { id: 'herb', name: 'Zioła' }, { id: 'material', name: 'Materiały' }];
  const goods = [
    { kind: 'item', item: { slot: 'weapon', name: 'Miecz' } },
    { kind: 'herb', key: 'comfrey' },
    { kind: 'item', item: { slot: 'head', name: 'Kaptur' } },
    { kind: 'item', item: { slot: 'weapon', name: 'Topór' } },
  ];
  const categories = categoriesOf(goods, goodsCategory, order);
  assert.deepEqual(
    categories.map(({ id, name, count }) => [id, name, count]),
    [
      ['head', slotName('head'), 1],
      ['weapon', slotName('weapon'), 2],
      ['herb', 'Zioła', 1],
    ],
  );
  // One category in the order of the list, or all of them.
  assert.deepEqual(inCategory(goods, goodsCategory, 'weapon').map((one) => one.item.name), ['Miecz', 'Topór']);
  assert.equal(inCategory(goods, goodsCategory, ALL), goods);
  // The choice stays while its category has goods, and gives way after.
  assert.equal(shownCategory('weapon', categories), 'weapon');
  assert.equal(shownCategory(ALL, categories), ALL);
  assert.equal(shownCategory('material', categories), ALL);
  assert.equal(shownCategory('weapon', categoriesOf(goods.slice(1, 3), goodsCategory, order)), ALL);
  assert.deepEqual(categoriesOf([], goodsCategory, order), []);
});

// Just enough of the page's DOM for what dom.js builds (h, icon): elements
// with a tag, a class, attributes, text and children, found again by a test.
function fakeDocument() {
  class FakeNode {
    constructor(tag) {
      this.tagName = tag.toUpperCase();
      this.childNodes = [];
      this.attributes = {};
      this.dataset = {};
      this.className = '';
      this.style = { setProperty() {} };
      this.listeners = {};
    }
    append(...nodes) {
      this.childNodes.push(...nodes);
    }
    replaceChildren(...nodes) {
      this.childNodes = nodes;
    }
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    }
    addEventListener(type, listener) {
      (this.listeners[type] ??= []).push(listener);
    }
    get textContent() {
      return this.childNodes.map((node) => (typeof node === 'string' ? node : node.textContent)).join('');
    }
    set textContent(text) {
      this.childNodes = [String(text)];
    }
    // The elements below this one that `match`, in order.
    find(match) {
      return this.childNodes.flatMap((node) => (typeof node === 'string' ? [] : [...(match(node) ? [node] : []), ...node.find(match)]));
    }
  }
  const saved = { Node: globalThis.Node, document: globalThis.document };
  globalThis.Node = FakeNode;
  globalThis.document = { createElement: (tag) => new FakeNode(tag), createElementNS: (namespace, tag) => new FakeNode(tag) };
  return () => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
  };
}

// The Duch budowniczego's bust comes later, once the author approves it
// (residents/builder-spirit.png): until it is on the art list, his part of
// the Kamień węgielny's window stands without it, with all the rest.
test("the Duch budowniczego's part of the stone's window works without his bust", async () => {
  const { SPRITES, residentBust } = await import('../src/client/art.js');
  const { saleRange, spiritGold, spiritPart, surplusOf } = await import('../src/client/builder-spirit.js');
  const camp = JSON.parse(readFileSync(new URL('../data/camp.json', import.meta.url), 'utf8'));
  const data = camp.cornerstone.spirit;
  const spirit = {
    art: data.art,
    name: data.name,
    line: data.line,
    lot: data.lot,
    texts: data.texts,
    goods: [
      { id: 'wood', name: 'Drewno', have: 5000, gold: data.gold.wood, least: Math.ceil(data.lot / data.gold.wood), need: 3200 },
      { id: 'stone', name: 'Kamień', have: 3, gold: data.gold.stone, least: Math.ceil(data.lot / data.gold.stone), need: 0 },
      { id: 'iron-ore', name: 'Ruda żelaza', have: 0, gold: data.gold['iron-ore'], least: Math.ceil(data.lot / data.gold['iron-ore']), need: 0 },
    ],
  };
  const restore = fakeDocument();
  try {
    const listed = SPRITES.residents.ids.includes(spirit.art);
    if (!listed) assert.equal(residentBust(spirit.art), null);
    const sold = [];
    const part = spiritPart(spirit, (good) => sold.push(good.id));
    const text = part.textContent;
    // His bust only once it is on the list, never an empty frame.
    assert.equal(part.find((node) => node.className === 'settlement-resident-bust').length, listed ? 1 : 0);
    assert.ok(text.includes(spirit.name) && text.includes(spirit.line), text);
    const rows = part.find((node) => node.tagName === 'LI');
    assert.equal(rows.length, 3);
    // The price of each, what the builds still need only where they need
    // some, and why too few pieces cannot be sold.
    assert.match(rows[0].textContent, new RegExp(`${data.gold.wood} zł za ${data.lot} szt\\.`));
    assert.match(rows[0].textContent, /potrzeba jeszcze 3\s?200 szt\./);
    assert.doesNotMatch(rows[1].textContent, /potrzeba/);
    assert.match(rows[1].textContent, new RegExp(`Za mniej niż ${spirit.goods[1].least} szt\\.`));
    assert.doesNotMatch(rows[2].textContent, /Za mniej/);
    const buttons = rows.map((row) => row.find((node) => node.tagName === 'BUTTON')[0]);
    assert.deepEqual(buttons.map((button) => button.textContent), ['Sprzedaj', 'Sprzedaj', 'Sprzedaj']);
    assert.deepEqual(buttons.map((button) => 'disabled' in button.attributes), [false, true, true]);
    buttons[0].listeners.click[0]();
    assert.deepEqual(sold, ['wood']);
  } finally {
    restore();
  }
  // The sale's numbers as the server counts them: from the fewest pieces
  // that bring a coin to all, rounded down, and the surplus over the need.
  const [wood, stone] = spirit.goods;
  assert.deepEqual(saleRange(wood), { least: wood.least, most: 5000 });
  assert.equal(saleRange(stone), null);
  assert.equal(spiritGold(wood, data.lot, wood.least), 1);
  assert.equal(spiritGold(wood, data.lot, wood.least - 1), 0);
  assert.equal(spiritGold(wood, data.lot, 1800), Math.floor((1800 * data.gold.wood) / data.lot));
  assert.equal(surplusOf(wood), 1800);
  assert.equal(surplusOf({ ...wood, need: 0 }), null);
  assert.equal(surplusOf({ ...wood, need: 4995 }), null);
});
