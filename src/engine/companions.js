// Companions (the Osada, part II, questions 104–113): the Karczma's
// innkeeper has four candidates a week, each with a class, a level near the
// character's, two or three traits, two of its class's skills and a short
// story (data/settlement.json, `companions`). A companion hired goes on the
// character's explorations as a second member of the party, with the
// points of its level spread by its class, its skills growing with its
// level, the gear it came with and its traits, and gains XP with the
// character, faster while it is below it. Without wages (question 110).
// Fainted in a fight, it is wounded until the character has rested to full
// HP (the author: "Niech rany towarzyszy goją się wraz z ranami postaci").
//
// Stored in the Osada: { id, name, appearance, classId, level, xp, traits,
// skills, profession, story, gear: [items], wounded, giftWeek }. An
// item of `gear` the player gave from the bag is marked `given`.

import { playerCombatant } from './combatant.js';
import { baseClassLevel, canUse, generateItem } from './items.js';
import { gainXp, xpToNext } from './progression.js';
import { questPeriod } from './quests.js';
import { createRng } from './rng.js';
import { topLevel } from './skills.js';
import { autoDistribute } from './stats.js';

const tuning = (content) => content.settlement.companions;

// The skills of a class a companion can learn: its own, not an evolution's.
const classSkills = (classId, content) => content.skills.filter((skill) => skill.classId === classId);

// A skill's level at the companion's level: the first at the skill's class
// level, one more every skillStep levels, up to the skills' top level.
export function companionSkillLevel(skillId, level, content) {
  const skill = content.skillsById[skillId];
  if (!skill || level < skill.classLevel) return 0;
  return Math.min(topLevel(skill, content), 1 + Math.floor((level - skill.classLevel) / tuning(content).skillStep));
}

// The gear a candidate comes with (question 108 B for the start; the
// player's items later): a common weapon of its class and the class's body
// armour, both at its level.
function startingGear(classId, level, rng, content) {
  const cls = content.classesById[classId];
  const firstOf = (family) => content.bases.find((base) => base.id === family) ?? content.bases.find((base) => (base.family ?? base.id) === family);
  const weapon = firstOf(cls.weapons[0]);
  const body = firstOf(cls.armor.at(-1));
  return [weapon, body].filter(Boolean).map((base) => generateItem({ baseId: base.id, level }, rng, content));
}

// This week's candidates (question 106: "czterech tylko"), the same all
// week for the character: drawn from its seed and the week. `taken` are
// the ids already hired, who no longer wait in the Karczma.
export function drawCandidates({ character, seed }, now, content, taken = []) {
  const t = tuning(content);
  const week = questPeriod('weekly', now, content).key;
  const rng = createRng(`${seed}:candidates:${week}`);
  const used = new Set();
  const candidates = [];
  for (let index = 0; index < t.candidates; index++) {
    const classId = rng.pick(content.classes).id;
    const appearance = rng.pick(['female', 'male']);
    const names = t.names[appearance].filter((name) => !used.has(name));
    const name = rng.pick(names);
    used.add(name);
    const level = Math.max(1, Math.min(content.balance.progression.maxLevel, character.level + rng.int(t.levelSpread[0], t.levelSpread[1])));
    // Two traits, and now and then a third ("2–3 cechy", the design).
    const count = rng.chance(t.thirdTraitChance) ? 3 : 2;
    const traits = [];
    while (traits.length < count) {
      const trait = rng.pick(t.traits.filter((one) => !traits.includes(one.id)));
      traits.push(trait.id);
    }
    // Two skills of its class (question 109: "dwie umiejetnosci klasy").
    const pool = classSkills(classId, content);
    const skills = [];
    while (skills.length < 2 && skills.length < pool.length) {
      skills.push(rng.pick(pool.filter((skill) => !skills.includes(skill.id))).id);
    }
    const profession = rng.pick(t.professions).id;
    const story = rng.int(0, t.stories.length - 1);
    const gear = startingGear(classId, level, rng, content);
    candidates.push({ id: `${week}:${index}`, name, appearance, classId, level, xp: 0, traits, skills, profession, story, gear });
  }
  return candidates.filter((candidate) => !taken.includes(candidate.id));
}

