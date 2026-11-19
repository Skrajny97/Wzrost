// What makes an attack on the Bestia Gildii or a strażnik of the Wyprawa
// Gildii hit harder or softer (src/engine/guild-strike.js has the rules,
// data/guilds.json `classDay`, `rally` and `undercut` the numbers and the
// words), all three accepted by the author on the review page on
// 19.11.2026:
//   - the classes of the day (1197): the attacks of a character whose base
//     class has its day hit harder;
//   - the guild's rally (1199 A, guild-rally.js): the attacks of its hour;
//   - "Cios" or "Podcięcie" (1203): before each attack the player picks
//     one; a podcięcie hits half as hard and waits on its beast or strażnik
//     (`target`, "beast:<id>" or "guardian:<id>") for the next `uses` Cios
//     of other players' members, each of which hits harder and uses up one
//     of the oldest podcięcie waiting; a podcięcie never helps the account
//     that made it.
// The three multiply (strikePower). strikePlan gives an attack its power
// and the statements for its batch: the bonus it uses, taken only while it
// is still there (an assertion, so of two Cios at once on the last one,
// one takes it and the other is told the guild changed meanwhile), or the
// podcięcie it leaves. The podcięcia go with their beast or strażnik: a
// new week's leave the older weeks' behind, gone at the next podcięcie.

import { classDays, classesOfDay, classOfDay, countedForm, questPeriod, strikePower } from '../engine/index.js';
import { assertion } from './atomic.js';
import { content } from './content.js';
import { rallyOn, rallyView } from './guild-rally.js';
import { readJson } from './http.js';

const tuning = () => content().guilds;
const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
const percentOf = (power) => Math.round(Math.abs(power - 1) * 100);

// The kind of attack a request asks for: "undercut" for a podcięcie, else a
// Cios (also for a page from before the choice, which sends no body).
export async function strikeKind(request) {
  if (!(request.headers.get('Content-Type') ?? '').toLowerCase().startsWith('application/json')) return 'strike';
  const body = await readJson(request);
  return body.kind === 'undercut' ? 'undercut' : 'strike';
}

// The podcięcia waiting on a target, the oldest first, with their authors'
// names: those with uses left whose character is still the one that made
// them (a removed character's id given again takes nothing of it).
const waitingOn = (db, target) =>
  db
    .prepare(
      `SELECT u.id, u.character_id, u.user_id, u.uses_left, c.name FROM guild_undercuts u
       JOIN characters c ON c.id = u.character_id AND c.created_at <= u.created_at
       WHERE u.target = ? AND u.uses_left > 0 ORDER BY u.id`,
    )
    .bind(target);

// The first waiting podcięcie a character of the account `userId` may use.
const usableBy = (waiting, userId) => waiting.find((one) => one.user_id !== userId) ?? null;

// An attack's power and what its batch writes besides the hit: the class
// of the day of the character (`row`), the guild's rally on, and for a
// Cios the oldest podcięcie of another player waiting on the target, used
// up by one; for a podcięcie its own row, waiting for `uses` Cios. The
// bonuses, for the answer's words.
export async function strikePlan(db, { guild, row, target, kind, now }) {
  const rules = tuning().undercut;
  const classDay = classOfDay(row.class_id, now, content());
  const rally = await rallyOn(db, guild.id, now);
  const bonus = kind === 'strike' ? usableBy((await waitingOn(db, target).all()).results, row.user_id) : null;
  const power = strikePower({ classDay, rally, kind, bonus: Boolean(bonus) }, content());
  const week = questPeriod('weekly', now, content()).key;
  const statements = bonus
    ? [
        assertion(db, '(SELECT uses_left FROM guild_undercuts WHERE id = ?) > 0', [bonus.id]),
        db.prepare('UPDATE guild_undercuts SET uses_left = uses_left - 1 WHERE id = ? AND uses_left > 0').bind(bonus.id),
      ]
    : kind === 'undercut'
      ? [
          db.prepare('DELETE FROM guild_undercuts WHERE week < ?').bind(week),
          db
            .prepare('INSERT INTO guild_undercuts (guild_id, target, week, character_id, user_id, uses_left, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .bind(guild.id, target, week, row.id, row.user_id, rules.uses, now),
        ]
      : [];
  return { power, statements, boosts: { kind, classDay, rally, bonus: bonus ? { name: bonus.name } : null, power } };
}

// The words of the three, with the rules' numbers filled in: the classes'
// days in "Jak to działa?" ("Wojownik pn, śr, sb; …").
function strikeTexts() {
  const { classDay, undercut } = tuning();
  const day = classDay.texts;
  const cut = undercut.texts;
  const schedule = Object.entries(classDays(content()))
    .map(([classId, days]) => filled(day.classDays, { class: content().classesById[classId]?.name ?? classId, days: days.map((index) => day.dayNames[index]).join(', ') }))
    .join('; ');
  const numbers = { percent: percentOf(undercut.bonus), uses: undercut.uses };
  return {
    classDay: { title: day.title, bonus: filled(day.bonus, { percent: percentOf(classDay.power) }), own: filled(day.own, { percent: percentOf(classDay.power) }) },
    undercut: {
      ...Object.fromEntries(Object.entries(cut).filter(([key]) => key !== 'how')),
      undercutNote: filled(cut.undercutNote, numbers),
      undercutDone: filled(cut.undercutDone, numbers),
    },
    how: [filled(day.how, { percent: percentOf(classDay.power), schedule }), ...cut.how.map((line) => filled(line, numbers))],
  };
}

// The words of an attack's bonuses for its answer: "Premie: klasa dnia
// +50%, zbiórka +30%, podcięcie (Radomira) +60%." or nothing (a
// podcięcie's own words, undercutDone, are the card's).
export function boostsText(boosts) {
  const { classDay, rally, undercut } = tuning();
  const cut = undercut.texts;
  const parts = [
    boosts.classDay && filled(cut.boostClassDay, { percent: percentOf(classDay.power) }),
    boosts.rally && filled(cut.boostRally, { percent: percentOf(rally.power) }),
    boosts.bonus && filled(cut.boostBonus, { name: boosts.bonus.name, percent: percentOf(undercut.bonus) }),
  ].filter(Boolean);
  return parts.length > 0 ? filled(cut.boosts, { boosts: parts.join(', ') }) : '';
}

// The three for the cards of the Bestia and the strażnik: the classes of
// the day (with whether the character's is one of them), the guild's rally
// (guild-rally.js), the podcięcia waiting on the target (who made them and
// how many Cios each still strengthens; `own` for the account's own) and
// the one the character's next Cios would use, and the words.
export async function strikeView(db, { guild, row, target, now }) {
  const { classDay, undercut } = tuning();
  const classes = classesOfDay(now, content());
  const waiting = target ? (await waitingOn(db, target).all()).results : [];
  const bonus = usableBy(waiting, row.user_id);
  const [one, few, many] = undercut.texts.strikeForms;
  return {
    classDay: {
      classes: classes.map((id) => ({ id, name: content().classesById[id]?.name ?? id })),
      own: classOfDay(row.class_id, now, content()),
      percent: percentOf(classDay.power),
    },
    rally: await rallyView(db, guild, now),
    undercuts: {
      waiting: waiting.map((cut) => ({ name: cut.name, left: cut.uses_left, strikes: countedForm(cut.uses_left, [one, few, many]), own: cut.user_id === row.user_id })),
      bonus: bonus ? { name: bonus.name } : null,
      percent: percentOf(undercut.bonus),
      uses: undercut.uses,
    },
    texts: strikeTexts(),
  };
}
