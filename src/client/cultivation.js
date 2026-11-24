// Kultywacja (1230 A; src/server/cultivation.js, src/engine/cultivation.js):
// while the class is ahead of the character, the character meditates for a
// length an exploration offers it, for character XP only. It has a screen of
// its own (#/kultywacja, mountCultivation), as a profession's, with its scene
// and its music (data/music.json, place `cultivation`): the levels, the XP
// of each length up to the class's level and "Medytuj"; while it runs, the
// timer, "Przewiń" and "Przerwij Kultywację"; then "Odbierz raport". The
// Walka's main view leads to it with a card (cultivationLink) and, while it
// runs, with a line as for a profession's work (cultivationBusy). The scene
// is data/animations.json `cultivation`, a sheet as a work's (scenes.js
// loopScene). Its texts are written in Polish and shown in the page's
// language (t(), i18n.js).

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

// The name of a length, as under the exploration's slider ("krótka"…).
const lengthName = (minutes) => (state.content.lengths?.find((length) => length.upTo === undefined || minutes <= length.upTo) ?? {}).name ?? '';

// " · poziom 120 → 131" after the XP, or nothing without a new level.
const newLevels = (before, after) => (after > before ? ` · ${t('poziom {before} → {after}', { before, after })}` : '');

// "Postać 120 · Klasa 140 · do klasy 6 h 40 min", or the levels met.
const progressLine = (character, plan) =>
  plan.open
    ? t('Postać {level} · Klasa {classLevel} · do klasy {time}', { level: character.level, classLevel: character.classLevel, time: formatMinutes(plan.minutes) })
    : t('Twoja postać dogoniła klasę.');

