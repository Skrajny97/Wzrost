// The Walka tab: explorations in three steps. The main view lists the regions
// (or shows the running exploration and the report to claim). A region shows
// its inner regions as circles, open from the class level each needs. An
// inner region shows the length, the threat level and the start. Dungeons and
// training appear here once unlocked. The code calls explorations hunts and
// inner regions areas.

import { areaArt } from '../area-art.js';
import { fill, h, icon } from '../dom.js';
import { formatCountdown, formatMinutes, timeFormat } from '../format.js';
import { activityFinished, call, currentHp, isUnlocked, reportCache, serverNow, state, testModeOn, unlockInfo } from '../state.js';
import { confirmAction, lockLabel, systemPanel, toast, withButton } from '../ui.js';

const THREAT_NAMES = { low: 'niskie', moderate: 'umiarkowane', high: 'wysokie', 'very-high': 'bardzo wysokie' };
const CHOICE_KEY = 'wzrost.hunt-choice';
const HOME = '#/walka';

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

// What the threat rating depends on, apart from HP.
const buildKey = (character) =>
  JSON.stringify([
    character.level,
    character.classLevel,
    character.maxHp,
    character.stats.map((stat) => stat.total),
    Object.values(character.equipment).map((item) => item?.id ?? null),
  ]);

// "bardzo krótka", "krótka"… for a length, from the content.
const lengthName = (minutes) => (state.content.lengths.find((length) => length.upTo === undefined || minutes <= length.upTo) ?? {}).name ?? '';

const areaOpen = (area, character) => character.classLevel >= area.unlockClassLevel;

const chip = (text, className = '') => h('span', { class: `chip ${className}`.trim(), text });

// The region and inner region views go on the browser history with their
// depth below the main view, so "Powrót" and the phone's back button lead to
// the same place, and starting an exploration returns to the main view.
const depth = () => history.state?.walka ?? 0;

