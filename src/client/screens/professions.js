// The Profesje tab: the professions as squares in a triangle (Zielarstwo on
// top, Alchemia and Rzemieślnictwo below it, grey until they come), the
// Zielarstwo screen: the Systemowy Zagajnik, the profession's level and
// stats, the herbs (those the System still hides are shadows), the herbs to
// gather and the time, and the gathering under way with "Przewiń",
// "Przerwij" and its report at the end; and the Alchemia screen in the same
// way: the Systemowa Pracownia, the recipes, how many potions and the
// brewing under way; and the Rzemieślnictwo screen: the Systemowy
// Warsztat, the patterns by slot, the rarity, how many items, the order
// under way and the parts' exchange. Each work can be done by the character or by the Awatar Systemu,
// bought on the tab, which works beside the character in its own card.
// Locked, or hidden in this deployment, the tab says so as before.

import { goldArt, herbSprite, itemSprite, placeArt, potionSprite, professionSprite } from '../art.js';
import { materialIcon } from '../craft-table.js';
import { fill, h, icon } from '../dom.js';
import { countOf, dateTimeFormat, formatCountdown, formatDecimal, formatMinutes, formatNumber, timeFormat } from '../format.js';
import { workScene } from '../scenes.js';
import { playSound } from '../sound.js';
import { activityFinished, call, reportCache, serverNow, state, testModeOn } from '../state.js';
import { skipControl } from '../time.js';
import { confirmAction, systemPanel, toast, withButton } from '../ui.js';
import { findMark, itemSummary } from './character.js';
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
// What the character or the Awatar Systemu is doing, by the activity's kind.
const DOING = { herbs: 'zbiera zioła', potions: 'warzy mikstury', items: 'wykonuje przedmioty' };
const FALLBACK_ICONS = { herbalism: 'leaf', alchemy: 'spirit', crafting: 'hammer' };
const HERB_CHOICE = 'wzrost.herb-choice';
const WORKER_CHOICE = 'wzrost.worker-choice';
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

// The chances that a made item comes out upgraded already, or the level of
// Rzemieślnictwo it may from.
const upgradesText = (workshop) =>
  workshop.upgrades.length === 0
    ? `Od ${workshop.upgradesFrom}. poziomu Rzemieślnictwa wyrób może wyjść od razu ulepszony.`
    : `Wyrób może wyjść od razu ulepszony: ${workshop.upgrades.map((tier) => `+${tier.upgrade} (${formatDecimal(tier.chance * 100)}%)`).join(', ')}.`;

// The chances that luck alone makes an item one or two rarities above the
// ordered one, in the author's words.
const luckText = (workshop) =>
  `Łut szczęścia: ${formatDecimal(workshop.luck.oneUp * 100)}% szans na przedmiot o wyższej rzadkości, ${formatDecimal(workshop.luck.twoUp * 100)}% szans na przedmiot rzadkości wyższej o 2 stopnie. Szanse rosną co 20 poziomów Rzemieślnictwa.`;

// A title with a large "Powrót" on the right, as in the report.
function backHeading(title, subtitle, hash) {
  return h(
    'div',
    { class: 'page-heading page-heading--back' },
    h('div', { class: 'page-heading-text' }, h('h1', { class: 'page-title', tabindex: '-1', text: title }), subtitle && h('p', { class: 'page-subtitle', text: subtitle })),
    h('a', { class: 'button button--system back-button', href: hash }, icon('back', { size: 20 }), 'Powrót'),
  );
}

