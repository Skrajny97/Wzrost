// The Wojna tab of the Gildia's page (src/server/guild-wars.js): the
// week's league of the wars (the author, 16.11.2026: „niech każda gildia
// walczy z każdą”, „drużyny niech losuje samo”, „każda z każdą gildią 1v1 i
// 3v3 i tyle”), on the Arena's picture in the look of the mock-ups 996 v3:
// the guild's banner and its next rival's (the Siedziba's Sztandar, the
// rival's turned and dyed red) with the guild's place in the league
// between them, and the evenings of the week, each with its result and its
// rival's tag, or "wolne"; the next evening at 20:00 with
// the time left, its rival, how often each team fights and the teams the
// game drew for it, the character's own lit; the league's table; the
// battles fought, each to watch as the Arena's fights (arena.js); the end
// of the league with the place and what it brought; the bar to the next
// team and the rules under "Jak to działa?". On the test version, "Test
// ligi" fights the next evening at a tap and draws the league again.
// Under the league's table, the Krainy pod sztandarem (guild-lands.js, 1200
// A): where the guild leads this week and where it chases, made once for
// the tab and kept as it is drawn anew.
// The words are the server's (data/guilds.json, war.texts), in the page's
// language; the tab's own few go through t() (i18n.js).

import { createArena } from './arena.js';
import { guildLandsCard } from './guild-lands.js';
import { goldArt, placeArt } from './art.js';
import { h, icon } from './dom.js';
import { formatMinutes, formatNumber } from './format.js';
import { language, t } from './i18n.js';
import { call, serverNow } from './state.js';
import { afterSheet, foldPart, howItWorks, openSheet, toast, withButton } from './ui.js';
import { bust } from './screens/select.js';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];
const roman = (team) => ROMAN[team - 1] ?? String(team);
const filled = (text, vars = {}) => text.replace(/\{(\w+)\}/g, (whole, name) => (Object.hasOwn(vars, name) ? String(vars[name]) : whole));
// A text with a team's numeral, kept on the line of the word before it
// ("Drużyna\u00a0II").
const teamText = (template, team) => filled(template.replace(/ \{team\}/g, '\u00a0{team}'), { team: roman(team) });
const ZONE = 'Europe/Warsaw';
// The hour of a moment on the Polish clock ("20:00"): an evening's battles
// may come at another hour than the league's (the first evening, fought
// again at 23:00 on 16.11.2026), and their fights bear it.
const HOUR = new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: ZONE });
const hourAt = (at) => HOUR.format(new Date(at));
// The sheet (ui.js's openSheet), which scrolls as a whole.
const scroller = () => document.getElementById('sheet');

// A noun after a number in its form ([one, few, many]; English gives
// [one, other, other]), the number as the game writes it.
function counted(count, [one, few, many]) {
  const last = count % 10;
  const tens = count % 100;
  const form = count === 1 ? one : last >= 2 && last <= 4 && (tens < 12 || tens > 14) ? few : many;
  return `${formatNumber(count)} ${form}`;
}

// "9–15 listopada", "27 października – 2 listopada" ("9–15 November"):
// the week of the war from its Monday, on the Polish clock.
function weekDates(startsAt) {
  const locale = language() === 'en' ? 'en-GB' : 'pl-PL';
  const first = new Date(startsAt + 12 * 3600000);
  const last = new Date(startsAt + (6 * 24 + 12) * 3600000);
  const day = new Intl.DateTimeFormat(locale, { day: 'numeric', timeZone: ZONE });
  const full = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', timeZone: ZONE });
  const month = new Intl.DateTimeFormat(locale, { month: 'numeric', timeZone: ZONE });
  return month.format(first) === month.format(last) ? `${day.format(first)}–${full.format(last)}` : `${full.format(first)} – ${full.format(last)}`;
}

// The guilds' banners: the Siedziba's Sztandar cut to the figure, drawn on
// a canvas once its picture is in; the rival's turned to face ours, its
// cloth dyed from blue to red (792.1 v2).
let bannerPicture = null;
function bannerImage(id) {
  bannerPicture ??= new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = `/art/guild/${id}.png`;
  });
  return bannerPicture;
}

const CUT = [28, 1, 78, 89];

function banner(id, theirs) {
  const [x0, y0, width, height] = CUT;
  const canvas = h('canvas', { class: 'war-banner', width: String(width), height: String(height), 'aria-hidden': 'true' });
  bannerImage(id)
    .then((image) => {
      const g = canvas.getContext('2d');
      if (!g) return;
      g.imageSmoothingEnabled = false;
      if (theirs) {
        g.translate(width, 0);
        g.scale(-1, 1);
      }
      g.drawImage(image, x0, y0, width, height, 0, 0, width, height);
      if (theirs) dyeRed(g, width, height);
    })
    .catch(() => {
      // Without its picture, the place stays empty.
    });
  return canvas;
}

