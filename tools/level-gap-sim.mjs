// Character level and class level over weeks of play (question 1227, the
// author 24.11.2026: „Jest straszny rozstrzał między Poziomami Klasy a
// Poziomami Postaci”): a player who explores every day, as the XP curves
// and the game's other sources of XP give it, for the game as it is and for
// the variants that would shrink the gap.
//
//   node tools/level-gap-sim.mjs                          a new character, every variant
//   node tools/level-gap-sim.mjs --from 150/200           a character at level 150 with class level 200
//   node tools/level-gap-sim.mjs --hours 10 --at character --no-yard
//   node tools/level-gap-sim.mjs --variants now,catchup --weeks 1,2,3,4
//   node tools/level-gap-sim.mjs --variants now,cult3cap,cult2,cult4cap --cultivation catch-up --from 100/119
//
// The player (options): `hours` of explorations a day (17.5: four
// explorations of 4 hours and an hour and a half rewound with Time
// Points), in the newest place its class level opens (`--at class`, the
// XP an hour of xpPerHour at that place's top level, as the curve was set:
// the character at the top of its place) or at its own level (`--at
// character`, the balance simulations' place). The Avatar Systemu works all
// day from the second week (a quarter of the character XP of the work,
// professions.json), and the Warownia stands from the fourth week, with the
// Plac treningowy built a level at a time after it at the data's building
// times (a training a day: class XP of a quarter of an exploration as long,
// at the character's level); `--no-yard` leaves it out. No faints (the
// realistic player of tools/difficulty-sim.mjs with its companions hardly
// ever faints in the newest place). The class's waits at its evolution
// levels are left out: their XP is kept and comes after the wait.
//
// Kultywacja (the author 24.11.2026, after turning down the variants above:
// „coś w rodzaju Kultywacji, która powoduje że postać medytuje i wtedy
// zdobywa mocno zwiększony XP postaci”): a timed activity the player chooses
// instead of an exploration as long. The character meditates and gets only
// character XP: `k` times what an exploration as long gives in the newest
// place its class opens (the XP an hour of `--at class`, whatever `--at`
// is). No class XP and no loot; the Avatar and the Plac treningowy work as on
// any other day. A capped Kultywacja gives XP only while the class level is
// above the character's and stops at equal levels: the character never
// passes its class through it. How the player meditates (`--cultivation`,
// both ways when left out): `slot`, the usual day with one of its 4-hour
// explorations turned into Kultywacja, the first one in which the class is
// ahead (with no cap, the first one every day); `catch-up`, every hour of play
// from the first day until the levels are equal, where the player stops even
// with no cap, then explorations only. A Kultywacja that reaches equal levels
// ends there and the rest of its hours are an exploration, as the player
// would choose its length. The game has `cult4cap` (1230 A). Its hours also
// grow the Kultywacja's own levels as the game counts them
// (cultivationProgress: from 4 hours for the first level to 20 for the
// hundredth, the author's 1248 B), each `levelBonus` more character XP from
// the explorations after it (cultivationBonus), never class XP.
//
// Each week: the character's and the class's levels, the gap, and the class
// level against the game as it is (the class levels a variant costs). A
// Kultywacja row ends with its hours in all, the Kultywacja's level and,
// catching up, the day the levels were equal; above the rows, the hours of
// meditation to its levels.

import { fileURLToPath } from 'node:url';
import * as engine from '../src/engine/index.js';
import { loadData } from './validate-data.mjs';

// The value at `x` of points [x, value]: evenly between two, as the first
// before it and as the last after it.
const between = (points, x) => {
  if (x <= points[0][0]) return points[0][1];
  const next = points.findIndex(([at]) => x < at);
  if (next === -1) return points[points.length - 1][1];
  const [x0, y0] = points[next - 1];
  const [x1, y1] = points[next];
  return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
};

