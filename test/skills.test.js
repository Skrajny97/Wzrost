import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  applyHunt,
  classXpToNext,
  createRng,
  evolutionBlock,
  learnBlock,
  monsterCombatant,
  playerCombatant,
  raiseBlock,
  simulateFight,
  skillParams,
  skillPoints,
  skillView,
  sharedBonus,
  skillsView,
} from '../src/engine/index.js';
import { typicalCharacter } from '../tools/simulate.mjs';
import { content } from './helpers/content.js';

// A character of a class at class level 10 or more with one skill learned.
function withSkill(classId, skillId, { level = 12, skillLevel = 1, hpShare } = {}) {
  const { character, equipped } = typicalCharacter(classId, level, content);
  const skilled = { ...character, classLevel: Math.max(character.classLevel, 10), skills: skillId ? { [skillId]: skillLevel } : {} };
  const unit = playerCombatant({ character: skilled, equipped, name: 'Mira' }, content);
  return hpShare === undefined ? unit : { ...unit, hp: Math.round(unit.maxHp * hpShare) };
}
const foe = (monsterId, level, id, extra = {}) => ({ ...monsterCombatant({ monsterId, level, id, name: `Wróg ${id}`, ...extra }, content) });
// A foe that does not fall quickly, so a fight lasts many moves.
const sturdy = (monsterId, level, id, extra) => ({ ...foe(monsterId, level, id, extra), hp: 5000, maxHp: 5000 });
const fight = (seed, allies, enemies) => simulateFight({ allies, enemies, rng: createRng(seed), content, record: true });
// The player's moves in order: each is one blow (or a heal) it made.
const moves = (result) => result.events.filter((event) => event.actor === 'a0' && ['hit', 'crit', 'dodge', 'heal'].includes(event.kind) && !event.counter);

