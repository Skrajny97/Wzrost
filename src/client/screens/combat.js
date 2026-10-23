// The Walka tab: explorations (regions, length, threat level, the running
// timer and the report to claim). Dungeons and training appear here once
// unlocked. The code calls explorations hunts.

import { fill, h } from '../dom.js';
import { formatCountdown, formatMinutes, timeFormat } from '../format.js';
import { activityFinished, call, currentHp, isUnlocked, reportCache, serverNow, state, testModeOn, unlockInfo } from '../state.js';
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

// "bardzo krótka", "krótka"… for a length, from the content.
const lengthName = (minutes) => (state.content.lengths.find((length) => length.upTo === undefined || minutes <= length.upTo) ?? {}).name ?? '';

export function mountCombat(container, { navigate }) {
  let options = null; // threat levels from the server, per region and duration
  let optionsFor = null; // character version the options were computed for
  const choice = loadChoice(); // { [regionId]: minutes }
  const threatViews = []; // redraw each region's threat for its chosen length
  let countdown = null;
  let progress = null;
  let shownFinished = null;
  let shownSkip = null;

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
    shownSkip = skipKind(character);
    countdown = null;
    progress = null;
    threatViews.length = 0;

    fill(container,
      h('div', { class: 'page-heading' }, h('h1', { class: 'page-title', tabindex: '-1', text: 'Walka' })),
      modeTabs(),
      testTools(),
      activity ? activityCard(activity) : huntList(character),
    );
    if (!activity) loadOptions();
  }

  // What "Pomiń czas" would skip now: the hunt, the rest, or nothing.
  function skipKind(character, now = serverNow()) {
    if (!state.content.testMode || !testModeOn()) return null;
    if (character.activity) return activityFinished(character.activity, now) ? null : 'hunt';
    return currentHp(character, now) < character.maxHp ? 'rest' : null;
  }

  // Test mode only: one button that ends the current wait.
  function testTools() {
    if (!shownSkip) return null;
    return h(
      'div',
      { class: 'test-tools' },
      h('p', {
        class: 'test-tools-text',
        text:
          shownSkip === 'hunt'
            ? 'Tryb testowy: wyprawa skończy się od razu, z tym samym wynikiem.'
            : 'Tryb testowy: HP wróci od razu do pełna.',
      }),
      h('button', {
        type: 'button',
        class: 'button button--test',
        text: 'Pomiń czas',
        onClick: (event) => withButton(event.currentTarget, () => call('POST', '/api/test/skip-time')),
      }),
    );
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
      tab('Eksploracja'),
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
        systemPanel(`Eksploracja zakończona: ${region.name}, ${formatMinutes(activity.minutes)}.`, 'Raport czeka na odbiór.', claim),
      );
    }

    countdown = h('p', { class: 'countdown', 'aria-live': 'off' });
    progress = h('div', { class: 'bar-fill bar-fill--system' });
    const cancel = h('button', {
      type: 'button',
      class: 'button button--world',
      text: 'Przerwij eksplorację',
      onClick: async (event) => {
        const button = event.currentTarget;
        const sure = await confirmAction({
          title: 'Przerwać eksplorację?',
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
        `Eksploracja w toku: ${region.name}, ${formatMinutes(activity.minutes)}.`,
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
            'Nie masz jeszcze ekwipunku. Pierwszy pokonany przeciwnik zostawi broń Twojej klasy, a postać od razu ją założy.',
          )
        : unarmed && systemPanel('Walczysz gołymi rękami. Załóż broń z plecaka w zakładce Postać, jeśli już ją masz.'),
      state.content.regions.map((region) => regionCard(region, character)),
      h('p', { class: 'muted threat-note', text: 'Zagrożenie to szansa omdlenia na wyprawie.' }),
    );
  }

  function regionCard(region, character) {
    const allowed = character.huntDurations;
    const { max } = state.content.durations;
    const longLevel = unlockInfo('long-hunts').level;
    // The slider moves over the allowed lengths (1, 5, 10… minutes).
    let index = allowed.indexOf(choice[region.id]);
    if (index === -1) index = Math.max(0, allowed.indexOf(15));
    let minutes = allowed[index];

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

    // A slider with buttons for one step at a time, and the length's name.
    const value = h('output', { class: 'duration-value', 'aria-live': 'off' });
    const kind = h('span', { class: 'duration-kind' });
    const slider = h('input', {
      type: 'range',
      class: 'duration-slider',
      min: 0,
      max: allowed.length - 1,
      step: 1,
      value: index,
      'aria-label': `Czas wyprawy: ${region.name}`,
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
    const remember = () => {
      choice[region.id] = minutes;
      saveChoice(choice);
    };
    function set(next) {
      index = Math.min(allowed.length - 1, Math.max(0, next));
      minutes = allowed[index];
      slider.value = String(index);
      slider.setAttribute('aria-valuetext', `${formatMinutes(minutes)}, ${lengthName(minutes)}`);
      slider.style.setProperty('--fill', `${(index / Math.max(1, allowed.length - 1)) * 100}%`);
      value.textContent = formatMinutes(minutes);
      kind.textContent = lengthName(minutes);
      less.disabled = index === 0;
      more.disabled = index === allowed.length - 1;
      showThreat();
    }
    set(index);

    const durations = h(
      'div',
      { class: 'duration-picker' },
      h('p', { class: 'duration-head' }, h('span', { class: 'duration-title' }, 'Czas wyprawy', kind), value),
      h('div', { class: 'duration-row' }, less, slider, more),
      h(
        'p',
        { class: 'duration-scale', 'aria-hidden': 'true' },
        h('span', { text: formatMinutes(allowed[0]) }),
        h('span', { text: formatMinutes(allowed.at(-1)) }),
      ),
      allowed.at(-1) < max && h('p', { class: 'duration-lock', text: `Dłuższe wyprawy, do ${formatMinutes(max)}, od poziomu ${longLevel}.` }),
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
    if (skipKind(state.character, now) !== shownSkip) {
      render();
      return;
    }
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
