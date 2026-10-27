// The Profesje tab: the professions as squares in a triangle (Zielarstwo on
// top, Alchemia and Rzemieślnictwo below it, grey until they come), the
// Zielarstwo screen: the Systemowy Zagajnik, the profession's level and
// stats, the herbs (those the System still hides are shadows), the herbs to
// gather and the time, and the gathering under way with "Przewiń",
// "Przerwij" and its report at the end; and the Alchemia screen in the same
// way: the Systemowa Pracownia, the recipes, how many potions and the
// brewing under way; and the Rzemieślnictwo screen: the Systemowy
// Warsztat, the patterns by slot, the rarity, how many items and the order
// under way. Locked, or hidden in this deployment, the tab says so as before.

import { herbSprite, itemSprite, placeArt, potionSprite, professionSprite } from '../art.js';
import { fill, h, icon } from '../dom.js';
import { countOf, dateTimeFormat, formatCountdown, formatMinutes, formatNumber, timeFormat } from '../format.js';
import { activityFinished, call, reportCache, serverNow, state, testModeOn } from '../state.js';
import { skipControl } from '../time.js';
import { confirmAction, systemPanel, toast, withButton } from '../ui.js';
import { itemSummary } from './character.js';
import { lockedScreen } from './locked.js';

const HOME = '#/profesje';
// The addresses of the professions with a screen.
const SCREENS = { zielarstwo: 'herbalism', alchemia: 'alchemy', rzemieslnictwo: 'crafting' };
const HASHES = { herbalism: `${HOME}/zielarstwo`, alchemy: `${HOME}/alchemia`, crafting: `${HOME}/rzemieslnictwo` };
// The activity of each profession's work, and what its square says meanwhile.
const WORK = {
  herbalism: { kind: 'herbs', busy: 'Zbiera zioła' },
  alchemy: { kind: 'potions', busy: 'Warzy mikstury' },
  crafting: { kind: 'items', busy: 'Wykonuje przedmioty' },
};
const FALLBACK_ICONS = { herbalism: 'leaf', alchemy: 'spirit', crafting: 'hammer' };
const HERB_CHOICE = 'wzrost.herb-choice';
const BREW_CHOICE = 'wzrost.brew-choice';
const CRAFT_CHOICE = 'wzrost.craft-choice';
// The Stół rozbiórki, where parts are made.
const TABLE = '#/oboz/craft-table';

function loadChoice(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? {};
  } catch {
    return {};
  }
}

function saveChoice(key, choice) {
  try {
    localStorage.setItem(key, JSON.stringify(choice));
  } catch {
    // Without storage the page simply forgets the last choice.
  }
}

const herbIcon = (id) => herbSprite(id) ?? icon('leaf', { size: 24 });
const potionIcon = (id) => potionSprite(id) ?? icon('flask', { size: 24 });
const patternIcon = (id) => itemSprite({ base: id }) ?? icon('hammer', { size: 24 });