// The blue of the cloth turned red: hues between 185° and 260° of some
// saturation move by 140°.
function dyeRed(g, width, height) {
  const pixels = g.getImageData(0, 0, width, height);
  const d = pixels.data;
  for (let i = 0; i < d.length; i += 4) {
    const [r, gg, b] = [d[i] / 255, d[i + 1] / 255, d[i + 2] / 255];
    const max = Math.max(r, gg, b);
    const min = Math.min(r, gg, b);
    const l = (max + min) / 2;
    const s = max === min ? 0 : l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
    let hue = 0;
    if (max !== min) {
      if (max === r) hue = ((gg - b) / (max - min) + (gg < b ? 6 : 0)) * 60;
      else if (max === gg) hue = ((b - r) / (max - min) + 2) * 60;
      else hue = ((r - gg) / (max - min) + 4) * 60;
    }
    if (s < 0.18 || hue < 185 || hue > 260) continue;
    const nh = ((hue + 140) % 360) / 360;
    const ns = Math.min(1, s * 1.05);
    const q = l < 0.5 ? l * (1 + ns) : l + ns - l * ns;
    const p = 2 * l - q;
    const f = (x) => {
      let v = x;
      if (v < 0) v += 1;
      if (v > 1) v -= 1;
      if (v < 1 / 6) return p + (q - p) * 6 * v;
      if (v < 1 / 2) return q;
      if (v < 2 / 3) return p + (q - p) * (2 / 3 - v) * 6;
      return p;
    };
    d[i] = Math.round(f(nh + 1 / 3) * 255);
    d[i + 1] = Math.round(f(nh) * 255);
    d[i + 2] = Math.round(f(nh - 1 / 3) * 255);
  }
  g.putImageData(pixels, 0, 0);
}

// A heading between the parts, as the Arena's "Wybierz rywala".
const heading = (text) =>
  h('h2', { class: 'pvp-arena-heading' }, icon('swords', { size: 18, className: 'pvp-arena-ornament' }), h('span', { text }), icon('swords', { size: 18, className: 'pvp-arena-ornament' }));

const portrait = (person) => h('span', { class: 'select-portrait', 'aria-hidden': 'true' }, bust(person));


