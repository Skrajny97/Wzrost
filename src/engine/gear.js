// @ts-check
// The gear and build of a character by its evolution line (988, the author
// 15.11.2026: „Licz i Nekromanta nagle powinien bronie magów typu kostury
// używać… pełne skalowanie od Intelektu tak jakby się inną klasą stawał”):
// a form of an evolution line may take another class's weapons and
// off-hands (evolutions.json `gear`), have its class's weapons hit with
// another stat (`scaling`) and spread the points of "Rozdaj według klasy"
// its own way (`autoPoints`); its next forms keep what it changed unless
// they change it again.

/** @typedef {Record<string, any>} Content The game's data, as content.js builds it. */

// What a form changes (988): the fields of evolutions.json that make it
// another class's kind.
const CHANGES = ['gear', 'scaling', 'as', 'autoPoints', 'weaponDamage'];

// The key of a character's gear and build: its class's id, or `class:form`
// (its own form) when a form of its line changes them. What a character can
// use, the gear it finds, its weapon's stat and damage, its stats and its
// points' spread all go by it.
/**
 * @param {string} classId
 * @param {string | null | undefined} evolutionId
 * @param {Content} content
 * @returns {string}
 */
export function gearKey(classId, evolutionId, content) {
  const own = evolutionId ? (content.evolutionsById?.[evolutionId] ?? null) : null;
  let form = own;
  while (form && !CHANGES.some((field) => form[field] !== undefined)) form = form.from ? (content.evolutionsById[form.from] ?? null) : null;
  return form && own ? `${classId}:${own.id}` : classId;
}

// A field of a gear key's form, else of the forms before it in its line
// (the next forms keep what a form changed unless they change it again).
/**
 * @param {string} key
 * @param {string} field
 * @param {Content} content
 * @returns {any}
 */
function fieldOf(key, field, content) {
  const formId = key.split(':')[1];
  let form = formId ? (content.evolutionsById[formId] ?? null) : null;
  while (form) {
    if (form[field] !== undefined) return form[field];
    form = form.from ? (content.evolutionsById[form.from] ?? null) : null;
  }
  return undefined;
}

// The class of a gear key.
/**
 * @param {string} key
 * @returns {string}
 */
export const keyClass = (key) => key.split(':')[0];

// The weapons, off-hands and armour (by family) of a gear key: its class's,
// with its line's own.
/**
 * @param {string} key
 * @param {Content} content
 * @returns {{ weapons: string[], offhands: string[], armor: string[] }}
 */
export function gearLists(key, content) {
  const cls = content.classesById[keyClass(key)];
  const gear = fieldOf(key, 'gear', content);
  return { weapons: gear?.weapons ?? cls.weapons, offhands: gear?.offhands ?? cls.offhands, armor: gear?.armor ?? cls.armor };
}

// The spread of "Rozdaj według klasy" of a gear key: its line's own, else
// its class's.
/**
 * @param {string} key
 * @param {Content} content
 * @returns {Record<string, number>}
 */
export const autoPointsOf = (key, content) => fieldOf(key, 'autoPoints', content) ?? content.classesById[keyClass(key)]?.autoPoints ?? {};

// The stat the weapons of a gear key hit with instead of their own, or null.
/**
 * @param {string} key
 * @param {Content} content
 * @returns {string | null}
 */
export const weaponScalingOf = (key, content) => fieldOf(key, 'scaling', content) ?? null;

// The stats a gear key counts as others (`as`: { dexterity: 'intellect' }:
// every point of Zręczność is one of Intelekt), or none.
/**
 * @param {string} key
 * @param {Content} content
 * @returns {Record<string, string>}
 */
export const statAsOf = (key, content) => fieldOf(key, 'as', content) ?? {};

// The element a gear key's weapons hit in when they have none of their own
// (gear.element: the Wielki Inkwizytor's swords and axes hit with Sakrum,
// as its kropidła did, for its Żarliwość), or null.
/**
 * @param {string} key
 * @param {Content} content
 * @returns {string | null}
 */
export const gearElementOf = (key, content) => fieldOf(key, 'gear', content)?.element ?? null;

// The share of their damage a gear key's weapons hit with (`weaponDamage`:
// the Nekromanta's kostury hit by 0.8 of a Mag's, as it keeps a Cień's
// speed, dodge and HP), 1 for a class's own.
/**
 * @param {string} key
 * @param {Content} content
 * @returns {number}
 */
export const gearDamageOf = (key, content) => fieldOf(key, 'weaponDamage', content) ?? 1;
