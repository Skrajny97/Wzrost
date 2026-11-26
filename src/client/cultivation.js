// Kultywacja (1230 A; src/server/cultivation.js, src/engine/cultivation.js):
// the character meditates for 10 minutes to 8 hours, as long as a
// profession's work, chosen on the same slider. While its class is ahead
// it gets character XP, up to the class's level, and every meditation
// grows the Kultywacja's own level (0–100), each level a share more
// character XP from explorations. It has a screen of its own
// (#/kultywacja, mountCultivation), a tab of the Walka since 24.11.2026
// (combat-modes.js; the author: „Postrach Krainy i Kultywacja powinny byc
// osobnymi zakładkami w Walce”), with its scene and its music
// (data/music.json, place `cultivation`): its level with the bar to the
// next one and its bonus, the character's and the class's levels, the XP
// of each length split into character XP and the Kultywacja's, and
// "Medytuj"; while it runs, the timer, "Przewiń" and "Przerwij Kultywację";
// then "Odbierz raport". While it runs, the Eksploracja says so with a line
// as for a profession's work (cultivationBusy), as no exploration sets out
// meanwhile; once it has ended, a dot lights its tab. The scene is
// data/animations.json `cultivation`, a sheet as a work's (scenes.js
// loopScene). Its texts are written in Polish and shown in the page's
// language (t(), i18n.js).
// An Awatar Systemu may meditate instead (DECISIONS.md, „Kultywacja
// Awatarem (26.11.2026)”): „Kto medytuje” over the length, as the Profesje's
// „Kto pracuje”, with the notes on who is busy and what the chosen one's
// meditation gives (its share of the character XP); one meditates at a
// time (meditationOf in state.js), and an Awatar's meditation shows here
// under its name, with its claim, "Przewiń" and "Przerwij" as its work's.

import { combatModes } from './combat-modes.js';
import { fill, h, setTimer } from './dom.js';
import { dateTimeFormat, formatCountdown, formatMinutes, formatNumber, timeFormat } from './format.js';
import { t } from './i18n.js';
import { loopScene } from './scenes.js';
import { DOING, activityFinished, call, isUnlocked, meditationOf, reportCache, serverNow, state, unlockInfo } from './state.js';
import { skipControl } from './time.js';
import { confirmAction, howItWorks, systemLink, systemPanel, withButton } from './ui.js';

export const CULTIVATION_HASH = '#/kultywacja';
const WALKA = '#/walka';
// The length last chosen for a Kultywacja on this device.
const CHOICE_KEY = 'wzrost.cultivation-choice';
// Who meditated last on this device: character, avatar or avatar2, as the
// Profesje keep who works (screens/professions.js).
const WORKER_KEY = 'wzrost.cultivation-worker';

function loadChoice() {
  try {
    return Number(localStorage.getItem(CHOICE_KEY)) || null;
  } catch {
    return null;
  }
}

function saveChoice(minutes) {
  try {
    localStorage.setItem(CHOICE_KEY, String(minutes));
  } catch {
    // Without storage the page simply forgets the last choice.
  }
}

function loadWorker() {
  try {
    return localStorage.getItem(WORKER_KEY);
  } catch {
    return null;
  }
}

function saveWorker(worker) {
  try {
    localStorage.setItem(WORKER_KEY, worker);
  } catch {
    // Without storage the page simply forgets who meditated last.
  }
}

const sheet = () => state.content.animations?.cultivation ?? null;

// The scene, looping as a work's, in the light of the hour; an Awatar's in
// the System's light, as its work's.
const scene = (avatar = false) => loopScene(sheet(), 'cultivation-scene', { avatar: Boolean(avatar) });

// "25%": an Awatar's share of the character XP.
const shareText = (share) => `${formatNumber(Math.round(share * 100))}%`;

// An Awatar's whole name, from the Profesje's view: "Awatar Systemu",
// "Drugi Awatar Systemu".
const avatarName = (avatar) =>
  (avatar === 2 ? state.character.professions?.avatar?.second?.name : state.character.professions?.avatar?.name) ?? (avatar === 2 ? t('Drugi Awatar Systemu') : t('Awatar Systemu'));