// What hiring one costs: goldPerLevel for each of its levels.
// What hiring costs at `points` of the relation with the innkeeper: the
// companion's level times goldPerLevel, times its standing's priceByStanding.
// Any standing may hire, a lower one for more (the author: "Nie uzależniaj
// możliwości a cenę werbunku od stopnia znajomości. Powinienem móc ale
// drożej niż na wyższym stopniu").
export function hireCost(companion, content, points = 0) {
  const { standings } = content.settlement;
  const standing = standings.findLast((one) => one.points <= points) ?? standings[0];
  return Math.round(companion.level * tuning(content).goldPerLevel * (tuning(content).priceByStanding[standing.id] ?? 1));
}

// The companion as the engine's character: its points spread by its class
// (the design: "automatyczny rozdział punktów według klasy"), its skills at
// its level, its class's place in the line.
export function companionCharacter(companion, content) {
  const cls = content.classesById[companion.classId];
  const base = { classId: companion.classId, level: companion.level, classLevel: companion.level, points: {}, professions: {}, appearance: companion.appearance };
  const skills = Object.fromEntries(companion.skills.map((id) => [id, companionSkillLevel(id, companion.level, content)]).filter(([, level]) => level > 0));
  return { ...base, points: autoDistribute(base, content), skills, position: cls.position };
}

// The traits' changes, summed: { damage, armor, hp, dodge, crit, speed, will }.
export function traitBonuses(companion, content) {
  const total = {};
  for (const id of companion.traits) {
    const trait = tuning(content).traits.find((one) => one.id === id);
    for (const key of ['damage', 'armor', 'hp', 'dodge', 'crit', 'speed', 'will']) if (trait?.[key]) total[key] = (total[key] ?? 0) + trait[key];
  }
  return total;
}

// The standing of the relation with a companion (296 A: "stopnie są jak u
// mieszkańców (od Obcego do Przyjaciela)"): its index and name, the points
// and the next standing.
export function companionStanding(companion, content) {
  const { standings } = content.settlement;
  const points = companion.relation ?? 0;
  const index = Math.max(0, standings.findLastIndex((standing) => standing.points <= points));
  return { index, name: standings[index].name, points, next: standings[index + 1] ?? null };
}

// What the relation gives in a fight (296 A: "każdy stopień daje mu w walce
// +2% obrażeń i HP"): `bonus` for each standing above the first.
export const bondBonus = (companion, content) => companionStanding(companion, content).index * tuning(content).relation.bonus;

// The relation an exploration of `minutes` together brings (296 A: "rośnie
// z każdą wspólną wyprawą"): perHour points an hour, to the fraction, with
// no least point a trip (341 A: very short explorations farmed it).
export const bondPoints = (minutes, content) => (minutes * tuning(content).relation.perHour) / 60;

// A text in the form for a woman or a man: "[a|b]" is a for her, b for him.
export const gendered = (text, appearance) => text.replace(/\[([^[\]|]*)\|([^[\]|]*)\]/g, (_, female, male) => (appearance === 'female' ? female : male));

// The pieces of its story a companion has told in talks (295 A).
export function toldPieces(companion, content) {
  const { talks } = tuning(content);
  return talks.stories[companion.story % talks.stories.length].slice(0, companion.told ?? 0).map((piece) => gendered(piece, companion.appearance));
}

// Whether the character has talked with the companion today.
export const talkedToday = (companion, now, content) => companion.talkedOn === questPeriod('daily', now, content).key;

// A talk with a companion, once a day (295 A: "towarzysz opowiada kawałek
// swojej historii, kolejne kawałki odsłaniają się z relacją, a rozmowa ją
// podnosi"): the next piece of its story once the relation has reached
// that piece's standing, else a word of chatter picked by the day; and the
// companion after it, `talk` points closer.
export function talkWith(companion, { seed, now }, content) {
  const t = tuning(content);
  const day = questPeriod('daily', now, content).key;
  const pieces = t.talks.stories[companion.story % t.talks.stories.length];
  const told = companion.told ?? 0;
  const story = told < pieces.length && told <= companionStanding(companion, content).index;
  const text = story ? pieces[told] : createRng(`${seed}:talk:${companion.id}:${day}`).pick(t.talks.chatter);
  return {
    talk: { text: gendered(text, companion.appearance), story, points: t.relation.talk },
    companion: { ...companion, relation: (companion.relation ?? 0) + t.relation.talk, ...(story && { told: told + 1 }), talkedOn: day },
  };
}

