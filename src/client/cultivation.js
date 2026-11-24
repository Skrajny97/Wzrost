// Kultywacja (1230 A; src/server/cultivation.js, src/engine/cultivation.js):
// the character meditates for a length an exploration offers it. While its
// class is ahead it gets character XP, up to the class's level, and every
// meditation grows the Kultywacja's own level (0–100), each level a share
// more character XP from explorations. It has a screen of its own
// (#/kultywacja, mountCultivation), as a profession's, with its scene and
// its music (data/music.json, place `cultivation`): its level with the bar
// to the next one and its bonus, the character's and the class's levels,
// the XP of each length split into character XP and the Kultywacja's, and
// "Medytuj"; while it runs, the timer, "Przewiń" and "Przerwij Kultywację";
// then "Odbierz raport". The Walka's main view leads to it with a card
// (cultivationLink) and, while it runs, with a line as for a profession's
// work (cultivationBusy). The scene is data/animations.json `cultivation`,
// a sheet as a work's (scenes.js loopScene). Its texts are written in
// Polish and shown in the page's language (t(), i18n.js).

import { fill, h, icon, setTimer } from './dom.js';
import { dateTimeFormat, formatCountdown, formatMinutes, formatNumber, timeFormat } from './format.js';
import { leaveView, openView } from './history.js';
import { t } from './i18n.js';
import { loopScene } from './scenes.js';
import { activityFinished, call, isUnlocked, reportCache, serverNow, state, unlockInfo } from './state.js';
import { skipControl } from './time.js';
import { confirmAction, howItWorks, systemLink, systemPanel, withButton } from './ui.js';

export const CULTIVATION_HASH = '#/kultywacja';
const WALKA = '#/walka';
// The length last chosen for a Kultywacja on this device.
const CHOICE_KEY = 'wzrost.cultivation-choice';

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

const sheet = () => state.content.animations?.cultivation ?? null;

// The scene, looping as a work's, in the light of the hour.
const scene = () => loopScene(sheet(), 'cultivation-scene');

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

// The name of a length, as under the exploration's slider ("krótka"…).
const lengthName = (minutes) => (state.content.lengths?.find((length) => length.upTo === undefined || minutes <= length.upTo) ?? {}).name ?? '';

// " · poziom 120 → 131" after the XP, or nothing without a new level.
const newLevels = (before, after) => (after > before ? ` · ${t('poziom {before} → {after}', { before, after })}` : '');

// The Kultywacja's bonus, "+7% XP postaci z wypraw".
const bonusText = (view) => t('{share} XP postaci z wypraw', { share: percent(view.bonus) });

// The Walka's way to the Kultywacja while the character is at home, from
// its unlock: a card as a land's, its scene behind the words, with its
// level and bonus, and how far the class is.
export function cultivationLink(character) {
  const view = character.cultivation;
  const plan = view?.plan;
  if (!plan || character.activity) return null;
  const card = h(
    'a',
    { class: `card region-card region-link cultivation-link${plan.open ? '' : ' cultivation-link--met'}`, href: CULTIVATION_HASH, 'data-guide': 'cultivation', onClick: (event) => openView(event, CULTIVATION_HASH, 'walka') },
    h('div', { class: 'region-head' }, h('h2', { class: 'card-title', text: t('Kultywacja') }), h('span', { class: 'region-chips' }, h('span', { class: 'chip chip--system', text: t('poz. {level}', { level: view.level }) }))),
    h('p', { class: 'region-trait', text: t('Twoja postać medytuje zamiast wyprawy: zdobywa XP postaci, aż dogoni klasę, i poziomy Kultywacji, które dają więcej XP postaci z wypraw.') }),
    h(
      'p',
      { class: 'region-foot' },
      // The class's part on one line, not "54 h 28" and "min" below.
      h('span', {}, `${bonusText(view)} · `, h('span', { class: 'cultivation-foot-class', text: plan.open ? t('do klasy {time}', { time: formatMinutes(plan.minutes) }) : t('postać dogoniła klasę') })),
      icon('chevron', { size: 20 }),
    ),
  );
  // The sheet's first frame, as wide as the card (styles.css).
  const art = sheet();
  if (art) {
    card.style.setProperty('--cultivation-art', `url("/${art.file}")`);
    card.style.setProperty('--cultivation-frames', String(art.frames));
  }
  return card;
}

// The Walka's line while a Kultywacja runs or its report waits, as a
// profession's work has its own, with the way to its screen.
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