// What an Awatar does (DOING, state.js), or that its report waits, as the
// Profesje's notes say it.
const busyNote = (one, name) => (activityFinished(one.activity) ? t('{name} czeka na odbiór raportu.', { name }) : `${name} ${t(DOING[one.activity.kind])}.`);

// The meditating figure cut out of the scene's first frame at its own size,
// for the Kultywacja's bonus among the others (bonuses.js).
export function cultivationMark() {
  const art = sheet();
  if (!art) return null;
  const mark = h('span', { class: 'cultivation-mark', 'aria-hidden': 'true' });
  mark.style.setProperty('--sheet', `url("/${art.file}")`);
  return mark;
}

// "+7%": a share in percent.
const percent = (share) => `+${formatNumber(Math.round(share * 1000) / 10)}%`;

// " · poziom 120 → 131" after the XP, or nothing without a new level.
const newLevels = (before, after) => (after > before ? ` · ${t('poziom {before} → {after}', { before, after })}` : '');

// The Kultywacja's bonus, "+7% XP postaci z wypraw".
const bonusText = (view) => t('{share} XP postaci z wypraw', { share: percent(view.bonus) });

// The Eksploracja's line while a Kultywacja runs or its report waits, as a
// profession's work has its own, with the way to its tab.
export const cultivationBusy = (activity) =>
  systemPanel(
    activityFinished(activity) ? t('Kultywacja zakończona. Raport czeka w Kultywacji.') : t('Twoja postać medytuje w Kultywacji do {time}.', { time: timeFormat.format(new Date(activity.endsAt)) }),
    systemLink(CULTIVATION_HASH, t('Do Kultywacji')),
  );

// The Kultywacja's own level, as a profession's: the level of the top one,
// the bar to the next, the meditation it still takes and its bonus.
function levelCard(view) {
  const top = view.xpToNext === 0;
  const share = top ? 100 : (view.xp / view.xpToNext) * 100;
  return h(
    'section',
    { class: 'cultivation-level', 'aria-label': t('Poziom Kultywacji {level}', { level: view.level }) },
    h(
      'p',
      { class: 'profession-card-head' },
      h('strong', { text: t('Poziom Kultywacji {level}', { level: view.level }) }),
      h('span', { class: 'muted', text: ` ${t('z {max}', { max: view.maxLevel })}` }),
    ),
    h('div', { class: 'bar bar--xp', role: 'presentation' }, h('div', { class: 'bar-fill', style: { width: `${share}%` } })),
    h('p', { class: 'muted', text: top ? t('Najwyższy poziom.') : t('Do następnego poziomu: {time} medytacji.', { time: formatMinutes(view.xpToNext - view.xp) }) }),
    h('p', { class: 'cultivation-bonus', text: t('Premia: {bonus}.', { bonus: bonusText(view) }) }),
  );
}

// The character's and the class's levels, and the XP between them.
function levelsList(character, plan) {
  const rows = [
    [t('Poziom postaci'), formatNumber(character.level)],
    [t('Poziom klasy'), formatNumber(character.classLevel)],
    plan?.open && [t('Do poziomu klasy'), t('{xp} XP', { xp: formatNumber(plan.cap) })],
  ].filter(Boolean);
  return h(
    'dl',
    { class: 'status-list cultivation-levels' },
    rows.map(([label, value]) => h('div', { class: 'status-row' }, h('dt', { text: label }), h('dd', { text: value }))),
  );
}