// Variants: how much of an exploration's XP the character and the class
// get (charShare, classShare: by the levels before it), the class's XP to a
// level (classFactor: by the class level, the share of the character's XP to
// the level of the same number) and who gets the Plac treningowy's XP.
export const VARIANTS = {
  now: { name: 'gra teraz' },
  // The character catches up: 10% more of its XP for each level the class
  // is ahead beyond 5, at most 4 times as much.
  catchup: {
    name: 'nadrabianie postaci (+10% XP postaci za poziom różnicy ponad 5, najwyżej 4 razy tyle)',
    charShare: (level, classLevel) => 1 + Math.min(3, 0.1 * Math.max(0, classLevel - level - 5)),
  },
  // Class levels need more XP from class level 50: 60% of the character's
  // there, evenly to 100% at 100 and on.
  factor: {
    name: 'droższe poziomy klasy (60% → 100% XP poziomu postaci, 50.–100. poziom klasy)',
    classFactor: (classLevel) => between([[50, 0.6], [100, 1]], classLevel),
  },
  // The class gets half its XP while it is 10 or more levels ahead.
  slow: {
    name: 'klasa wolniej, gdy wyprzedza postać o 10 poziomów (połowa XP klasy)',
    classShare: (level, classLevel) => (classLevel - level >= 10 ? 0.5 : 1),
  },
  // The Plac treningowy trains the character instead of the class.
  yard: { name: 'Plac treningowy daje XP postaci zamiast klasy', yardTo: 'character' },
  // More character XP from explorations for everyone from level 50.
  more: {
    name: 'więcej XP postaci z wypraw (+25% od 50. poziomu postaci)',
    charShare: (level) => (level >= 50 ? 1.25 : 1),
  },
  // Kultywacja (header): `k` times the character XP of an exploration in the
  // newest place, with `cap` only while the class is ahead.
  cult3cap: { name: 'Kultywacja: 3 razy XP postaci, tylko gdy klasa wyżej, do zrównania poziomów', cultivation: { k: 3, cap: true } },
  cult2: { name: 'Kultywacja: 2 razy XP postaci, zawsze, bez limitu', cultivation: { k: 2, cap: false } },
  cult4cap: { name: 'Kultywacja: 4 razy XP postaci, tylko gdy klasa wyżej, do zrównania poziomów', cultivation: { k: 4, cap: true } },
};

// How the player meditates with a Kultywacja variant (header).
export const CULTIVATION = {
  slot: 'co dzień jedna 4-godzinna wyprawa zamieniona na Kultywację',
  'catch-up': 'Kultywacja przez całe dni aż do zrównania poziomów, potem same wyprawy',
};

// The level and XP after `gained` XP (gainXp without the evolution waits).
function gain(state, gained, toNext, maxLevel) {
  let { level, xp } = state;
  xp += gained;
  while (level < maxLevel && xp >= toNext(level)) {
    xp -= toNext(level);
    level += 1;
  }
  return { level, xp };
}

// The XP from `state` to the start of level `target`.
function xpTo(state, target, toNext) {
  let xp = -state.xp;
  for (let level = state.level; level < target; level++) xp += toNext(level);
  return xp;
}

// The top level of the newest place a class level opens.
function newestTop(classLevel, content) {
  // The game's own (src/engine/cultivation.js), as Kultywacja counts it.
  return engine.newestArea(classLevel, content).maxLevel;
}

// The Plac treningowy's level on each day: the Warownia from `fortressDay`,
// then each level built after the one before it.
function yardLevels(fortressDay, days, content) {
  const yard = content.buildings.find((building) => building.effect?.kind === 'training');
  const levels = [];
  let level = 0;
  let readyAt = fortressDay;
  for (let day = 0; day <= days; day++) {
    while (level < yard.maxLevel && day >= readyAt + yard.minutes.base * yard.minutes.growth ** level / 1440) {
      readyAt += (yard.minutes.base * yard.minutes.growth ** level) / 1440;
      level += 1;
    }
    levels.push(day >= fortressDay ? level : 0);
  }
  return { levels, share: yard.effect.share };
}

