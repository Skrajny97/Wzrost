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
  const regions = JSON.parse(readFileSync(new URL('../data/regions.json', import.meta.url), 'utf8'));
  const areas = regions.flatMap((region) => region.areas.map((area) => area.id));
  assert.deepEqual(areas.filter((id) => !areaArtIds.includes(id)), []);
});

test('every building has its picture and a plot on the camp board, apart from the others', async () => {
  const art = await import('../src/client/camp-art.js');
  const all = JSON.parse(readFileSync(new URL('../data/buildings.json', import.meta.url), 'utf8'));
  const buildings = all.map((building) => building.id);
  assert.deepEqual(buildings.filter((id) => !art.campArtIds.includes(id)), []);
  // The board without the Osada has the camp's own buildings; the taller one
  // with it the Osada's too (the Kwatery).
  for (const tall of [false, true]) {
    const plots = art.campPlots(tall);
    const on = all.filter((building) => tall || !building.settlement).map((building) => building.id);
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
        assert.ok(apart, `${a.id} overlaps ${b.id}${tall ? ' on the taller board' : ''}`);
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
    // The Osada's places and torch, its residents' busts and its board.
    settlement: [...data('settlement').places.map((place) => place.id), ...(data('settlement').torches?.length ? ['torch', 'torch-off'] : [])],
    residents: data('settlement').residents.map((resident) => resident.id),
    // The companions' busts, one for each class and look.
    companions: data('classes').flatMap((cls) => looks.map((look) => `${cls.id}-${look}`)),
    'companion-portraits': data('classes').flatMap((cls) => looks.map((look) => `${cls.id}-${look}`)),
    'settlement-board': ['settlement'],
    // The inner regions' circles and the lands' cards on the Walka screen.
    areas: data('regions').flatMap((region) => region.areas.map((area) => area.id)),
    lands: data('regions').map((region) => region.id),
    // The camp board's ground at the camp's three looks.
    board: ['camp-1', 'camp-2', 'camp-3'],
    'board-tall': ['camp-1', 'camp-2', 'camp-3'],
    // The camp's buildings at their three looks.
    camp: data('buildings').flatMap((building) => [1, 2, 3].map((tier) => `${building.id}-${tier}`)),
    // Zielarstwo's herbs, Alchemia's potions, the professions' squares, the
    // places they work in, the Ewolucja's spring and the Wieże.
    herbs: data('professions').herbs.map((herb) => herb.id),
    potions: data('professions').potions.map((potion) => potion.id),
    professions: data('professions').professions.map((profession) => profession.id),
    places: [...['gathering', 'brewing', 'workshop'].map((work) => data('professions')[work].place.id), data('evolutions').place, ...data('towers').towers.map((tower) => tower.place), data('guilds').place],
    events: data('events').list.map((event) => event.art),
    'event-scenes': data('events').list.map((event) => event.scene),
    // The camp's resources in place of their line icons.
    resources: data('resources').map((resource) => resource.id),
    // Gold, Punkty Czasu and the Encyclopedia's corner.
    icons: ['gold', 'time-points', 'encyclopedia'],
    // The Stajnia's mounts and the looks a mount can wear (each with its
    // trot), and the character riding them, one for each walk.
    mounts: [...new Set([...data('settlement').stable.mounts.map((mount) => mount.id), ...Object.keys(data('animations').walk.mounts)])],
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

test("the narrator's quests sit in the top bar, where his line points", () => {
  const layout = readFileSync(join(CLIENT, 'layout.js'), 'utf8');
  assert.match(layout, /'data-guide': 'quests'/);
  // Between the levels and the gold, with the locked Sklep Systemu beside him.
  assert.match(layout, /h\('div', \{ class: 'topbar-badges' \}, level, classLevel\),\s*h\('div', \{ class: 'topbar-middle' \}, quests, shop\),/);
  assert.match(layout, /'Sklep Systemu dojdzie w jednej z kolejnych aktualizacji\.'/);
  const quests = readFileSync(join(CLIENT, 'quests.js'), 'utf8');
  for (const path of ['/api/quests/claim', '/api/quests/claim-all', '/api/quests/chest']) assert.ok(quests.includes(`'${path}'`), path);
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
  const offline = readFileSync(join(CLIENT, 'offline.html'), 'utf8');
  assert.match(offline, /href="\/styles\.css"/);
  assert.match(offline, /href="\/">Spróbuj ponownie</);
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