// What it is, in a few words, and the rest under "Jak to działa?"; `plan`,
// the plan of whoever may meditate. Once an Awatar is bought, also that it
// may meditate instead (`avatarShare`, 26.11.2026).
const about = (view, plan) =>
  howItWorks(
    t('Twoja postać medytuje zamiast wyprawy. Póki klasa ją wyprzedza, zdobywa XP postaci: {factor} razy tyle, ile dałaby jej wyprawa tej samej długości w miejscu {place}. Każda medytacja rozwija też poziom Kultywacji, a każdy poziom daje {per} XP postaci z wypraw.', {
      factor: plan.factor,
      place: plan.area.name,
      per: percent(view.perLevel),
    }),
    [
      t('Kultywacja trwa od {min} do {max}, jak praca w profesji. W tym czasie postać nie wyrusza na wyprawy, nie pracuje w profesji i nie idzie z Drużyną, ale odpoczywa. Nie zdobywa XP klasy, łupów ani złota.', {
        min: formatMinutes(plan.lengths[0].minutes),
        max: formatMinutes(plan.lengths.at(-1).minutes),
      }),
      t('Kultywacja nigdy nie da postaci wyższego poziomu niż klasa: daje najwyżej tyle XP, ile w chwili odbioru raportu brakuje do poziomu klasy. Gdy poziomy się zrównają, medytacja rozwija już tylko poziom Kultywacji.'),
      t('Każda minuta medytacji to punkt XP Kultywacji. Pierwszy poziom zajmuje {first}, każdy następny trochę dłużej, aż do {last} na poziom {max}. Premia działa na każdej wyprawie, także z Drużyną, ale nie na XP klasy.', {
        max: view.maxLevel,
        first: formatMinutes(view.firstMinutes),
        last: formatMinutes(view.lastMinutes),
      }),
      view.avatarShare !== undefined && t('Zamiast postaci może medytować Awatar Systemu. Postać jest wtedy wolna, a Awatar nie pracuje w profesjach. Naraz medytuje tylko jeden.'),
      view.avatarShare !== undefined && t('Postać dostaje z medytacji Awatara całe XP Kultywacji i {share} XP postaci, które dałaby jej ta sama medytacja.', { share: shareText(view.avatarShare) }),
      t('Punkty Czasu przewijają ją jak wyprawę. Przerwana nie daje nic.'),
    ].filter(Boolean),
  );