// A folded list of the herbs, recipes or patterns, which grew too many for
// tiles (the author: the screens were long to scroll). Folded, its button
// shows the choice; open, a row for each known one and, last, the shadows
// the System still hides, a row for each level that shows them (`unknown`
// names them: one, a few, many). A choice folds the list, except in a list
// of several choices at once (`multi`), folded by its button or "Gotowe".
function choiceList(label, { multi = false, unknown }) {
  let open = false;
  const chosen = h('span', { class: 'choice-chosen' });
  const action = h('span', { class: 'choice-action' });
  const rows = h('ul', { class: 'choice-rows', 'aria-label': label });
  const body = h('div', { class: 'choice-body', hidden: true }, rows, multi && h('button', { type: 'button', class: 'button button--world', text: 'Gotowe', onClick: () => setOpen(false) }));
  const toggle = h('button', { type: 'button', class: 'choice-toggle', 'aria-expanded': false, onClick: () => setOpen(!open) }, chosen, action);
  function setOpen(value) {
    open = value;
    body.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    fill(action, open ? 'Zwiń' : 'Zmień', icon('chevron', { size: 16 }));
    // Folded after a choice far down the list, the button comes back into view.
    if (!open) toggle.scrollIntoView({ block: 'nearest' });
  }
  const text = (name, meta) => h('span', { class: 'choice-text' }, h('span', { class: 'choice-name', text: name }), meta && h('span', { class: 'choice-meta', text: meta }));
  fill(action, 'Zmień', icon('chevron', { size: 16 }));
  return {
    element: h('div', { class: 'choice-list' }, toggle, body),
    // `picked`: the choice in the button, { art, name, meta }; `entries`:
    // the known ones, { id, art, name, meta, on }; `hidden`: the shadows,
    // { art, level, hint }; `pick(id)` takes one.
    show(picked, entries, hidden, pick) {
      fill(chosen, h('span', { class: 'choice-art' }, picked.art), text(picked.name, picked.meta));
      const levels = [...new Set(hidden.map((each) => each.level))].sort((a, b) => a - b);
      fill(
        rows,
        entries.map((entry) =>
          h(
            'li',
            {},
            h(
              'button',
              {
                type: 'button',
                class: 'choice-row',
                'aria-pressed': entry.on,
                onClick: () => {
                  pick(entry.id);
                  if (!multi) setOpen(false);
                },
              },
              h('span', { class: 'choice-art' }, entry.art),
              text(entry.name, entry.meta),
              entry.on && icon('check', { size: 18 }),
            ),
          ),
        ),
        levels.map((level) => {
          const group = hidden.filter((each) => each.level === level);
          return h(
            'li',
            { class: 'choice-hidden', role: 'img', 'aria-label': `${countOf(group.length, ...unknown)}. ${group[0].hint}` },
            h('span', { class: 'choice-shadows' }, group.map((each) => h('span', { class: 'choice-shadow' }, each.art))),
            h('span', { class: 'choice-meta', text: group[0].hint }),
          );
        }),
      );
    },
  };
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
  // The Warsztat's tab: the workshop itself or its part exchange.
  let workshopTab = 'workshop';
  // The works under way on the screen, each with its countdown, bar, scene
  // and "Przewiń": the character's and the Awatar's.
  let timers = [];

  // What the screen shows depends on: the work under way (or not) of the
  // character and of the Awatar, whether it has ended, and test mode.
  const stateKey = (character, now = serverNow()) => {
    const works = [character.activity, character.professions?.avatar?.activity];
    return JSON.stringify([
      ...works.flatMap((work) => [work?.kind ?? null, work?.startedAt ?? null, activityFinished(work, now)]),
      character.professions?.avatar?.owned ?? false,
      state.user.testMode && testModeOn(),
    ]);
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
    timers = [];
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
    // The System's words over the squares, which the narrator points at.
    const intro = character.professions.intro && systemPanel(character.professions.intro);
    if (intro) intro.dataset.guide = 'professions-intro';
    fill(
      container,
      h('div', { class: 'page-heading' }, h('h1', { class: 'page-title', tabindex: '-1', text: 'Profesje' })),
      intro,
      triangle(character),
      avatarPanel(character),
    );
  }

  // Three squares: the first on top, the others below it.
  function triangle(character) {
    const [first, ...rest] = character.professions.list;
    return h(
      'div',
      { class: 'profession-triangle', 'data-guide': 'professions-list' },
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
    // A profession that opens later than the tab waits for its level.
    if (profession.locked) {
      return h(
        'div',
        { class: 'profession-square profession-square--soon', role: 'img', 'aria-label': `${profession.name}: od poziomu postaci ${profession.unlockLevel}` },
        h('span', { class: 'profession-art' }, art),
        label,
        h('span', { class: 'profession-level' }, icon('lock', { size: 12 }), ` od poz. ${profession.unlockLevel}`),
      );
    }
    const work = WORK[profession.id];
    const own = work && character.activity?.kind === work.kind ? character.activity : null;
    const avatar = character.professions.avatar.activity;
    const avatarHere = work && avatar?.kind === work.kind ? avatar : null;
    let status = `poz. ${profession.level}`;
    if (own) status = activityFinished(own) ? 'Raport gotowy' : work.busy;
    else if (avatarHere) status = activityFinished(avatarHere) ? 'Raport Awatara' : 'Pracuje Awatar';
    return h(
      'a',
      { class: 'profession-square', href: HASHES[profession.id] ?? HOME },
      h('span', { class: 'profession-art' }, art),
      label,
      h('span', { class: 'profession-level', text: status }),
    );
  }

  // The Awatar Systemu under the squares: what it is and its price until it
  // is bought, then what it is doing.
  function avatarPanel(character) {
    const { avatar } = character.professions;
    const card = h('section', { class: 'card avatar-card', 'aria-labelledby': 'avatar-title' }, h('h2', { class: 'card-title', id: 'avatar-title', text: avatar.name }));
    if (!avatar.owned) {
      const short = avatar.price - character.gold;
      card.append(
        h('p', { class: 'region-description', text: avatar.description }),
        h('p', { class: 'avatar-price' }, goldArt(20), ` ${formatNumber(avatar.price)} złota, jednorazowo i na zawsze`),
        ...(short > 0 ? [h('p', { class: 'muted', text: `Brakuje jeszcze ${formatNumber(short)} złota.` })] : []),
        h('button', {
          type: 'button',
          class: 'button button--system',
          text: 'Kup Awatara',
          disabled: short > 0,
          onClick: async (event) => {
            const button = event.currentTarget;
            const sure = await confirmAction({
              title: `Kupić: ${avatar.name}?`,
              text: `Zapłacisz ${formatNumber(avatar.price)} złota. Zakup jest jednorazowy i na zawsze.`,
              confirmLabel: 'Kup',
            });
            if (!sure) return;
            await withButton(button, async () => {
              const { text } = await call('POST', '/api/avatar/buy');
              toast(text);
            });
          },
        }),
      );
      return card;
    }
    const work = avatar.activity;
    if (!work) {
      card.append(h('p', { text: 'Czeka na pracę. Wybierz profesję i przy starcie zaznacz, że pracuje Awatar.' }));
      return card;
    }
    const done = activityFinished(work);
    card.append(
      h('p', { text: done ? 'Praca skończona. Raport czeka na odbiór.' : `${WORK[work.profession].busy}: ${work.placeName}.` }),
      h('a', { class: 'button button--world', href: HASHES[work.profession] ?? HOME, text: done ? 'Odbierz raport' : 'Zobacz pracę' }),
    );
    return card;
  }

  function renderHerbalism(character) {
    const { list, gathering } = character.professions;
    const profession = list.find((candidate) => candidate.id === gathering.professionId);
    fill(
      container,
      backHeading(profession.name, `poziom ${profession.level}`, HOME),
      // What the character and the Awatar are doing comes first, so a
      // report to claim is always at the top, above the place (the author).
      works(character, 'herbs', gatheringCard, 'Do Zagajnika wyruszy po powrocie.'),
      testTools(character, 'herbs', 'Tryb testowy: zbieranie skończy się od razu, z tym samym wynikiem.'),
      placeCard(gathering.place),
      levelCard(profession, 'zbierania'),
      anyFree(character) && gatherForm(character, gathering),
    );
  }

  function renderAlchemy(character) {
    const { list, brewing } = character.professions;
    const profession = list.find((candidate) => candidate.id === brewing.professionId);
    fill(
      container,
      backHeading(profession.name, `poziom ${profession.level}`, HOME),
      works(character, 'potions', brewingCard, 'Warzenie możliwe po powrocie.'),
      testTools(character, 'potions', 'Tryb testowy: warzenie skończy się od razu, z tym samym wynikiem.'),
      placeCard(brewing.place),
      levelCard(profession, 'warzenia'),
      anyFree(character) && brewForm(character, brewing),
    );
  }

  // Under the works, two tabs: the Warsztat and its part exchange (the
  // author: the exchange at the top as a tab, not at the very bottom).
  function renderCrafting(character) {
    const { list, workshop } = character.professions;
    const profession = list.find((candidate) => candidate.id === workshop.professionId);
    const tab = (id, label) =>
      h(
        'button',
        {
          type: 'button',
          class: 'segmented-option',
          'aria-pressed': workshopTab === id,
          onClick: () => {
            workshopTab = id;
            render();
          },
        },
        label,
      );
    fill(
      container,
      backHeading(profession.name, `poziom ${profession.level}`, HOME),
      works(character, 'items', craftingCard, 'Wyrób możliwy po powrocie.'),
      testTools(character, 'items', 'Tryb testowy: wyrób skończy się od razu, z tym samym wynikiem.'),
      h('div', { class: 'segmented workshop-tabs', role: 'group', 'aria-label': workshop.place.name }, tab('workshop', 'Warsztat'), tab('exchange', workshop.exchange.title)),
      workshopTab === 'exchange'
        ? partExchange(character, workshop)
        : [
            placeCard(workshop.place),
            levelCard(profession, 'wyrobu'),
            anyFree(character) && craftForm(character, workshop),
            anyFree(character) && scrollForm(character, workshop),
          ],
    );
  }

  // Who is free for a new work: the character at home, and the Awatar
  // Systemu once bought and not at work.
  const freeWorkers = (character) => ({ character: !character.activity, avatar: character.professions.avatar.owned && !character.professions.avatar.activity });
  const anyFree = (character) => {
    const free = freeWorkers(character);
    return free.character || free.avatar;
  };

  // The works of `kind` here, by `card`: the character's, or what it does
  // elsewhere while no one can take this work (`then` says when it can), and
  // the Awatar's under its name. A report to claim comes first.
  function works(character, kind, card, then) {
    const { avatar } = character.professions;
    const activity = character.activity;
    const own = activity?.kind === kind ? card(activity, false) : activity && !freeWorkers(character).avatar && busyPanel(activity, then);
    const avatarWork = avatar.activity?.kind === kind ? avatar.activity : null;
    const theirs = avatarWork && h('section', { class: 'stack', 'aria-label': avatar.name }, h('h2', { class: 'section-title', text: avatar.name }), card(avatarWork, true));
    const avatarFirst = avatarWork && activityFinished(avatarWork) && !(activity?.kind === kind && activityFinished(activity));
    return avatarFirst ? [theirs, own] : [own, theirs];
  }

  // What the character does elsewhere, and when it comes here.
  function busyPanel(activity, then) {
    return systemPanel(`Postać ${DOING[activity.kind] ?? 'jest na wyprawie'}. ${then}`);
  }

  // Who takes a new work, over its start button: with the Awatar bought,
  // the character or the Awatar when both are free (the last choice is
  // remembered), otherwise the one that is free. `body` adds the choice to
  // the start's request.
  function workerPicker(character) {
    const { avatar } = character.professions;
    const free = freeWorkers(character);
    if (!avatar.owned) return { element: null, body: () => ({}) };
    let worker = free.character && free.avatar ? (loadChoice(WORKER_CHOICE).worker === 'avatar' ? 'avatar' : 'character') : free.avatar ? 'avatar' : 'character';
    const row = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Kto pracuje' });
    const show = () =>
      fill(
        row,
        [
          ['character', 'Postać'],
          ['avatar', avatar.name],
        ].map(([id, name]) =>
          h('button', {
            type: 'button',
            class: 'segmented-option',
            'aria-pressed': worker === id,
            disabled: !free[id],
            text: name,
            onClick: () => {
              worker = id;
              saveChoice(WORKER_CHOICE, { worker });
              show();
            },
          }),
        ),
      );
    show();
    // Why one of them cannot take it.
    let note = null;
    if (!free.character) note = `Postać ${DOING[character.activity.kind] ?? 'jest na wyprawie'}, więc pracę wykona ${avatar.name}.`;
    else if (!free.avatar) note = activityFinished(avatar.activity) ? `${avatar.name} czeka na odbiór raportu.` : `${avatar.name} ${DOING[avatar.activity.kind]}.`;
    return {
      element: h('div', { class: 'stack worker-picker' }, h('p', { class: 'duration-title', text: 'Kto pracuje' }), row, note && h('p', { class: 'muted', text: note })),
      body: () => (worker === 'avatar' ? { avatar: true } : {}),
    };
  }

  // Test mode only: one button that ends the work of `kind` at once.
  function testTools(character, kind, text) {
    const going = [character.activity, character.professions.avatar.activity].some((work) => work?.kind === kind && !activityFinished(work));
    if (!state.user.testMode || !testModeOn() || !going) return null;
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

  // "Odbierz raport" of a work that has ended, the character's or the
  // Awatar's.
  function claimButton(avatar) {
    return h('button', {
      type: 'button',
      class: 'button button--system',
      text: 'Odbierz raport',
      onClick: (event) =>
        withButton(event.currentTarget, async () => {
          const { report } = await call('POST', avatar ? '/api/avatar/claim' : '/api/hunts/claim');
          // A work the game can no longer finish gave back what it took.
          if (report) openReport(report);
          else toast('Tej pracy nie da się już dokończyć. Zabrane rzeczy wróciły.');
        }),
    });
  }

  // Calling the character or the Awatar back early.
  const cancelPath = (avatar) => (avatar ? '/api/avatar/cancel' : '/api/hunts/cancel');

  function openReport(report) {
    reportCache.set(String(report.id), report);
    state.freshReport = String(report.id);
    navigate(`#/raport/${report.id}`);
  }

  // A work under way: its looping scene (scenes.js), what and for how long,
  // the countdown and its bar, the time of the report, "Przewiń" (`label`
  // names the work) and the button that calls the character, or the Awatar,
  // back.
  function workUnderWay(activity, what, label, cancel, avatar) {
    const timer = {
      activity,
      countdown: h('p', { class: 'countdown', 'aria-live': 'off' }),
      progress: h('div', { class: 'bar-fill bar-fill--system' }),
      scene: workScene(activity.profession, activity, { avatar }),
      skipper: skipControl(avatar ? 'avatar' : 'activity', (now) => activity.endsAt - now, label),
    };
    timers.push(timer);
    const card = h(
      'div',
      { class: 'stack' },
      ...(timer.scene ? [timer.scene.element] : []),
      systemPanel(
        what,
        timer.countdown,
        h('div', { class: 'bar bar--system' }, timer.progress),
        h('p', { class: 'system-hint', text: `Raport będzie gotowy o ${timeFormat.format(new Date(activity.endsAt))}. Możesz zamknąć grę.` }),
      ),
      timer.skipper.element,
      cancel,
    );
    showTimer(timer, serverNow());
    return card;
  }

  // The gathering under way, or its report waiting.
  function gatheringCard(activity, avatar) {
    const names = activity.herbs.map((herb) => herb.name).join(', ');
    if (activityFinished(activity)) {
      return systemPanel(`Zbieranie zakończone: ${names}, ${formatMinutes(activity.minutes)}.`, 'Raport czeka na odbiór.', claimButton(avatar));
    }
    const cancel = h('button', {
      type: 'button',
      class: 'button button--world',
      text: 'Przerwij zbieranie',
      onClick: async (event) => {
        const button = event.currentTarget;
        const sure = await confirmAction({
          title: 'Przerwać zbieranie?',
          text: avatar ? 'Awatar wróci od razu, bez ziół.' : 'Postać wróci od razu, bez ziół i bez doświadczenia.',
          confirmLabel: 'Przerwij',
          danger: true,
        });
        if (sure) await withButton(button, () => call('POST', cancelPath(avatar)));
      },
    });
    return workUnderWay(activity, `Zbieranie w toku: ${names}, ${formatMinutes(activity.minutes)}.`, 'Zbieranie', cancel, avatar);
  }

  // The brewing under way, or its report waiting. Called back early, the
  // character brings the potions done, with their report.
  function brewingCard(activity, avatar) {
    const what = `${activity.count} × ${activity.potion?.name ?? 'mikstura'}`;
    if (activityFinished(activity)) {
      return systemPanel(`Warzenie zakończone: ${what}.`, 'Raport czeka na odbiór.', claimButton(avatar));
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
          const { report } = await call('POST', cancelPath(avatar));
          if (report) openReport(report);
        });
      },
    });
    return workUnderWay(activity, `Warzenie w toku: ${what}, ${formatMinutes(activity.minutes)}.`, 'Warzenie', cancel, avatar);
  }

  // The order under way, or its report waiting. Called back early, the
  // character brings the items done, with their report.
  function craftingCard(activity, avatar) {
    const what = activity.scroll ? `${activity.count} × ${activity.base.name}` : `${activity.count} × ${activity.base?.name ?? 'przedmiot'} (${activity.rarityName})`;
    if (activityFinished(activity)) {
      return systemPanel(`Wyrób zakończony: ${what}.`, 'Raport czeka na odbiór.', claimButton(avatar));
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
          const { report } = await call('POST', cancelPath(avatar));
          if (report) openReport(report);
        });
      },
    });
    return workUnderWay(activity, `Wyrób w toku: ${what}, ${formatMinutes(activity.minutes)}.`, 'Wyrób', cancel, avatar);
  }

  // The herbs to gather, the time and the start.
  function gatherForm(character, gathering) {
    const who = workerPicker(character);
    const known = gathering.herbs.filter((herb) => !herb.hidden);
    const slots = gathering.slots;
    // The last choice, without herbs no longer known or too many for now.
    let chosen = (choice.herbs ?? []).filter((id) => known.some((herb) => herb.id === id)).slice(0, slots);
    if (chosen.length === 0) chosen = [known[0].id];
    const allowed = gathering.minutes;
    let index = allowed.indexOf(choice.minutes);
    if (index === -1) index = Math.max(0, allowed.indexOf(60));
    let minutes = allowed[index];

    const list = choiceList('Zioła', { multi: slots > 1, unknown: ['nieznane zioło', 'nieznane zioła', 'nieznanych ziół'] });
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
      const picked = chosen.map((id) => known.find((herb) => herb.id === id));
      list.show(
        {
          art: picked.map((herb) => herbIcon(herb.id)),
          name: picked.map((herb) => herb.name).join(', '),
          meta: slots > 1 ? `wybrano ${picked.length} z ${slots}` : `w plecaku: ${formatNumber(picked[0].count)}`,
        },
        known.map((herb) => ({ id: herb.id, art: herbIcon(herb.id), name: herb.name, meta: `w plecaku: ${formatNumber(herb.count)}`, on: chosen.includes(herb.id) })),
        gathering.herbs.filter((herb) => herb.hidden).map((herb) => ({ art: herbIcon(herb.id), level: herb.level, hint: herb.hint })),
        toggle,
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
          await call('POST', '/api/professions/gather', { herbs: chosen, minutes, ...who.body() });
        }),
    });

    return h(
      'section',
      { class: 'card gather-card', 'aria-labelledby': 'herbs-title' },
      h('h2', { class: 'section-title', id: 'herbs-title', text: 'Zioła' }),
      who.element,
      list.element,
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
    const who = workerPicker(character);
    const known = brewing.recipes.filter((recipe) => !recipe.hidden);
    let recipe = known.find((candidate) => candidate.id === brewChoice.recipe) ?? known[0];
    let count = 1;
    // A recipe's catalyst (proposal 3: "Wybrane mikstury biorą jeden materiał
    // stwora"): the grade chosen, and the most potions herbs and it allow.
    let catalyst = null;
    let limit = 1;
    const catalystBox = h('div', { class: 'stack' });

    const list = choiceList('Przepisy', { unknown: ['nieznany przepis', 'nieznane przepisy', 'nieznanych przepisów'] });
    const about = h('p', { class: 'muted' });
    const needs = h('p', { class: 'herb-estimate' });
    const picker = h('div', { class: 'stack' });
    const lucky = h('p', { class: 'muted' });

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

    // In the bag, and whether its herbs and its catalyst are there for one
    // potion.
    const recipeMeta = (each) =>
      `w plecaku: ${formatNumber(each.count)}${each.most === 0 ? ' · brak ziół' : each.catalyst && each.catalyst.stacks.length === 0 ? ' · brak katalizatora' : ''}`;

    // A grade of a catalyst by its name with the rarity: "Rzadka łuska żmii".
    const stackTitle = (stack) => `${stack.label.charAt(0).toUpperCase()}${stack.label.slice(1)}`;

    // The grades of the catalyst the character has, the one chosen first:
    // the one remembered, or else the commonest.
    function catalystPicker() {
      const { stacks, name } = recipe.catalyst;
      if (stacks.length === 0) {
        fill(catalystBox, h('p', { class: 'herb-room herb-room--full', text: `Brakuje katalizatora: ${name}. Zostawiają go pokonane stwory.` }));
        return;
      }
      const select = h(
        'select',
        {
          class: 'anvil-material',
          'aria-label': `Katalizator: ${name}`,
          onChange: (event) => {
            brewChoice.catalyst = event.currentTarget.value;
            saveChoice(BREW_CHOICE, brewChoice);
            show();
          },
        },
        stacks.map((stack) =>
          h('option', {
            value: stack.key,
            selected: stack.key === catalyst.key,
            text: `${stackTitle(stack)}: ${formatNumber(stack.count)} szt. · ${formatNumber(Math.round(stack.chance * 100))}% na dodatkową`,
          }),
        ),
      );
      fill(
        catalystBox,
        h('p', { class: 'herb-estimate', text: `Katalizator: 1 × ${name} na miksturę. Rzadszy daje większą szansę na dodatkową miksturę.` }),
        select,
      );
    }

    function show() {
      list.show(
        { art: potionIcon(recipe.id), name: recipe.name, meta: recipeMeta(recipe) },
        known.map((each) => ({ id: each.id, art: potionIcon(each.id), name: each.name, meta: recipeMeta(each), on: each.id === recipe.id })),
        brewing.recipes.filter((each) => each.hidden).map((each) => ({ art: potionIcon(each.id), level: each.level, hint: each.hint })),
        choose,
      );
      about.textContent = recipe.description;
      needs.textContent = `Na jedną miksturę: ${recipe.herbs.map((herb) => `${herb.need} × ${herb.name} (w plecaku ${formatNumber(herb.have)})`).join(', ')}.`;
      const stacks = recipe.catalyst?.stacks ?? [];
      catalyst = stacks.find((stack) => stack.key === brewChoice.catalyst) ?? stacks[0] ?? null;
      limit = recipe.catalyst ? Math.min(recipe.most, catalyst?.count ?? 0) : recipe.most;
      lucky.textContent = `Każda uwarzona mikstura ma ${formatNumber(Math.round((catalyst?.chance ?? brewing.bonusChance) * 100))}% szans na jedną dodatkową.`;
      if (recipe.catalyst) catalystPicker();
      else fill(catalystBox);
      if (recipe.most === 0) {
        fill(
          picker,
          h('p', { class: 'herb-room herb-room--full', text: 'Brakuje ziół na tę miksturę. Zbierzesz je w Zielarstwie.' }),
          h('a', { class: 'button button--world', href: HASHES.herbalism, text: 'Do Zielarstwa' }),
        );
        return;
      }
      if (limit === 0) {
        fill(picker);
        return;
      }
      count = Math.min(limit, Math.max(1, brewChoice.count ?? Math.min(limit, 6)));
      fill(picker, countPicker());
    }

    // A slider of the potions with buttons for one at a time, the time and
    // the herbs they take, the room in the bag and the start.
    function countPicker() {
      const most = limit;
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
        const used = [...recipe.herbs.map((herb) => `${herb.need * count} × ${herb.name}`), catalyst && `${count} × ${stackTitle(catalyst)}`].filter(Boolean).join(', ');
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
            await call('POST', '/api/professions/brew', { recipe: recipe.id, count, ...(catalyst && { catalyst: catalyst.key }), ...who.body() });
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
      who.element,
      list.element,
      about,
      needs,
      catalystBox,
      lucky,
      picker,
    );
  }

  // The slots, the patterns of the slot chosen (those the System still hides
  // are shadows), the rarity, how many items, what they take, the chance and
  // the time, and the start.
  function craftForm(character, workshop) {
    const who = workerPicker(character);
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
    const list = choiceList('Wzory', { unknown: ['nieznany wzór', 'nieznane wzory', 'nieznanych wzorów'] });
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

    // For whom a pattern is, from which class level, and whether it came from
    // an item taken apart.
    const forWhom = (each) =>
      [each.classNames ? each.classNames.join(', ') : 'każda klasa', each.classLevel && `od poz. klasy ${each.classLevel}`, each.learned && 'z rozbiórki']
        .filter(Boolean)
        .join(' · ');

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
      list.show(
        { art: patternIcon(pattern.id), name: pattern.name, meta: forWhom(pattern) },
        known(slot).map((each) => ({ id: each.id, art: patternIcon(each.id), name: each.name, meta: forWhom(each), on: each.id === pattern.id })),
        slot.patterns.filter((each) => each.hidden).map((each) => ({ art: patternIcon(each.id), level: each.level, hint: each.hint })),
        (id) => choose(() => (pattern = known(slot).find((each) => each.id === id))),
      );
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
        // The time of one item too, whatever the count (the author).
        const each = formatMinutes(workMinutes(1, rarity.itemMinutes));
        const time = count === 1 ? `Czas wyrobu jednego przedmiotu: ${each}` : `Czas wyrobu: ${formatMinutes(workMinutes(count, rarity.itemMinutes))}, po ${each} na przedmiot`;
        estimate.textContent = `${time}. Zużyjesz: ${used.join(', ')}.`;
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
            await call('POST', '/api/professions/craft', { baseId: pattern.id, rarity: rarity.id, count, ...who.body() });
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
        h('p', { class: 'muted', text: upgradesText(workshop) }),
        h('p', { class: 'muted', text: luckText(workshop) }),
        h('p', { class: 'muted', text: `Przedmioty dostaną poziom postaci: ${formatNumber(character.level)}.` }),
        free < Math.min(workshop.maxCount, byParts, byResources) &&
          h('p', { class: 'herb-room', text: `Plecak ma miejsce tylko na ${countOf(free, 'przedmiot', 'przedmioty', 'przedmiotów')}.` }),
        start,
      ];
    }

    show();
    return h(
      'section',
      { class: 'card gather-card', 'aria-labelledby': 'patterns-title', 'data-guide': 'workshop-patterns' },
      h('h2', { class: 'section-title', id: 'patterns-title', text: 'Wzory' }),
      who.element,
      slotRow,
      list.element,
      h('h3', { class: 'workshop-subtitle', text: 'Rzadkość' }),
      rarityRow,
      next && h('p', { class: 'muted', text: `Następna rzadkość: ${next.name}, od ${next.level}. poziomu Rzemieślnictwa.` }),
      picker,
    );
  }

  // The parts' exchange, at once and whoever is at work: each part above the
  // commonest for `rate` of the part a rarity lower, by "Wymień 1" or
  // "Wymień 10", with what the character has of both (the author:
  // "natychmiastowa opcja wymiany Ścinek na Rzemienie itd.").
  function partExchange(character, workshop) {
    const { exchange } = workshop;
    const own = (id) => character.crafting.parts.find((part) => part.id === id);
    return h(
      'section',
      { class: 'card gather-card', 'aria-labelledby': 'part-exchange-title' },
      h('h2', { class: 'section-title', id: 'part-exchange-title', text: exchange.title }),
      h('p', { class: 'muted', text: exchange.text }),
      h(
        'ul',
        { class: 'craft-list' },
        exchange.parts.map(({ id, from }) => {
          const part = own(id);
          const source = own(from);
          return h(
            'li',
            { class: 'craft-row shop-row part-exchange-row' },
            h('span', { class: 'craft-art' }, materialIcon(id, 32)),
            h(
              'span',
              { class: 'craft-text' },
              h('span', { class: 'item-name', vars: { '--rarity': part.color }, text: part.name }),
              h(
                'span',
                { class: 'item-meta shop-meta' },
                h('strong', { class: 'shop-price', text: `${formatNumber(exchange.rate)} × ${source.name} za 1` }),
                h('span', { text: `masz ${formatNumber(part.count)}` }),
              ),
              h('span', { class: 'item-meta', text: `${source.name}: masz ${formatNumber(source.count)}` }),
            ),
            h(
              'span',
              { class: 'shop-buttons' },
              exchange.counts.map((count) =>
                h('button', {
                  type: 'button',
                  class: 'button button--world button--small shop-button',
                  disabled: source.count < count * exchange.rate,
                  'aria-label': `Wymień ${formatNumber(count * exchange.rate)} × ${source.name} na ${formatNumber(count)} × ${part.name}`,
                  text: `Wymień ${count}`,
                  onClick: (event) => withButton(event.currentTarget, () => exchangeParts(id, count)),
                }),
              ),
            ),
          );
        }),
      ),
    );
  }

  async function exchangeParts(partId, count) {
    const { exchanged } = await call('POST', '/api/professions/exchange', { partId, count });
    playSound('collect');
    const name = (id) => state.character.crafting.parts.find((part) => part.id === id)?.name ?? id;
    toast(`Wymieniono ${formatNumber(exchanged.given)} × ${name(exchanged.from)} na ${formatNumber(exchanged.count)} × ${name(exchanged.partId)}.`);
  }

  // The Zwoje ochronne for the Kowadło: what they do and how many the
  // character has, then, from the scroll's level, how many to make from the
  // parts there are, with their time, and the start; before it, the level
  // the System shows them at.
  function scrollForm(character, workshop) {
    const { scroll } = workshop;
    const head = [
      h('h2', { class: 'section-title', id: 'scroll-title', text: scroll.name }),
      h('p', { class: 'muted', text: scroll.description }),
      h('p', { class: 'herb-estimate', text: `Masz: ${countOf(scroll.owned, 'zwój', 'zwoje', 'zwojów')}.` }),
    ];
    const card = (...children) => h('section', { class: 'card gather-card', 'aria-labelledby': 'scroll-title' }, head, children);
    if (scroll.hidden) return card(h('p', { class: 'system-hint', text: scroll.hint }));
    const have = character.crafting.parts.find((part) => part.id === scroll.part.id)?.count ?? 0;
    const most = Math.min(workshop.maxCount, Math.floor(have / scroll.parts));
    const needs = `Jeden zwój to ${formatNumber(scroll.parts)} × ${scroll.part.name} i ${formatMinutes(workMinutes(1, scroll.minutes))}.`;
    if (most === 0) {
      return card(
        h('p', { class: 'herb-room herb-room--full', text: `${needs} Masz: ${formatNumber(have)} × ${scroll.part.name}.` }),
        h('a', { class: 'button button--world', href: TABLE, text: 'Do Stołu rozbiórki' }),
      );
    }
    const who = workerPicker(character);
    let count = 1;
    const value = h('output', { class: 'duration-value', 'aria-live': 'off' });
    const estimate = h('p', { class: 'herb-estimate' });
    const slider = h('input', {
      type: 'range',
      class: 'duration-slider',
      min: 1,
      max: most,
      step: 1,
      value: count,
      'aria-label': 'Liczba zwojów',
      onInput: () => set(Number(slider.value)),
    });
    const stepButton = (sign, label) =>
      h('button', { type: 'button', class: 'button button--world duration-step', 'aria-label': label, text: sign < 0 ? '−' : '+', onClick: () => set(count + sign) });
    const less = stepButton(-1, 'Mniej');
    const more = stepButton(1, 'Więcej');
    function set(nextCount) {
      count = Math.min(most, Math.max(1, nextCount));
      const label = countOf(count, 'zwój', 'zwoje', 'zwojów');
      slider.value = String(count);
      slider.setAttribute('aria-valuetext', label);
      slider.style.setProperty('--fill', `${most > 1 ? ((count - 1) / (most - 1)) * 100 : 100}%`);
      value.textContent = label;
      less.disabled = count === 1;
      more.disabled = count === most;
      const each = formatMinutes(workMinutes(1, scroll.minutes));
      const time = count === 1 ? `Czas jednego zwoju: ${each}` : `Czas: ${formatMinutes(workMinutes(count, scroll.minutes))}, po ${each} na zwój`;
      estimate.textContent = `${time}. Zużyjesz: ${formatNumber(scroll.parts * count)} × ${scroll.part.name}.`;
    }
    set(count);
    const start = h('button', {
      type: 'button',
      class: 'button button--system',
      text: 'Zrób zwoje',
      onClick: (event) =>
        withButton(event.currentTarget, async () => {
          await call('POST', '/api/professions/craft', { scroll: true, count, ...who.body() });
          window.scrollTo(0, 0);
        }),
    });
    return card(
      who.element,
      h(
        'div',
        { class: 'duration-picker' },
        h('p', { class: 'duration-head' }, h('span', { class: 'duration-title' }, 'Liczba zwojów'), value),
        h('div', { class: 'duration-row' }, less, slider, more),
        h('p', { class: 'duration-scale', 'aria-hidden': 'true' }, h('span', { text: '1' }), h('span', { text: formatNumber(most) })),
      ),
      estimate,
      h('p', { class: 'muted', text: 'Każdy zwój się uda. Zwoje nie zajmują miejsca w plecaku.' }),
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
    for (const timer of timers) showTimer(timer, now);
  }

  function showTimer({ activity, countdown, progress, scene, skipper }, now) {
    skipper.update(now);
    countdown.textContent = formatCountdown(activity.endsAt - now);
    const done = (now - activity.startedAt) / (activity.endsAt - activity.startedAt);
    progress.style.width = `${Math.min(100, Math.max(0, done * 100))}%`;
    scene?.update(done);
  }

  render();
  return { update: render, tick };
}

// The XP, the profession's levels and the Time Points of a work's report.
// The Awatar Systemu's work brings no XP and no levels.
function workSummary(report) {
  const { summary, profession } = report;
  const rows = report.avatar
    ? [['Wykonawca', 'Awatar Systemu']]
    : [
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
// exploration, by `findSheet`, and is marked like one) and the failed ones,
// the profession's levels, the XP and the System's lines.
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
            h('li', {}, h('button', { type: 'button', class: 'item-row', onClick: () => findSheet(item) }, itemSummary(item), findMark(item), icon('chevron', { size: 18 }))),
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
// "Mniejsza mikstura leczenia ×12" or "Miecz ×3, nieudane: 1", after
// "Awatar Systemu · " for the Awatar's work.
export const workSummaryText = (summary) =>
  (summary.avatar ? 'Awatar Systemu · ' : '') +
  [...(summary.herbs ?? summary.potions ?? summary.items ?? []).map((entry) => `${entry.name} ×${formatNumber(entry.count)}`), summary.failed > 0 && `nieudane: ${formatNumber(summary.failed)}`]
    .filter(Boolean)
    .join(', ');
