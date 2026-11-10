// The Wojna tab of the Gildia's page (src/server/guild-wars.js; the
// author's 792–800, the mock-ups 792.1–792.4 v2 he accepted): the war of
// the week on the Arena's picture, both guilds' banners (the Siedziba's
// Sztandar, the rival's turned and dyed red) and the score in battles won,
// the days of the week with their results; the battles of the next evening
// at 20:00 with the time left, how often each team fights and the
// character's own team; a guild with fewer than six teams also sees all its
// teams with the reserve, the bar to its next team and why its teams fight
// more often (795 B); the battles fought, each to watch as the Arena's
// fights (arena.js); and the rules under "Jak to działa?". "Drużyny" opens
// the teams: medallions I–VI, the team chosen with each member's portrait,
// name, class and level, "Zajmij" on a free place and ⇄ for the leader and
// the deputies (or a member's own row), and the members without a team. No
// Moc anywhere: the game does not count it. On the test version, "Test
// wojny" begins a war with the mirror guild and fights an evening at a tap.
// The words are the server's (data/guilds.json, war.texts), in the page's
// language; the tab's own few go through t() (i18n.js).

import { createArena } from './arena.js';
import { goldArt, placeArt } from './art.js';
import { h, icon } from './dom.js';
import { formatMinutes, formatNumber } from './format.js';
import { language, t } from './i18n.js';
import { CLASS_ICONS, SYSTEM_POINTS_ICON } from './icons.js';
import { openProfile } from './profile.js';
import { call, serverNow } from './state.js';
import { afterSheet, closeSheet, foldPart, framedName, howItWorks, openSheet, toast, withButton } from './ui.js';
import { bust } from './screens/select.js';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];
const roman = (team) => ROMAN[team - 1] ?? String(team);
const filled = (text, vars = {}) => text.replace(/\{(\w+)\}/g, (whole, name) => (Object.hasOwn(vars, name) ? String(vars[name]) : whole));
// A text with a team's numeral, kept on the line of the word before it
// ("Drużyna\u00a0II").
const teamText = (template, team) => filled(template.replace(/ \{team\}/g, '\u00a0{team}'), { team: roman(team) });
const ZONE = 'Europe/Warsaw';

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

// A character's name that opens its card.
const nameButton = (person) =>
  framedName(
    h('button', {
      type: 'button',
      class: 'chat-name',
      text: person.name,
      'aria-label': t('{name}: zobacz postać', { name: person.name }),
      onClick: (event) => withButton(event.currentTarget, () => openProfile(person.name)),
    }),
    person.nameColor ?? null,
  );