export function mountGuildWar(container) {
  let view = null;
  let failure = null;
  let gone = false;
  let clock = null;
  let ticker = null;
  let watching = null;
  let asked = 0;
  const holder = h('div', { class: 'war' }, h('p', { class: 'muted', text: t('Wczytywanie…') }));
  container.append(holder);
  // The lands' card (1200 A), asked for once.
  let lands = null;
  const landsPart = () => (lands ??= guildLandsCard());

  async function load() {
    asked += 1;
    const mine = asked;
    try {
      const answer = await call('GET', '/api/guild/war');
      if (mine !== asked || gone) return;
      view = answer;
      failure = null;
    } catch (error) {
      if (mine !== asked || gone) return;
      failure = error;
    }
    render();
  }

  // An action's answer: the tab after it, newer than any look on its way.
  function apply(answer) {
    asked += 1;
    view = answer;
    failure = null;
    if (!gone) render();
  }

  const texts = () => view.texts;
  const member = (id) => view.members[id];
  const own = (id) => id === view.me.id;
  const locale = () => (language() === 'en' ? 'en-GB' : 'pl-PL');
  const capital = (text) => text.charAt(0).toLocaleUpperCase(locale()) + text.slice(1);
  // A balance with its sign: "+12", "−3", "0".
  const signed = (count) => (count > 0 ? `+${formatNumber(count)}` : count < 0 ? `−${formatNumber(-count)}` : '0');
  const ours = () => view.league.table.find((row) => row.ours);
  // Whether any match of the league has been fought: till then, no places.
  const started = () => view.league.table.some((row) => row.played > 0);

  // Busts in a row, the character's own lit (792.1 v2), each with its name
  // under it (the author, 16.11.2026: „brakuje nicków graczy w drużynie
  // gildii”).
  const busts = (ids, few = false) =>
    h(
      'div',
      { class: `war-busts war-busts--named${few ? ' war-busts--few' : ''}` },
      ids.map((id) => {
        const person = member(id);
        return h('span', { class: `war-bust${own(id) ? ' war-bust--own' : ''}`, title: person.name }, portrait(person), h('span', { class: 'war-bust-name', text: person.name }));
      }),
    );

  // A guild's tag, the rival's in red.
  const tagOf = (guild, theirs = false) => h('span', { class: `guild-tag${theirs ? ' war-their-tag' : ''}`, text: `[${guild.tag}]` });

  const setArt = (card) => {
    const art = placeArt(view.backdrop);
    if (art) card.style.setProperty('--place-art', `url("${art}")`);
  };

  // The league's picture: the guild's banner and its next rival's, the
  // guild's place in the league between them, a line of what matters now
  // and the week's evenings.
  function hero() {
    const { league, week } = view;
    const words = texts();
    const row = ours();
    const rival = league.next?.matches[0]?.rival ?? null;
    const card = h(
      'section',
      { class: 'card war-hero' },
      heading(words.title),
      h('p', { class: 'war-hero-date', text: filled(words.dates, { dates: weekDates(week.startsAt), day: week.today + 1 }) }),
      h(
        'div',
        { class: 'war-versus' },
        banner(view.banner, false),
        // Before the first evening "VS"; then the guild's place.
        started()
          ? h(
              'div',
              { class: 'war-score' },
              h('p', { class: 'war-score-line' }, h('span', { class: 'war-score-ours', text: `${formatNumber(row.place)}.` })),
              h('p', { class: 'war-score-label', text: filled(words.placeOf, { count: formatNumber(league.guilds) }) }),
            )
          : h('div', { class: 'war-score' }, h('p', { class: 'war-score-line' }, h('span', { class: 'war-score-ours', text: words.versus }))),
        rival ? banner(view.banner, true) : h('span'),
      ),
      h(
        'div',
        { class: 'war-names' },
        h('div', { class: 'war-name' }, tagOf(view.guild), h('span', { class: 'war-name-text', text: view.guild.name })),
        rival
          ? h(
              'div',
              { class: 'war-name war-name--theirs' },
              tagOf(rival, true),
              h('span', { class: 'war-name-text', text: rival.name }),
              h('span', { class: 'war-name-members', text: eveningShort(league.next.day) }),
            )
          : h('span'),
      ),
      leadLine(),
      weekTiles(),
    );
    setArt(card);
    return card;
  }

  // What matters now, in a gold pill: the first evening, the place and the
  // points, or how the league ended.
  function leadLine() {
    const { league, week } = view;
    const words = texts();
    const row = ours();
    let line;
    if (league.end) line = { icon: 'trophy', text: league.end.place === 1 ? words.lead.won : filled(words.lead.ended, { place: league.end.place }) };
    else if (row.played === 0 && league.next?.day === week.today) line = { icon: 'hourglass', text: filled(words.lead.first, { hour: hourAt(league.next.at) }) };
    else if (row.played === 0 && league.next?.day === week.today + 1) line = { icon: 'hourglass', text: filled(words.lead.firstTomorrow, { hour: hourAt(league.next.at) }) };
    else if (row.place === 1 && row.played > 0) line = { icon: 'trophy', text: filled(words.lead.top, { balance: signed(row.balance) }) };
    else line = { icon: 'swords', text: filled(words.lead.place, { place: row.place, balance: signed(row.balance) }) };
    return h('p', { class: 'war-lead' }, icon(line.icon, { size: 18 }), h('span', { text: line.text }));
  }

  // The week: a tile for each evening, its result in battles won and lost
  // and the rival's tag, or "wolne" on the guild's free evening; today's
  // with crossed swords while its battles are to come.
  function weekTiles() {
    const { league, week } = view;
    const words = texts();
    return h(
      'div',
      { class: 'war-week', role: 'list', 'aria-label': words.daysLabel },
      league.days.map((day) => {
        const [match] = day.matches;
        let kind = 'future';
        let score = '–';
        if (!match) kind = 'none';
        else if (day.matches.every((one) => one.fought)) {
          // The evening's balance of fights: a few signs fit the tile.
          const balance = day.matches.reduce((sum, one) => sum + one.score[0] - one.score[1], 0);
          const results = day.matches.map((one) => one.result);
          kind = results.every((one) => one === 'win') ? 'win' : results.every((one) => one === 'loss') ? 'loss' : 'even';
          score = signed(balance);
        } else if (day.day === week.today && league.next?.day === day.day) kind = 'today';
        const rival = match ? day.matches.map((one) => one.rival.tag).join(' ') : day.free ? words.free : '';
        return h(
          'div',
          { class: `war-day war-day--${kind}`, role: 'listitem', 'aria-label': `${words.days[day.day]}: ${rival} ${score}`.trim() },
          h('span', { class: 'war-day-name', text: words.dayNames[day.day] }),
          h('span', { class: 'war-day-score' }, kind === 'today' ? icon('swords', { size: 18 }) : score),
          h('span', { class: 'war-day-rival', text: rival || ' ' }),
        );
      }),
    );
  }

  // When an evening's battles are: "Dziś o 20:00", "Jutro o 20:00", or the
  // day's name; the next evening's at its own hour.
  function eveningName(day) {
    const words = texts();
    const { today } = view.week;
    const hour = view.league?.next?.day === day ? hourAt(view.league.next.at) : view.hour;
    if (day === today) return filled(words.todayAt, { hour });
    if (day === today + 1) return filled(words.tomorrowAt, { hour });
    return capital(filled(words.dayAt, { day: words.days[day], hour }));
  }

  // The same, under the rival's name: "dziś", "jutro" or the day.
  function eveningShort(day) {
    const words = texts();
    const { today } = view.week;
    return day === today ? words.today : day === today + 1 ? words.tomorrow : words.days[day];
  }

  // The time left to the next battles: "za 2 h 14 min".
  function clockText() {
    const left = view.league.next.at - serverNow();
    if (left <= 60000) return texts().clockNow;
    return filled(texts().clock, { time: formatMinutes(Math.floor(left / 60000)) });
  }

  // The character's own trio that evening, and its duels.
  function ownTeam() {
    const words = texts();
    const { me, teams } = view;
    if (me.team === null) return [h('p', { class: 'muted', text: words.yourDuels })];
    const lineup = teams.lineups[me.team - 1];
    return [
      h('p', { class: 'war-sub' }, h('span', { text: teamText(words.yourTeam, me.team) }), h('span', { class: `war-sub-count${lineup.length < teams.size ? ' war-sub-count--short' : ''}`, text: filled(words.count, { count: lineup.length, size: teams.size }) })),
      busts(lineup),
      h('p', { class: 'muted', text: words.yourDuels }),
    ];
  }

  // A match of the next evening: its rival, its duels and trio fights, and
  // the walkovers of the guild with fewer trios.
  function matchLine(match) {
    const words = texts();
    return h(
      'div',
      { class: 'war-match' },
      h('p', { class: 'war-match-rival' }, h('span', { class: 'war-match-label', text: words.rivalLabel }), tagOf(match.rival, true), h('span', { class: 'war-match-name', text: match.rival.name })),
      h('p', { class: 'war-clock-note', text: filled(words.duelsLine, { count: counted(match.duels, words.duelForms) }) }),
      h('p', { class: 'war-clock-note', text: filled(words.triosLine, { count: counted(match.trioFights, words.fightForms) }) }),
      match.walkovers.ours > 0 && h('p', { class: 'war-warn', text: filled(words.walkoversOurs, { count: counted(match.walkovers.ours, words.fightForms) }) }),
      match.walkovers.theirs > 0 && h('p', { class: 'muted', text: filled(words.walkoversTheirs, { count: counted(match.walkovers.theirs, words.fightForms) }) }),
    );
  }

  // The next evening: the time left on the plaque, its matches and the
  // character's own trio.
  function eveningPart() {
    const { league } = view;
    const { next } = league;
    clock = h('p', { class: 'war-clock', text: clockText() });
    return [
      heading(eveningName(next.day)),
      h(
        'section',
        { class: 'card war-today' },
        h('div', { class: 'pvp-arena-plaque war-plaque' }, icon('hourglass', { size: 30, className: 'pvp-arena-plaque-icon' }), h('div', { class: 'pvp-arena-plaque-text' }, clock)),
        next.matches.map(matchLine),
        h('hr', { class: 'war-rule' }),
        ownTeam(),
      ),
    ];
  }

  // The trios the game drew for the guild's next evening, each with its
  // busts, the one short of members marked (the author: „drużyny niech
  // losuje samo”, „walkower jak brakuje członków”).
  function teamsPart() {
    const words = texts();
    const { teams } = view;
    const block = (team) => {
      const ids = teams.lineups[team - 1];
      const short = ids.length < teams.size;
      return h(
        'div',
        { class: 'war-team-block' },
        h('p', { class: 'war-sub' }, h('span', { text: teamText(words.teamName, team) }), h('span', { class: `war-sub-count${short ? ' war-sub-count--short' : ''}`, text: short ? `${filled(words.count, { count: ids.length, size: teams.size })} · ${words.shortTeam}` : filled(words.count, { count: ids.length, size: teams.size }) })),
        busts(ids),
      );
    };
    const day = view.league?.next?.day;
    const title = day === undefined ? words.teamsTitle : filled(words.teamsFor, { when: day === view.week.today ? words.today : day === view.week.today + 1 ? words.tomorrow : words.daysOn[day] });
    return h(
      'section',
      { class: 'card war-teams' },
      foldPart(
        { key: 'guild-war-teams', title, line: words.drawnNote, open: false },
        h('div', { class: 'war-teams-body' }, Array.from({ length: teams.count }, (_, index) => [index > 0 && h('hr', { class: 'war-rule' }), block(index + 1)])),
      ),
    );
  }

  // The league's table: each guild's place, tag and name, its evenings
  // won, drawn and lost, its battles and points; the guild's own lit, the
  // podium marked.
  function tablePart() {
    const { league } = view;
    const words = texts();
    const columns = words.columns;
    return [
      heading(words.tableTitle),
      h(
        'section',
        { class: 'card war-table-card' },
        h(
          'div',
          { class: 'war-table-wrap' },
          h(
            'table',
            { class: 'war-table' },
            h(
              'thead',
              {},
              h(
                'tr',
                {},
                h('th', { scope: 'col', class: 'war-table-place', text: columns.place }),
                h('th', { scope: 'col', class: 'war-table-guild', text: columns.guild }),
                h('th', { scope: 'col', class: 'war-table-num', text: columns.won }),
                h('th', { scope: 'col', class: 'war-table-num', text: columns.lost }),
                h('th', { scope: 'col', class: 'war-table-num war-table-points', text: columns.balance }),
              ),
            ),
            h(
              'tbody',
              {},
              league.table.map((row) =>
                h(
                  'tr',
                  { class: `war-table-row${row.ours ? ' war-table-row--ours' : ''}${row.place <= 3 && row.played > 0 ? ` war-table-row--podium war-table-row--${row.place}` : ''}` },
                  h('td', { class: 'war-table-place', text: started() ? `${row.place}.` : '–' }),
                  h('td', { class: 'war-table-guild' }, h('span', { class: 'guild-tag', text: `[${row.tag}]` }), h('span', { class: 'war-table-name', text: row.name })),
                  h('td', { class: 'war-table-num', text: formatNumber(row.fightsWon) }),
                  h('td', { class: 'war-table-num', text: formatNumber(row.fightsLost) }),
                  h('td', { class: 'war-table-num war-table-points', text: signed(row.balance) }),
                ),
              ),
            ),
          ),
        ),
        h('p', { class: 'muted war-table-note', text: words.tableNote }),
      ),
    ];
  }

  // The guild's matches all played before the league's end on Sunday.
  function donePart() {
    return h(
      'section',
      { class: 'card war-today' },
      h(
        'div',
        { class: 'pvp-arena-plaque war-plaque' },
        icon('hourglass', { size: 30, className: 'pvp-arena-plaque-icon' }),
        // The hour kept on the line of the word before it ("o\u00a020:00").
        h('div', { class: 'pvp-arena-plaque-text' }, h('p', { class: 'war-clock-note', text: filled(texts().doneAll.replace(/ \{hour\}/g, '\u00a0{hour}'), { hour: view.hour }) })),
      ),
    );
  }

  // The league's end: the guild's place and what it brought.
  function endPart() {
    const { league } = view;
    const words = texts();
    const { end } = league;
    const text =
      end.items > 0
        ? filled(words.endPrize, { place: end.place, fame: counted(end.fame, words.fameForms), items: counted(end.items, words.itemForms) })
        : end.fame > 0
          ? filled(words.endFame, { place: end.place, fame: counted(end.fame, words.fameForms) })
          : filled(words.endPlace, { place: end.place });
    return [
      heading(words.endTitle),
      h(
        'section',
        { class: 'card war-today' },
        h(
          'div',
          { class: 'pvp-arena-plaque war-plaque' },
          icon(end.place <= 3 ? 'trophy' : 'swords', { size: 30, className: 'pvp-arena-plaque-icon' }),
          h('div', { class: 'pvp-arena-plaque-text' }, h('p', { class: 'war-end', text: end.place === 1 ? words.lead.won : filled(words.lead.final, { place: end.place }) }), h('p', { class: 'war-clock-note', text })),
        ),
        h('p', { class: 'muted', text: words.next }),
      ),
    ];
  }

  // The trios' marks, three to a trio, and how many members the last one
  // needs to be full: a trio short of members loses by walkover.
  function nextTeamPart() {
    const words = texts();
    const { teams } = view;
    if (teams.next === null) return null;
    const groups = teams.count;
    const missing = teams.next - teams.members;
    return h(
      'section',
      { class: 'card war-next' },
      h('h2', { class: 'card-title', text: words.nextTitle }),
      h('div', { class: 'war-meter-label' }, h('span', { text: words.membersLabel }), h('span', {}, h('b', { text: formatNumber(teams.members) }), ` / ${formatNumber(teams.next)}`)),
      h(
        'div',
        { class: 'war-meter-marks', 'aria-hidden': 'true', vars: { '--war-groups': String(groups) } },
        Array.from({ length: groups }, (_, group) =>
          h(
            'div',
            { class: `war-meter-group${group === groups - 1 ? ' war-meter-group--open' : ''}` },
            h('div', { class: 'war-meter-cells' }, Array.from({ length: teams.size }, (__, index) => h('span', { class: `war-meter-mark${group * teams.size + index < teams.members ? ' war-meter-mark--on' : ''}` }))),
            h('span', { class: 'war-meter-group-name', text: groups > 3 ? roman(group + 1) : teamText(words.groupName, group + 1) }),
          ),
        ),
      ),
      h('p', { text: filled(words.nextNeed, { missing: counted(missing, words.missingForms) }) }),
    );
  }

  // When an evening was, as the battles' list says it: "Dziś", "Wczoraj"
  // or the day's name.
  function dayName(day) {
    const words = texts();
    return capital(day === view.week.today ? words.today : day === view.week.today - 1 ? words.yesterday : words.days[day]);
  }

  // The evenings fought: each with its rival, the result and the fights won
  // and lost, by format, with the walkovers.
  function eveningsPart() {
    const { league } = view;
    const words = texts();
    const fought = league.days.flatMap((day) => day.matches.filter((match) => match.fought).map((match) => ({ ...match, day: day.day }))).reverse();
    if (fought.length === 0) return null;
    const last = fought[0];
    const line = filled(words.eveningsLine, { day: dayName(last.day), result: words.results[last.result], won: formatNumber(last.score[0]), lost: formatNumber(last.score[1]) });
    return h(
      'section',
      { class: 'card war-recent' },
      foldPart(
        { key: 'guild-war-evenings', title: words.evenings, line, open: false },
        h(
          'ul',
          { class: 'war-battles' },
          fought.map((match) =>
            h(
              'li',
              { class: 'war-battle' },
              h('span', { class: `pvp-arena-badge pvp-arena-badge--${match.result === 'void' ? 'draw' : match.result}`, text: words.results[match.result] }),
              h(
                'div',
                { class: 'war-battle-text' },
                h('p', {}, `${dayName(match.day)} `, tagOf(match.rival, true), ` ${match.rival.name} · ${formatNumber(match.score[0])}:${formatNumber(match.score[1])}`),
                match.result === 'void'
                  ? h('p', { class: 'muted', text: words.voidLine })
                  : [
                      h('p', { class: 'muted', text: filled(words.matchLine, { duelsWon: match.duels.won, duelsLost: match.duels.lost, triosWon: match.trios.won, triosLost: match.trios.lost }) }),
                      (match.trios.walkoversWon > 0 || match.trios.walkoversLost > 0) && h('p', { class: 'muted', text: filled(words.walkoversLine, { won: match.trios.walkoversWon, lost: match.trios.walkoversLost }) }),
                    ],
              ),
              // A match of walkovers only (a rival gone) has no fights.
              match.duels.won + match.duels.lost + match.duels.drawn + match.trios.won + match.trios.lost + match.trios.drawn > 0 &&
                h(
                  'button',
                  { type: 'button', class: 'button button--world button--small war-watch', onClick: (event) => withButton(event.currentTarget, () => allFights(match)) },
                  icon('eye', { size: 18 }),
                  h('span', { text: words.allFights }),
                ),
            ),
          ),
        ),
      ),
    );
  }

  // The character's own fights of its latest evening, folded; each to
  // watch at a tap (the evenings before are in "Wyniki wieczorów").
  function recentPart() {
    const { league } = view;
    const words = texts();
    const all = league?.battles ?? [];
    const last = all[0]?.day;
    const battles = all.filter((one) => one.day === last);
    const won = battles.filter((one) => one.result === 'win').length;
    const lost = battles.filter((one) => one.result === 'loss').length;
    const line = battles.length === 0 ? words.noBattles : `${dayName(last)}: ${formatNumber(won)}:${formatNumber(lost)}`;
    return h(
      'section',
      { class: 'card war-recent' },
      foldPart(
        { key: 'guild-war-recent', title: words.recent, line, open: false },
        // With no fights the line under the title says it, once.
        battles.length === 0
          ? null
          : h(
              'ul',
              { class: 'war-fights' },
              battles.map((battle) =>
                h(
                  'li',
                  { class: 'war-fight' },
                  h('span', { class: `pvp-arena-badge pvp-arena-badge--${battle.result}`, text: words.results[battle.result] }),
                  h('p', { class: 'war-fight-text' }, `${versusText(battle)} `, tagOf(battle.rival, true)),
                  battle.replay &&
                    h(
                      'button',
                      {
                        type: 'button',
                        class: 'button button--world button--small war-fight-watch',
                        'aria-label': `${words.watch}: ${versusText(battle)}`,
                        title: words.watch,
                        onClick: (event) => withButton(event.currentTarget, () => watch(battle)),
                      },
                      icon('eye', { size: 18 }),
                    ),
                ),
              ),
            ),
      ),
    );
  }

  // A fight in words: "1v1 z: Bogumił" or "3v3, Trójka II przeciw: …".
  const versusText = (battle) =>
    battle.format === '1v1' ? filled(texts().versusDuel, { names: battle.opponents.join(', ') }) : filled(teamText(texts().versusTrio, battle.ourTeam), { names: battle.opponents.join(', ') });

  // A fight's line with the guilds' tags in the sheet.
  function versus(battle) {
    const tag = (text, theirs) => h('span', { class: `guild-tag${theirs ? ' war-their-tag' : ''}`, text: `[${text}]` });
    return h('p', { class: 'war-result-teams' }, tag(battle.ourTag), ` ${versusText(battle)} `, tag(battle.theirTag, true));
  }

  // A battle played back in a sheet: its result over the playback, who
  // stayed on their feet and what the character got (792.4 v2).
  async function watch(line, back = null) {
    const { battle } = await call('GET', `/api/guild/war/battles/${line.id}`);
    if (gone) return;
    const words = texts();
    const standing =
      battle.result === 'win'
        ? battle.standing.ours.map((index) => battle.ours[index])
        : battle.result === 'loss'
          ? battle.standing.theirs.map((index) => battle.theirs[index])
          : [...battle.standing.ours.map((index) => battle.ours[index]), ...battle.standing.theirs.map((index) => battle.theirs[index])];
    watching?.stop();
    const playback = createArena(battle.fight, { autoplay: 'now', board: view.fightBoard });
    watching = playback;
    const stop = () => {
      playback.stop();
      if (watching === playback) watching = null;
    };
    openSheet(
      h('h2', { class: 'sheet-title', text: filled(words.battleTitle, { when: dayName(battle.day).toLocaleLowerCase(locale()), hour: hourAt(battle.at) }) }),
      h(
        'div',
        { class: 'war-sheet' },
        back &&
          h(
            'button',
            {
              type: 'button',
              class: 'button button--world button--small war-back',
              onClick: () => {
                stop();
                back();
              },
            },
            icon('back', { size: 18 }),
            h('span', { text: words.backToList }),
          ),
        h(
          'section',
          { class: `card war-result war-result--${battle.result}` },
          h('div', { class: 'war-result-head' }, h('span', { class: `pvp-arena-badge pvp-arena-badge--${battle.result}`, text: words.results[battle.result] }), versus(battle)),
          standing.length > 0 && [
            h('p', { class: 'muted', text: words.standing }),
            h('div', { class: 'war-standing' }, standing.map((one) => h('span', { class: 'war-standing-one' }, portrait(one), h('span', { text: one.name })))),
          ],
          battle.reward &&
            h(
              'div',
              { class: 'war-reward' },
              h('p', { class: 'muted', text: words.reward }),
              h(
                'ul',
                { class: 'guild-chest' },
                h('li', {}, goldArt(20), h('span', { text: filled(words.gold, { count: formatNumber(battle.reward.gold) }) })),
              ),
            ),
        ),
        playback.element,
      ),
    );
    // The sheet scrolls as a whole: a fight watched from the list starts
    // at its top.
    scroller().scrollTop = 0;
    afterSheet(stop);
  }

  // Every fight of a match, not only the character's own (the author,
  // 16.11.2026: „Wszystkie walki mają być możliwe do obejrzenia, każda nie
  // tylko własna”), in a sheet under the match's result: the trios' fights
  // by the guild's trio, the duels by its member, each group with its
  // fights won and lost, the character's own first and open (1038). Each
  // fight to watch, and from it back to the list as it was.
  async function allFights(match) {
    const { battles } = await call('GET', `/api/guild/war/matches/${match.id}/battles`);
    if (gone) return;
    const words = texts();
    const fight = (line, text) =>
      h(
        'li',
        { class: `war-fight${line.fought ? ' war-fight--own' : ''}` },
        h('span', { class: `pvp-arena-badge pvp-arena-badge--${line.result}`, text: words.results[line.result] }),
        h('p', { class: 'war-fight-text', text }),
        line.replay &&
          h(
            'button',
            {
              type: 'button',
              class: 'button button--world button--small war-fight-watch',
              'aria-label': `${words.watch}: ${text}`,
              title: words.watch,
              onClick: (event) =>
                withButton(event.currentTarget, () => {
                  const at = scroller().scrollTop;
                  return watch(line, () => show(at));
                }),
            },
            icon('eye', { size: 18 }),
          ),
      );
    // The fights of a format in groups (by `keyOf`), in the order they
    // came, the character's own group first.
    const groups = (format, keyOf, titleOf, textOf) => {
      const byKey = new Map();
      for (const line of battles.filter((one) => one.format === format)) byKey.set(keyOf(line), [...(byKey.get(keyOf(line)) ?? []), line]);
      const list = [...byKey.values()].sort((a, b) => Number(b.some((one) => one.fought)) - Number(a.some((one) => one.fought)));
      return list.map((lines) => {
        const own = lines.some((one) => one.fought);
        const won = lines.filter((one) => one.result === 'win').length;
        const lost = lines.filter((one) => one.result === 'loss').length;
        return h(
          'details',
          { class: `war-group${own ? ' war-group--own' : ''}`, open: own },
          h(
            'summary',
            { class: 'war-group-summary' },
            h('span', { class: 'war-group-title', text: titleOf(lines[0]) }),
            h('span', { class: 'war-group-score', text: `${formatNumber(won)}:${formatNumber(lost)}` }),
            h('span', { class: 'fold-part-marker', 'aria-hidden': 'true' }),
          ),
          h(
            'ul',
            { class: 'war-fights' },
            lines.map((line) => fight(line, textOf(line))),
          ),
        );
      });
    };
    const team = (number, names) => `${teamText(words.teamName, number)}: ${names.join(', ')}`;
    const trios = groups(
      '3v3',
      (line) => line.ourTeam,
      (line) => team(line.ourTeam, line.ours),
      (line) => team(line.theirTeam, line.theirs),
    );
    const duels = groups(
      '1v1',
      (line) => line.ours[0],
      (line) => line.ours[0],
      (line) => filled(words.duelWith, { name: line.theirs[0] }),
    );
    const part = (title, list) => list.length > 0 && h('section', { class: 'card war-groups-part' }, h('h3', { class: 'card-title', text: title }), h('div', { class: 'war-groups' }, list));
    const content = [
      h('h2', { class: 'sheet-title', text: filled(words.allFightsTitle, { when: dayName(match.day).toLocaleLowerCase(locale()) }) }),
      h(
        'div',
        { class: 'war-sheet' },
        h(
          'section',
          { class: `card war-result war-result--${match.result}` },
          h(
            'div',
            { class: 'war-result-head' },
            h('span', { class: `pvp-arena-badge pvp-arena-badge--${match.result}`, text: words.results[match.result] }),
            h('p', { class: 'war-result-teams' }, tagOf(match.rival, true), ` ${match.rival.name} · ${formatNumber(match.score[0])}:${formatNumber(match.score[1])}`),
          ),
          h('p', { class: 'muted', text: filled(words.matchLine, { duelsWon: match.duels.won, duelsLost: match.duels.lost, triosWon: match.trios.won, triosLost: match.trios.lost }) }),
          (match.trios.walkoversWon > 0 || match.trios.walkoversLost > 0) && h('p', { class: 'muted', text: filled(words.walkoversLine, { won: match.trios.walkoversWon, lost: match.trios.walkoversLost }) }),
        ),
        battles.length === 0 ? h('p', { class: 'muted', text: words.noFights }) : [part(words.triosTitle, trios), part(words.duelsTitle, duels)],
      ),
    ];
    // Back from a fight, the list as it was: its groups open or folded and
    // where it was scrolled to.
    function show(at = 0) {
      openSheet(...content);
      scroller().scrollTop = at;
    }
    show();
  }

  // "Test ligi" on the test version: the next evening of the whole league
  // at a tap, a day ahead too, and the league drawn again from today.
  function testPart() {
    const { test } = view;
    if (!test) return null;
    const words = texts();
    const run = (body, said) => (event) =>
      withButton(event.currentTarget, async () => {
        apply(await call('POST', '/api/test/guild-war', body));
        toast(said);
      });
    return h(
      'section',
      { class: 'card war-test' },
      h('h2', { class: 'card-title', text: t('Test ligi') }),
      h('p', { class: 'muted', text: t('Na wersji testowej rozegrasz tu od razu następny wieczór całej ligi, dzień po dniu, aż do niedzieli i końca ligi, albo wylosujesz ligę od nowa, od dziś.') }),
      test.fight !== null && h('button', { type: 'button', class: 'button button--system', text: t('Rozegraj wieczór: {day}', { day: words.days[test.fight] }), onClick: run({ action: 'fight' }, t('Wieczór rozegrany.')) }),
      h('button', { type: 'button', class: 'button button--world', text: t('Losuj ligę od nowa'), onClick: run({ action: 'redraw' }, t('Liga wylosowana od nowa.')) }),
    );
  }

  // No league for the guild this week: why, and when the next one is.
  function noLeague() {
    const words = texts();
    const card = h(
      'section',
      { class: 'card war-hero war-none' },
      heading(words.title),
      h('p', { class: 'war-hero-date', text: weekDates(view.week.startsAt) }),
      h('p', { class: 'war-none-text', text: words.none[view.none] }),
      h('p', { class: 'war-none-next' }, icon('hourglass', { size: 18 }), h('span', { text: words.noneNext })),
    );
    setArt(card);
    return card;
  }

  function overview() {
    const { league } = view;
    if (!league) return [noLeague(), landsPart(), teamsPart(), nextTeamPart(), howItWorks(null, texts().how), testPart()];
    return [
      hero(),
      league.next ? eveningPart() : league.end ? endPart() : donePart(),
      league.next && teamsPart(),
      tablePart(),
      landsPart(),
      eveningsPart(),
      recentPart(),
      nextTeamPart(),
      howItWorks(null, texts().how),
      testPart(),
    ];
  }

  function render() {
    clearInterval(ticker);
    clock = null;
    if (failure) {
      holder.replaceChildren(h('section', { class: 'card' }, h('p', { class: 'muted', text: failure.message ?? t('Nie udało się wczytać wojny.') })));
      return;
    }
    if (!view) return;
    if (!view.guild) {
      holder.replaceChildren(h('section', { class: 'card' }, h('p', { class: 'muted', text: view.texts.noGuild })));
      return;
    }
    holder.replaceChildren(...[overview()].flat(Infinity).filter(Boolean));
    // The time left goes down every half a minute; when the battles come,
    // the league is asked again.
    if (view.league?.next) {
      ticker = setInterval(() => {
        if (serverNow() >= view.league.next.at + 30000) {
          clearInterval(ticker);
          load();
          return;
        }
        if (clock) clock.textContent = clockText();
      }, 30000);
    }
  }

  load();
  return {
    unmount() {
      gone = true;
      clearInterval(ticker);
      watching?.stop();
    },
  };
}
