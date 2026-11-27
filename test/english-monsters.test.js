// The creatures in English (a player's report, 27.11.2026: „Potwory z listy
// poszukiwanych nie są tłumaczone niektóre”): every creature of
// data/monsters.json, its elites and champions among them, and every foe of
// the events, the Wanted's outlaws among them, has its English name, its
// three counted forms and its attack's name; the Wanted's named variants
// have theirs; and the Wanted posters of an English page name their
// targets in English, a poster kept with its Polish name and the report of
// an exploration that set out in Polish too.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

import { autoDistribute, simulateHunt, wantedName, wantedPosters } from '../src/engine/index.js';
import { contentIn } from '../src/server/content.js';
import { content, newCharacter } from './helpers/content.js';

const read = (path) => JSON.parse(readFileSync(new URL(`../data/${path}.json`, import.meta.url), 'utf8'));
const monsters = read('monsters');
const foes = read('events').foes;
const english = { ...read('en/monsters'), ...read('en/events').foes };
const variants = read('settlement').wanted.variants;
const englishVariants = read('en/settlement').wanted.variants;
// The names the English keeps as they are (data/en/glossary.json: Turoń,
// Nyja, Marzanna, and the outlaws' own names, Wojsław and Ścibor), and the
// words both languages spell alike.
const kept = new Set(read('en/glossary').groups.flatMap((group) => group.terms.filter((term) => term.en === term.pl || /[ąćęłńóśźż]/i.test(term.en)).map((term) => term.en)));
const ALIKE = new Set(['Tarantula', 'Tarpan']);
const PL = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;
// An English name of a Polish one: there, and not the Polish left as it is.
const englishName = (polish, name) => typeof name === 'string' && name !== '' && ((name !== polish && !PL.test(name)) || kept.has(name) || ALIKE.has(name));

describe('the creatures in English', () => {
  test('every creature, its elites and champions among them, and every foe of the events has its English name, counted forms and attack', () => {
    const missing = [];
    for (const monster of [...monsters, ...foes]) {
      const own = english[monster.id];
      const what = `${monster.id}${monster.elite ? ' (elita)' : ''}${monster.champion ? ' (czempion)' : ''}`;
      if (!englishName(monster.name, own?.name)) missing.push(`${what}: ${own?.name ?? 'brak nazwy'}`);
      // The counted forms of a name kept (Turoń: "Turońs") keep its letters.
      if (own?.counted?.length !== 3 || !own.counted.every((form) => typeof form === 'string' && form !== '' && (!PL.test(form) || kept.has(own.name)))) missing.push(`${what}: counted`);
      if (monster.attack?.name && !own?.attack?.name) missing.push(`${what}: attack`);
    }
    assert.deepEqual(missing, []);
    // The elites and the champions are creatures of the list, so they are
    // named above; each land's and place's has a creature there.
    const regions = read('regions');
    const rare = regions.flatMap((region) => [region.elite, ...region.areas.flatMap((area) => [area.elite, area.champion])]).filter(Boolean);
    assert.ok(rare.length > 30);
    for (const id of rare) assert.ok(english[id]?.name, id);
  });

  test('every Wanted variant and outlaw has its English name', () => {
    const missing = variants.filter((variant) => !englishName(variant.name, englishVariants[variant.monster]?.name)).map((variant) => variant.monster);
    assert.deepEqual(missing, []);
    for (const id of read('settlement').wanted.outlaws) assert.ok(englishName(foes.find((foe) => foe.id === id).name, english[id]?.name), id);
  });
});

describe('the Wanted posters in English', () => {
  const en = contentIn('en');
  const pl = contentIn('pl');

  test('every poster of every class level is named in English, a poster kept with its Polish name too', () => {
    const seen = new Map();
    for (let level = 1; level <= 500; level += 7) {
      for (const day of ['2026-11-05', '2026-11-27']) {
        for (const poster of wantedPosters(level, day, `postać-${level}`, en)) seen.set(`${poster.kind}:${poster.areaId}:${poster.monsterId}`, poster);
      }
    }
    assert.ok(seen.size > 100, `${seen.size}`);
    const polish = [];
    for (const poster of seen.values()) {
      const name = wantedName(poster, en);
      const own = poster.kind === 'outlaw' ? pl.monstersById[poster.monsterId].name : pl.settlement.wanted.variants.find((one) => one.area === poster.areaId).name;
      if (!englishName(own, name)) polish.push(`${poster.monsterId}: ${name}`);
      // Taken while the page was Polish, it reads in English now.
      assert.equal(wantedName({ ...poster, name: own }, en), name);
    }
    assert.deepEqual(polish, []);
  });

  test('an exploration that set out with the Polish name of its poster names its target in English in an English report', () => {
    // Every fight in the poster's place its target's, without the harder
    // explorations (as test/wanted.test.js); the English content's parts
    // read when asked (content.js) come along.
    const changed = {
      balance: { ...en.balance, challenge: { ...en.balance.challenge, fromLevel: Infinity } },
      settlement: { ...en.settlement, wanted: { ...en.settlement.wanted, chance: 1 } },
    };
    const always = Object.defineProperties({}, { ...Object.getOwnPropertyDescriptors(en), ...Object.fromEntries(Object.entries(changed).map(([key, value]) => [key, { value, enumerable: true }])) });
    const character = newCharacter('warrior', { level: 70, classLevel: 47 });
    character.points = autoDistribute(character, content);
    const variant = { id: 'd:spider-gully:tarantula', kind: 'creature', areaId: 'spider-gully', monsterId: 'tarantula', name: 'Krwawa Tarantula', female: true, level: 36 };
    const hunt = simulateHunt({ character, equipped: [], hp: null, name: 'Hunter', areaId: 'spider-gully', minutes: 60, seed: 'trop', wanted: variant }, always);
    const fight = hunt.fights.find((one) => one.wanted);
    const name = en.settlement.wanted.variants.find((one) => one.monster === 'tarantula').name;
    assert.equal(name, 'Blood Tarantula');
    assert.deepEqual(fight.enemies.map((enemy) => enemy.name), [name]);
    const text = hunt.entries.find((entry) => entry.fight === fight.index).text;
    assert.ok(text.includes(name), text);
    assert.doesNotMatch(text, /Krwawa/);
  });
});