function openView(event, hash) {
  event.preventDefault();
  history.pushState({ walka: depth() + 1 }, '', hash);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

function leaveView(hash, levels) {
  if (depth() >= levels) history.go(-levels);
  else location.replace(hash);
}

export function mountCombat(container, { params, navigate }) {
  const region = params.region && state.content.regions.find((candidate) => candidate.id === params.region);
  const area = region && params.area && region.areas.find((candidate) => candidate.id === params.area);
  // An unknown place in the address leads back to the regions.
  if ((params.region && !region) || (params.area && !area)) {
    location.replace(HOME);
    return {};
  }
  const regionHash = region && `${HOME}/${region.id}`;

  const options = {}; // { [areaId]: { build, hp, threat } } from the server
  const choice = loadChoice(); // { [areaId]: minutes }
  let shownArea = null; // the inner region whose threat is on the screen
  let showThreat = null;
  let loading = false;
  let loadAgain = false;
  let countdown = null;
  let progress = null;
  let shownFinished = null;
  let shownSkip = null;

  // HP in tenths of the maximum: resting moves the threat now and then.
  const hpStep = (character, now) => Math.floor((currentHp(character, now) / character.maxHp) * 10);

  // The threat of the inner region on the screen, one request at a time, so
  // each stays within the server's CPU limit. The rating follows the whole
  // character, so a change of level, class level, stats, equipment or HP
  // asks again. Until the new answer comes, a new build shows "…", while
  // resting keeps the old rating.
  async function loadOptions() {
    if (loading) {
      loadAgain = true;
      return;
    }
    loading = true;
    try {
      do {
        loadAgain = false;
        const areaId = shownArea;
        const character = state.character;
        if (!areaId || !character || character.activity) return;
        const build = buildKey(character);
        const hp = hpStep(character, serverNow());
        const known = options[areaId];
        if (known && known.build === build && known.hp === hp) continue;
        const { areas } = await call('GET', `/api/hunts/options?area=${encodeURIComponent(areaId)}`);
        options[areaId] = { build, hp, threat: areas[0].threat };
        showThreat?.();
      } while (loadAgain);
    } catch (error) {
      toast(error.message);
    } finally {
      loading = false;
    }
  }

  function render() {
    const character = state.character;
    const activity = character.activity;
    shownFinished = activityFinished(activity);
    shownSkip = skipKind(character);
    countdown = null;
    progress = null;
    shownArea = null;
    showThreat = null;

    // While the character is away, every view shows the exploration.
    if (activity || !region) {
      fill(
        container,
        h('div', { class: 'page-heading' }, h('h1', { class: 'page-title', tabindex: '-1', text: 'Walka' })),
        modeTabs(),
        testTools(),
        activity ? activityCard(activity) : regionList(character),
      );
      return;
    }
    if (!area) {
      fill(
        container,
        backHeading(region.name, `poz. ${region.minLevel}–${region.maxLevel}`, () => leaveView(HOME, 1)),
        testTools(),
        regionView(character),
      );
      return;
    }
    const open = areaOpen(area, character);
    fill(
      container,
      backHeading(area.name, region.name, () => leaveView(regionHash, 1)),
      testTools(),
      open ? areaView(character) : systemPanel(`To miejsce odblokujesz na poziomie klasy ${area.unlockClassLevel}.`),
    );
    if (open) loadOptions();
  }

  // A title with a large "Powrót" on the right, as in the report.
  function backHeading(title, subtitle, onBack) {
    return h(
      'div',
      { class: 'page-heading page-heading--back' },
      h(
        'div',
        { class: 'page-heading-text' },
        h('h1', { class: 'page-title', tabindex: '-1', text: title }),
        h('p', { class: 'page-subtitle', text: subtitle }),
      ),
      h('button', { type: 'button', class: 'button button--system back-button', onClick: onBack }, icon('back', { size: 20 }), 'Powrót'),
    );
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
        systemPanel(`Eksploracja zakończona: ${activity.areaName}, ${formatMinutes(activity.minutes)}.`, 'Raport czeka na odbiór.', claim),
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
        `Eksploracja w toku: ${activity.areaName}, ${formatMinutes(activity.minutes)}.`,
        countdown,
        h('div', { class: 'bar bar--system' }, progress),
        h('p', { class: 'system-hint', text: `Raport będzie gotowy o ${timeFormat.format(new Date(activity.endsAt))}. Możesz zamknąć grę.` }),
      ),
      cancel,
    );
    tick(serverNow());
    return card;
  }

  // Step one: the regions.
  function regionList(character) {
    const first = character.level === 1 && character.xp === 0 && character.gold === 0;
    const unarmed = !character.equipment.weapon;
    return h(
      'div',
      { class: 'stack' },
      first
        ? systemPanel('Wiatrołomy to najbezpieczniejsze miejsce na start. Wybierz czas eksploracji i wyrusz.')
        : unarmed && systemPanel('Walczysz gołymi rękami. Załóż broń z plecaka w zakładce Postać, jeśli już ją masz.'),
      state.content.regions.map((candidate) => regionLink(candidate, character)),
    );
  }

  function regionLink(candidate, character) {
    const hash = `${HOME}/${candidate.id}`;
    const open = candidate.areas.filter((place) => areaOpen(place, character)).length;
    return h(
      'a',
      { class: 'card region-card region-link', href: hash, onClick: (event) => openView(event, hash) },
      h(
        'div',
        { class: 'region-head' },
        h('h2', { class: 'card-title', text: candidate.name }),
        h(
          'span',
          { class: 'region-chips' },
          chip(`poz. ${candidate.minLevel}–${candidate.maxLevel}`),
          candidate.safe && chip('bezpieczny', 'chip--safe'),
        ),
      ),
      h('p', { class: 'region-description', text: candidate.description }),
      h('p', { class: 'region-trait' }, h('strong', { text: `${candidate.trait.name}. ` }), candidate.trait.description),
      h(
        'p',
        { class: 'region-foot' },
        open > 0
          ? h('span', { text: `Otwarte miejsca: ${open} z ${candidate.areas.length}` })
          : lockLabel(`poz. klasy ${candidate.areas[0].unlockClassLevel}`),
        icon('chevron', { size: 20 }),
      ),
    );
  }

  // Step two: the inner regions of a region, as circles.
  function regionView(character) {
    return h(
      'div',
      { class: 'stack' },
      h('p', { class: 'region-description', text: region.description }),
      h('p', { class: 'region-trait' }, h('strong', { text: `${region.trait.name}. ` }), region.trait.description),
      h('div', { class: 'area-grid' }, region.areas.map((place) => areaTile(place, character))),
    );
  }

  function areaTile(place, character) {
    const circle = h('span', { class: 'area-circle' }, areaArt(place.id));
    if (!areaOpen(place, character)) {
      circle.append(h('span', { class: 'area-lock' }, icon('lock', { size: 28 })));
      return h(
        'div',
        { class: 'area-tile area-tile--locked', role: 'img', 'aria-label': `${place.name}: od poziomu klasy ${place.unlockClassLevel}` },
        circle,
        h('span', { class: 'area-tile-name', text: place.name }),
        lockLabel(`poz. klasy ${place.unlockClassLevel}`),
      );
    }
    const hash = `${regionHash}/${place.id}`;
    return h(
      'a',
      { class: 'area-tile', href: hash, onClick: (event) => openView(event, hash) },
      circle,
      h('span', { class: 'area-tile-name', text: place.name }),
      h('span', { class: 'area-levels', text: `poz. ${place.minLevel}–${place.maxLevel}` }),
    );
  }

  // Step three: the length, the threat level and the start.
  function areaView(character) {
    const allowed = character.huntDurations;
    const { max } = state.content.durations;
    const longLevel = unlockInfo('long-hunts').level;
    // The slider moves over the allowed lengths (1, 5, 10… minutes). The last
    // length is kept for each inner region (before them: for each region).
    let index = allowed.indexOf(choice[area.id] ?? choice[region.id]);
    if (index === -1) index = Math.max(0, allowed.indexOf(15));
    let minutes = allowed[index];
    shownArea = area.id;

    const threatValue = h('strong', {});
    const threatLine = h('p', { class: 'threat' }, 'Zagrożenie: ', threatValue);
    showThreat = () => {
      const known = options[area.id];
      const threat = known && known.build === buildKey(state.character) ? known.threat[minutes] : undefined;
      threatLine.className = `threat threat--${threat ?? 'unknown'}`;
      threatValue.textContent = threat ? THREAT_NAMES[threat] : '…';
    };

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
      'aria-label': `Czas wyprawy: ${area.name}`,
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
      choice[area.id] = minutes;
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
          remember();
          await call('POST', '/api/hunts', { areaId: area.id, minutes });
          leaveView(HOME, 2);
        }),
    });

    const levelNote =
      character.level < area.minLevel
        ? h('p', { class: 'region-warning', text: `Przeciwnicy mają tu poziom ${area.minLevel}–${area.maxLevel}, wyżej niż Twoja postać.` })
        : character.level > area.maxLevel + 2
          ? h('p', { class: 'region-warning', text: 'To miejsce jest już dla Ciebie za łatwe: dostaniesz mniej doświadczenia.' })
          : null;

    return h(
      'div',
      { class: 'stack' },
      h(
        'article',
        { class: 'card area-card', 'aria-label': area.name },
        h(
          'div',
          { class: 'area-hero' },
          h('span', { class: 'area-circle area-circle--large' }, areaArt(area.id)),
          h(
            'span',
            { class: 'region-chips' },
            chip(`poz. ${area.minLevel}–${area.maxLevel}`),
            region.safe && chip('bezpieczny', 'chip--safe'),
          ),
        ),
        h('p', { class: 'region-description', text: area.description }),
        levelNote,
        durations,
        threatLine,
        start,
      ),
      h('p', { class: 'muted threat-note', text: 'Zagrożenie to szansa omdlenia na wyprawie.' }),
    );
  }

  function tick(now) {
    const activity = state.character.activity;
    if (skipKind(state.character, now) !== shownSkip) {
      render();
      return;
    }
    if (!activity) {
      loadOptions();
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
