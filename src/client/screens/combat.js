// The Walka tab: hunts (regions, length, threat level, the running timer and
// the report to claim). Dungeons and training appear here once unlocked.

import { fill, h } from '../dom.js';
import { formatCountdown, formatMinutes, timeFormat } from '../format.js';
import { activityFinished, call, currentHp, isUnlocked, reportCache, serverNow, state, unlockInfo } from '../state.js';
import { confirmAction, lockLabel, systemPanel, toast, withButton } from '../ui.js';

const THREAT_NAMES = { low: 'niskie', moderate: 'umiarkowane', high: 'wysokie', 'very-high': 'bardzo wysokie' };
const CHOICE_KEY = 'wzrost.hunt-choice';

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

export function mountCombat(container, { navigate }) {
  let options = null; // threat levels from the server, per region and duration
  let optionsFor = null; // character version the options were computed for
  const choice = loadChoice(); // { [regionId]: minutes }
  const threatViews = []; // redraw each region's threat for its chosen length
  let countdown = null;
  let progress = null;
  let shownFinished = null;

  // HP in tenths of the maximum: resting moves the threat now and then.
  const hpStep = (character, now) => Math.floor((currentHp(character, now) / character.maxHp) * 10);

  // One region per request, one after another, so each stays within the
  // server's CPU limit. The rating follows the whole character, so a change
  // of level, class level, stats, equipment or HP asks again. Until the new
  // answer comes, a new build shows "…", while resting keeps the old rating.
  async function loadOptions(now = serverNow()) {
    const character = state.character;
    const build = JSON.stringify([
      character.level,
      character.classLevel,
      character.maxHp,
      character.stats.map((stat) => stat.total),
      Object.values(character.equipment).map((item) => item?.id ?? null),
    ]);
    const key = `${build}|${hpStep(character, now)}`;
    if (optionsFor === key) return;
    if (optionsFor?.split('|')[0] !== build) options = null;
    optionsFor = key;
    try {
      for (const region of state.content.regions) {
        const { regions } = await call('GET', `/api/hunts/options?region=${encodeURIComponent(region.id)}`);
        if (optionsFor !== key) return;
        options = { regions: [...(options?.regions ?? []).filter((known) => known.id !== region.id), ...regions] };
        for (const view of threatViews) view();
      }
    } catch (error) {
      toast(error.message);
    }
  }

  function render() {
    const character = state.character;
    const activity = character.activity;
    shownFinished = activityFinished(activity);
    countdown = null;
    progress = null;
    threatViews.length = 0;

    fill(container,
      h('div', { class: 'page-heading' }, h('h1', { class: 'page-title', tabindex: '-1', text: 'Walka' })),
      modeTabs(),
      activity ? activityCard(activity) : huntList(character),
    );
    if (!activity) loadOptions();
  }

  function modeTabs() {
    const tab = (label, unlock) => {
      const locked = unlock && !isUnlocked(unlock);
      const info = unlock && unlockInfo(unlock);
      return h(
        'button',
        {
          type: 'button',
          class: 'segmented-option',
          'aria-pressed': !unlock,
          disabled: Boolean(unlock),
          onClick: () => {},
        },
        locked ? [label, ' ', lockLabel(`poz. ${info.level}`)] : unlock ? `${label} · wkrótce` : label,
      );
    };
    return h(
      'div',
      { class: 'segmented segmented--three', role: 'group', 'aria-label': 'Rodzaj walki' },
      tab('Polowania'),
      tab('Trening', 'training'),
      tab('Lochy', 'dungeons'),
    );
  }

  function activityCard(activity) {
    const region = state.content.regions.find((candidate) => candidate.id === activity.regionId);
    if (activityFinished(activity)) {
      const claim = h('button', {
        type: 'button',
        class: 'button button--system',
        text: 'Odbierz raport',
        onClick: (event) =>
          withButton(event.currentTarget, async () => {
            const { report } = await call('POST', '/api/hunts/claim');
            reportCache.set(String(report.id), report);
            navigate(`#/raport/${report.id}`);
          }),
      });
      return h(
        'div',
        { class: 'stack' },
        systemPanel(`Polowanie zakończone: ${region.name}, ${formatMinutes(activity.minutes)}.`, 'Raport czeka na odbiór.', claim),
      );
    }

    countdown = h('p', { class: 'countdown', 'aria-live': 'off' });
    progress = h('div', { class: 'bar-fill bar-fill--system' });
    const cancel = h('button', {
      type: 'button',
      class: 'button button--world',
      text: 'Przerwij polowanie',
      onClick: async (event) => {
        const button = event.currentTarget;
        const sure = await confirmAction({
          title: 'Przerwać polowanie?',
          text: 'Postać wróci od razu, bez doświadczenia, złota i łupów.',
          confirmLabel: 'Przerwij',
          danger: true,
        });
        if (sure) await withButton(button, () => call('POST', '/api/hunts/cancel'));
      },
    });
    const card = h(
      'div',
      { class: 'stack' },
      systemPanel(
        `Polowanie w toku: ${region.name}, ${formatMinutes(activity.minutes)}.`,
        countdown,
        h('div', { class: 'bar bar--system' }, progress),
        h('p', { class: 'system-hint', text: `Raport będzie gotowy o ${timeFormat.format(new Date(activity.endsAt))}. Możesz zamknąć grę.` }),
      ),
      cancel,
    );
    tick(serverNow());
    return card;
  }

  function huntList(character) {
    const first = character.level === 1 && character.xp === 0 && character.gold === 0;
    const unarmed = !character.equipment.weapon;
    return h(
      'div',
      { class: 'stack' },
      first
        ? systemPanel(
            'Wiatrołomy to najbezpieczniejsze miejsce na start. Wybierz czas i wyrusz. Raport przeczytasz po powrocie.',
            'Nie masz jeszcze ekwipunku. Pierwszy pokonany przeciwnik zostawi broń Twojej klasy.',
          )
        : unarmed && systemPanel('Walczysz gołymi rękami. Załóż broń z plecaka w zakładce Postać, jeśli już ją masz.'),
      state.content.regions.map((region) => regionCard(region, character)),
      h('p', {
        class: 'muted threat-note',
        text: 'Zagrożenie to szansa omdlenia na wyprawie. Gra liczy je z próbnych walk Twojej postaci z potworami regionu, więc liczą się jej statystyki, ekwipunek i aktualne HP, a nie sam poziom.',
      }),
    );
  }

  function regionCard(region, character) {
    const allowed = character.huntDurations;
    const shortest = allowed[0];
    const longest = allowed.at(-1);
    const { step, max } = state.content.durations;
    const longLevel = unlockInfo('long-hunts').level;
    let minutes = choice[region.id];
    if (!allowed.includes(minutes)) minutes = allowed.includes(15) ? 15 : shortest;

    const threatValue = h('strong', {});
    const threatLine = h('p', { class: 'threat' }, 'Zagrożenie: ', threatValue);
    const showThreat = () => {
      const threat = options?.regions.find((candidate) => candidate.id === region.id)?.threat[minutes];
      threatLine.className = `threat threat--${threat ?? 'unknown'}`;
      threatValue.textContent = threat ? THREAT_NAMES[threat] : '…';
    };
    threatViews.push(showThreat);

    const levelNote =
      character.level < region.minLevel
        ? h('p', { class: 'region-warning', text: `Przeciwnicy mają tu poziom ${region.minLevel}–${region.maxLevel}, wyżej niż Twoja postać.` })
        : character.level > region.maxLevel + 2
          ? h('p', { class: 'region-warning', text: 'Ten region jest już dla Ciebie za łatwy: dostaniesz mniej doświadczenia.' })
          : null;

    // A slider in steps of 5 minutes, with buttons for one step at a time.
    const value = h('output', { class: 'duration-value', 'aria-live': 'off' });
    const slider = h('input', {
      type: 'range',
      class: 'duration-slider',
      min: shortest,
      max: longest,
      step,
      value: minutes,
      'aria-label': `Czas polowania: ${region.name}`,
      onInput: () => set(Number(slider.value)),
      onChange: () => remember(),
    });
    const stepButton = (sign, label) =>
      h('button', {
        type: 'button',
        class: 'button button--world duration-step',
        'aria-label': `${label} o ${step} minut`,
        text: sign < 0 ? '−' : '+',
        onClick: () => {
          set(minutes + sign * step);
          remember();
        },
      });
    const less = stepButton(-1, 'Krócej');
    const more = stepButton(1, 'Dłużej');
    const remember = () => {
      choice[region.id] = minutes;
      saveChoice(choice);
    };
    function set(next) {
      minutes = Math.min(longest, Math.max(shortest, Math.round(next / step) * step));
      slider.value = String(minutes);
      slider.setAttribute('aria-valuetext', formatMinutes(minutes));
      slider.style.setProperty('--fill', `${((minutes - shortest) / Math.max(1, longest - shortest)) * 100}%`);
      value.textContent = formatMinutes(minutes);
      less.disabled = minutes <= shortest;
      more.disabled = minutes >= longest;
      showThreat();
    }
    set(minutes);

    const durations = h(
      'div',
      { class: 'duration-picker' },
      h('p', { class: 'duration-head' }, h('span', { text: 'Czas wyprawy' }), value),
      h('div', { class: 'duration-row' }, less, slider, more),
      h(
        'p',
        { class: 'duration-scale', 'aria-hidden': 'true' },
        h('span', { text: formatMinutes(shortest) }),
        h('span', { text: formatMinutes(longest) }),
      ),
      longest < max && h('p', { class: 'duration-lock', text: `Dłuższe wyprawy, do ${formatMinutes(max)}, od poziomu ${longLevel}.` }),
    );

    const start = h('button', {
      type: 'button',
      class: 'button button--system',
      text: 'Wyrusz',
      onClick: (event) =>
        withButton(event.currentTarget, async () => {
          choice[region.id] = minutes;
          saveChoice(choice);
          await call('POST', '/api/hunts', { regionId: region.id, minutes });
          window.scrollTo(0, 0);
        }),
    });

    return h(
      'article',
      { class: 'card region-card', 'aria-labelledby': `region-${region.id}` },
      h(
        'header',
        { class: 'region-head' },
        h('h2', { class: 'card-title', id: `region-${region.id}`, text: region.name }),
        h(
          'span',
          { class: 'region-chips' },
          h('span', { class: 'chip', text: `poz. ${region.minLevel}–${region.maxLevel}` }),
          region.safe && h('span', { class: 'chip chip--safe', text: 'bezpieczny' }),
        ),
      ),
      h('p', { class: 'region-description', text: region.description }),
      h('p', { class: 'region-trait' }, h('strong', { text: `${region.trait.name}. ` }), region.trait.description),
      levelNote,
      durations,
      threatLine,
      start,
    );
  }

  function tick(now) {
    const activity = state.character.activity;
    if (!activity) {
      loadOptions(now);
      return;
    }
    if (activityFinished(activity, now) !== shownFinished) {
      render();
      return;
    }
    if (countdown) {
      countdown.textContent = formatCountdown(activity.endsAt - now);
      const done = (now - activity.startedAt) / (activity.endsAt - activity.startedAt);
      progress.style.width = `${Math.min(100, Math.max(0, done * 100))}%`;
    }
  }

  render();
  return { update: render, tick };
}