// What it is, in a few words, and the rest under "Jak to działa?".
const about = (view) =>
  howItWorks(
    t('Twoja postać medytuje zamiast wyprawy. Póki klasa ją wyprzedza, zdobywa XP postaci: {factor} razy tyle, ile dałaby jej wyprawa tej samej długości w miejscu {place}. Każda medytacja rozwija też poziom Kultywacji, a każdy poziom daje {per} XP postaci z wypraw.', {
      factor: view.plan.factor,
      place: view.plan.area.name,
      per: percent(view.perLevel),
    }),
    [
      t('Kultywacja może trwać tyle samo co wyprawa. W tym czasie postać nie wyrusza na wyprawy, nie pracuje w profesji i nie idzie z Drużyną, ale odpoczywa. Nie zdobywa XP klasy, łupów ani złota.'),
      t('Kultywacja nigdy nie da postaci wyższego poziomu niż klasa: daje najwyżej tyle XP, ile w chwili odbioru raportu brakuje do poziomu klasy. Gdy poziomy się zrównają, medytacja rozwija już tylko poziom Kultywacji.'),
      t('Każda minuta medytacji to punkt XP Kultywacji. Pierwszy poziom zajmuje {first}, każdy następny trochę dłużej, aż do {last} na poziom {max}. Premia działa na każdej wyprawie, także z Drużyną, ale nie na XP klasy.', {
        max: view.maxLevel,
        first: formatMinutes(view.firstMinutes),
        last: formatMinutes(view.lastMinutes),
      }),
      t('Punkty Czasu przewijają ją jak wyprawę. Przerwana nie daje nic.'),
    ],
  );