// The length with a slider over its lengths, 10 minutes to 8 hours as a
// profession's work has (cultivationMinutes), what the one chosen gives (the
// character's XP up to the class's level, and the Kultywacja's own XP), and
// "Medytuj". With an Awatar Systemu bought, „Kto medytuje” over it, as the
// Profesje's „Kto pracuje” (1070.4): the character or an Awatar, each while
// free (the last choice remembered), with the notes on who is busy and on
// an Awatar's share; the length then gives what the chosen one's plan says
// (`avatarPlan` for an Awatar's, 26.11.2026).
function picker(character, view) {
  const avatar = character.professions?.avatar?.owned ? character.professions.avatar : null;
  const second = avatar?.second?.owned ? avatar.second : null;
  // With two Awatary the options and the notes name them shortly, as on the
  // Profesje; with one, by its whole name.
  const names = second ? { avatar: t('Awatar'), avatar2: t('Drugi Awatar') } : { avatar: avatar?.name };
  const free = {
    character: Boolean(view.plan),
    avatar: Boolean(view.avatarPlan && avatar && !avatar.activity),
    avatar2: Boolean(view.avatarPlan && second && !second.activity),
  };
  const options = [['character', t('Postać')], ...(avatar ? [['avatar', names.avatar]] : []), ...(second ? [['avatar2', names.avatar2]] : [])];
  const remembered = loadWorker();
  let worker = options.some(([id]) => id === remembered) && free[remembered] ? remembered : (options.find(([id]) => free[id])?.[0] ?? 'character');
  const planOf = () => (worker === 'character' ? view.plan : view.avatarPlan);
  let plan = planOf();
  const allowed = plan.lengths.map((length) => length.minutes);
  const longest = allowed.at(-1);
  // The length chosen last, else the shortest that catches the class up,
  // else the longest.
  const kept = allowed.indexOf(loadChoice());
  const enough = plan.open ? allowed.findIndex((minutes) => minutes >= plan.minutes) : -1;
  let index = kept >= 0 ? kept : enough >= 0 ? enough : allowed.length - 1;

  const value = h('output', { class: 'duration-value', 'aria-live': 'off' });
  const gain = h('p', { class: 'cultivation-gain' });
  const grow = h('p', { class: 'cultivation-gain cultivation-gain--level' });
  const note = h('p', { class: 'muted cultivation-note' });
  const start = h('button', { type: 'button', class: 'button button--system', 'data-guide': 'cultivation-start' });
  const slider = h('input', {
    type: 'range',
    class: 'duration-slider',
    min: 0,
    max: allowed.length - 1,
    step: 1,
    value: index,
    'aria-label': t('Czas Kultywacji'),
    onInput: () => set(Number(slider.value)),
    onChange: () => saveChoice(allowed[index]),
  });
  const stepButton = (sign, label) =>
    h('button', {
      type: 'button',
      class: 'button button--world duration-step',
      'aria-label': label,
      text: sign < 0 ? '−' : '+',
      onClick: () => {
        set(index + sign);
        saveChoice(allowed[index]);
      },
    });
  const less = stepButton(-1, t('Krócej'));
  const more = stepButton(1, t('Dłużej'));
  // „Kto medytuje”, its buttons and the notes under them.
  const who = avatar && h('div', { class: 'stack worker-picker' });
  function showWho() {
    if (!who) return;
    const notes = [
      !free.character &&
        character.activity &&
        t('Postać {doing}, więc medytować będzie {name}.', { doing: t(DOING[character.activity.kind] ?? 'jest na wyprawie'), name: names[worker] ?? names.avatar }),
      avatar.activity && busyNote(avatar, names.avatar),
      second?.activity && busyNote(second, names.avatar2),
      worker !== 'character' && t('Postać dostaje z medytacji Awatara całe XP Kultywacji i {share} XP postaci, które dałaby jej ta sama medytacja.', { share: shareText(plan.share) }),
    ].filter(Boolean);
    fill(
      who,
      h('p', { class: 'duration-title', text: t('Kto medytuje') }),
      h(
        'div',
        { class: `segmented${second ? ' segmented--three' : ''}`, role: 'group', 'aria-label': t('Kto medytuje') },
        options.map(([id, name]) =>
          h('button', {
            type: 'button',
            class: 'segmented-option',
            'aria-pressed': worker === id,
            disabled: !free[id],
            text: name,
            onClick: () => {
              worker = id;
              saveWorker(id);
              plan = planOf();
              showWho();
              set(index);
            },
          }),
        ),
      ),
      notes.map((line) => h('p', { class: 'muted', text: line })),
    );
  }
  function set(next) {
    index = Math.min(allowed.length - 1, Math.max(0, next));
    const length = plan.lengths[index];
    slider.value = String(index);
    slider.setAttribute('aria-valuetext', formatMinutes(length.minutes));
    slider.style.setProperty('--fill', `${(index / Math.max(1, allowed.length - 1)) * 100}%`);
    value.textContent = formatMinutes(length.minutes);
    less.disabled = index === 0;
    more.disabled = index === allowed.length - 1;
    // The character's XP, up to the class's level.
    const caught = plan.open && length.xp >= plan.cap;
    gain.textContent = plan.open
      ? `${t('XP postaci: +{xp}', { xp: formatNumber(length.xp) })}${newLevels(character.level, length.level)}`
      : t('XP postaci: +0, bo postać dogoniła klasę');
    gain.classList.toggle('cultivation-gain--caught', caught);
    // The Kultywacja's own XP and level.
    grow.textContent =
      length.cultivationXp > 0 ? `${t('Kultywacja: +{xp} XP', { xp: formatNumber(length.cultivationXp) })}${newLevels(view.level, length.cultivationLevel)}` : t('Kultywacja: najwyższy poziom');
    // How long is enough to catch the class up, and that a longer one
    // gives no more character XP.
    note.textContent = !plan.open
      ? t('Twoja postać dogoniła klasę (poziom {level}): medytacja rozwija teraz tylko poziom Kultywacji.', { level: character.classLevel })
      : caught
        ? length.minutes > plan.minutes
          ? t('Twoja postać dogoni klasę. Wystarczy {time}: dłuższa Kultywacja nie da więcej XP postaci.', { time: formatMinutes(plan.minutes) })
          : t('Twoja postać dogoni klasę.')
        : plan.minutes <= longest
          ? t('Wystarczy {time}, żeby Twoja postać dogoniła klasę.', { time: formatMinutes(plan.minutes) })
          : t('Twoja postać dogoni klasę po {time} Kultywacji.', { time: formatMinutes(plan.minutes) });
    start.textContent = t('Medytuj · {time}', { time: formatMinutes(length.minutes) });
  }
  showWho();
  set(index);
  start.addEventListener('click', (event) =>
    withButton(event.currentTarget, async () => {
      saveChoice(allowed[index]);
      await call('POST', '/api/cultivation', { minutes: allowed[index], ...(worker === 'avatar' ? { avatar: true } : worker === 'avatar2' ? { avatar: 2 } : {}) });
    }),
  );
  return h(
    'div',
    { class: 'stack cultivation-picker' },
    who,
    h(
      'div',
      { class: 'duration-picker' },
      h('p', { class: 'duration-head' }, h('span', { class: 'duration-title' }, t('Czas Kultywacji')), value),
      h('div', { class: 'duration-row' }, less, slider, more),
      h('p', { class: 'duration-scale', 'aria-hidden': 'true' }, h('span', { text: formatMinutes(allowed[0]) }), h('span', { text: formatMinutes(longest) })),
    ),
    h('div', { class: 'cultivation-gains' }, h('p', { class: 'cultivation-gains-title', text: t('Zdobędziesz:') }), gain, grow),
    note,
    h('div', { class: 'start-bar' }, start),
  );
}