// A work of `count` potions or items of `each` minutes in whole minutes, as
// the server counts it (brewMinutes and orderMinutes in src/engine).
const workMinutes = (count, each) => Math.ceil(Math.round(count * each * 1000) / 1000);

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
  const choice = loadChoice(HERB_CHOICE); // { herbs: [ids], minutes }
  const brewChoice = loadChoice(BREW_CHOICE); // { recipe, count }
  const craftChoice = loadChoice(CRAFT_CHOICE); // { slot, pattern, rarity, count }
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
    if (professionId === 'alchemy') {
      renderAlchemy(character);
      return;
    }
    // Rzemieślnictwo locked in this deployment leads back to the tab.
    if (professionId === 'crafting' && !character.professions.workshop) {
      location.replace(HOME);
      return;
    }
    if (professionId === 'crafting') {
      renderCrafting(character);
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
    const work = WORK[profession.id];
    const working = work && character.activity?.kind === work.kind;
    return h(
      'a',
      { class: 'profession-square', href: HASHES[profession.id] ?? HOME },
      h('span', { class: 'profession-art' }, art),
      label,
      h('span', { class: 'profession-level', text: working ? (activityFinished(character.activity) ? 'Raport gotowy' : work.busy) : `poz. ${profession.level}` }),
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
      activity?.kind === 'herbs' ? gatheringCard(activity) : activity && busyPanel(activity, 'Do Zagajnika wyruszy po powrocie.'),
      testTools(character, 'herbs', 'Tryb testowy: zbieranie skończy się od razu, z tym samym wynikiem.'),
      placeCard(gathering.place),
      levelCard(profession, 'zbierania'),
      !activity && gatherForm(character, gathering),
    );
  }

  function renderAlchemy(character) {
    const { list, brewing } = character.professions;
    const profession = list.find((candidate) => candidate.id === brewing.professionId);
    const activity = character.activity;
    fill(
      container,
      backHeading(profession.name, `poziom ${profession.level}`, HOME),
      activity?.kind === 'potions' ? brewingCard(activity) : activity && busyPanel(activity, 'Warzenie zacznie po powrocie.'),
      testTools(character, 'potions', 'Tryb testowy: warzenie skończy się od razu, z tym samym wynikiem.'),
      placeCard(brewing.place),
      levelCard(profession, 'warzenia'),
      !activity && brewForm(character, brewing),
    );
  }

  function renderCrafting(character) {
    const { list, workshop } = character.professions;
    const profession = list.find((candidate) => candidate.id === workshop.professionId);
    const activity = character.activity;
    fill(
      container,
      backHeading(profession.name, `poziom ${profession.level}`, HOME),
      activity?.kind === 'items' ? craftingCard(activity) : activity && busyPanel(activity, 'Wyrób zacznie po powrocie.'),
      testTools(character, 'items', 'Tryb testowy: wyrób skończy się od razu, z tym samym wynikiem.'),
      placeCard(workshop.place),
      levelCard(profession, 'wyrobu'),
      !activity && craftForm(character, workshop),
    );
  }

  // What the character does elsewhere, and when it comes here.
  function busyPanel(activity, then) {
    const doing = { herbs: 'Postać zbiera zioła.', potions: 'Postać warzy mikstury.', items: 'Postać wykonuje przedmioty.' }[activity.kind] ?? 'Postać jest na wyprawie.';
    return systemPanel(`${doing} ${then}`);
  }

  // Test mode only: one button that ends the work of `kind` at once.
  function testTools(character, kind, text) {
    const activity = character.activity;
    if (!state.user.testMode || !testModeOn() || activity?.kind !== kind || activityFinished(activity)) return null;
    return h(
      'div',
      { class: 'test-tools' },
      h('p', { class: 'test-tools-text', text }),
      h('button', {
        type: 'button',
        class: 'button button--test',
        text: 'Pomiń czas',
        onClick: (event) => withButton(event.currentTarget, () => call('POST', '/api/test/skip-time')),
      }),
    );
  }

  // The place's picture dim behind its name and the System's words.
  function placeCard(place) {
    const art = placeArt(place.id);
    const card = h(
      'section',
      { class: `card place-card${art ? ' place-card--art' : ''}`, 'aria-label': place.name },
      h('h2', { class: 'card-title', text: place.name }),
      h('p', { class: 'region-description', text: place.description }),
    );
    if (art) card.style.setProperty('--place-art', `url("${art}")`);
    return card;
  }

  // `work`: the work in the genitive, "zbierania".
  function levelCard(profession, work) {
    const top = profession.xpToNext === 0;
    const share = top ? 100 : (profession.xp / profession.xpToNext) * 100;
    return h(
      'section',
      { class: 'card profession-card', 'aria-label': `${profession.name}, poziom ${profession.level}` },
      h('p', { class: 'profession-card-head' }, h('strong', { text: `Poziom ${profession.level}` }), h('span', { class: 'muted', text: ` z ${profession.maxLevel}` })),
      h('div', { class: 'bar bar--xp', role: 'presentation' }, h('div', { class: 'bar-fill', style: { width: `${share}%` } })),
      h('p', { class: 'muted', text: top ? 'Najwyższy poziom.' : `Do następnego poziomu: ${formatMinutes(profession.xpToNext - profession.xp)} ${work}.` }),
      h('p', { class: 'profession-stats', text: profession.stats.map((stat) => `${stat.name} +${formatNumber(stat.bonus)}`).join(' · ') }),
    );
  }

  // "Odbierz raport" of a work that has ended.
  function claimButton() {
    return h('button', {
      type: 'button',
      class: 'button button--system',
      text: 'Odbierz raport',
      onClick: (event) =>
        withButton(event.currentTarget, async () => {
          const { report } = await call('POST', '/api/hunts/claim');
          openReport(report);
        }),
    });
  }

  function openReport(report) {
    reportCache.set(String(report.id), report);
    state.freshReport = String(report.id);
    navigate(`#/raport/${report.id}`);
  }

  // A work under way: what and for how long, the countdown and its bar, the
  // time of the report, "Przewiń" (`label` names the work) and the button
  // that calls the character back.
  function workUnderWay(activity, what, label, cancel) {
    countdown = h('p', { class: 'countdown', 'aria-live': 'off' });
    progress = h('div', { class: 'bar-fill bar-fill--system' });
    skipper = skipControl('activity', (now) => activity.endsAt - now, label);
    const card = h(
      'div',
      { class: 'stack' },
      systemPanel(
        what,
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

  // The gathering under way, or its report waiting.
  function gatheringCard(activity) {
    const names = activity.herbs.map((herb) => herb.name).join(', ');
    if (activityFinished(activity)) {
      return systemPanel(`Zbieranie zakończone: ${names}, ${formatMinutes(activity.minutes)}.`, 'Raport czeka na odbiór.', claimButton());
    }
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
    return workUnderWay(activity, `Zbieranie w toku: ${names}, ${formatMinutes(activity.minutes)}.`, 'Zbieranie', cancel);
  }

  // The brewing under way, or its report waiting. Called back early, the
  // character brings the potions done, with their report.
  function brewingCard(activity) {
    const what = `${activity.count} × ${activity.potion?.name ?? 'mikstura'}`;
    if (activityFinished(activity)) {
      return systemPanel(`Warzenie zakończone: ${what}.`, 'Raport czeka na odbiór.', claimButton());
    }
    const cancel = h('button', {
      type: 'button',
      class: 'button button--world',
      text: 'Przerwij warzenie',
      onClick: async (event) => {
        const button = event.currentTarget;
        const done = Math.min(activity.count, Math.floor((activity.count * (serverNow() - activity.startedAt)) / (activity.endsAt - activity.startedAt)));
        const sure = await confirmAction({
          title: 'Przerwać warzenie?',
          text:
            done > 0
              ? `Gotowe mikstury (${formatNumber(done)}) trafią do plecaka, a zioła na resztę wrócą.`
              : 'Żadna mikstura nie jest jeszcze gotowa. Zioła wrócą do plecaka.',
          confirmLabel: 'Przerwij',
          danger: true,
        });
        if (!sure) return;
        await withButton(button, async () => {
          const { report } = await call('POST', '/api/hunts/cancel');
          if (report) openReport(report);
        });
      },
    });
    return workUnderWay(activity, `Warzenie w toku: ${what}, ${formatMinutes(activity.minutes)}.`, 'Warzenie', cancel);
  }

  // The order under way, or its report waiting. Called back early, the
  // character brings the items done, with their report.
  function craftingCard(activity) {
    const what = `${activity.count} × ${activity.base?.name ?? 'przedmiot'} (${activity.rarityName})`;
    if (activityFinished(activity)) {
      return systemPanel(`Wyrób zakończony: ${what}.`, 'Raport czeka na odbiór.', claimButton());
    }
    const cancel = h('button', {
      type: 'button',
      class: 'button button--world',
      text: 'Przerwij wyrób',
      onClick: async (event) => {
        const button = event.currentTarget;
        const done = Math.min(activity.count, Math.floor((activity.count * (serverNow() - activity.startedAt)) / (activity.endsAt - activity.startedAt)));
        const sure = await confirmAction({
          title: 'Przerwać wyrób?',
          text:
            done > 0
              ? `Ukończone przedmioty (${formatNumber(done)}) zostaną, a części i zasoby na resztę wrócą.`
              : 'Żaden przedmiot nie jest jeszcze ukończony. Części i zasoby wrócą.',
          confirmLabel: 'Przerwij',
          danger: true,
        });
        if (!sure) return;
        await withButton(button, async () => {
          const { report } = await call('POST', '/api/hunts/cancel');
          if (report) openReport(report);
        });
      },
    });
    return workUnderWay(activity, `Wyrób w toku: ${what}, ${formatMinutes(activity.minutes)}.`, 'Wyrób', cancel);
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
    // How many kinds of herbs at once, and the level of the profession that
    // adds the next (the author's words).
    const next = gathering.slotLevels.find((slot) => slot.herbs > slots);
    const kinds = countOf(slots, 'rodzaj zioła', 'rodzaje ziół', 'rodzajów ziół');
    const slotsHint = h('p', {
      class: 'muted',
      text: next
        ? `Obecnie możesz zbierać tylko ${kinds}. Potrzebujesz wyższego poziomu Profesji, by zbierać więcej rodzajów naraz. Kolejny rodzaj przy poziomie: ${next.level}.`
        : `Obecnie możesz zbierać naraz ${kinds}.`,
    });

    const remember = () => {
      choice.herbs = chosen;
      choice.minutes = minutes;
      saveChoice(HERB_CHOICE, choice);
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

  // The recipes (those the System still hides are shadows), how many
  // potions, the time and the herbs they take, the room in the bag and the
  // start.
  function brewForm(character, brewing) {
    const known = brewing.recipes.filter((recipe) => !recipe.hidden);
    let recipe = known.find((candidate) => candidate.id === brewChoice.recipe) ?? known[0];
    let count = 1;

    const tiles = h('ul', { class: 'herb-grid' });
    const about = h('p', { class: 'muted' });
    const needs = h('p', { class: 'herb-estimate' });
    const picker = h('div', { class: 'stack' });
    const lucky = h('p', {
      class: 'muted',
      text: `Każda uwarzona mikstura ma ${formatNumber(Math.round(brewing.bonusChance * 100))}% szans na jedną dodatkową.`,
    });

    const remember = () => {
      brewChoice.recipe = recipe.id;
      brewChoice.count = count;
      saveChoice(BREW_CHOICE, brewChoice);
    };

    // The bag's room for the potions: what is left in the potion's last
    // stack, and whole stacks in the places free once the herbs are taken
    // (herbs and potions stack alike).
    function roomFor(amount) {
      const stack = character.herbStack;
      const freed = recipe.herbs.reduce((sum, herb) => sum + Math.ceil(herb.have / stack) - Math.ceil((herb.have - herb.need * amount) / stack), 0);
      const free = Math.max(0, character.bagCapacity - character.bagUsed + freed);
      return Math.ceil(recipe.count / stack) * stack - recipe.count + free * stack;
    }

    function choose(id) {
      recipe = known.find((candidate) => candidate.id === id);
      remember();
      show();
    }

    function showTiles() {
      fill(
        tiles,
        brewing.recipes.map((each) => {
          if (each.hidden) {
            return h(
              'li',
              {},
              h(
                'div',
                { class: 'herb-tile herb-tile--hidden', role: 'img', 'aria-label': `Nieznany przepis. ${each.hint}` },
                h('span', { class: 'herb-art herb-art--shadow' }, potionIcon(each.id)),
                h('span', { class: 'herb-name', text: '???' }),
                h('span', { class: 'herb-meta', text: each.hint }),
              ),
            );
          }
          return h(
            'li',
            {},
            h(
              'button',
              { type: 'button', class: 'herb-tile', 'aria-pressed': each.id === recipe.id, onClick: () => choose(each.id) },
              h('span', { class: 'herb-art' }, potionIcon(each.id)),
              h('span', { class: 'herb-name', text: each.name }),
              h('span', { class: 'herb-meta', text: `w plecaku: ${formatNumber(each.count)}` }),
            ),
          );
        }),
      );
    }

    function show() {
      showTiles();
      about.textContent = recipe.description;
      needs.textContent = `Na jedną miksturę: ${recipe.herbs.map((herb) => `${herb.need} × ${herb.name} (w plecaku ${formatNumber(herb.have)})`).join(', ')}.`;
      if (recipe.most === 0) {
        fill(
          picker,
          h('p', { class: 'herb-room herb-room--full', text: 'Brakuje ziół na tę miksturę. Zbierzesz je w Zielarstwie.' }),
          h('a', { class: 'button button--world', href: HASHES.herbalism, text: 'Do Zielarstwa' }),
        );
        return;
      }
      count = Math.min(recipe.most, Math.max(1, brewChoice.count ?? Math.min(recipe.most, 6)));
      fill(picker, countPicker());
    }

    // A slider of the potions with buttons for one at a time, the time and
    // the herbs they take, the room in the bag and the start.
    function countPicker() {
      const most = recipe.most;
      const value = h('output', { class: 'duration-value', 'aria-live': 'off' });
      const estimate = h('p', { class: 'herb-estimate' });
      const room = h('p', { class: 'herb-room' });
      const slider = h('input', {
        type: 'range',
        class: 'duration-slider',
        min: 1,
        max: most,
        step: 1,
        value: count,
        'aria-label': 'Liczba mikstur',
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
            set(count + sign);
            remember();
          },
        });
      const less = stepButton(-1, 'Mniej');
      const more = stepButton(1, 'Więcej');
      function set(next) {
        count = Math.min(most, Math.max(1, next));
        const label = countOf(count, 'mikstura', 'mikstury', 'mikstur');
        slider.value = String(count);
        slider.setAttribute('aria-valuetext', label);
        slider.style.setProperty('--fill', `${most > 1 ? ((count - 1) / (most - 1)) * 100 : 100}%`);
        value.textContent = label;
        less.disabled = count === 1;
        more.disabled = count === most;
        const used = recipe.herbs.map((herb) => `${herb.need * count} × ${herb.name}`).join(', ');
        estimate.textContent = `Czas warzenia: ${formatMinutes(workMinutes(count, brewing.potionMinutes))}. Zużyjesz: ${used}.`;
        const fits = roomFor(count);
        room.className = `herb-room${count > fits ? ' herb-room--full' : ''}`;
        room.textContent =
          count > fits
            ? `W plecaku zmieści się tylko ${countOf(fits, 'mikstura', 'mikstury', 'mikstur')}. Reszta przepadnie.`
            : `W plecaku zmieści się jeszcze ${countOf(fits, 'mikstura', 'mikstury', 'mikstur')}.`;
      }
      set(count);
      const start = h('button', {
        type: 'button',
        class: 'button button--system',
        text: 'Warz mikstury',
        onClick: (event) =>
          withButton(event.currentTarget, async () => {
            remember();
            await call('POST', '/api/professions/brew', { recipe: recipe.id, count });
          }),
      });
      return [
        h(
          'div',
          { class: 'duration-picker' },
          h('p', { class: 'duration-head' }, h('span', { class: 'duration-title' }, 'Liczba mikstur'), value),
          h('div', { class: 'duration-row' }, less, slider, more),
          h('p', { class: 'duration-scale', 'aria-hidden': 'true' }, h('span', { text: '1' }), h('span', { text: formatNumber(most) })),
        ),
        estimate,
        room,
        start,
      ];
    }

    show();
    return h(
      'section',
      { class: 'card gather-card', 'aria-labelledby': 'recipes-title' },
      h('h2', { class: 'section-title', id: 'recipes-title', text: 'Przepisy' }),
      tiles,
      about,
      needs,
      lucky,
      picker,
    );
  }

  // The slots, the patterns of the slot chosen (those the System still hides
  // are shadows), the rarity, how many items, what they take, the chance and
  // the time, and the start.
  function craftForm(character, workshop) {
    const known = (slot) => slot.patterns.filter((pattern) => !pattern.hidden);
    // A slot's pattern for the character's class comes first.
    const firstFor = (slot) => known(slot).find((pattern) => !pattern.classNames || pattern.classNames.includes(character.className)) ?? known(slot)[0];
    const rarities = workshop.rarities.filter((rarity) => !rarity.hidden);
    const next = workshop.rarities.find((rarity) => rarity.hidden);
    let slot = workshop.slots.find((candidate) => candidate.id === craftChoice.slot) ?? workshop.slots[0];
    let pattern = known(slot).find((candidate) => candidate.id === craftChoice.pattern) ?? firstFor(slot);
    let rarity = rarities.find((candidate) => candidate.id === craftChoice.rarity) ?? rarities[0];
    let count = 1;
    const free = Math.max(0, character.bagCapacity - character.bagUsed);
    const partCount = (id) => character.crafting.parts.find((part) => part.id === id)?.count ?? 0;
    const need = (resource) => resource.amount * rarity.step;

    const slotRow = h('div', { class: 'segmented workshop-slots', role: 'group', 'aria-label': 'Rodzaj przedmiotu' });
    const tiles = h('ul', { class: 'herb-grid' });
    const hiddenHint = h('p', { class: 'muted' });
    const rarityRow = h('div', { class: 'workshop-rarities', role: 'group', 'aria-label': 'Rzadkość' });
    const picker = h('div', { class: 'stack' });

    const remember = () => {
      craftChoice.slot = slot.id;
      craftChoice.pattern = pattern.id;
      craftChoice.rarity = rarity.id;
      craftChoice.count = count;
      saveChoice(CRAFT_CHOICE, craftChoice);
    };

    function choose(change) {
      change();
      remember();
      show();
    }

    // How many items the parts, the camp's resources and the bag allow.
    function affordable() {
      const byParts = Math.floor(partCount(rarity.part.id) / pattern.parts);
      const byResources = Math.min(...pattern.resources.map((resource) => Math.floor((character.resources[resource.id] ?? 0) / need(resource))));
      return { byParts, byResources, most: Math.min(workshop.maxCount, byParts, byResources, free) };
    }

    // For whom a pattern is, and from which class level.
    const forWhom = (each) =>
      [each.classNames ? each.classNames.join(', ') : 'każda klasa', each.classLevel && `od poz. klasy ${each.classLevel}`].filter(Boolean).join(' · ');

    function show() {
      fill(
        slotRow,
        workshop.slots.map((each) =>
          h('button', {
            type: 'button',
            class: 'segmented-option',
            'aria-pressed': each.id === slot.id,
            text: each.name,
            onClick: () =>
              choose(() => {
                slot = each;
                pattern = firstFor(each);
              }),
          }),
        ),
      );
      // The known patterns first, then the shadows, whose level the line
      // under them tells in the System's words.
      const hidden = slot.patterns.filter((each) => each.hidden);
      fill(
        tiles,
        [...known(slot), ...hidden].map((each) => {
          if (each.hidden) {
            return h(
              'li',
              {},
              h(
                'div',
                { class: 'herb-tile herb-tile--hidden', role: 'img', 'aria-label': `Nieznany wzór. ${each.hint}` },
                h('span', { class: 'herb-art herb-art--shadow' }, patternIcon(each.id)),
                h('span', { class: 'herb-name', text: '???' }),
                h('span', { class: 'herb-meta', text: `poz. ${each.level}` }),
              ),
            );
          }
          return h(
            'li',
            {},
            h(
              'button',
              { type: 'button', class: 'herb-tile', 'aria-pressed': each.id === pattern.id, onClick: () => choose(() => (pattern = each)) },
              h('span', { class: 'herb-art' }, patternIcon(each.id)),
              h('span', { class: 'herb-name', text: each.name }),
              h('span', { class: 'herb-meta', text: forWhom(each) }),
            ),
          );
        }),
      );
      hiddenHint.hidden = hidden.length === 0;
      hiddenHint.textContent = [...new Set(hidden.map((each) => each.hint))].join(' ');
      fill(
        rarityRow,
        rarities.map((each) =>
          h('button', {
            type: 'button',
            class: 'rarity-option',
            'aria-pressed': each.id === rarity.id,
            vars: { '--rarity': each.color },
            text: each.name,
            onClick: () => choose(() => (rarity = each)),
          }),
        ),
      );
      const plan = affordable();
      if (plan.most === 0) {
        fill(picker, shortage(plan));
        return;
      }
      count = Math.min(plan.most, Math.max(1, craftChoice.count ?? 1));
      fill(picker, countPicker(plan));
    }

    // What one item still lacks, and where parts come from.
    function shortage({ byParts, byResources }) {
      const lines = [];
      if (byParts === 0) lines.push(`Brakuje części: ${rarity.part.name} (masz ${formatNumber(partCount(rarity.part.id))}, potrzeba ${formatNumber(pattern.parts)}).`);
      if (byResources === 0) {
        for (const resource of pattern.resources) {
          const have = character.resources[resource.id] ?? 0;
          if (have < need(resource)) lines.push(`Brakuje zasobów: ${resource.name} (masz ${formatNumber(have)}, potrzeba ${formatNumber(need(resource))}).`);
        }
      }
      if (free === 0) lines.push('Plecak jest pełny. Zrób w nim miejsce na przedmiot.');
      return [
        lines.map((text) => h('p', { class: 'herb-room herb-room--full', text })),
        byParts === 0 && h('p', { class: 'muted', text: 'Części zrobisz z materiałów na Stole rozbiórki albo kupisz w Skupie złomu.' }),
        byParts === 0 && h('a', { class: 'button button--world', href: TABLE, text: 'Do Stołu rozbiórki' }),
      ];
    }

    // A slider of the items with buttons for one at a time, what they take
    // and how long, the chance, the room in the bag and the start.
    function countPicker({ byParts, byResources, most }) {
      const value = h('output', { class: 'duration-value', 'aria-live': 'off' });
      const estimate = h('p', { class: 'herb-estimate' });
      const slider = h('input', {
        type: 'range',
        class: 'duration-slider',
        min: 1,
        max: most,
        step: 1,
        value: count,
        'aria-label': 'Liczba przedmiotów',
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
            set(count + sign);
            remember();
          },
        });
      const less = stepButton(-1, 'Mniej');
      const more = stepButton(1, 'Więcej');
      function set(nextCount) {
        count = Math.min(most, Math.max(1, nextCount));
        const label = countOf(count, 'przedmiot', 'przedmioty', 'przedmiotów');
        slider.value = String(count);
        slider.setAttribute('aria-valuetext', label);
        slider.style.setProperty('--fill', `${most > 1 ? ((count - 1) / (most - 1)) * 100 : 100}%`);
        value.textContent = label;
        less.disabled = count === 1;
        more.disabled = count === most;
        const used = [`${formatNumber(pattern.parts * count)} × ${rarity.part.name}`, ...pattern.resources.map((resource) => `${formatNumber(need(resource) * count)} × ${resource.name}`)];
        estimate.textContent = `Czas wyrobu: ${formatMinutes(workMinutes(count, rarity.itemMinutes))}. Zużyjesz: ${used.join(', ')}.`;
      }
      set(count);
      const chance = Math.round(rarity.chance * 100);
      const start = h('button', {
        type: 'button',
        class: 'button button--system',
        text: 'Zacznij wyrób',
        onClick: (event) =>
          withButton(event.currentTarget, async () => {
            remember();
            await call('POST', '/api/professions/craft', { baseId: pattern.id, rarity: rarity.id, count });
            // The order's card is at the top, above the long form.
            window.scrollTo(0, 0);
          }),
      });
      return [
        h(
          'div',
          { class: 'duration-picker' },
          h('p', { class: 'duration-head' }, h('span', { class: 'duration-title' }, 'Liczba przedmiotów'), value),
          h('div', { class: 'duration-row' }, less, slider, more),
          h('p', { class: 'duration-scale', 'aria-hidden': 'true' }, h('span', { text: '1' }), h('span', { text: formatNumber(most) })),
        ),
        estimate,
        h('p', {
          class: 'muted',
          text: rarity.chance >= 1 ? 'Każdy przedmiot tej rzadkości się uda.' : `Każdy przedmiot ma ${chance}% szans na powodzenie. Nieudany zabiera swoje części, a zasoby wracają.`,
        }),
        h('p', { class: 'muted', text: `Przedmioty dostaną poziom postaci: ${formatNumber(character.level)}.` }),
        free < Math.min(workshop.maxCount, byParts, byResources) &&
          h('p', { class: 'herb-room', text: `Plecak ma miejsce tylko na ${countOf(free, 'przedmiot', 'przedmioty', 'przedmiotów')}.` }),
        start,
      ];
    }

    show();
    return h(
      'section',
      { class: 'card gather-card', 'aria-labelledby': 'patterns-title' },
      h('h2', { class: 'section-title', id: 'patterns-title', text: 'Wzory' }),
      slotRow,
      tiles,
      hiddenHint,
      h('h3', { class: 'workshop-subtitle', text: 'Rzadkość' }),
      rarityRow,
      next && h('p', { class: 'muted', text: `Następna rzadkość: ${next.name}, od ${next.level}. poziomu Rzemieślnictwa.` }),
      picker,
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

// The XP, the profession's levels and the Time Points of a work's report.
function workSummary(report) {
  const { summary, profession } = report;
  const rows = [
    ['XP postaci', `+${formatNumber(summary.xp)} XP`],
    [profession.name, profession.levelAfter > profession.levelBefore ? `poziom ${profession.levelBefore} → ${profession.levelAfter}` : `poziom ${profession.levelAfter}`],
    summary.timePoints > 0 && ['Punkty Czasu', `+${formatNumber(summary.timePoints)}`],
  ].filter(Boolean);
  return h(
    'dl',
    { class: 'status-list' },
    rows.map(([label, value]) => h('div', { class: 'status-row' }, h('dt', { text: label }), h('dd', { text: value }))),
  );
}

// The report of a gathering, drawn by the report screen (report.js): the
// grove's line, the herbs found and lost, the profession's levels, the XP
// and the System's lines.
export function herbsReport(report, heading) {
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
      workSummary(report),
    ),
    report.system.length > 0 && systemPanel(...report.system),
    h('a', { class: 'button button--system', href: HASHES.herbalism, text: 'Do Zagajnika' }),
  ];
}

// The report of a brewing, in the same way: the workshop's line, the
// potions brewed, the lucky and the lost ones, whether it was stopped, the
// profession's levels, the XP and the System's lines.
export function potionsReport(report, heading) {
  const { potion } = report;
  return [
    heading('Raport z warzenia', `${report.placeName} · ${formatMinutes(report.minutes)} · ${dateTimeFormat.format(new Date(report.endsAt))}`),
    h(
      'section',
      { class: 'card report-summary', 'aria-label': 'Podsumowanie' },
      h('p', { class: 'herb-line', text: report.line }),
      report.stopped && h('p', { class: 'muted', text: report.stopped }),
      h(
        'ul',
        { class: 'herb-found' },
        h(
          'li',
          { class: 'herb-found-row' },
          h('span', { class: 'herb-art' }, potionIcon(potion.id)),
          h('span', { class: 'herb-found-name', text: potion.name }),
          h('span', { class: 'herb-found-count', text: `×${formatNumber(potion.count)}` }),
          potion.lost > 0 && h('span', { class: 'herb-found-lost', text: `przepadło ${formatNumber(potion.lost)}` }),
        ),
      ),
      report.lucky && h('p', { class: 'herb-room herb-room--lucky', text: report.lucky }),
      report.lost && h('p', { class: 'herb-room herb-room--full', text: report.lost }),
      workSummary(report),
    ),
    report.system.length > 0 && systemPanel(...report.system),
    h('a', { class: 'button button--system', href: HASHES.alchemy, text: 'Do Pracowni' }),
  ];
}

// The report of an order in the Warsztat, in the same way: the workshop's
// line, whether it was stopped, the items made (each opens like a find of an
// exploration, by `findSheet`) and the failed ones, the profession's levels,
// the XP and the System's lines.
export function itemsReport(report, heading, findSheet) {
  return [
    heading('Raport z wyrobu', `${report.placeName} · ${formatMinutes(report.minutes)} · ${dateTimeFormat.format(new Date(report.endsAt))}`),
    h(
      'section',
      { class: 'card report-summary', 'aria-label': 'Podsumowanie' },
      h('p', { class: 'herb-line', text: report.line }),
      report.stopped && h('p', { class: 'muted', text: report.stopped }),
      report.made && h('p', { class: 'herb-estimate', text: report.made }),
      report.items.length > 0 &&
        h(
          'ul',
          { class: 'item-list' },
          report.items.map((item) =>
            h('li', {}, h('button', { type: 'button', class: 'item-row', onClick: () => findSheet(item) }, itemSummary(item), icon('chevron', { size: 18 }))),
          ),
        ),
      report.failedText && h('p', { class: 'herb-room herb-room--full', text: report.failedText }),
      workSummary(report),
    ),
    report.system.length > 0 && systemPanel(...report.system),
    h('a', { class: 'button button--system', href: HASHES.crafting, text: 'Do Warsztatu' }),
  ];
}

// What a work's report brought, for the journal's row: "Żywokost ×13",
// "Mniejsza mikstura leczenia ×12" or "Miecz ×3, nieudane: 1".
export const workSummaryText = (summary) =>
  [...(summary.herbs ?? summary.potions ?? summary.items ?? []).map((entry) => `${entry.name} ×${formatNumber(entry.count)}`), summary.failed > 0 && `nieudane: ${formatNumber(summary.failed)}`]
    .filter(Boolean)
    .join(', ');