// The length with a slider over the lengths an exploration offers, what the
// one chosen gives (the character's XP up to the class's level, and the
// Kultywacja's own XP), and "Medytuj".
function picker(character, view) {
  const { plan } = view;
  const allowed = plan.lengths.map((length) => length.minutes);
  const longest = allowed.at(-1);
  // The length chosen last, else the shortest that catches the class up,
  // else the longest.
  const kept = allowed.indexOf(loadChoice());
  const enough = plan.open ? allowed.findIndex((minutes) => minutes >= plan.minutes) : -1;
  let index = kept >= 0 ? kept : enough >= 0 ? enough : allowed.length - 1;

  const value = h('output', { class: 'duration-value', 'aria-live': 'off' });
  const kind = h('span', { class: 'duration-kind' });
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
  function set(next) {
    index = Math.min(allowed.length - 1, Math.max(0, next));
    const length = plan.lengths[index];
    slider.value = String(index);
    slider.setAttribute('aria-valuetext', `${formatMinutes(length.minutes)}, ${lengthName(length.minutes)}`);
    slider.style.setProperty('--fill', `${(index / Math.max(1, allowed.length - 1)) * 100}%`);
    value.textContent = formatMinutes(length.minutes);
    kind.textContent = lengthName(length.minutes);
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
  set(index);
  start.addEventListener('click', (event) =>
    withButton(event.currentTarget, async () => {
      saveChoice(allowed[index]);
      await call('POST', '/api/cultivation', { minutes: allowed[index] });
    }),
  );
  return h(
    'div',
    { class: 'stack cultivation-picker' },
    h(
      'div',
      { class: 'duration-picker' },
      h('p', { class: 'duration-head' }, h('span', { class: 'duration-title' }, t('Czas Kultywacji'), kind), value),
      h('div', { class: 'duration-row' }, less, slider, more),
      h('p', { class: 'duration-scale', 'aria-hidden': 'true' }, h('span', { text: formatMinutes(allowed[0]) }), h('span', { text: formatMinutes(longest) })),
      character.huntNext && h('p', { class: 'duration-lock', text: t('Dłuższa Kultywacja, do {time}, od poziomu {level}.', { time: formatMinutes(character.huntNext.minutes), level: character.huntNext.level }) }),
    ),
    h('div', { class: 'cultivation-gains' }, h('p', { class: 'cultivation-gains-title', text: t('Zdobędziesz:') }), gain, grow),
    note,
    h('div', { class: 'start-bar' }, start),
  );
}

// The Kultywacja's screen: at home, what it is, its own level, the
// character's and the class's levels, the length and "Medytuj" (or the word
// that a meditation would give nothing now); while it runs, the timer with
// the bar, "Przewiń" and "Przerwij Kultywację"; once it has ended, "Odbierz
// raport". The scene stands on top of each, and the music of the place
// plays (app.js: the route's music).
export function mountCultivation(container, { navigate }) {
  let countdown = null;
  let progress = null;
  let skipper = null;
  let shownFinished = null;

  const heading = (character) =>
    h(
      'div',
      { class: 'page-heading page-heading--back' },
      h(
        'div',
        { class: 'page-heading-text' },
        h('h1', { class: 'page-title', tabindex: '-1', text: t('Kultywacja') }),
        h('p', { class: 'page-subtitle', text: t('Postać: poz. {level} · Klasa: poz. {classLevel}', { level: character.level, classLevel: character.classLevel }) }),
      ),
      h('button', { type: 'button', class: 'button button--system back-button', onClick: () => leaveView(WALKA, 1, 'walka') }, icon('back', { size: 20 }), t('Powrót')),
    );

  function render() {
    const character = state.character;
    const activity = character.activity;
    const view = character.cultivation;
    countdown = null;
    progress = null;
    skipper = null;
    shownFinished = activity?.kind === 'cultivation' ? activityFinished(activity) : null;
    if (!isUnlocked('cultivation') || !view) {
      const unlock = unlockInfo('cultivation');
      fill(
        container,
        heading(character),
        systemPanel(t('Dostęp zablokowany. {name}: od poziomu postaci {level}. Twój poziom: {own}.', { name: unlock?.name ?? t('Kultywacja'), level: unlock?.level ?? '', own: character.level })),
      );
      return;
    }
    if (activity?.kind === 'cultivation') {
      fill(container, heading(character), activityView(activity, view));
      tick(serverNow());
      return;
    }
    // Busy with another activity: the Kultywacja waits for its end.
    if (activity || !view.plan) {
      fill(container, heading(character), scene(), levelCard(view), systemPanel(t('Twoja postać jest teraz zajęta. Kultywację zaczniesz, gdy skończy.'), systemLink(WALKA, t('Do Walki'))));
      return;
    }
    fill(
      container,
      heading(character),
      h(
        'article',
        { class: 'card cultivation-card', 'aria-label': t('Kultywacja') },
        scene(),
        about(view),
        levelCard(view),
        levelsList(character, view.plan),
        view.plan.possible
          ? picker(character, view)
          : systemPanel(t('Twoja postać dogoniła klasę, a Kultywacja ma najwyższy poziom: medytacja nic teraz nie da.')),
      ),
    );
  }

  // A Kultywacja under way or ended.
  function activityView(activity, view) {
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
            const { report } = await call('POST', '/api/hunts/claim');
            if (!report) return;
            reportCache.set(String(report.id), report);
            state.freshReport = String(report.id);
            navigate(`#/raport/${report.id}`);
          }),
      });
      return h('div', { class: 'stack' }, scene(), systemPanel(t('Kultywacja zakończona: {time}.', { time: formatMinutes(activity.minutes) }), ...gainLines, t('Raport czeka na odbiór.'), claim));
    }
    countdown = h('p', { class: 'countdown', 'aria-live': 'off' });
    progress = h('div', { class: 'bar-fill bar-fill--system' });
    skipper = skipControl('activity', (now) => activity.endsAt - now, t('Kultywacja'));
    const cancel = h('button', {
      type: 'button',
      class: 'button button--world',
      text: t('Przerwij Kultywację'),
      onClick: async (event) => {
        const button = event.currentTarget;
        const sure = await confirmAction({
          title: t('Przerwać Kultywację?'),
          text: t('Twoja postać przestanie medytować od razu, bez doświadczenia.'),
          confirmLabel: t('Przerwij'),
          danger: true,
        });
        if (sure) await withButton(button, () => call('POST', '/api/hunts/cancel'));
      },
    });
    return h(
      'div',
      { class: 'stack' },
      scene(),
      systemPanel(
        t('Kultywacja w toku: {time}.', { time: formatMinutes(activity.minutes) }),
        countdown,
        h('div', { class: 'bar bar--system' }, progress),
        ...gainLines,
        h('p', {
          class: 'system-hint',
          text: t('Raport będzie gotowy o {time}. Do tego czasu postać odpoczywa, a wyprawy, profesje i Drużyna poczekają.', { time: timeFormat.format(new Date(activity.endsAt)) }),
        }),
      ),
      skipper.element,
      cancel,
    );
  }

  function tick(now) {
    const activity = state.character.activity;
    skipper?.update(now);
    if (activity?.kind !== 'cultivation') return;
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
  const rows = [
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
      h('p', { class: 'herb-line', text: t('Twoja postać medytowała {time}.', { time: formatMinutes(report.minutes) }) }),
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

// Its line in the Dziennik (screens/journal.js), under its name and length.
export const cultivationRowMeta = (report) =>
  h(
    'span',
    { class: 'report-row-meta' },
    h('span', { class: 'chip chip--cultivation', text: t('kultywacja') }),
    ` ${t('+{xp} XP postaci', { xp: formatNumber(report.xp) })}${newLevels(report.levelBefore, report.levelAfter)}`,
    report.cultivation && ` · ${t('Kultywacja +{xp} XP', { xp: formatNumber(report.cultivation.xp) })}${newLevels(report.cultivation.levelBefore, report.cultivation.levelAfter)}`,
  );