// Day by day: the character's and the class's levels at the end of each
// week in `weeks`, with the hours of Kultywacja so far and, catching up, the
// day the levels were equal (0: at the start, null: not yet).
export function project({ variant = VARIANTS.now, cultivate = 'slot', hours = 17.5, at = 'class', yard = true, from = null, weeks = [1, 2, 4, 8, 12], fortressDay = 21, avatarDay = 7 }, content) {
  const { maxLevel } = content.balance.progression;
  const charShare = variant.charShare ?? (() => 1);
  const classShare = variant.classShare ?? (() => 1);
  const classFactor = variant.classFactor ?? (() => content.balance.progression.classXpFactor);
  const charToNext = (level) => engine.xpToNext(level, content);
  const classToNext = (level) => Math.round(engine.xpToNext(level, content) * classFactor(level));
  const days = 7 * Math.max(...weeks);
  // A character already far on has its Warownia and Avatar.
  const training = yardLevels(from ? -1000 : fortressDay, days, content);
  let char = { level: from?.level ?? 1, xp: 0 };
  let cls = { level: from?.classLevel ?? 1, xp: 0 };
  const { cultivation } = variant;
  let catchingUp = Boolean(cultivation) && cultivate === 'catch-up' && cls.level > char.level;
  let equalOn = cultivation && cultivate === 'catch-up' && !catchingUp ? 0 : null;
  let cultivated = 0;
  // The Kultywacja's own level and XP, from 0 (the game's are new to all).
  let progress = { level: 0, xp: 0 };
  // Kultywacja for at most `length` hours: the hours it lasted. With `cap`
  // it starts only while the class is ahead and ends at equal levels.
  const meditate = (length, cap) => {
    if (cap && char.level >= cls.level) return 0;
    const rate = cultivation.k * engine.xpPerHour(newestTop(cls.level, content), content);
    const needed = cap ? xpTo(char, cls.level, charToNext) / rate : Infinity;
    const spent = Math.min(length, needed);
    char = spent === needed ? { level: cls.level, xp: 0 } : gain(char, rate * spent, charToNext, maxLevel);
    cultivated += spent;
    const grown = engine.cultivationProgress(progress, Math.round(spent * 60), content);
    progress = { level: grown.level, xp: grown.xp };
    return spent;
  };
  // Catching up ends once the levels are equal.
  const caughtUp = (day) => {
    if (catchingUp && char.level >= cls.level) [catchingUp, equalOn] = [false, day];
  };
  const rows = [];
  for (let day = 1; day <= days; day++) {
    // The day's one 4-hour Kultywacja is still to come.
    let slot = Boolean(cultivation) && cultivate === 'slot';
    // Explorations of 4 hours, and what is left as a shorter one; the hours
    // of Kultywacja come out of them.
    for (let left = hours; left > 0; left -= 4) {
      let length = Math.min(4, left);
      if (catchingUp) {
        length -= meditate(length, true);
        caughtUp(day);
      } else if (slot && length === 4 && (cls.level > char.level || !cultivation.cap)) {
        slot = false;
        length -= meditate(length, cultivation.cap);
      }
      if (length <= 0) continue;
      const place = at === 'class' ? newestTop(cls.level, content) : char.level;
      const xp = engine.xpPerHour(place, content) * length;
      const [toCharacter, toClass] = [charShare(char.level, cls.level), classShare(char.level, cls.level)];
      // The Kultywacja's levels: a share more character XP (applyHunt).
      const cultivationShare = 1 + engine.cultivationBonus(progress.level, content);
      char = gain(char, xp * toCharacter * cultivationShare, charToNext, maxLevel);
      cls = gain(cls, xp * toClass, classToNext, maxLevel);
    }
    const yardLevel = yard ? training.levels[day] : 0;
    if (yardLevel > 0) {
      const xp = engine.trainingXp(char.level, { hours: yardLevel, share: training.share }, content);
      if (variant.yardTo === 'character') char = gain(char, xp, charToNext, maxLevel);
      else cls = gain(cls, xp * classShare(char.level, cls.level), classToNext, maxLevel);
    }
    if (from || day > avatarDay) {
      const work = engine.workXp(char.level, 24 * 60, content) * content.avatar.share;
      char = gain(char, work, charToNext, maxLevel);
    }
    caughtUp(day);
    if (day % 7 === 0 && weeks.includes(day / 7)) rows.push({ week: day / 7, level: char.level, classLevel: cls.level, gap: cls.level - char.level, cultivated, cultivationLevel: progress.level, equalOn });
  }
  return rows;
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const name = argv[i].slice(2);
    const next = argv[i + 1];
    options[name] = next === undefined || next.startsWith('--') ? true : (i++, next);
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const content = engine.buildContent(loadData());
  const [level, classLevel] = typeof options.from === 'string' ? options.from.split('/').map(Number) : [];
  const from = level ? { level, classLevel } : null;
  const weeks = typeof options.weeks === 'string' ? options.weeks.split(',').map(Number) : [1, 2, 4, 8, 12];
  const ids = typeof options.variants === 'string' ? options.variants.split(',') : Object.keys(VARIANTS);
  const ways = typeof options.cultivation === 'string' ? options.cultivation.split(',') : Object.keys(CULTIVATION);
  for (const id of ids) if (!VARIANTS[id]) throw new Error(`No variant ${id}: ${Object.keys(VARIANTS).join(', ')}`);
  for (const way of ways) if (!CULTIVATION[way]) throw new Error(`No way of meditating ${way}: ${Object.keys(CULTIVATION).join(', ')}`);
  const settings = { hours: Number(options.hours ?? 17.5), at: options.at ?? 'class', yard: !options['no-yard'], from, weeks };
  // A row for each variant, and for a Kultywacja one, each way of meditating.
  const runs = ids.flatMap((id) => (VARIANTS[id].cultivation ? ways.map((way) => ({ id, way, label: `${id}/${way}` })) : [{ id, label: id }]));
  const width = Math.max(8, ...runs.map((run) => run.label.length));
  const now = project({ ...settings, variant: VARIANTS.now }, content);
  const days = 7 * Math.max(...weeks);
  console.log(`${settings.hours} h wypraw dziennie, miejsce według poziomu ${settings.at === 'class' ? 'klasy' : 'postaci'}, Plac treningowy: ${settings.yard ? 'tak' : 'nie'}${from ? `, start: postać ${level}, klasa ${classLevel}` : ''}`);
  // The Kultywacja's levels as the game counts them (1248 B).
  if (runs.some((run) => run.way)) {
    const { maxLevel, levelBonus } = content.balance.cultivation;
    const marks = [1, 5, 10, 25, 50, 75, maxLevel].filter((mark) => mark <= maxLevel);
    const hoursTo = (mark) => Math.round(engine.cultivationHours(mark, content) * 10) / 10;
    console.log(`Poziomy Kultywacji (+${Math.round(levelBonus * 1000) / 10}% XP postaci z wypraw za poziom), godziny medytacji: ${marks.map((mark) => `${mark}. po ${hoursTo(mark)} h`).join(', ')}`);
  }
  console.log(`${'tydzień:'.padEnd(width)}${weeks.map((week) => String(week).padStart(16)).join('')}   (postać/klasa, różnica, klasa względem gry teraz)`);
  for (const { id, way, label } of runs) {
    const rows = project({ ...settings, variant: VARIANTS[id], cultivate: way }, content);
    const cells = rows.map((row, i) => {
      const change = row.classLevel - now[i].classLevel;
      return `${row.level}/${row.classLevel} ${String(row.gap).padStart(3)} ${(id === 'now' ? '' : `${change > 0 ? '+' : ''}${change}`).padStart(3)}`.padStart(16);
    });
    const { cultivated, cultivationLevel, equalOn } = rows[rows.length - 1];
    const equal = equalOn === null ? 'poziomy wciąż nierówne' : equalOn === 0 ? 'poziomy równe od początku' : `zrównanie w ${equalOn}. dniu`;
    const notes = way ? `; ${CULTIVATION[way]}: ${Math.round(cultivated)} h Kultywacji (jej poziom ${cultivationLevel}), ${way === 'catch-up' ? equal : `${(cultivated / days).toFixed(1)} h dziennie`}` : '';
    console.log(`${label.padEnd(width)}${cells.join('')}   ${VARIANTS[id].name}${notes}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
