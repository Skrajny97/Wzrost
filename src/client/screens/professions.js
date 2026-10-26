// The Profesje tab: the professions as squares in a triangle (Zielarstwo on
// top, Alchemia and Rzemieślnictwo below it, grey until they come), and the
// Zielarstwo screen: the Systemowy Zagajnik, the profession's level and
// stats, the herbs (those the System still hides are shadows), the herbs to
// gather and the time, and the gathering under way with "Przewiń",
// "Przerwij" and its report at the end. Locked, or hidden in this
// deployment, the tab says so as before.

import { herbSprite, placeArt, professionSprite } from '../art.js';
import { fill, h, icon } from '../dom.js';
import { countOf, dateTimeFormat, formatCountdown, formatMinutes, formatNumber, timeFormat } from '../format.js';
import { activityFinished, call, reportCache, serverNow, state, testModeOn } from '../state.js';
import { skipControl } from '../time.js';
import { confirmAction, systemPanel, toast, withButton } from '../ui.js';
import { lockedScreen } from './locked.js';

const HOME = '#/profesje';
// The addresses of the professions with a screen.
const SCREENS = { zielarstwo: 'herbalism' };
const HASHES = { herbalism: `${HOME}/zielarstwo` };
const FALLBACK_ICONS = { herbalism: 'leaf', alchemy: 'spirit', crafting: 'hammer' };
const CHOICE_KEY = 'wzrost.herb-choice';

function loadChoice() {
  try {
    return JSON.parse(localStorage.getItem(CHOICE_KEY)) ?? {};
  } catch {
    return {};
  }
}

function saveChoice(choice) {
  try {
    localStorage.setItem(CHOICE_KEY, JSON.stringify(choice));
  } catch {
    // Without storage the page simply forgets the last choice.
  }
}

const herbIcon = (id) => herbSprite(id) ?? icon('leaf', { size: 24 });

// A title with a large "Powrót" on the right, as in the report.
function backHeading(title, subtitle, hash) {
  return h(
    'div',
    { class: 'page-heading page-heading--back' },
    h('div', { class: 'page-heading-text' }, h('h1', { class: 'page-title', tabindex: '-1', text: title }), subtitle && h('p', { class: 'page-subtitle', text: subtitle })),
    h('a', { class: 'button button--system back-button', href: hash }, icon('back', { size: 20 }), 'Powrót'),
  );
}