// The Kultywacja's screen, under the Walka's heading and its switch
// (combat-modes.js) as the Portale and the Wieże: while someone may
// meditate (the character at home, an Awatar free), what it is, its own
// level, the character's and the class's levels, who meditates, the length
// and "Medytuj" (or the word that a meditation would give nothing now);
// while one runs, the character's or an Awatar's (under its name), the
// timer with the bar, "Przewiń" and "Przerwij Kultywację"; once it has
// ended, "Odbierz raport". The scene stands on top of each, and the music
// of the place plays (app.js: the route's music).
export function mountCultivation(container, { navigate }) {
  let countdown = null;
  let progress = null;
  let skipper = null;
  let shownFinished = null;

  const heading = () => [h('div', { class: 'page-heading' }, h('h1', { class: 'page-title', tabindex: '-1', text: t('Walka') })), combatModes('cultivation', navigate)];

  function render() {
    const character = state.character;
    const view = character.cultivation;
    const meditation = meditationOf(character);
    countdown = null;
    progress = null;
    skipper = null;
    shownFinished = meditation ? activityFinished(meditation.activity) : null;
    if (!isUnlocked('cultivation') || !view) {
      const unlock = unlockInfo('cultivation');
      fill(
        container,
        heading(),
        systemPanel(t('Dostęp zablokowany. {name}: od poziomu postaci {level}. Twój poziom: {own}.', { name: unlock?.name ?? t('Kultywacja'), level: unlock?.level ?? '', own: character.level })),
      );
      return;
    }
    if (meditation) {
      fill(container, heading(), activityView(meditation, view));
      tick(serverNow());
      return;
    }
    // Nobody free: the Kultywacja waits for the end of another activity.
    if (!view.plan && !view.avatarPlan) {
      fill(container, heading(), scene(), levelCard(view), busyPanel(character));
      return;
    }
    const plan = view.plan ?? view.avatarPlan;
    fill(
      container,
      heading(),
      h(
        'article',
        { class: 'card cultivation-card', 'aria-label': t('Kultywacja') },
        scene(),
        about(view, plan),
        levelCard(view),
        levelsList(character, plan),
        plan.possible ? picker(character, view) : systemPanel(t('Twoja postać dogoniła klasę, a Kultywacja ma najwyższy poziom: medytacja nic teraz nie da.')),
      ),
    );
  }

  // Nobody free to meditate: the character busy, and each Awatar bought at
  // its work, as the Profesje say it.
  function busyPanel(character) {
    const avatar = character.professions?.avatar?.owned ? character.professions.avatar : null;
    if (!avatar) return systemPanel(t('Twoja postać jest teraz zajęta. Kultywację zaczniesz, gdy skończy.'), systemLink(WALKA, t('Do Walki')));
    const second = avatar.second?.owned ? avatar.second : null;
    const doing = t(DOING[character.activity?.kind] ?? 'jest na wyprawie');
    return systemPanel(
      second
        ? t('Postać {doing}, a oba Awatary są zajęte. Kultywację zaczniesz, gdy któreś z nich będzie wolne.', { doing })
        : t('Postać {doing}, a Awatar jest zajęty. Kultywację zaczniesz, gdy któreś z nich będzie wolne.', { doing }),
      ...[
        [avatar, second ? t('Awatar') : avatar.name],
        [second, t('Drugi Awatar')],
      ]
        .filter(([one]) => one?.activity)
        .map(([one, name]) => busyNote(one, name)),
      systemLink(WALKA, t('Do Walki')),
    );
  }

  // A Kultywacja under way or ended, the character's, or an Awatar's under
  // its name, as its work on the Profesje; an Awatar's is claimed, rewound
  // and called back as its work (the server's avatar.js).
  function activityView({ activity, avatar }, view) {
    const body = avatar === 2 ? { avatar: 2 } : undefined;
    const element = meditationView(activity, avatar, body, view);
    if (!avatar) return element;
    const name = avatarName(avatar);
    return h('section', { class: 'stack', 'aria-label': name }, h('h2', { class: 'section-title', text: name }), element);
  }

  function meditationView(activity, avatar, body, view) {
    const running = view.running ?? null;
    const gainLines = running
      ? [
          (running.xp > 0 || running.level > state.character.level) &&
            h('p', { class: 'system-hint', text: `${t('Twoja postać zdobędzie +{xp} XP postaci', { xp: formatNumber(running.xp) })}${newLevels(state.character.level, running.level)}.` }),
          running.cultivationXp > 0 && h('p', { class: 'system-hint', text: `${t('Kultywacja: +{xp} XP', { xp: formatNumber(running.cultivationXp) })}${newLevels(view.level, running.cultivationLevel)}.` }),
        ].filter(Boolean)
      : [];
    if (activityFinished(activity)) {
      const claim = h('button', {
        type: 'button',
        class: 'button button--system',
        'data-guide': 'cultivation-claim',
        text: t('Odbierz raport'),
        onClick: (event) =>
          withButton(event.currentTarget, async () => {
            const { report } = await call('POST', avatar ? '/api/avatar/claim' : '/api/hunts/claim', body);
            if (!report) return;
            reportCache.set(String(report.id), report);
            state.freshReport = String(report.id);
            navigate(`#/raport/${report.id}`);
          }),
      });
      return h('div', { class: 'stack' }, scene(avatar), systemPanel(t('Kultywacja zakończona: {time}.', { time: formatMinutes(activity.minutes) }), ...gainLines, t('Raport czeka na odbiór.'), claim));
    }
    countdown = h('p', { class: 'countdown', 'aria-live': 'off' });
    progress = h('div', { class: 'bar-fill bar-fill--system' });
    skipper = skipControl(avatar === 2 ? 'avatar2' : avatar ? 'avatar' : 'activity', (now) => activity.endsAt - now, t('Kultywacja'));
    const cancel = h('button', {
      type: 'button',
      class: 'button button--world',
      text: t('Przerwij Kultywację'),
      onClick: async (event) => {
        const button = event.currentTarget;
        const sure = await confirmAction({
          title: t('Przerwać Kultywację?'),
          text: avatar ? t('Awatar przestanie medytować od razu, bez doświadczenia.') : t('Twoja postać przestanie medytować od razu, bez doświadczenia.'),
          confirmLabel: t('Przerwij'),
          danger: true,
        });
        if (sure) await withButton(button, () => call('POST', avatar ? '/api/avatar/cancel' : '/api/hunts/cancel', body));
      },
    });
    const time = timeFormat.format(new Date(activity.endsAt));
    return h(
      'div',
      { class: 'stack' },
      scene(avatar),
      systemPanel(
        t('Kultywacja w toku: {time}.', { time: formatMinutes(activity.minutes) }),
        countdown,
        h('div', { class: 'bar bar--system' }, progress),
        ...gainLines,
        h('p', {
          class: 'system-hint',
          // An Awatar meditating takes no work, and the character is free.
          text: avatar
            ? t('Raport będzie gotowy o {time}. Do tego czasu Awatar nie podejmie pracy w profesji, a Twoja postać jest wolna.', { time })
            : t('Raport będzie gotowy o {time}. Do tego czasu postać odpoczywa, a wyprawy, profesje i Drużyna poczekają.', { time }),
        }),
      ),
      skipper.element,
      cancel,
    );
  }

  function tick(now) {
    const activity = meditationOf(state.character)?.activity;
    skipper?.update(now);
    if (!activity) return;
    if (activityFinished(activity, now) !== shownFinished) {
      render();
      return;
    }
    if (countdown) {
      setTimer(countdown, formatCountdown(activity.endsAt - now));
      const done = (now - activity.startedAt) / (activity.endsAt - activity.startedAt);
      progress.style.width = `${Math.min(100, Math.max(0, done * 100))}%`;
    }
  }

  render();
  return { update: render, tick };
}

