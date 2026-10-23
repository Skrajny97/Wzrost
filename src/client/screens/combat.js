// The Walka tab: hunts (regions, length, threat level, the running timer and
// the report to claim). Dungeons and training appear here once unlocked.

import { fill, h } from '../dom.js';
import { formatCountdown, formatMinutes, timeFormat } from '../format.js';
import { activityFinished, call, isUnlocked, reportCache, serverNow, state, unlockInfo } from '../state.js';
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
  let countdown = null;
  let progress = null;
  let shownFinished = null;

  async function loadOptions() {
    const key = `${state.character.level}:${state.character.hp}:${state.character.maxHp}`;
    if (optionsFor === key) return;
    optionsFor = key;
    try {
      options = await call('GET', '/api/hunts/options');
      render();
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
    return h(
      'div',
      { class: 'stack' },
      first && systemPanel('Wiatrołomy są bezpieczne na start. Wybierz czas i wyrusz. Raport przeczytasz po powrocie.'),
      state.content.regions.map((region) => regionCard(region, character)),
    );
  }

  function regionCard(region, character) {
    const allowed = character.huntDurations;
    const longLevel = unlockInfo('long-hunts').level;
    let minutes = choice[region.id];
    if (!allowed.includes(minutes)) minutes = allowed.includes(15) ? 15 : allowed[0];

    const threat = options?.regions.find((candidate) => candidate.id === region.id)?.threat[minutes];
    const threatLine = h(
      'p',
      { class: `threat threat--${threat ?? 'unknown'}` },
      'Zagrożenie: ',
      h('strong', { text: threat ? THREAT_NAMES[threat] : '…' }),
    );
    const levelNote =
      character.level < region.minLevel
        ? h('p', { class: 'region-warning', text: `Przeciwnicy mają tu poziom ${region.minLevel}–${region.maxLevel}, wyżej niż Twoja postać.` })
        : character.level > region.maxLevel + 2
          ? h('p', { class: 'region-warning', text: 'Ten region jest już dla Ciebie za łatwy: dostaniesz mniej doświadczenia.' })
          : null;

    const durations = h(
      'div',
      { class: 'durations', role: 'radiogroup', 'aria-label': `Czas polowania: ${region.name}` },
      state.content.durations.map((value) => {
        const locked = !allowed.includes(value);
        return h(
          'button',
          {
            type: 'button',
            class: 'duration',
            role: 'radio',
            'aria-checked': value === minutes,
            disabled: locked,
            'aria-label': locked ? `${formatMinutes(value)}, od poziomu ${longLevel}` : formatMinutes(value),
            onClick: () => {
              choice[region.id] = value;
              saveChoice(choice);
              render();
            },
          },
          formatMinutes(value),
          locked && h('span', { class: 'duration-lock', text: `poz. ${longLevel}` }),
        );
      }),
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
    if (!activity) return;
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
