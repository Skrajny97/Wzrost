// The Kronika Gildii (1195 A, accepted by the author on the review page on
// 19.11.2026; data/guilds.json `chronicle`; DECISIONS.md, "Kronika Gildii w
// czacie"): the System's short lines in a guild's channel of the chat about
// the guild's big moments, two or three a day, with nobody tapping
// anything: the Bestia's and a strażnik's fall with the name of the
// character who struck the last blow, a new threshold of the Próby, a new
// level of a building of the Siedziba, a league evening's result, a new
// member and the start of the guild's rally; and as a week starts, the
// Bohaterowie tygodnia (1198 A, guild-heroes.js), the lands under the
// guild's banner (1200 A, guild-lands.js) and the Kącina's patron of the
// week (1201 A, guild-shrine.js); and a member who bought the title of the
// Strażnik Sztandaru in the Kram (1202 A, guild-stall.js). Shown as the
// Loteria's lines are (chat.js), under [ SYSTEM ], nobody's to report or
// hide.
//
// chronicle() gives the statement that writes one, for the batch of the
// action that makes the event, so the line lands only with it: `once`
// names the event (e.g. "beast:12"), and a second line of the same event
// in the same channel does nothing (the unique index of migration 0162);
// `when` ({ sql, binds }) holds it to a condition read in the batch, as
// "this hit felled the beast". A line keeps its key and params, so each
// reader reads it in its own language (chronicleShown), and its Polish in
// the text column. It belongs to `characterId` (the one it is about, or
// who made it happen), else to the guild's leader, as a chat message needs
// a writer; it goes with that character. A System line tags nobody, so it
// never brings a phone notification (mentions.js reads only the tags of
// players' messages).

import { countedForm, godBonusText, heroName, shrineGod } from '../engine/index.js';
import { content } from './content.js';
import { language, numberText, runInLanguage } from './i18n.js';

const words = () => content().guilds.chronicle.texts;
const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (whole, name) => (Object.hasOwn(vars, name) ? String(vars[name]) : whole));

// "20:00": an hour of Polish time, as the request's language writes it.
const hourOptions = { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
const hourFormats = { pl: new Intl.DateTimeFormat('pl-PL', hourOptions), en: new Intl.DateTimeFormat('en-GB', hourOptions) };
export const hourText = (ms) => (hourFormats[language()] ?? hourFormats.pl).format(new Date(ms));

// A line in the language of the request: its words with the params filled
// in, a creature's id as its name, a Siedziba building's as its name, a
// moment (`until`) as its hour, a number as the language writes it. Null
// for a key the data no longer has.
export function chronicleText(key, params = {}) {
  const template = words()[key];
  if (typeof template !== 'string') return null;
  const game = content();
  const vars = {};
  for (const [name, value] of Object.entries(params)) vars[name] = typeof value === 'number' ? numberText(value) : value;
  if (params.monster) vars.monster = game.monstersById[params.monster]?.name ?? params.monster;
  if (params.building) vars.building = game.guilds.seat.buildings.find((building) => building.id === params.building)?.name ?? params.building;
  if (params.until) vars.until = hourText(params.until);
  // Plain numbers: a stage, a level, a threshold and fights won are small.
  for (const name of ['stage', 'level', 'threshold', 'thresholds', 'percent']) if (typeof params[name] === 'number') vars[name] = String(params[name]);
  // The Bohaterowie tygodnia (1198 A): each hero's title, a woman's for a
  // woman ("Pogromczyni"), with its name, and the Punkty Czasu of the
  // reward with their noun.
  if (Array.isArray(params.heroes)) {
    vars.heroes = params.heroes.map((hero) => filled(words().hero, { title: heroName(hero.kind, hero.appearance, game), name: hero.name })).join(', ');
  }
  if (typeof params.timePoints === 'number') vars.timePoints = `${numberText(params.timePoints)} ${countedForm(params.timePoints, game.guilds.heroes.texts.timePointForms)}`;
  // The lands of the guild's banners (1200 A), by their names.
  if (Array.isArray(params.lands)) vars.lands = params.lands.map((id) => game.regionsById[id]?.name ?? id).join(', ');
  // The Kącina's patron of the week (1201 A): the god as "pod opieką
  // Peruna" ("under Perun's protection") has it, and what it gives.
  if (typeof params.god === 'string') {
    const god = shrineGod(params.god, game);
    vars.god = god?.genitive ?? params.god;
    vars.bonus = god ? godBonusText(god, game) : '';
  }
  return filled(template, vars);
}

// The words a message of the chat shows (chat.js): a Kronika's line in the
// reader's language, any other its own text.
export function chronicleShown(row) {
  if (!row.chronicle) return row.text;
  try {
    const { key, params } = JSON.parse(row.chronicle);
    return chronicleText(key, params) ?? row.text;
  } catch {
    return row.text;
  }
}

// The statement that writes the line `key` with `params` in the channel of
// the guild `guildId` at `now` (see above).
export function chronicle(db, guildId, key, params, now, { characterId = null, once = null, when = null } = {}) {
  const text = runInLanguage('pl', () => chronicleText(key, params)) ?? key;
  return db
    .prepare(
      `INSERT OR IGNORE INTO chat_messages (channel, user_id, character_id, name, level, class_id, text, created_at, system, chronicle, chronicle_key)
       SELECT ?, c.user_id, c.id, c.name, c.level, c.class_id, ?, ?, 1, ?, ?
       FROM characters c
       WHERE c.id = COALESCE(?, (SELECT m.character_id FROM guild_members m WHERE m.guild_id = ? AND m.role = 'leader'))
         AND EXISTS (SELECT 1 FROM guilds WHERE id = ?)${when ? ` AND (${when.sql})` : ''}`,
    )
    .bind(`guild:${guildId}`, text, now, JSON.stringify({ key, params }), once, characterId, guildId, guildId, ...(when?.binds ?? []));
}

// The Próby's threshold reached last this week, told once (the bar is the
// guild's, trialsView in guild-trials.js): looked at with the guild's dots
// (guild-todo.js), so the line comes within a minute or so of the trial
// that reached it while a member has the game open. Each Worker keeps the
// thresholds it has told, so a look writes nothing while no new one came.
const toldTrials = new Map();
export async function trialsChronicle(db, guildId, bar, now) {
  if (!bar?.thresholds) return;
  const reached = bar.thresholds.filter((threshold) => threshold.reached);
  if (reached.length === 0) return;
  const top = reached.at(-1);
  const seen = `${guildId}:${bar.week}`;
  if ((toldTrials.get(seen) ?? -1) >= top.index) return;
  await chronicle(db, guildId, 'trials', { threshold: top.index + 1, thresholds: bar.thresholds.length }, now, { once: `trials:${bar.week}:${top.index}` }).run();
  if (toldTrials.size > 5000) toldTrials.clear();
  toldTrials.set(seen, top.index);
}