// The report of a Kultywacja (screens/report.js): its length, the
// character's XP and levels, the Kultywacja's own XP, level and bonus, the
// System's lines with the free points to spend (`points`, the report
// screen's own box), and the way back.
export function cultivationReport(report, heading, points = null) {
  const { summary } = report;
  const grown = report.cultivation ?? null;
  // An Awatar's Kultywacja names it, as its work's report (26.11.2026).
  const worker = report.avatar === 2 ? t('Drugi Awatar Systemu') : report.avatar ? t('Awatar Systemu') : null;
  const rows = [
    worker && [t('Wykonawca'), worker],
    [t('XP postaci'), t('+{xp} XP', { xp: formatNumber(report.xp) })],
    [t('Poziom postaci'), summary.levelAfter > summary.levelBefore ? `${formatNumber(summary.levelBefore)} → ${formatNumber(summary.levelAfter)}` : formatNumber(summary.levelBefore)],
    [t('Poziom klasy'), formatNumber(report.classLevel)],
    summary.timePoints > 0 && [t('Punkty Czasu'), `+${formatNumber(summary.timePoints)}`],
    grown && [t('XP Kultywacji'), t('+{xp} XP', { xp: formatNumber(grown.xp) })],
    grown && [t('Poziom Kultywacji'), grown.levelAfter > grown.levelBefore ? `${formatNumber(grown.levelBefore)} → ${formatNumber(grown.levelAfter)}` : formatNumber(grown.levelAfter)],
    grown && [t('Premia z Kultywacji'), bonusText(grown)],
  ].filter(Boolean);
  return [
    heading(t('Raport z Kultywacji'), `${formatMinutes(report.minutes)} · ${dateTimeFormat.format(new Date(report.endsAt))}`),
    h(
      'section',
      { class: 'card report-summary', 'aria-label': t('Podsumowanie') },
      h('p', {
        class: 'herb-line',
        text:
          report.avatar === 2
            ? t('Drugi Awatar Systemu medytował {time}.', { time: formatMinutes(report.minutes) })
            : report.avatar
              ? t('Awatar Systemu medytował {time}.', { time: formatMinutes(report.minutes) })
              : t('Twoja postać medytowała {time}.', { time: formatMinutes(report.minutes) }),
      }),
      h(
        'dl',
        { class: 'status-list' },
        rows.map(([label, value]) => h('div', { class: 'status-row' }, h('dt', { text: label }), h('dd', { text: value }))),
      ),
      report.capped && h('p', { class: 'muted', text: t('Twoja postać dogoniła klasę: Kultywacja dała tyle XP postaci, ile brakowało do poziomu klasy.') }),
    ),
    report.system.length > 0 && systemPanel(...report.system, ...[points].filter(Boolean)),
    h('a', { class: 'button button--system', href: CULTIVATION_HASH, text: t('Do Kultywacji') }),
  ];
}

// Its line in the Dziennik (screens/journal.js), under its name and length,
// "Awatar Systemu · " before an Awatar's, as before its work's.
export const cultivationRowMeta = (report) =>
  h(
    'span',
    { class: 'report-row-meta' },
    h('span', { class: 'chip chip--cultivation', text: t('kultywacja') }),
    ` ${report.avatar ? `${report.avatar === 2 ? t('Drugi Awatar Systemu') : t('Awatar Systemu')} · ` : ''}${t('+{xp} XP postaci', { xp: formatNumber(report.xp) })}${newLevels(report.levelBefore, report.levelAfter)}`,
    report.cultivation && ` · ${t('Kultywacja +{xp} XP', { xp: formatNumber(report.cultivation.xp) })}${newLevels(report.cultivation.levelBefore, report.cultivation.levelAfter)}`,
  );