// The companion in a fight: a character of its class with its gear, its
// traits on top, and the relation's bonus (296 A). `hp` its HP now (full
// when not given).
export function companionCombatant(companion, { hp, area, id = 'a1' } = {}, content) {
  const unit = playerCombatant({ character: companionCharacter(companion, content), equipped: companion.gear, hp, name: companion.name, area, id }, content);
  const bonus = traitBonuses(companion, content);
  const bond = bondBonus(companion, content);
  const maxHp = Math.max(1, Math.round(unit.maxHp * (1 + (bonus.hp ?? 0) + bond)));
  return {
    ...unit,
    isPlayer: false,
    companion: true,
    maxHp,
    hp: Math.min(hp ?? maxHp, maxHp),
    armor: Math.round(unit.armor * (1 + (bonus.armor ?? 0))),
    ...((bonus.damage || bond) && { damageBonus: (bonus.damage ?? 0) + bond }),
    dodgeRating: unit.dodgeRating * (1 + (bonus.dodge ?? 0)),
    critRating: unit.critRating * (1 + (bonus.crit ?? 0)),
    willRating: unit.willRating * (1 + (bonus.will ?? 0)),
    speed: unit.speed * (1 + (bonus.speed ?? 0)),
  };
}

// The XP a companion gains from an exploration's `xp`: xpShare of it, and
// catchUp more for each level it is below the character (the design:
// "z mnożnikiem nadrabiania").
export function companionXp(companion, xp, characterLevel, content) {
  const t = tuning(content);
  return Math.round(xp * t.xpShare * (1 + t.catchUp * Math.max(0, characterLevel - companion.level)));
}

// The companion after an exploration of `minutes`: its XP and levels, the
// relation the time together brings (296 A), and wounded when it fainted,
// until the character rests to full HP (companionReady).
export function companionAfterHunt(companion, { xp, fainted, minutes }, characterLevel, content) {
  const next = gainXp(companion.level, companion.xp ?? 0, companionXp(companion, xp, characterLevel, content), (level) => xpToNext(level, content), content.balance.progression.maxLevel);
  const relation = minutes ? { relation: (companion.relation ?? 0) + bondPoints(minutes, content) } : {};
  const { woundedUntil: _, ...after } = { ...companion, level: next.level, xp: next.xp, ...relation };
  return fainted ? { ...after, wounded: true } : after;
}

// Whether the companion goes on an exploration: a wounded one only once
// the character has rested to full HP (`rested`), as its wounds heal with
// the character's.
export const companionReady = (companion, rested) => Boolean(companion) && (!companion.wounded || rested);

// The places a companion wears items in (the design: "broń, pancerz,
// talizman").
export const COMPANION_SLOTS = ['weapon', 'chest', 'talisman'];

// Why the companion cannot wear `item` from the character's bag (question
// 108 A: "gracz zakłada towarzyszowi przedmioty jego klasy z plecaka"), or
// null: one of its places, its class, and its class level (its level) for
// the item's Tier, wherever the item came from, as for the character.
export function companionWearBlock(companion, item, content) {
  if (!COMPANION_SLOTS.includes(item.slot)) return { code: 'wrong_slot', message: 'Towarzysz nosi tylko broń, pancerz i talizman.' };
  if (!canUse(item.base, companion.classId, content)) return { code: 'wrong_class', message: 'Klasa towarzysza nie może używać tego przedmiotu.' };
  if (!canUse(item.base, companion.classId, content, companion.level)) {
    return { code: 'class_level', message: `Ten przedmiot towarzysz założy od poziomu ${baseClassLevel(item.base, content)}.` };
  }
  return null;
}

// The companion wearing `item` (marked as given) in its place, and the item
// it wore there, which goes back to the bag (`off`, or null).
export function wearOnCompanion(companion, item) {
  const off = companion.gear.find((worn) => worn.slot === item.slot) ?? null;
  return { companion: { ...companion, gear: [...companion.gear.filter((worn) => worn !== off), { ...item, given: true }] }, off };
}
