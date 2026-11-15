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

// The key of a character's gear and build: its class's id, or `class:form`
// for the nearest form of its line that changes them (gear, scaling or
// autoPoints). What a character can use, the gear it finds, its weapon's
// stat and its points' spread all go by it.
/**
 * @param {string} classId
 * @param {string | null | undefined} evolutionId
 * @param {Content} content
 * @returns {string}
 */
export function gearKey(classId, evolutionId, content) {
  let form = evolutionId ? (content.evolutionsById?.[evolutionId] ?? null) : null;
  while (form && !form.gear && !form.scaling && !form.autoPoints && !form.as) form = form.from ? (content.evolutionsById[form.from] ?? null) : null;
  return form ? `${classId}:${form.id}` : classId;
}

// The form of a gear key, or null for a class's own.
/**
 * @param {string} key
 * @param {Content} content
 * @returns {Record<string, any> | null}
 */
const formOf = (key, content) => {
  const formId = key.split(':')[1];
  return formId ? (content.evolutionsById[formId] ?? null) : null;
};

// The class of a gear key.
/**
 * @param {string} key
 * @returns {string}
 */
export const keyClass = (key) => key.split(':')[0];

// The weapons, off-hands and armour (by family) of a gear key: its class's,
// with the form's own.
/**
 * @param {string} key
 * @param {Content} content
 * @returns {{ weapons: string[], offhands: string[], armor: string[] }}
 */
export function gearLists(key, content) {
  const cls = content.classesById[keyClass(key)];
  const gear = formOf(key, content)?.gear;
  return { weapons: gear?.weapons ?? cls.weapons, offhands: gear?.offhands ?? cls.offhands, armor: gear?.armor ?? cls.armor };
}

// The spread of "Rozdaj według klasy" of a gear key: the form's own, else
// its class's.
/**
 * @param {string} key
 * @param {Content} content
 * @returns {Record<string, number>}
 */
export const autoPointsOf = (key, content) => formOf(key, content)?.autoPoints ?? content.classesById[keyClass(key)]?.autoPoints ?? {};

// The stat the weapons of a gear key hit with instead of their own, or null.
/**
 * @param {string} key
 * @param {Content} content
 * @returns {string | null}
 */
export const weaponScalingOf = (key, content) => formOf(key, content)?.scaling ?? null;

// The stats a form counts as others (`as`: { dexterity: 'intellect' }: every
// point of Zręczność is one of Intelekt), or none.
/**
 * @param {string} key
 * @param {Content} content
 * @returns {Record<string, string>}
 */
export const statAsOf = (key, content) => formOf(key, content)?.as ?? {};

// The share of their damage a form's own weapons hit with (gear.damage), 1
// for a class's own gear.
/**
 * @param {string} key
 * @param {Content} content
 * @returns {number}
 */
export const gearDamageOf = (key, content) => formOf(key, content)?.gear?.damage ?? 1;