export function mountProfessions(container, { params, navigate }) {
  const locked = lockedScreen('professions', 'Profesje');
  const professionId = params.profession ? SCREENS[params.profession] : null;
  // An unknown profession in the address leads back to the tab.
  if (params.profession && !professionId) {
    location.replace(HOME);
    return {};
  }
  const choice = loadChoice(); // { herbs: [ids], minutes }
  let lockedScreenShown = null;
  let shownState = null;
  let countdown = null;
  let progress = null;
  let skipper = null;

  // What the screen shows depends on: the gathering under way (or not) and
  // whether it has ended, and test mode.
  const stateKey = (character, now = serverNow()) => {
    const activity = character.activity;
    return JSON.stringify([activity?.kind ?? null, activity?.startedAt ?? null, activityFinished(activity, now), state.user.testMode && testModeOn()]);
  };

  function render() {
    const character = state.character;
    if (!character.professions) {
      lockedScreenShown ??= locked(container);
      lockedScreenShown.update();
      return;
    }
    lockedScreenShown = null;
    shownState = stateKey(character);
    countdown = null;
    progress = null;
    skipper = null;
    if (professionId === 'herbalism') {
      renderHerbalism(character);
      return;
    }
    fill(
      container,
      h('div', { class: 'page-heading' }, h('h1', { class: 'page-title', tabindex: '-1', text: 'Profesje' })),
      triangle(character),
    );
  }

  // Three squares: the first on top, the others below it.
  function triangle(character) {
    const [first, ...rest] = character.professions.list;
    return h(
      'div',
      { class: 'profession-triangle' },
      h('div', { class: 'profession-row' }, square(first, character)),
      h('div', { class: 'profession-row' }, rest.map((profession) => square(profession, character))),
    );
  }

  function square(profession, character) {
    const art = professionSprite(profession.id) ?? icon(FALLBACK_ICONS[profession.id] ?? 'leaf', { size: 40 });
    const label = h('span', { class: 'profession-name', text: profession.name });
    if (profession.soon) {
      return h(
        'div',
        { class: 'profession-square profession-square--soon', role: 'img', 'aria-label': `${profession.name}: wkrótce` },
        h('span', { class: 'profession-art' }, art),
        label,
        h('span', { class: 'profession-level', text: 'Wkrótce' }),
      );
    }
    const working = character.activity?.kind === 'herbs' && profession.id === character.professions.gathering.professionId;
    return h(
      'a',
      { class: 'profession-square', href: HASHES[profession.id] ?? HOME },
      h('span', { class: 'profession-art' }, art),
      label,
      h('span', { class: 'profession-level', text: working ? (activityFinished(character.activity) ? 'Raport gotowy' : 'Zbiera zioła') : `poz. ${profession.level}` }),
    );
  }

  function renderHerbalism(character) {
    const { list, gathering } = character.professions;
    const profession = list.find((candidate) => candidate.id === gathering.professionId);
    const activity = character.activity;
    fill(
      container,
      backHeading(profession.name, `poziom ${profession.level}`, HOME),
      // What the character is doing comes first, so a report to claim is
      // always at the top, above the place (the author).
      activity?.kind === 'herbs' ? gatheringCard(activity) : activity && systemPanel('Postać jest na wyprawie. Do Zagajnika wyruszy po powrocie.'),
      testTools(character),
      placeCard(gathering),
      levelCard(profession),
      !activity && gatherForm(character, gathering),
    );
  }

  // Test mode only: one button that ends the gathering at once.
  function testTools(character) {
    const activity = character.activity;
    if (!state.user.testMode || !testModeOn() || activity?.kind !== 'herbs' || activityFinished(activity)) return null;
    return h(
      'div',
      { class: 'test-tools' },
      h('p', { class: 'test-tools-text', text: 'Tryb testowy: zbieranie skończy się od razu, z tym samym wynikiem.' }),
      h('button', {
        type: 'button',
        class: 'button button--test',
        text: 'Pomiń czas',
        onClick: (event) => withButton(event.currentTarget, () => call('POST', '/api/test/skip-time')),
      }),
    );
  }

  // The grove's picture dim behind its name and the System's words.
  function placeCard(gathering) {
    const art = placeArt(gathering.place.id);
    const card = h(
      'section',
      { class: `card place-card${art ? ' place-card--art' : ''}`, 'aria-label': gathering.place.name },
      h('h2', { class: 'card-title', text: gathering.place.name }),
      h('p', { class: 'region-description', text: gathering.place.description }),
    );
    if (art) card.style.setProperty('--place-art', `url("${art}")`);
    return card;
  }

  function levelCard(profession) {
    const top = profession.xpToNext === 0;
    const share = top ? 100 : (profession.xp / profession.xpToNext) * 100;
    return h(
      'section',
      { class: 'card profession-card', 'aria-label': `${profession.name}, poziom ${profession.level}` },
      h('p', { class: 'profession-card-head' }, h('strong', { text: `Poziom ${profession.level}` }), h('span', { class: 'muted', text: ` z ${profession.maxLevel}` })),
      h('div', { class: 'bar bar--xp', role: 'presentation' }, h('div', { class: 'bar-fill', style: { width: `${share}%` } })),
      h('p', { class: 'muted', text: top ? 'Najwyższy poziom.' : `Do następnego poziomu: ${formatMinutes(profession.xpToNext - profession.xp)} zbierania.` }),
      h('p', { class: 'profession-stats', text: profession.stats.map((stat) => `${stat.name} +${formatNumber(stat.bonus)}`).join(' · ') }),
    );
  }

  // The gathering under way, or its report waiting.
  function gatheringCard(activity) {
    const names = activity.herbs.map((herb) => herb.name).join(', ');
    if (activityFinished(activity)) {
      const claim = h('button', {
        type: 'button',
        class: 'button button--system',
        text: 'Odbierz raport',
        onClick: (event) =>
          withButton(event.currentTarget, async () => {
            const { report } = await call('POST', '/api/hunts/claim');
            reportCache.set(String(report.id), report);
            state.freshReport = String(report.id);
            navigate(`#/raport/${report.id}`);
          }),
      });
      return systemPanel(`Zbieranie zakończone: ${names}, ${formatMinutes(activity.minutes)}.`, 'Raport czeka na odbiór.', claim);
    }
    countdown = h('p', { class: 'countdown', 'aria-live': 'off' });
    progress = h('div', { class: 'bar-fill bar-fill--system' });
    const cancel = h('button', {
      type: 'button',
      class: 'button button--world',
      text: 'Przerwij zbieranie',
      onClick: async (event) => {
        const button = event.currentTarget;
        const sure = await confirmAction({
          title: 'Przerwać zbieranie?',
          text: 'Postać wróci od razu, bez ziół i bez doświadczenia.',
          confirmLabel: 'Przerwij',
          danger: true,
        });
        if (sure) await withButton(button, () => call('POST', '/api/hunts/cancel'));
      },
    });
    skipper = skipControl('activity', (now) => activity.endsAt - now, 'Zbieranie');
    const card = h(
      'div',
      { class: 'stack' },
      systemPanel(
        `Zbieranie w toku: ${names}, ${formatMinutes(activity.minutes)}.`,
        countdown,
        h('div', { class: 'bar bar--system' }, progress),
        h('p', { class: 'system-hint', text: `Raport będzie gotowy o ${timeFormat.format(new Date(activity.endsAt))}. Możesz zamknąć grę.` }),
      ),
      skipper.element,
      cancel,
    );
    tick(serverNow());
    return card;
  }

  // The herbs to gather, the time and the start.
  function gatherForm(character, gathering) {
    const known = gathering.herbs.filter((herb) => !herb.hidden);
    const slots = gathering.slots;
    // The last choice, without herbs no longer known or too many for now.
    let chosen = (choice.herbs ?? []).filter((id) => known.some((herb) => herb.id === id)).slice(0, slots);
    if (chosen.length === 0) chosen = [known[0].id];
    const allowed = gathering.minutes;
    let index = allowed.indexOf(choice.minutes);
    if (index === -1) index = Math.max(0, allowed.indexOf(60));
    let minutes = allowed[index];

    const tiles = h('ul', { class: 'herb-grid' });
    const estimate = h('p', { class: 'herb-estimate' });
    const room = h('p', { class: 'herb-room' });
    const next = gathering.slotLevels.find((slot) => slot.herbs > slots);
    const slotsHint = h('p', {
      class: 'muted',
      text: `Naraz zbierasz ${countOf(slots, 'zioło', 'zioła', 'ziół')}.${next ? ` Od ${next.level}. poziomu: ${next.herbs}.` : ''}`,
    });

    const remember = () => {
      choice.herbs = chosen;
      choice.minutes = minutes;
      saveChoice(choice);
    };

    function toggle(id) {
      if (slots === 1) chosen = [id];
      else if (chosen.includes(id)) chosen = chosen.length > 1 ? chosen.filter((other) => other !== id) : chosen;
      else if (chosen.length < slots) chosen = [...chosen, id];
      else {
        toast(`Naraz zbierzesz najwyżej ${countOf(slots, 'zioło', 'zioła', 'ziół')}.`);
        return;
      }
      remember();
      show();
    }

    // The bag's room for the chosen herbs: what is left in each one's last
    // stack, and whole stacks in the free places.
    function roomFor(ids) {
      const stack = character.herbStack;
      const free = Math.max(0, character.bagCapacity - character.bagUsed);
      const left = ids.reduce((sum, id) => {
        const have = character.herbs.find((herb) => herb.id === id)?.count ?? 0;
        return sum + (Math.ceil(have / stack) * stack - have);
      }, 0);
      return left + free * stack;
    }

    function show() {
      fill(
        tiles,
        gathering.herbs.map((herb) => {
          if (herb.hidden) {
            return h(
              'li',
              {},
              h(
                'div',
                { class: 'herb-tile herb-tile--hidden', role: 'img', 'aria-label': `Nieznane zioło. ${herb.hint}` },
                h('span', { class: 'herb-art herb-art--shadow' }, herbIcon(herb.id)),
                h('span', { class: 'herb-name', text: '???' }),
                h('span', { class: 'herb-meta', text: herb.hint }),
              ),
            );
          }
          const on = chosen.includes(herb.id);
          return h(
            'li',
            {},
            h(
              'button',
              { type: 'button', class: 'herb-tile', 'aria-pressed': on, onClick: () => toggle(herb.id) },
              h('span', { class: 'herb-art' }, herbIcon(herb.id)),
              h('span', { class: 'herb-name', text: herb.name }),
              h('span', { class: 'herb-meta', text: `w plecaku: ${formatNumber(herb.count)}` }),
            ),
          );
        }),
      );
      const share = chosen.length;
      const expected = chosen.map((id) => {
        const herb = known.find((candidate) => candidate.id === id);
        const middle = (herb.perHour * minutes) / 60 / share;
        const low = Math.max(0, Math.floor(middle * (1 - gathering.spread)));
        const high = Math.ceil(middle * (1 + gathering.spread));
        return { herb, low, high };
      });
      const top = expected.reduce((sum, { high }) => sum + high, 0);
      estimate.textContent = `Spodziewany zbiór: ${expected.map(({ herb, low, high }) => `${herb.name} ${low === high ? low : `${low}–${high}`}`).join(', ')}.`;
      const fits = roomFor(chosen);
      room.className = `herb-room${top > fits ? ' herb-room--full' : ''}`;
      room.textContent =
        top > fits
          ? `W plecaku zmieści się tylko ${formatNumber(fits)} szt. Reszta przepadnie.`
          : `W plecaku zmieści się jeszcze ${formatNumber(fits)} szt. ${share === 1 ? 'tego zioła' : 'tych ziół'}.`;
    }

    // A slider with buttons for one step at a time, as for explorations.
    const value = h('output', { class: 'duration-value', 'aria-live': 'off' });
    const slider = h('input', {
      type: 'range',
      class: 'duration-slider',
      min: 0,
      max: allowed.length - 1,
      step: 1,
      value: index,
      'aria-label': 'Czas zbierania',
      onInput: () => set(Number(slider.value)),
      onChange: () => remember(),
    });
    const stepButton = (sign, label) =>
      h('button', {
        type: 'button',
        class: 'button button--world duration-step',
        'aria-label': label,
        text: sign < 0 ? '−' : '+',
        onClick: () => {
          set(index + sign);
          remember();
        },
      });
    const less = stepButton(-1, 'Krócej');
    const more = stepButton(1, 'Dłużej');
    function set(nextIndex) {
      index = Math.min(allowed.length - 1, Math.max(0, nextIndex));
      minutes = allowed[index];
      slider.value = String(index);
      slider.setAttribute('aria-valuetext', formatMinutes(minutes));
      slider.style.setProperty('--fill', `${(index / Math.max(1, allowed.length - 1)) * 100}%`);
      value.textContent = formatMinutes(minutes);
      less.disabled = index === 0;
      more.disabled = index === allowed.length - 1;
      show();
    }
    set(index);

    const start = h('button', {
      type: 'button',
      class: 'button button--system',
      text: 'Wyrusz po zioła',
      onClick: (event) =>
        withButton(event.currentTarget, async () => {
          remember();
          await call('POST', '/api/professions/gather', { herbs: chosen, minutes });
        }),
    });

    return h(
      'section',
      { class: 'card gather-card', 'aria-labelledby': 'herbs-title' },
      h('h2', { class: 'section-title', id: 'herbs-title', text: 'Zioła' }),
      tiles,
      slotsHint,
      h(
        'div',
        { class: 'duration-picker' },
        h('p', { class: 'duration-head' }, h('span', { class: 'duration-title' }, 'Czas zbierania'), value),
        h('div', { class: 'duration-row' }, less, slider, more),
        h('p', { class: 'duration-scale', 'aria-hidden': 'true' }, h('span', { text: formatMinutes(allowed[0]) }), h('span', { text: formatMinutes(allowed.at(-1)) })),
      ),
      estimate,
      room,
      start,
    );
  }

  function tick(now) {
    const character = state.character;
    if (!character?.professions) {
      if (lockedScreenShown) return;
      render();
      return;
    }
    if (stateKey(character, now) !== shownState) {
      render();
      return;
    }
    skipper?.update(now);
    const activity = character.activity;
    if (countdown && activity) {
      countdown.textContent = formatCountdown(activity.endsAt - now);
      const done = (now - activity.startedAt) / (activity.endsAt - activity.startedAt);
      progress.style.width = `${Math.min(100, Math.max(0, done * 100))}%`;
    }
  }

  render();
  return { update: render, tick };
}