export function mountGuildWar(container) {
  let view = null;
  let failure = null;
  let page = 'overview';
  let chosen = null;
  let gone = false;
  let clock = null;
  let ticker = null;
  let watching = null;
  let asked = 0;
  const holder = h('div', { class: 'war' }, h('p', { class: 'muted', text: t('Wczytywanie…') }));
  container.append(holder);

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
  const lead = () => view.guild.role === 'leader' || view.guild.role === 'deputy';

  // Busts in a row, the character's own lit (792.1 v2).
  const busts = (ids, few = false) =>
    h(
      'div',
      { class: `war-busts${few ? ' war-busts--few' : ''}` },
      ids.map((id) => {
        const person = member(id);
        return h('span', { class: `war-bust${own(id) ? ' war-bust--own' : ''}`, title: person.name }, portrait(person));
      }),
    );

  // The war's picture: the guilds under their banners, the score between
  // them, a line of what matters now and the week's days.
  function hero() {
    const { war, week } = view;
    const words = texts();
    const small = war.ours.teams < view.teams.max;
    const card = h(
      'section',
      { class: 'card war-hero' },
      heading(words.title),
      h('p', { class: 'war-hero-date', text: filled(words.dates, { dates: weekDates(week.startsAt), day: week.today + 1 }) }),
      h(
        'div',
        { class: 'war-versus' },
        banner(view.banner, false),
        h(
          'div',
          { class: 'war-score' },
          h(
            'p',
            { class: 'war-score-line' },
            h('span', { class: 'war-score-ours', text: formatNumber(war.score[0]) }),
            h('span', { class: 'war-score-colon', text: ':' }),
            h('span', { class: 'war-score-theirs', text: formatNumber(war.score[1]) }),
          ),
          h('p', { class: 'war-score-label', text: words.wonBattles }),
        ),
        banner(view.banner, true),
      ),
      h(
        'div',
        { class: 'war-names' },
        [
          [war.ours, false],
          [war.theirs, true],
        ].map(([guild, theirs]) =>
          h(
            'div',
            { class: `war-name${theirs ? ' war-name--theirs' : ''}` },
            h('span', { class: 'guild-tag', text: `[${guild.tag}]` }),
            h('span', { class: 'war-name-text', text: guild.name }),
            small && h('span', { class: 'war-name-members', text: counted(guild.members, words.memberForms) }),
          ),
        ),
      ),
      leadLine(),
      weekTiles(),
    );
    setArt(card);
    return card;
  }

  const setArt = (card) => {
    const art = placeArt(view.backdrop);
    if (art) card.style.setProperty('--place-art', `url("${art}")`);
  };

  // What matters now, in a gold pill: the first battles, who leads and by
  // how much, or how the war ended.
  function leadLine() {
    const { war, week } = view;
    const words = texts();
    const [ours, theirs] = war.score;
    let line;
    if (war.result) line = { icon: war.result === 'win' ? 'trophy' : 'swords', text: words.lead[{ win: 'won', loss: 'lost', draw: 'draw' }[war.result]] };
    else if (ours > theirs) line = { icon: 'trophy', text: filled(words.lead.ahead, { count: counted(ours - theirs, words.leadForms) }) };
    else if (theirs > ours) line = { icon: 'swords', text: filled(words.lead.behind, { count: counted(theirs - ours, words.leadForms) }) };
    else if (!war.days.some((day) => day.fought) && war.next?.day === week.today) line = { icon: 'hourglass', text: filled(words.lead.first, { hour: view.hour }) };
    else if (!war.days.some((day) => day.fought) && war.next?.day === week.today + 1) line = { icon: 'hourglass', text: filled(words.lead.firstTomorrow, { hour: view.hour }) };
    else line = { icon: 'swords', text: words.lead.even };
    return h('p', { class: 'war-lead' }, icon(line.icon, { size: 18 }), h('span', { text: line.text }));
  }

  // The week: a tile for each day, its battles won and lost; today's with
  // crossed swords while its battles are to come.
  function weekTiles() {
    const { war, week } = view;
    const words = texts();
    return h(
      'div',
      { class: 'war-week', role: 'list', 'aria-label': words.daysLabel },
      war.days.map((day) => {
        let kind = 'future';
        let score = '–';
        if (day.fought) {
          const [won, lost] = day.wins;
          kind = won > lost ? 'win' : won < lost ? 'loss' : 'even';
          score = `${won}:${lost}`;
        } else if (day.skipped || day.day < week.today) kind = 'none';
        else if (day.day === week.today && war.next?.day === day.day) kind = 'today';
        return h(
          'div',
          { class: `war-day war-day--${kind}`, role: 'listitem', 'aria-label': `${words.days[day.day]}: ${score}` },
          h('span', { class: 'war-day-name', text: words.dayNames[day.day] }),
          h('span', { class: 'war-day-score' }, kind === 'today' ? icon('swords', { size: 18 }) : score),
        );
      }),
    );
  }

  // When the next evening's battles are: "Dziś o 20:00", "Jutro o 20:00",
  // or the day's name.
  function eveningName(day) {
    const words = texts();
    const { today } = view.week;
    if (day === today) return filled(words.todayAt, { hour: view.hour });
    if (day === today + 1) return filled(words.tomorrowAt, { hour: view.hour });
    const name = filled(words.dayAt, { day: words.days[day], hour: view.hour });
    return name.charAt(0).toLocaleUpperCase(language() === 'en' ? 'en-GB' : 'pl-PL') + name.slice(1);
  }

  // The time left to the next battles: "za 2 h 14 min".
  function clockText() {
    const left = view.war.next.at - serverNow();
    if (left <= 60000) return texts().clockNow;
    return filled(texts().clock, { time: formatMinutes(Math.floor(left / 60000)) });
  }

  // How often the guild's teams fight that evening (795 B).
  function fightsNote() {
    const words = texts();
    const { fights } = view.war.next;
    const times = (count) => (count === 1 ? words.once : filled(words.times, { count }));
    if (fights.length === 1) return filled(words.oneTeam, { times: times(fights[0]) });
    if (fights.every((count) => count === fights[0])) return filled(words.everyTeam, { times: times(fights[0]) });
    return filled(words.inTurn, { list: fights.map((count, index) => filled(words.teamTimes.replace(' {team}', '\u00a0{team}'), { team: roman(index + 1), times: times(count) })).join(', ') });
  }

  // The character's own team as it fights now, or its place in the reserve.
  function ownTeam() {
    const words = texts();
    const { me, teams } = view;
    if (me.team !== null) {
      const lineup = teams.lineups[me.team - 1];
      return [
        h('p', { class: 'war-sub' }, h('span', { text: teamText(words.yourTeam, me.team) }), h('span', { class: 'war-sub-count', text: filled(words.count, { count: lineup.length, size: teams.size }) })),
        busts(lineup),
      ];
    }
    return [
      h('p', { class: 'war-sub' }, h('span', { text: words.reserveYou })),
      h('p', { class: 'muted', text: me.fights ? teamText(words.reserveFills, me.fights) : words.reserveWaits }),
    ];
  }

  const teamsButton = () =>
    h(
      'button',
      {
        type: 'button',
        class: 'button button--world war-button',
        onClick: () => {
          page = 'teams';
          chosen = view.me.team ?? 1;
          render();
          holder.scrollIntoView?.({ block: 'start' });
        },
      },
      icon('people', { size: 18 }),
      h('span', { text: texts().teams }),
    );

  // The next evening: the time left on the plaque, its battles as the
  // Arena's marks, and the character's own team (a full guild) or the
  // guild's teams below (a smaller one).
  function eveningPart(small) {
    const { war } = view;
    const words = texts();
    const { next } = war;
    clock = h('p', { class: 'war-clock', text: clockText() });
    const label = next.day === view.week.today ? words.battlesToday : next.day === view.week.today + 1 ? words.battlesTomorrow : words.battlesToday;
    return [
      heading(eveningName(next.day)),
      h(
        'section',
        { class: 'card war-today' },
        h(
          'div',
          { class: 'pvp-arena-plaque war-plaque' },
          icon('hourglass', { size: 30, className: 'pvp-arena-plaque-icon' }),
          h('div', { class: 'pvp-arena-plaque-text' }, clock, next.battles > 0 && h('p', { class: 'war-clock-note', text: fightsNote() })),
        ),
        h(
          'div',
          { class: 'pvp-arena-pips' },
          h('span', { class: 'pvp-arena-pips-label', text: filled(label, { count: next.battles }) }),
          h(
            'span',
            { class: 'pvp-arena-pips-row', 'aria-hidden': 'true' },
            Array.from({ length: Math.min(next.battles, view.teams.max) }, () => h('span', { class: 'pvp-arena-pip pvp-arena-pip--on' }, icon('swords', { size: 14 }))),
          ),
        ),
        !small && [h('hr', { class: 'war-rule' }), ownTeam(), teamsButton()],
      ),
    ];
  }

  // The war's end: how it went and what the guild got.
  function endPart(small) {
    const { war } = view;
    const words = texts();
    const text =
      war.result === 'win'
        ? filled(words.endWon, { fame: counted(war.end.fame, words.fameForms), items: counted(war.end.items, words.itemForms) })
        : war.result === 'loss'
          ? words.endLost
          : words.endDraw;
    return [
      heading(words.endTitle),
      h(
        'section',
        { class: 'card war-today' },
        h(
          'div',
          { class: 'pvp-arena-plaque war-plaque' },
          icon(war.result === 'win' ? 'trophy' : 'swords', { size: 30, className: 'pvp-arena-plaque-icon' }),
          h('div', { class: 'pvp-arena-plaque-text' }, h('p', { class: 'war-end', text: words.lead[{ win: 'won', loss: 'lost', draw: 'draw' }[war.result]] }), h('p', { class: 'war-clock-note', text })),
        ),
        h('p', { class: 'muted', text: words.next }),
        !small && teamsButton(),
      ),
    ];
  }

  // A guild of fewer than six teams: all its teams with their busts, its
  // reserve and "Drużyny" (792.3 v2).
  function teamsPart() {
    const words = texts();
    const { teams } = view;
    const block = (team) => {
      const ids = teams.assigned[team - 1];
      return h(
        'div',
        { class: 'war-team-block' },
        h('p', { class: 'war-sub' }, h('span', { text: teamText(words.teamName, team) }), h('span', { class: `war-sub-count${ids.length < teams.size ? ' war-sub-count--short' : ''}`, text: filled(words.count, { count: ids.length, size: teams.size }) })),
        ids.length > 0 ? busts(ids) : h('p', { class: 'muted', text: words.free }),
      );
    };
    const full = teams.assigned.every((ids) => ids.length >= teams.size);
    const reserve = teams.reserve;
    const many = reserve.length > 1;
    const waits = full && teams.next !== null ? filled(many ? words.reserveNextMany : words.reserveNextOne, { ordinal: words.ordinals[teams.count] }) : many ? words.reserveFillMany : words.reserveFillOne;
    return [
      heading(words.yourTeams),
      h(
        'section',
        { class: 'card' },
        Array.from({ length: teams.count }, (_, index) => [index > 0 && h('hr', { class: 'war-rule' }), block(index + 1)]),
        reserve.length > 0 && [
          h('hr', { class: 'war-rule' }),
          h('p', { class: 'war-sub' }, h('span', { text: words.reserve }), h('span', { class: 'war-sub-count', text: counted(reserve.length, words.reserveForms) })),
          h('div', { class: 'war-reserve' }, busts(reserve, true), h('p', { class: 'muted', text: waits })),
        ],
        teamsButton(),
      ),
    ];
  }

  // The way to the next team: the members as marks, five to a team, and
  // how many are missing (792.3 v2).
  function nextTeamPart() {
    const words = texts();
    const { teams } = view;
    if (teams.next === null) return null;
    const groups = teams.count + 1;
    const missing = teams.next - teams.members;
    return h(
      'section',
      { class: 'card war-next' },
      h('h2', { class: 'card-title', text: filled(words.nextTitle, { ordinal: words.ordinalTitles[teams.count] }) }),
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
      h('p', { text: filled(words.nextNeed, { missing: counted(missing, words.missingForms), need: formatNumber(teams.next), ordinal: words.ordinals[teams.count] }) }),
    );
  }

  // Why the teams of one guild fight more often (795 B), when the two
  // guilds have not as many teams.
  function fewerPart() {
    const { war } = view;
    const words = texts();
    if (!war || war.theirs.teams < 1 || war.theirs.teams === war.ours.teams) return null;
    const fewer = war.ours.teams < war.theirs.teams;
    const vars = { ours: counted(war.ours.teams, words.teamForms), theirs: counted(war.theirs.teams, words.teamForms) };
    return h(
      'section',
      { class: 'war-open' },
      h('p', { class: 'war-open-title' }, icon('swords', { size: 20 }), h('span', { text: fewer ? words.fewerTitle : words.moreTitle })),
      h('p', { text: filled(fewer ? words.fewer : words.more, vars) }),
    );
  }

  // When an evening was, as the battles' list says it: "Dziś", "Wczoraj"
  // or the day's name.
  function dayName(day) {
    const words = texts();
    const name = day === view.week.today ? words.today : day === view.week.today - 1 ? words.yesterday : words.days[day];
    return name.charAt(0).toLocaleUpperCase(language() === 'en' ? 'en-GB' : 'pl-PL') + name.slice(1);
  }

  const results = (list) => {
    const words = texts();
    const won = list.filter((one) => one.result === 'win').length;
    const lost = list.filter((one) => one.result === 'loss').length;
    const drawn = list.filter((one) => one.result === 'draw').length;
    return [won > 0 && counted(won, words.winForms), lost > 0 && counted(lost, words.lossForms), drawn > 0 && counted(drawn, words.drawForms)].filter(Boolean).join(', ');
  };

  // The battles fought, folded under the last evening's results; each to
  // watch at a tap.
  function recentPart() {
    const { war } = view;
    const words = texts();
    const battles = war?.battles ?? [];
    const last = battles[0]?.day;
    const line = battles.length === 0 ? words.noBattles : filled(words.recentLine, { day: dayName(last), results: results(battles.filter((one) => one.day === last)) });
    return h(
      'section',
      { class: 'card war-recent' },
      foldPart(
        { key: 'guild-war-recent', title: words.recent, line, open: false },
        battles.length === 0
          ? h('p', { class: 'muted', text: words.noBattles })
          : h(
              'ul',
              { class: 'war-battles' },
              battles.map((battle) =>
                h(
                  'li',
                  { class: 'war-battle' },
                  h('span', { class: `pvp-arena-badge pvp-arena-badge--${battle.result}`, text: words.results[battle.result] }),
                  h(
                    'div',
                    { class: 'war-battle-text' },
                    h('p', { text: `${teamText(words.versusOurs, battle.ourTeam)} ${teamText(words.versusTheirs, battle.theirTeam)}` }),
                    h('p', { class: 'muted', text: `${dayName(battle.day)}, ${view.hour}` }),
                  ),
                  battle.replay &&
                    h(
                      'button',
                      {
                        type: 'button',
                        class: 'button button--world button--small war-watch',
                        'aria-label': `${words.watch}: ${dayName(battle.day)}`,
                        onClick: (event) => withButton(event.currentTarget, () => watch(battle)),
                      },
                      icon('eye', { size: 16 }),
                      h('span', { text: words.watch }),
                    ),
                ),
              ),
            ),
      ),
    );
  }

  // A team's line with the guild's tags: "Drużyna II [BZK] przeciw
  // Drużynie IV [WIL]".
  function versus(battle) {
    const words = texts();
    const tag = (text, theirs) => h('span', { class: `guild-tag${theirs ? ' war-their-tag' : ''}`, text: `[${text}]` });
    return h('p', { class: 'war-result-teams' }, `${teamText(words.versusOurs, battle.ourTeam)} `, tag(battle.ourTag), ` ${teamText(words.versusTheirs, battle.theirTeam)} `, tag(battle.theirTag, true));
  }

  // A battle played back in a sheet: its result over the playback, who
  // stayed on their feet and what the character got (792.4 v2).
  async function watch(line) {
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
    openSheet(
      h('h2', { class: 'sheet-title', text: filled(words.battleTitle, { when: dayName(battle.day).toLocaleLowerCase(language() === 'en' ? 'en-GB' : 'pl-PL'), hour: view.hour }) }),
      h(
        'div',
        { class: 'war-sheet' },
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
                battle.reward.systemPoints > 0 && h('li', {}, icon(SYSTEM_POINTS_ICON, { size: 20, className: 'guild-chest-system' }), h('span', { text: counted(battle.reward.systemPoints, words.systemPointForms) })),
              ),
            ),
        ),
        playback.element,
      ),
    );
    afterSheet(() => {
      playback.stop();
      if (watching === playback) watching = null;
    });
  }

  // "Test wojny" on the test version: a war with the mirror guild at once
  // (its teams fight as this guild's own, under other names), and the
  // next evening's battles at a tap, a day ahead too.
  function testPart() {
    const { test, war } = view;
    if (!test) return null;
    const words = texts();
    const run = (body, said) => (event) =>
      withButton(event.currentTarget, async () => {
        apply(await call('POST', '/api/test/guild-war', body));
        toast(said);
      });
    const teams = h(
      'select',
      { class: 'war-test-teams', id: 'war-test-teams', 'aria-label': t('Drużyny rywala') },
      ROMAN.map((_, index) => h('option', { value: String(index + 1), selected: index + 1 === test.teams, text: String(index + 1) })),
    );
    return h(
      'section',
      { class: 'card war-test' },
      h('h2', { class: 'card-title', text: t('Test wojny') }),
      h('p', { class: 'muted', text: t('Na wersji testowej rozpoczniesz tu wojnę od razu, z lustrzaną gildią: jej drużyny walczą jak drużyny Twojej gildii, pod innymi imionami. Bitwy wieczoru rozegrasz od razu, dzień po dniu, aż do niedzieli i końca wojny.') }),
      test.start && [
        h('label', { class: 'war-test-label', for: 'war-test-teams' }, h('span', { text: t('Drużyny rywala') }), teams),
        h('button', { type: 'button', class: 'button button--system', text: t('Rozpocznij wojnę teraz'), onClick: (event) => run({ action: 'start', teams: Number(teams.value) }, t('Wojna testowa trwa.'))(event) }),
      ],
      test.fight && h('button', { type: 'button', class: 'button button--system', text: t('Rozegraj bitwy: {day}', { day: words.days[war.next.day] }), onClick: run({ action: 'fight' }, t('Bitwy rozegrane.')) }),
      test.end && h('button', { type: 'button', class: 'button button--world', text: t('Zakończ wojnę testową'), onClick: run({ action: 'end' }, t('Wojna testowa zakończona.')) }),
    );
  }

  // No war this week: why, when the next draw is, and the teams to set up.
  function noWar() {
    const words = texts();
    const card = h(
      'section',
      { class: 'card war-hero war-none' },
      heading(words.title),
      h('p', { class: 'war-hero-date', text: weekDates(view.week.startsAt) }),
      h('p', { class: 'war-none-text', text: words.none[view.none] }),
      h('p', { class: 'war-lead' }, icon('hourglass', { size: 18 }), h('span', { text: words.noneNext })),
    );
    setArt(card);
    return card;
  }

  function overview() {
    const { war } = view;
    const small = view.teams.count < view.teams.max;
    if (!war) return [noWar(), teamsPart(), nextTeamPart(), howItWorks(null, texts().how), testPart()];
    return [
      hero(),
      war.next ? eveningPart(small) : endPart(small),
      small && [teamsPart(), nextTeamPart(), fewerPart()],
      !small && fewerPart(),
      recentPart(),
      howItWorks(null, texts().how),
      testPart(),
    ];
  }

  // A place to move a member to (⇄), in a sheet: a free place of another
  // team, a member of it to swap with (the leader and the deputies), or
  // the reserve.
  function moveSheet(id) {
    const words = texts();
    const { teams } = view;
    const person = member(id);
    const at = teams.assigned.findIndex((ids) => ids.includes(id)) + 1;
    const place = (body) => (event) =>
      withButton(event.currentTarget, async () => {
        const answer = await call('POST', '/api/guild/war/place', { characterId: id, ...body });
        closeSheet();
        apply(answer);
        if (answer.text) toast(answer.text);
      });
    openSheet(
      h('h2', { class: 'sheet-title', text: filled(words.move, { name: person.name }) }),
      h('p', { class: 'sheet-text', text: lead() ? filled(words.moveLead, { name: person.name }) : words.moveSelf }),
      h(
        'div',
        { class: 'war-move-list' },
        Array.from({ length: teams.count }, (_, index) => index + 1)
          .filter((team) => team !== at)
          .map((team) => {
            const ids = teams.assigned[team - 1];
            const free = ids.length < teams.size;
            return h(
              'div',
              { class: 'war-move-team' },
              h('p', { class: 'war-sub' }, h('span', { text: teamText(words.teamName, team) }), h('span', { class: 'war-sub-count', text: filled(words.count, { count: ids.length, size: teams.size }) })),
              h(
                'div',
                { class: 'war-move-options' },
                free && h('button', { type: 'button', class: 'button button--system button--small', onClick: place({ team }) }, icon('plus', { size: 16 }), h('span', { text: words.free })),
                lead() && ids.map((other) => h('button', { type: 'button', class: 'button button--world button--small', onClick: place({ team, swapWith: other }) }, icon('swap', { size: 16 }), h('span', { text: filled(words.swap, { name: member(other).name }) }))),
              ),
            );
          }),
        at > 0 && h('button', { type: 'button', class: 'button button--world', text: words.toReserve, onClick: place({ team: 0 }) }),
      ),
    );
  }

  // A member's row in a team's card or the reserve: portrait, name (its
  // card at a tap), role, class, level and ⇄ (the leader and the
  // deputies, or the member's own).
  function memberRow(id) {
    const words = texts();
    const person = member(id);
    const role = person.role === 'leader' ? t('Lider') : person.role === 'deputy' ? t('Zastępca') : null;
    return h(
      'li',
      { class: `war-member${own(id) ? ' war-member--own' : ''}` },
      portrait(person),
      h(
        'div',
        { class: 'war-member-text' },
        h('p', { class: 'war-member-name' }, nameButton(person), role && h('span', { class: 'party-leader', text: role })),
        h('p', { class: 'war-member-line' }, icon(CLASS_ICONS[person.classId] ?? 'person', { size: 16 }), h('span', { text: person.className })),
        h('p', { class: 'war-member-line war-member-level', text: t('poz. {level}', { level: person.level }) }),
      ),
      (lead() || own(id)) &&
        h('button', { type: 'button', class: 'button button--world war-move', 'aria-label': filled(words.move, { name: person.name }), onClick: () => moveSheet(id) }, icon('swap', { size: 20 })),
    );
  }

  // The teams (792.2 v2): the medallions, the team chosen and those
  // without a team.
  function teamsPage() {
    const words = texts();
    const { teams, me } = view;
    chosen = Math.min(Math.max(1, chosen ?? me.team ?? 1), teams.count);
    const inTeams = teams.assigned.reduce((sum, ids) => sum + ids.length, 0);
    const head = h(
      'section',
      { class: 'card war-hero war-teams-head' },
      heading(words.teamsTitle),
      h('p', { class: 'war-hero-date', text: filled(words.inTeams, { count: formatNumber(inTeams), members: counted(teams.members, words.inTeamsForms) }) }),
      h(
        'div',
        { class: 'war-chips', role: 'tablist', 'aria-label': words.teams, vars: { '--war-teams': String(teams.count) } },
        Array.from({ length: teams.count }, (_, index) => {
          const team = index + 1;
          const count = teams.assigned[index].length;
          return h(
            'button',
            {
              type: 'button',
              role: 'tab',
              'aria-selected': String(team === chosen),
              class: `war-chip${team === chosen ? ' war-chip--chosen' : ''}${count < teams.size ? ' war-chip--short' : ''}`,
              onClick: () => {
                chosen = team;
                render();
              },
            },
            h('span', { class: 'war-chip-disc', text: roman(team) }),
            h('span', { class: 'war-chip-count', text: `${count}/${teams.size}` }),
            team === me.team && h('span', { class: 'war-chip-own', text: words.own }),
          );
        }),
      ),
    );
    setArt(head);
    const ids = teams.assigned[chosen - 1];
    const lineup = teams.lineups[chosen - 1];
    const missing = teams.size - ids.length;
    let warning = null;
    if (missing > 0) {
      const many = filled(words.shortMany, { missing: counted(missing, words.missingForms), count: lineup.length, size: teams.size });
      if (lineup.length >= teams.size) warning = missing === 1 ? words.fillsOne : filled(words.fillsMany, { missing: counted(missing, words.missingForms) });
      else warning = missing === 1 ? filled(words.shortOne, { count: lineup.length, size: teams.size }) : many;
    }
    const takes = me.team !== chosen;
    const card = h(
      'section',
      { class: 'card war-team' },
      h('div', { class: 'war-team-title' }, h('h2', { class: 'card-title', text: teamText(words.teamName, chosen) }), h('span', { class: `war-count-pill${missing > 0 ? ' war-count-pill--short' : ''}`, text: filled(words.count, { count: ids.length, size: teams.size }) })),
      warning && h('p', { class: 'war-warn', text: warning }),
      h(
        'ul',
        { class: 'war-members' },
        ids.map(memberRow),
        Array.from({ length: missing }, () =>
          h(
            'li',
            { class: 'war-slot' },
            h('span', { class: 'war-slot-frame', 'aria-hidden': 'true' }, icon('plus', { size: 26 })),
            h('span', { class: 'war-slot-text', text: words.free }),
            takes &&
              h(
                'button',
                {
                  type: 'button',
                  class: 'button button--system button--small war-take',
                  onClick: (event) =>
                    withButton(event.currentTarget, async () => {
                      const answer = await call('POST', '/api/guild/war/place', { team: chosen });
                      apply(answer);
                      if (answer.text) toast(answer.text);
                    }),
                },
                icon('plus', { size: 16 }),
                h('span', { text: words.take }),
              ),
          ),
        ),
      ),
      h('p', { class: 'war-hint' }, icon('swap', { size: 18 }), h('span', { text: lead() ? words.hintLead : words.hintSelf })),
    );
    const reserve = teams.reserve;
    return [
      h(
        'a',
        {
          class: 'link-button war-back',
          href: '#/gildia/war',
          onClick: (event) => {
            event.preventDefault();
            page = 'overview';
            render();
          },
        },
        icon('back', { size: 16 }),
        words.back,
      ),
      head,
      card,
      reserve.length > 0 &&
        h(
          'section',
          { class: 'card war-loose' },
          foldPart(
            { key: 'guild-war-loose', title: filled(words.noTeam, { count: reserve.length }), line: reserve.map((id) => member(id).name).join(', '), open: false },
            h('ul', { class: 'war-members' }, reserve.map(memberRow)),
          ),
        ),
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
    holder.replaceChildren(...[page === 'teams' ? teamsPage() : overview()].flat(Infinity).filter(Boolean));
    // The time left goes down every half a minute; when the battles come,
    // the war is asked again.
    if (page === 'overview' && view.war?.next) {
      ticker = setInterval(() => {
        if (serverNow() >= view.war.next.at + 30000) {
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