// The Walka's way to the Kultywacja while the character is at home, from
// its unlock: a card as a land's, its scene behind the words.
export function cultivationLink(character) {
  const plan = character.cultivation;
  if (!plan || character.activity) return null;
  const card = h(
    'a',
    { class: `card region-card region-link cultivation-link${plan.open ? '' : ' cultivation-link--met'}`, href: CULTIVATION_HASH, 'data-guide': 'cultivation', onClick: (event) => openView(event, CULTIVATION_HASH, 'walka') },
    h('div', { class: 'region-head' }, h('h2', { class: 'card-title', text: t('Kultywacja') }), h('span', { class: 'region-chips' }, h('span', { class: 'chip chip--system', text: t('×{factor} XP postaci', { factor: plan.factor }) }))),
    h('p', { class: 'region-trait', text: t('Twoja postać medytuje zamiast wyprawy i zdobywa tylko XP postaci, aż dogoni klasę.') }),
    h('p', { class: 'region-foot' }, h('span', { text: progressLine(character, plan) }), icon('chevron', { size: 20 })),
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
const about = (plan) =>
  howItWorks(
    t('Twoja postać medytuje zamiast wyprawy i zdobywa tylko XP postaci: {factor} razy tyle, ile dałaby jej wyprawa tej samej długości w miejscu {place}. Nie zdobywa XP klasy, łupów ani złota.', {
      factor: plan.factor,
      place: plan.area.name,
    }),
    [
      t('Kultywacja może trwać tyle samo co wyprawa. W tym czasie postać nie wyrusza na wyprawy, nie pracuje w profesji i nie idzie z Drużyną, ale odpoczywa.'),
      t('Kultywacja nigdy nie da postaci wyższego poziomu niż klasa: daje najwyżej tyle XP, ile w chwili odbioru raportu brakuje do poziomu klasy. Gdy poziomy się zrównają, Kultywacja poczeka, aż klasa znów wyprzedzi postać.'),
      t('Punkty Czasu przewijają ją jak wyprawę. Przerwana nie daje nic.'),
    ],
  );

// The length with a slider over the lengths an exploration offers, the XP
// of the one chosen up to the class's level, and "Medytuj".
function picker(character, plan) {
  const allowed = plan.lengths.map((length) => length.minutes);
  const longest = allowed.at(-1);
  // The length chosen last, else the shortest that catches the class up,
  // else the longest.
  const kept = allowed.indexOf(loadChoice());
  const enough = allowed.findIndex((minutes) => minutes >= plan.minutes);
  let index = kept >= 0 ? kept : enough >= 0 ? enough : allowed.length - 1;

  const value = h('output', { class: 'duration-value', 'aria-live': 'off' });
  const kind = h('span', { class: 'duration-kind' });
  const gain = h('p', { class: 'cultivation-gain' });
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
    const caught = length.xp >= plan.cap;
    gain.textContent = `${t('Zdobędziesz: +{xp} XP postaci', { xp: formatNumber(length.xp) })}${newLevels(character.level, length.level)}`;
    gain.classList.toggle('cultivation-gain--caught', caught);
    // How long is enough to catch the class up, and that a longer one
    // gives no more.
    note.textContent = caught
      ? length.minutes > plan.minutes
        ? t('Twoja postać dogoni klasę. Wystarczy {time}: dłuższa Kultywacja nie da więcej XP.', { time: formatMinutes(plan.minutes) })
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
    gain,
    note,
    h('div', { class: 'start-bar' }, start),
  );
}

// The Kultywacja's screen: at home, what it is, its levels, the length and
// "Medytuj" (or the word that the character has caught its class up);
// while it runs, the timer with the bar, "Przewiń" and "Przerwij
// Kultywację"; once it has ended, "Odbierz raport". The scene stands on top
// of each, and the music of the place plays (app.js: the route's music).
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
    const plan = character.cultivation;
    countdown = null;
    progress = null;
    skipper = null;
    shownFinished = activity?.kind === 'cultivation' ? activityFinished(activity) : null;
    if (!isUnlocked('cultivation')) {
      const unlock = unlockInfo('cultivation');
      fill(
        container,
        heading(character),
        systemPanel(t('Dostęp zablokowany. {name}: od poziomu postaci {level}. Twój poziom: {own}.', { name: unlock?.name ?? t('Kultywacja'), level: unlock?.level ?? '', own: character.level })),
      );
      return;
    }
    if (activity?.kind === 'cultivation') {
      fill(container, heading(character), activityView(activity));
      tick(serverNow());
      return;
    }
    // Busy with another activity: the Kultywacja waits for its end.
    if (activity || !plan) {
      fill(container, heading(character), scene(), systemPanel(t('Twoja postać jest teraz zajęta. Kultywację zaczniesz, gdy skończy.'), systemLink(WALKA, t('Do Walki'))));
      return;
    }
    fill(
      container,
      heading(character),
      h(
        'article',
        { class: 'card cultivation-card', 'aria-label': t('Kultywacja') },
        scene(),
        about(plan),
        levelsList(character, plan),
        plan.open
          ? picker(character, plan)
          : systemPanel(t('Twoja postać dogoniła klasę (poziom {level}). Kultywacja ruszy, gdy klasa znów ją wyprzedzi.', { level: character.classLevel })),
      ),
    );
  }

  // A Kultywacja under way or ended.
  function activityView(activity) {
    const running = state.character.cultivation?.running ?? null;
    const gainLine =
      running && h('p', { class: 'system-hint', text: `${t('Twoja postać zdobędzie +{xp} XP postaci', { xp: formatNumber(running.xp) })}${newLevels(state.character.level, running.level)}.` });
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
      return h('div', { class: 'stack' }, scene(), systemPanel(t('Kultywacja zakończona: {time}.', { time: formatMinutes(activity.minutes) }), gainLine, t('Raport czeka na odbiór.'), claim));
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
        gainLine,
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

// The report of a Kultywacja (screens/report.js): its length, the XP and
// the levels it brought, the System's lines with the free points to spend
// (`points`, the report screen's own box), and the way back.
export function cultivationReport(report, heading, points = null) {
  const { summary } = report;
  const rows = [
    [t('XP postaci'), t('+{xp} XP', { xp: formatNumber(report.xp) })],
    [t('Poziom postaci'), summary.levelAfter > summary.levelBefore ? `${formatNumber(summary.levelBefore)} → ${formatNumber(summary.levelAfter)}` : formatNumber(summary.levelBefore)],
    [t('Poziom klasy'), formatNumber(report.classLevel)],
    summary.timePoints > 0 && [t('Punkty Czasu'), `+${formatNumber(summary.timePoints)}`],
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
      report.capped && h('p', { class: 'muted', text: t('Twoja postać dogoniła klasę: Kultywacja dała tyle XP, ile brakowało do poziomu klasy.') }),
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
  );