describe('skills', () => {
  test('a skill grows evenly from level 1 to 20', () => {
    const strike = content.skillsById['power-strike'];
    assert.equal(skillParams(strike, 1, content).power, 1.4);
    assert.ok(Math.abs(skillParams(strike, 20, content).power - 2.0) < 1e-9);
    assert.ok(Math.abs(skillParams(strike, 10, content).power - (1.4 + 0.6 * (9 / 19))) < 1e-9);
    assert.ok(Math.abs(skillParams(strike, 99, content).power - 2.0) < 1e-9);
    assert.equal(skillParams(strike, 5, content).armorIgnore > skillParams(strike, 4, content).armorIgnore, true);
  });

  test('every Skill Point shows on the card: each next level reads differently', () => {
    for (const skill of content.skills) {
      for (let level = 1; level < content.balance.skills.maxLevel; level++) {
        const view = skillView(skill, level, content);
        assert.notEqual(view.next, view.effect, `${skill.id}, poziom ${level}`);
      }
    }
  });

  test('a mana shield takes its share of mana at once and holds what that makes', () => {
    const result = fight('osłona-koszt', [withSkill('mage', 'mana-shield', { hpShare: 0.45 })], [sturdy('boar', 12, 'e0')]);
    const mage = withSkill('mage', 'mana-shield');
    // A point of mana for a point of damage.
    const { pool } = skillParams(content.skillsById['mana-shield'], 1, content);
    const points = Math.round(mage.maxMana * pool);
    const on = result.events.find((event) => event.kind === 'skill' && event.skill === 'mana-shield');
    assert.equal(on.shield, points);
    const absorbed = result.events.filter((event) => event.target === 'a0' && event.absorbed > 0).reduce((sum, event) => sum + event.absorbed, 0);
    assert.ok(absorbed > 0 && absorbed <= points);
    assert.equal(skillView(content.skillsById['mana-shield'], 1, content).cost, `Koszt: ${Math.round(pool * 100)}% maks. many, raz na walkę.`);
  });

  test('Skill Points come with each class level from the tenth to the 49th, one per level of a skill', () => {
    assert.deepEqual(skillPoints({ classLevel: 9, skills: {} }, content), { earned: 0, spent: 0, free: 0 });
    assert.deepEqual(skillPoints({ classLevel: 10, skills: {} }, content), { earned: 1, spent: 0, free: 1 });
    // The author: the point of class level 10 opens the main path, with no
    // bonus at the start.
    assert.deepEqual(skillPoints({ classLevel: 10, skills: { fireball: 1 } }, content), { earned: 1, spent: 1, free: 0 });
    assert.equal(skillPoints({ classLevel: 11, skills: { fireball: 1 } }, content).free, 1);
    assert.equal(skillPoints({ classLevel: 15, skills: {} }, content).free, 6);
    assert.deepEqual(skillPoints({ classLevel: 15, skills: { 'power-strike': 3 } }, content), { earned: 6, spent: 3, free: 3 });
    // The second skill's first level takes a point too.
    assert.deepEqual(skillPoints({ classLevel: 15, skills: { 'power-strike': 3, unyielding: 1 } }, content), { earned: 6, spent: 4, free: 2 });
    // The author: none at 50, so the 40 of levels 10 to 49 fill both paths
    // to 20, with none left.
    assert.equal(skillPoints({ classLevel: 49, skills: {} }, content).earned, 40);
    assert.deepEqual(skillPoints({ classLevel: 50, skills: { 'power-strike': 20, unyielding: 20 } }, content), { earned: 40, spent: 40, free: 0 });
    assert.equal(skillPoints({ classLevel: 120, skills: { 'power-strike': 20, unyielding: 20 } }, content).free, 0);
    const toNext = (level) => classXpToNext(level, content);
    const at50 = applyHunt({ classId: 'warrior', level: 50, xp: 0, classLevel: 49, classXp: 0, points: {}, skills: { 'power-strike': 20, unyielding: 20 } }, { xp: toNext(49), result: 'success' }, content);
    assert.equal(at50.classLevel, 50);
    assert.ok(!at50.messages.some((message) => message.startsWith('Zdobyto Punkty Umiejętności')));
  });

  test('the class level that opens the skills brings their first point, and each one after it another', () => {
    const mage = (classLevel) => ({ classId: 'mage', level: 9, xp: 0, classLevel, classXp: 0, points: {}, skills: {} });
    const opened = applyHunt(mage(9), { xp: classXpToNext(9, content), result: 'success' }, content);
    assert.equal(opened.classLevel, 10);
    assert.ok(opened.messages.includes('Zdobyto Punkty Umiejętności: +1'));
    const next = applyHunt(mage(10), { xp: classXpToNext(10, content), result: 'success' }, content);
    assert.equal(next.classLevel, 11);
    assert.ok(next.messages.includes('Zdobyto Punkty Umiejętności: +1'));
  });

  test('a class picks its main path at class level 10 for its first point, may add a second from 11 for another, and the third closes', () => {
    const warrior = (classLevel, skills = {}) => ({ classId: 'warrior', classLevel, skills });
    assert.equal(learnBlock(warrior(9), 'power-strike', content).code, 'class_level');
    assert.equal(learnBlock(warrior(10), 'fireball', content).code, 'unknown_skill');
    assert.equal(learnBlock(warrior(10), 'power-strike', content), null);
    assert.equal(learnBlock(warrior(30, { 'power-strike': 1 }), 'power-strike', content).code, 'known');
    assert.equal(learnBlock(warrior(10, { 'power-strike': 1 }), 'wide-sweep', content).code, 'class_level');
    assert.equal(learnBlock(warrior(11, { 'power-strike': 3 }), 'wide-sweep', content).code, 'no_points');
    assert.equal(learnBlock(warrior(11, { 'power-strike': 2 }), 'wide-sweep', content).code, 'no_points');
    assert.equal(learnBlock(warrior(11, { 'power-strike': 1 }), 'wide-sweep', content), null);
    assert.equal(learnBlock(warrior(12, { 'power-strike': 1 }), 'wide-sweep', content), null);
    assert.equal(learnBlock(warrior(30, { 'wide-sweep': 1 }), 'power-strike', content), null);
    assert.equal(learnBlock(warrior(30, { 'power-strike': 1, unyielding: 1 }), 'wide-sweep', content).code, 'chosen');
    const states = (character) => skillsView(character, content).pools[0].options.map((skill) => skill.state);
    assert.deepEqual(states(warrior(10)), ['pick', 'pick', 'pick']);
    assert.deepEqual(states(warrior(10, { 'power-strike': 1 })), ['main', 'soon', 'soon']);
    assert.deepEqual(states(warrior(11, { 'power-strike': 3 })), ['main', 'points', 'points']);
    assert.deepEqual(states(warrior(12, { 'power-strike': 1 })), ['main', 'pick', 'pick']);
    // The point of class level 10 goes to the main path; at 11 there are two
    // before the first choice and one after it.
    assert.equal(skillsView(warrior(10, { 'power-strike': 1 }), content).points, 0);
    assert.equal(skillsView(warrior(11), content).points, 2);
    assert.equal(skillsView(warrior(11, { 'power-strike': 1 }), content).points, 1);
    assert.deepEqual(states(warrior(11, { 'power-strike': 1 })), ['main', 'pick', 'pick']);
    // The first learned is the main path, whatever its place on the list.
    assert.deepEqual(states(warrior(30, { unyielding: 1, 'power-strike': 4 })), ['second', 'closed', 'main']);
    assert.deepEqual(skillsView(warrior(10), content).pools[0].options.map((skill) => skill.path), ['Barbarzyńca', 'Gladiator', 'Strażnik']);
    // The author: Druid will be an evolution of the Arkanista, so the frost
    // path is the Władca Lodu.
    const mage = { classId: 'mage', classLevel: 10, skills: {} };
    assert.deepEqual(skillsView(mage, content).pools[0].options.map((skill) => skill.path), ['Elementalista', 'Władca Lodu', 'Arkanista']);
    assert.equal(raiseBlock(warrior(10, { 'power-strike': 1 }), 'power-strike', content).code, 'no_points');
    assert.equal(raiseBlock(warrior(11, { 'power-strike': 1 }), 'power-strike', content), null);
    assert.equal(raiseBlock(warrior(10, { 'power-strike': 2 }), 'power-strike', content).code, 'no_points');
    assert.equal(raiseBlock(warrior(12, { 'power-strike': 1 }), 'power-strike', content), null);
    assert.equal(raiseBlock(warrior(40, { 'power-strike': 20 }), 'power-strike', content).code, 'max_level');
    assert.equal(raiseBlock(warrior(40), 'power-strike', content).code, 'not_learned');

    const open = skillsView(warrior(10), content);
    assert.equal(open.ready, true);
    assert.deepEqual(open.pools[0].options.map((skill) => skill.name), ['Potężny cios', 'Szeroki zamach', 'Nieugięty']);
    assert.match(open.pools[0].options[0].effect, /^Cios za 140% obrażeń, który pomija 20% pancerza celu\.$/);
    assert.equal(open.pools[0].options[0].cost, 'Koszt: 10 many, najwyżej co 3. ruch.');
    const chosen = skillsView(warrior(12, { 'power-strike': 2 }), content);
    assert.deepEqual(chosen.pools[0].chosen, ['power-strike']);
    assert.equal(chosen.points, 1);
    assert.equal(chosen.ready, true);
    assert.match(chosen.pools[0].options[0].next, /^Cios za 14\d% obrażeń/);
    assert.equal(skillsView(warrior(11, { 'power-strike': 3 }), content).ready, false);
    assert.equal(skillsView(warrior(9), content).ready, false);
  });

  test('by class level 50, the first evolution, both paths are chosen and the Skill Points spent; until then the class waits there and keeps its XP', () => {
    const warrior = (classLevel, skills, classXp = 0) => ({ classId: 'warrior', level: 50, xp: 0, classLevel, classXp, points: {}, skills });
    assert.equal(evolutionBlock(warrior(12, {}), content).code, 'second_path');
    assert.equal(evolutionBlock(warrior(30, { 'power-strike': 20 }), content).code, 'second_path');
    assert.equal(evolutionBlock(warrior(30, { 'power-strike': 10, unyielding: 1 }), content).code, 'skill_points');
    // Counted with the points of level 50: at 47 with none left, those of 48
    // and 49 are still due.
    assert.equal(skillPoints(warrior(47, { 'power-strike': 20, unyielding: 18 }), content).free, 0);
    assert.equal(evolutionBlock(warrior(47, { 'power-strike': 20, unyielding: 18 }), content).code, 'skill_points');
    // Both at 20 take all the points, so nothing holds the class, and a
    // class already past 50 waits for nothing.
    assert.equal(evolutionBlock(warrior(49, { 'power-strike': 20, unyielding: 20 }), content), null);
    assert.equal(evolutionBlock(warrior(50, { 'power-strike': 20, unyielding: 20 }), content), null);
    assert.equal(evolutionBlock(warrior(60, { 'power-strike': 20 }), content), null);

    const toNext = (level) => classXpToNext(level, content);
    const alone = warrior(49, { 'power-strike': 20 });
    const gained = toNext(49) + toNext(50) + toNext(51) + 7;
    const held = applyHunt(alone, { xp: gained, result: 'success' }, content);
    assert.equal(held.classLevel, 50);
    assert.equal(held.classXp, gained - toNext(49));
    assert.ok(held.messages.includes('Wojownik: klasa czeka na 50. poziomie, u progu ewolucji. Urośnie dalej, gdy w Umiejętnościach wybierzesz ścieżkę poboczną. Zdobyte XP klasy nie przepada.'));
    assert.deepEqual(skillsView({ ...alone, classLevel: 50 }, content).evolution, { level: 50, need: 'second_path' });
    // Waiting, it keeps adding up and says so after each exploration.
    const still = applyHunt({ ...alone, classLevel: 50, classXp: held.classXp }, { xp: 100, result: 'success' }, content);
    assert.equal(still.classLevel, 50);
    assert.equal(still.classXp, held.classXp + 100);
    assert.ok(still.messages.some((message) => message.includes('klasa czeka')));
    // Ready, the XP it kept carries it on with the next exploration.
    const ready = { ...alone, classLevel: 50, classXp: held.classXp, skills: { 'power-strike': 20, unyielding: 20 } };
    assert.deepEqual(skillsView(ready, content).evolution, { level: 50, need: null });
    const after = applyHunt(ready, { xp: 0, result: 'success' }, content);
    assert.equal(after.classLevel, 52);
    assert.equal(after.classXp, 7);
    assert.ok(!after.messages.some((message) => message.includes('klasa czeka')));
    // The points: the same wait, with its own words.
    const points = applyHunt(warrior(49, { 'power-strike': 20, unyielding: 10 }), { xp: toNext(49) + toNext(50), result: 'success' }, content);
    assert.equal(points.classLevel, 50);
    assert.ok(points.messages.some((message) => message.includes('gdy w Umiejętnościach rozdasz Punkty Umiejętności')));
    // Below 50 a class grows as before, and one past it is not held.
    assert.equal(applyHunt(warrior(30, { 'power-strike': 20 }), { xp: toNext(30), result: 'success' }, content).classLevel, 31);
    assert.equal(applyHunt(warrior(60, { 'power-strike': 20 }), { xp: toNext(60), result: 'success' }, content).classLevel, 61);
    // The progression simulator may measure a skill alone, without the wait.
    assert.equal(applyHunt(alone, { xp: gained, result: 'success' }, content, { evolutionGate: false }).classLevel, 52);
  });

  test('mana grows with each character level, so every class can use its skills', () => {
    const warrior = (level) => playerCombatant({ character: { classId: 'warrior', level, classLevel: 1, points: {}, position: 'front' }, equipped: [], name: 'Mira' }, content);
    assert.equal(warrior(11).maxMana - warrior(10).maxMana, content.balance.character.manaPerLevel);
  });

  test('a ready strike skill replaces a blow, then waits for its cooldown', () => {
    const result = fight('zamach', [withSkill('warrior', 'power-strike')], [sturdy('boar', 12, 'e0')]);
    const used = moves(result).map((event) => event.skill === 'power-strike');
    assert.equal(used[0], true, 'the first move');
    for (let i = 1; i < used.length; i++) {
      if (used[i]) assert.ok(!used[i - 1] && !used[i - 2], `move ${i}: the cooldown is 3 moves`);
    }
    const unit = withSkill('warrior', 'power-strike');
    assert.ok(used.filter(Boolean).length <= Math.floor(unit.maxMana / content.skillsById['power-strike'].mana), 'mana runs out');
    assert.ok(used.filter(Boolean).length >= 2);
    assert.match(moves(result)[0].text, /Potężny cios/);
  });

  test('a sweep hits every enemy, a lone one harder', () => {
    const three = fight('grad', [withSkill('archer', 'arrow-rain')], [0, 1, 2].map((i) => sturdy('wolf', 12, `e${i}`)));
    const start = three.events.findIndex((event) => event.kind === 'skill' && event.skill === 'arrow-rain');
    assert.ok(start >= 0);
    const blows = three.events.slice(start + 1, start + 4);
    assert.deepEqual(blows.map((event) => event.target).sort(), ['e0', 'e1', 'e2']);
    assert.ok(blows.every((event) => event.t === three.events[start].t && event.skill === 'arrow-rain'));
  });

  test('a prayer heals the wounded cleric a lot on its move, once a fight', () => {
    const cleric = withSkill('cleric', 'prayer-of-health', { hpShare: 0.3 });
    const result = fight('modlitwa', [cleric], [sturdy('boar', 12, 'e0')]);
    const prayers = result.events.filter((event) => event.kind === 'heal' && event.skill === 'prayer-of-health');
    assert.equal(prayers.length, 1);
    const { heal } = skillParams(content.skillsById['prayer-of-health'], 1, content);
    assert.ok(prayers[0].amount >= Math.round(heal * cleric.maxHp));
    assert.match(prayers[0].text, /Modlitwa o zdrowie/);
    assert.equal(skillView(content.skillsById['prayer-of-health'], 1, content).cost, 'Koszt: 14 many, raz na walkę.');
    // It heals more than the warrior's guard, which gives armour instead.
    assert.ok(heal > skillParams(content.skillsById.unyielding, 20, content).heal * 2);
  });

  test('a guard wakes once below its mark: a little HP back and much more armour for a few of its moves', () => {
    let woke = 0;
    let faded = 0;
    const { heal, armor, turns } = skillParams(content.skillsById.unyielding, 1, content);
    for (let i = 0; i < 6; i++) {
      const warrior = withSkill('warrior', 'unyielding', { hpShare: 0.45 });
      const result = fight(`tarcza:${i}`, [warrior], [sturdy('boar', 14, 'e0')]);
      const guards = result.events.filter((event) => event.skill === 'unyielding' && event.kind === 'heal');
      assert.ok(guards.length <= 1);
      woke += guards.length;
      if (guards.length === 0) continue;
      const [guard] = guards;
      assert.ok(guard.amount <= Math.round(heal * warrior.maxHp));
      assert.deepEqual([guard.armor, guard.turns], [Math.round(armor * 100), Math.round(turns)]);
      const fade = result.events.findIndex((event) => event.kind === 'fade' && event.skill === 'unyielding');
      if (fade < 0) continue;
      faded += 1;
      // It fades as the warrior's move after its last guarded one begins.
      const start = result.events.indexOf(guard);
      const own = result.events.slice(start, fade).filter((event) => event.actor === 'a0' && ['hit', 'crit', 'dodge'].includes(event.kind) && !event.counter);
      assert.equal(own.length, Math.round(turns));
    }
    assert.ok(woke > 0 && faded > 0);
  });

  test('an exorcism may paralyse, a fireball burns for 2 moves, then 3', () => {
    let paralysed = 0;
    for (let i = 0; i < 6; i++) {
      const result = fight(`egzorcyzm:${i}`, [withSkill('cleric', 'exorcism', { level: 20, skillLevel: 20 })], [0, 1, 2].map((j) => sturdy('wolf', 18, `e${j}`)));
      paralysed += result.events.filter((event) => event.kind === 'stun' && event.label === 'sparaliżowany').length;
    }
    assert.ok(paralysed > 0);
    const fireball = content.skillsById.fireball;
    assert.deepEqual([1, 10, 11, 20].map((level) => Math.round(skillParams(fireball, level, content).dotTicks)), [2, 2, 3, 3]);
  });

  test('a blessing shares its bonus out over the party', () => {
    assert.deepEqual([1, 2, 3].map((members) => sharedBonus(members, content.skillsById.blessing.params.crowd)), [1, 2 / 3, 0.5]);
  });

  test('a mana shield takes blows for mana, and every blow tells what it can still take', () => {
    const result = fight('osłona', [withSkill('mage', 'mana-shield', { hpShare: 0.55 })], [sturdy('boar', 12, 'e0')]);
    const on = result.events.findIndex((event) => event.kind === 'skill' && event.skill === 'mana-shield');
    assert.ok(on >= 0);
    assert.ok(result.events[on].shield > 0);
    assert.ok(result.events.slice(on).some((event) => event.target === 'a0' && event.absorbed > 0));
    assert.ok(result.events.slice(0, on).every((event) => event.shield === undefined));
    // What is left falls by what a blow took, or a point more, as mana is
    // paid in whole points.
    let left = result.events[on].shield;
    for (const event of result.events.slice(on + 1).filter((candidate) => candidate.target === 'a0' && candidate.shield !== undefined)) {
      const taken = event.absorbed ?? 0;
      assert.ok(event.shield <= left - taken && event.shield >= left - taken - 1, `${left} − ${taken} → ${event.shield}`);
      left = event.shield;
    }
  });

  test('the dance of shadows dodges more and strikes back', () => {
    let counters = 0;
    for (let i = 0; i < 8; i++) {
      const result = fight(`taniec:${i}`, [withSkill('shadow', 'shadow-dance', { hpShare: 0.45 })], [sturdy('wolf', 12, 'e0')]);
      counters += result.events.filter((event) => event.counter && event.actor === 'a0').length;
    }
    assert.ok(counters > 0);
  });

  test('a blessing and a coated blade work from the start, and the account says what they give', () => {
    const blessed = fight('błogosławieństwo', [withSkill('cleric', 'blessing')], [sturdy('boar', 12, 'e0')]);
    assert.equal(blessed.events[0].kind, 'skill');
    assert.equal(blessed.events[0].skill, 'blessing');
    assert.equal(blessed.events[0].t, 0);
    // Alone, the cleric has the whole bonus of level 1.
    assert.equal(blessed.events[0].text, 'Mira: Błogosławieństwo. Do końca walki pancerz +20%, odporności +20%, obrażenia +8%.');
    const coated = fight('jad', [withSkill('shadow', 'poisoned-blade')], [sturdy('boar', 12, 'e0')]);
    assert.equal(coated.events[0].skill, 'poisoned-blade');
    assert.equal(coated.events[0].text, 'Mira: Zatrute ostrze. Do końca walki każdy cios ma 30% szans na Zatrucie: 15% obrażeń ciosu co ruch przez 3 ruchy.');
    assert.ok(coated.events.some((event) => event.kind === 'effect' && event.actor === 'a0' && event.effect === 'Zatrucie'));
    // So do a mana shield and the dance of shadows when they wake.
    const shielded = fight('osłona-opis', [withSkill('mage', 'mana-shield', { hpShare: 0.45 })], [sturdy('boar', 12, 'e0')]);
    const shield = shielded.events.find((event) => event.kind === 'skill' && event.skill === 'mana-shield');
    assert.equal(shield.text, `Mira: Osłona many. Osłona przyjmie ${shield.shield} obrażeń, tyle, ile wzięła many.`);
    const danced = fight('taniec-opis', [withSkill('shadow', 'shadow-dance', { hpShare: 0.45 })], [sturdy('wolf', 12, 'e0')]);
    const dance = danced.events.find((event) => event.kind === 'skill' && event.skill === 'shadow-dance');
    assert.equal(dance.text, 'Mira: Taniec cieni. Przez 5 ciosów wrogów unik rośnie o 40 pkt proc., a każdy unik daje kontrę za 80% obrażeń.');
  });

  test('a pinning shot takes a move, a frost gust slows everyone', () => {
    const pinned = fight('szpila', [withSkill('archer', 'pinning-shot')], [sturdy('wolf', 12, 'e0')]);
    assert.ok(pinned.events.some((event) => event.kind === 'stun' && event.target === 'e0'));
    const frozen = fight('mróz', [withSkill('mage', 'frost-gust')], [0, 1].map((i) => sturdy('wolf', 12, `e${i}`)));
    const slow = frozen.events.find((event) => event.kind === 'slow');
    assert.deepEqual(slow.targets, ['e0', 'e1']);
  });

  test('a fireball burns with fire whatever the staff', () => {
    let burnt = 0;
    for (let i = 0; i < 6; i++) {
      const result = fight(`ogień:${i}`, [withSkill('mage', 'fireball')], [sturdy('boar', 12, 'e0')]);
      burnt += result.events.filter((event) => event.kind === 'effect' && event.actor === 'a0' && event.effect === 'Oparzenie').length;
    }
    assert.ok(burnt > 0);
  });

  test('a backstab strikes the enemy standing furthest back, always critically', () => {
    const enemies = [sturdy('wolf', 12, 'e0', { position: 'front' }), sturdy('wolf', 12, 'e1', { position: 'back' })];
    const result = fight('plecy', [withSkill('shadow', 'backstab')], enemies);
    const stab = result.events.find((event) => event.skill === 'backstab');
    assert.equal(stab.target, 'e1');
    assert.ok(stab.kind === 'crit' || stab.kind === 'dodge');
  });

  test('without a skill the fight is the same as before skills', () => {
    const plain = withSkill('warrior', null);
    const bare = { ...plain, skills: undefined };
    assert.deepEqual(fight('bez', [plain], [foe('wolf', 12, 'e0')]), fight('bez', [bare], [foe('wolf', 12, 'e0')]));
  });
});