// The report of a gathering, drawn by the report screen (report.js): the
// grove's line, the herbs found and lost, the profession's levels, the XP
// and the System's lines.
export function herbsReport(report, heading) {
  const summary = report.summary;
  const { profession } = report;
  const rows = [
    ['XP postaci', `+${formatNumber(summary.xp)} XP`],
    [profession.name, profession.levelAfter > profession.levelBefore ? `poziom ${profession.levelBefore} → ${profession.levelAfter}` : `poziom ${profession.levelAfter}`],
    summary.timePoints > 0 && ['Punkty Czasu', `+${formatNumber(summary.timePoints)}`],
  ].filter(Boolean);
  return [
    heading('Raport ze zbierania', `${report.placeName} · ${formatMinutes(report.minutes)} · ${dateTimeFormat.format(new Date(report.endsAt))}`),
    h(
      'section',
      { class: 'card report-summary', 'aria-label': 'Podsumowanie' },
      h('p', { class: 'herb-line', text: report.line }),
      h(
        'ul',
        { class: 'herb-found' },
        report.herbs.map((herb) =>
          h(
            'li',
            { class: 'herb-found-row' },
            h('span', { class: 'herb-art' }, herbIcon(herb.id)),
            h('span', { class: 'herb-found-name', text: herb.name }),
            h('span', { class: 'herb-found-count', text: `×${formatNumber(herb.count)}` }),
            herb.lost > 0 && h('span', { class: 'herb-found-lost', text: `przepadło ${formatNumber(herb.lost)}` }),
          ),
        ),
      ),
      report.lost && h('p', { class: 'herb-room herb-room--full', text: report.lost }),
      h(
        'dl',
        { class: 'status-list' },
        rows.map(([label, value]) => h('div', { class: 'status-row' }, h('dt', { text: label }), h('dd', { text: value }))),
      ),
    ),
    report.system.length > 0 && systemPanel(...report.system),
    h('a', { class: 'button button--system', href: HASHES.herbalism, text: 'Do Zagajnika' }),
  ];
}

// The herbs of a report for the journal's row: "Żywokost ×13".
export const herbsSummary = (summary) => summary.herbs.map((herb) => `${herb.name} ×${formatNumber(herb.count)}`).join(', ');
