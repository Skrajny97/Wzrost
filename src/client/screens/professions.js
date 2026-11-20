// The Profesje tab: the professions as squares in their rows (`rows` of
// data/professions.json: the gathering ones on top, each above the one that
// works with what it brings, and Rzemieślnictwo below; grey until they
// come), the Zielarstwo screen: the Systemowy Zagajnik, the profession's
// level and stats, the herbs (those the System still hides are shadows),
// the herbs to gather and the time, and the gathering under way with
// "Przewiń", "Przerwij" and its report at the end; and the Alchemia screen
// in the same way: the Systemowa Pracownia, the recipes, how many potions
// and the brewing under way; and the Rzemieślnictwo screen: the Systemowy
// Warsztat, the patterns by slot, the rarity, how many items and the order
// under way, with the parts' exchange and the Przechowalnia in tabs; the
// Górnictwo screen: the Systemowa Kopalnia, the time, what a digging should
// bring and the digging under way; and the Jubilerstwo screen: the
// Systemowa Szlifiernia with its tabs, the jewellery by pattern and gem, the
// gems set in the items worn (on the character's figure), the przemiana of
// gems and the Przechowalnia. Each work can be done by the character or by
// the Awatar Systemu, bought on the tab, which works beside the character in
// its own card. Locked, or hidden in this deployment, the tab says so as
// before.

import { cropSprite, dishSprite, farmArt, fishSprite, goldArt, herbSprite, itemSprite, mineralSprite, placeArt, potionSprite, professionSprite, scrollArt } from '../art.js';
import { droppedCardsSection } from '../cards.js';
import { materialIcon } from '../craft-table.js';
import { fill, h, icon, setTimer } from '../dom.js';
import { countOf, dateTimeFormat, formatCountdown, formatDecimal, formatMinutes, formatNumber, timeFormat } from '../format.js';
import { language, t } from '../i18n.js';
import { motionOn } from '../motion.js';
import { workScene } from '../scenes.js';
import { playSound } from '../sound.js';
import { activityFinished, buildLocked, call, reportCache, serverNow, state, testModeOn } from '../state.js';
import { skipControl } from '../time.js';
import { closeSheet, confirmAction, howItWorks, openSheet, splitLead, systemPanel, toast, withButton } from '../ui.js';
import { transmuteForm } from '../transmute.js';
import { playMinigame } from '../minigame.js';
import { characterLook, portraitLayers } from '../cosmetics.js';
import { SLOT_ICONS } from '../icons.js';
import { classFits, compareTable, findMark, itemSummary, itemTitle, salvagedText } from './character.js';
import { lockedScreen } from './locked.js';

const HOME = '#/profesje';
// The addresses of the professions with a screen.
const SCREENS = { zielarstwo: 'herbalism', alchemia: 'alchemy', rzemieslnictwo: 'crafting', gornictwo: 'mining', jubilerstwo: 'jewelcrafting', rybolowstwo: 'fishing', rolnictwo: 'farming', gotowanie: 'cooking' };
const HASHES = {
  herbalism: `${HOME}/zielarstwo`,
  alchemy: `${HOME}/alchemia`,
  crafting: `${HOME}/rzemieslnictwo`,
  mining: `${HOME}/gornictwo`,
  jewelcrafting: `${HOME}/jubilerstwo`,
  fishing: `${HOME}/rybolowstwo`,
  farming: `${HOME}/rolnictwo`,
  cooking: `${HOME}/gotowanie`,
};
// The activity of each profession's work, and what its square says meanwhile
// (in Polish, shown through t(), i18n.js).
const WORK = {
  herbalism: { kind: 'herbs', busy: 'Zbiera zioła' },
  alchemy: { kind: 'potions', busy: 'Warzy mikstury' },
  crafting: { kind: 'items', busy: 'Wykonuje przedmioty' },
  mining: { kind: 'minerals', busy: 'Kopie' },
  jewelcrafting: { kind: 'jewels', busy: 'Pracuje w Szlifierni' },
  fishing: { kind: 'fish', busy: 'Łowi ryby' },
  farming: { kind: 'crops', busy: 'Uprawia pole' },
  cooking: { kind: 'dishes', busy: 'Gotuje' },
};
// What the character or the Awatar Systemu is doing, by the activity's kind (t()).
const DOING = { herbs: 'zbiera zioła', potions: 'warzy mikstury', items: 'wykonuje przedmioty', minerals: 'kopie w Kopalni', jewels: 'pracuje w Szlifierni', fish: 'łowi ryby', crops: 'uprawia pole', dishes: 'gotuje', mercenary: 'wykonuje usługę najemną' };
const FALLBACK_ICONS = { herbalism: 'leaf', alchemy: 'spirit', crafting: 'hammer', mining: 'ore', jewelcrafting: 'ring', fishing: 'fish', farming: 'sprout', cooking: 'pot' };
const HERB_CHOICE = 'wzrost.herb-choice';
const WORKER_CHOICE = 'wzrost.worker-choice';
const BREW_CHOICE = 'wzrost.brew-choice';
const CRAFT_CHOICE = 'wzrost.craft-choice';
const MINE_CHOICE = 'wzrost.mine-choice';
const JEWEL_CHOICE = 'wzrost.jewel-choice';
const FISH_CHOICE = 'wzrost.fish-choice';
const FARM_CHOICE = 'wzrost.farm-choice';
const COOK_CHOICE = 'wzrost.cook-choice';
const SET_CHOICE = 'wzrost.set-choice';
// How many of the bag's items Oprawianie's „Z plecaka” shows at first, and
// how many more each „Pokaż kolejne” adds.
const SET_BAG_STEP = 20;
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
const mineralIcon = (id) => mineralSprite(id) ?? icon('ore', { size: 24 });
const fishIcon = (id) => fishSprite(id) ?? icon('fish', { size: 24 });
const cropIcon = (id) => cropSprite(id) ?? icon('sprout', { size: 24 });
const dishIcon = (id) => dishSprite(id) ?? icon('pot', { size: 24 });
const jewelIcon = (id) => itemSprite({ base: id }) ?? icon('ring', { size: 24 });
const percentText = (share) => `${formatNumber(Math.round(share * 100))}%`;

// A work of `count` potions or items of `each` minutes in whole minutes, as
// the server counts it (brewMinutes and orderMinutes in src/engine).
const workMinutes = (count, each) => Math.ceil(Math.round(count * each * 1000) / 1000);

// The chances that a made item comes out upgraded already, or the level of
// Rzemieślnictwo it may from.
const upgradesText = (workshop) =>
  workshop.upgrades.length === 0
    ? t('Od {level}. poziomu Rzemieślnictwa wyrób może wyjść od razu ulepszony.', { level: workshop.upgradesFrom })
    : t('Wyrób może wyjść od razu ulepszony: {chances}.', { chances: workshop.upgrades.map((tier) => `+${tier.upgrade} (${formatDecimal(tier.chance * 100)}%)`).join(', ') });

// The chances that luck alone makes an item one or two rarities above the
// ordered one, in the author's words.
const luckText = (workshop) =>
  t('Łut szczęścia: {one}% szans na przedmiot o wyższej rzadkości, {two}% szans na przedmiot rzadkości wyższej o 2 stopnie. Szanse rosną co 20 poziomów Rzemieślnictwa.', {
    one: formatDecimal(workshop.luck.oneUp * 100),
    two: formatDecimal(workshop.luck.twoUp * 100),
  });

// A title with a large "Powrót" on the right, as in the report.
function backHeading(title, subtitle, hash) {
  return h(
    'div',
    { class: 'page-heading page-heading--back' },
    h('div', { class: 'page-heading-text' }, h('h1', { class: 'page-title', tabindex: '-1', text: title }), subtitle && h('p', { class: 'page-subtitle', text: subtitle })),
    h('a', { class: 'button button--system back-button', href: hash }, icon('back', { size: 20 }), t('Powrót')),
  );
}

// A folded list of the herbs, recipes or patterns, which grew too many for
// tiles (the author: the screens were long to scroll). Folded, its button
// shows the choice; open, a row for each known one and, last, the shadows
// still hidden, a row for each hint under them, by level: one for each level
// the System shows them at, and one of its own for each rare recipe Jagna
// has not taught yet (`unknown(count)` names them: "3 nieznane zioła"). A
// choice folds the list, except in a list of several choices at once
// (`multi`), folded by its button or "Gotowe".
function choiceList(label, { multi = false, unknown }) {
  let open = false;
  const chosen = h('span', { class: 'choice-chosen' });
  const action = h('span', { class: 'choice-action' });
  const rows = h('ul', { class: 'choice-rows', 'aria-label': label });
  const body = h('div', { class: 'choice-body', hidden: true }, rows, multi && h('button', { type: 'button', class: 'button button--world', text: t('Gotowe'), onClick: () => setOpen(false) }));
  const toggle = h('button', { type: 'button', class: 'choice-toggle', 'aria-expanded': false, onClick: () => setOpen(!open) }, chosen, action);
  function setOpen(value) {
    open = value;
    body.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    fill(action, open ? t('Zwiń') : t('Zmień'), icon('chevron', { size: 16 }));
    // Folded after a choice far down the list, the button comes back into view.
    if (!open) toggle.scrollIntoView({ block: 'nearest' });
  }
  const text = (name, meta) => h('span', { class: 'choice-text' }, h('span', { class: 'choice-name', text: name }), meta && h('span', { class: 'choice-meta', text: meta }));
  fill(action, t('Zmień'), icon('chevron', { size: 16 }));
  return {
    element: h('div', { class: 'choice-list' }, toggle, body),
    // `picked`: the choice in the button, { art, name, meta }; `entries`:
    // the known ones, { id, art, name, meta, on }; `hidden`: the shadows,
    // { art, level, hint }; `pick(id)` takes one.
    show(picked, entries, hidden, pick) {
      fill(chosen, h('span', { class: 'choice-art' }, picked.art), text(picked.name, picked.meta));
      // The shadows by level, and by their hint within a level.
      const hints = [...new Set([...hidden].sort((a, b) => a.level - b.level).map((each) => each.hint))];
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
        hints.map((hint) => {
          const group = hidden.filter((each) => each.hint === hint);
          return h(
            'li',
            { class: 'choice-hidden', role: 'img', 'aria-label': `${unknown(group.length)}. ${group[0].hint}` },
            h('span', { class: 'choice-shadows' }, group.map((each) => h('span', { class: 'choice-shadow' }, each.art))),
            h('span', { class: 'choice-meta', text: group[0].hint }),
          );
        }),
      );
    },
  };
}

// "50. i 100." in Polish, "50 and 100" in English: the levels of
// Rolnictwo that give the field more plots.
function levelList(levels) {
  const english = language() === 'en';
  const parts = levels.map((level) => (english ? String(level) : `${level}.`));
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} ${english ? 'and' : 'i'} ${parts.at(-1)}` : parts[0];
}

// The Systemowe Pole's title: its plots, and with the next level's still
// locked how many the board shows ("Pole · 9 z 12 grządek").
const fieldTitle = (count, next) =>
  next ? t('Pole · {count} z {all} grządek', { count: formatNumber(count), all: formatNumber(next.plots) }) : t('Pole · {plots}', { plots: countOf(count, 'grządka', 'grządki', 'grządek') });

// One plot of the Systemowe Pole (1005): its tilled ground and over it, by
// `kind`, the crop chosen for it ('sown', `crop`; with `stage`, the plants
// of that stage of growth and the crop's icon in the corner, and with
// `count` what it brought), a "+" to sow it ('empty'), nothing ('fallow',
// left empty) or a lock ('locked'); under it `label`. With `onClick` it is
// a button.
function farmPlot(kind, { crop = null, stage = 0, count = null, label = '', onClick = null, ariaLabel = null } = {}) {
  const ground = h('span', { class: 'farm-plot-ground' }, h('img', { class: 'farm-plot-art', src: farmArt.plot, alt: '', width: 48, height: 48, draggable: 'false' }));
  if (kind === 'sown') {
    if (stage > 0) ground.append(h('img', { class: 'farm-stage', src: farmArt.stage(stage), alt: '', width: 48, height: 48, draggable: 'false' }));
    const art = cropIcon(crop.id);
    art.classList.add(stage > 0 ? 'farm-badge' : 'farm-crop');
    ground.append(art);
    if (count !== null) ground.append(h('span', { class: 'farm-count', text: `×${formatNumber(count)}` }));
  }
  if (kind === 'locked') ground.append(h('span', { class: 'farm-lock' }, icon('lock', { size: 22 })));
  const children = [ground, h('span', { class: 'farm-plot-name', text: label })];
  const className = `farm-plot farm-plot--${kind}`;
  return onClick ? h('button', { type: 'button', class: className, 'aria-label': ariaLabel ?? label, onClick }, children) : h('div', { class: className }, children);
}

// The Systemowe Pole's board (1005): the meadow with the field's plots
// (`cells`) and, while a later level gives more (`next`), the plots still
// locked with that level. `small`: the report's, four plots in a row.
function farmBoard(cells, next, { small = false } = {}) {
  const locked = next ? Array.from({ length: Math.max(0, next.plots - cells.length) }, () => farmPlot('locked', { label: t('poz. {level}', { level: next.level }) })) : [];
  return h(
    'div',
    { class: `farm-board${small ? ' farm-board--small' : ''}`, vars: { '--farm-board': `url("${farmArt.board}")` } },
    h('div', { class: 'farm-grid' }, cells, locked),
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
  const mineChoice = loadChoice(MINE_CHOICE); // { minutes }
  const jewelChoice = loadChoice(JEWEL_CHOICE); // { slot, pattern, rarity, count }
  const setChoice = loadChoice(SET_CHOICE); // { item, gem }
  const fishChoice = loadChoice(FISH_CHOICE); // { fish: [ids], minutes }
  const farmChoice = loadChoice(FARM_CHOICE); // { plots: [id or null], crop, minutes }
  const cookChoice = loadChoice(COOK_CHOICE); // { recipe, count }
  let lockedScreenShown = null;
  let shownState = null;
  // The Warsztat's tab: the workshop itself or its part exchange.
  let workshopTab = 'workshop';
  // The Szlifiernia's tab: the jewellery or the setting of gems.
  let jewelTab = 'craft';
  // The step of przemiana chosen in the Szlifiernia's tab (913 A), by its gem.
  let transmuteChoice = null;
  // The items marked in the Przechowalnia, by id, whichever screen shows it.
  const storageMarks = new Set();
  // The works under way on the screen, each with its countdown, bar, scene
  // and "Przewiń": the character's and the Awatar's.
  let timers = [];

  // What the screen shows depends on: the work under way (or not) of the
  // character and of the Awatar, whether it has ended, and test mode.
  const stateKey = (character, now = serverNow()) => {
    const works = [character.activity, character.professions?.avatar?.activity, character.professions?.avatar?.second?.activity];
    return JSON.stringify([
      ...works.flatMap((work) => [work?.kind ?? null, work?.startedAt ?? null, activityFinished(work, now)]),
      character.professions?.avatar?.owned ?? false,
      character.professions?.avatar?.second?.owned ?? false,
      state.user.testMode && testModeOn(),
      // What waits in the Przechowalnia.
      (character.professions?.storage?.items ?? []).map((item) => item.id).join(),
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
    // Górnictwo and Jubilerstwo below their level lead back to the tab.
    if (professionId === 'mining' || professionId === 'jewelcrafting') {
      if (!character.professions[professionId]) {
        location.replace(HOME);
        return;
      }
      if (professionId === 'mining') renderMining(character);
      else renderJewelcraft(character);
      return;
    }
    // Rybołówstwo below its level, or hidden in this deployment, leads back
    // to the tab.
    if (professionId === 'fishing') {
      if (!character.professions.fishing) {
        location.replace(HOME);
        return;
      }
      renderFishing(character);
      return;
    }
    // Rolnictwo below its level, or hidden in this deployment, leads back
    // to the tab.
    if (professionId === 'farming') {
      if (!character.professions.farming) {
        location.replace(HOME);
        return;
      }
      renderFarming(character);
      return;
    }
    // Gotowanie below its level, or hidden in this deployment, leads back
    // to the tab.
    if (professionId === 'cooking') {
      if (!character.professions.cooking) {
        location.replace(HOME);
        return;
      }
      renderCooking(character);
      return;
    }
    // The System's words over the squares, which the narrator points at.
    // Its first sentence, the rest under "Jak to działa?" (315 A).
    const [lead, rest] = splitLead(character.professions.intro ?? '');
    const intro = character.professions.intro && systemPanel(rest ? howItWorks(lead, rest, { system: true }) : lead);
    if (intro) intro.dataset.guide = 'professions-intro';
    fill(
      container,
      h('div', { class: 'page-heading' }, h('h1', { class: 'page-title', tabindex: '-1', text: t('Profesje') })),
      intro,
      triangle(character),
      avatarPanel(character),
    );
  }

  // The squares in their rows (`rows`, data/professions.json): the
  // gathering professions on top, each above the one that works with what it
  // brings, and Rzemieślnictwo below; without rows the first on top and the
  // others below it.
  function triangle(character) {
    const { list, rows } = character.professions;
    const byId = Object.fromEntries(list.map((profession) => [profession.id, profession]));
    const layout = rows?.length > 0 ? rows : [[list[0].id], list.slice(1).map((profession) => profession.id)];
    return h(
      'div',
      { class: 'profession-triangle', 'data-guide': 'professions-list' },
      layout.map((row) => h('div', { class: 'profession-row' }, row.filter((id) => byId[id]).map((id) => square(byId[id], character)))),
    );
  }

  function square(profession, character) {
    const art = professionSprite(profession.id) ?? icon(FALLBACK_ICONS[profession.id] ?? 'leaf', { size: 40 });
    const label = h('span', { class: 'profession-name', text: profession.name });
    if (profession.soon) {
      return h(
        'div',
        { class: 'profession-square profession-square--soon', role: 'img', 'aria-label': t('{name}: wkrótce', { name: profession.name }) },
        h('span', { class: 'profession-art' }, art),
        label,
        h('span', { class: 'profession-level', text: t('Wkrótce') }),
      );
    }
    // A profession that opens later than the tab waits for its level.
    if (profession.locked) {
      return h(
        'div',
        { class: 'profession-square profession-square--soon', role: 'img', 'aria-label': t('{name}: od poziomu postaci {level}', { name: profession.name, level: profession.unlockLevel }) },
        h('span', { class: 'profession-art' }, art),
        label,
        h('span', { class: 'profession-level' }, icon('lock', { size: 12 }), ` ${t('od poz. {level}', { level: profession.unlockLevel })}`),
      );
    }
    const work = WORK[profession.id];
    const own = work && character.activity?.kind === work.kind ? character.activity : null;
    const avatar = character.professions.avatar.activity;
    const avatarHere = work && avatar?.kind === work.kind ? avatar : null;
    // The second Awatar's (1066, 1070.2).
    const second = character.professions.avatar.second?.activity;
    const secondHere = work && second?.kind === work.kind ? second : null;
    let status = t('poz. {level}', { level: profession.level });
    if (own) status = activityFinished(own) ? t('Raport gotowy') : t(work.busy);
    else if (avatarHere) status = activityFinished(avatarHere) ? t('Raport Awatara') : t('Pracuje Awatar');
    else if (secondHere) status = activityFinished(secondHere) ? t('Raport Drugiego Awatara') : t('Pracuje Drugi Awatar');
    return h(
      'a',
      { class: 'profession-square', href: HASHES[profession.id] ?? HOME },
      h('span', { class: 'profession-art' }, art),
      label,
      h('span', { class: 'profession-level', text: status }),
    );
  }

  // The Awatar Systemu under the squares: what it is and its price until it
  // is bought, then what it is doing; and once it is bought, the same of the
  // second Awatar under it (1066; 1070.1 and 1070.2).
  function avatarPanel(character) {
    const { avatar } = character.professions;
    return [avatarCard(character, avatar, true), avatar.owned && avatar.second && avatarCard(character, avatar.second, 2)];
  }

  // One Awatar's card (`which`: true the first, 2 the second).
  function avatarCard(character, avatar, which) {
    const id = which === 2 ? 'avatar2-title' : 'avatar-title';
    const card = h('section', { class: 'card avatar-card', 'aria-labelledby': id }, h('h2', { class: 'card-title', id, text: avatar.name }));
    if (!avatar.owned) {
      const short = avatar.price - character.gold;
      card.append(
        h('p', { class: 'region-description', text: avatar.description }),
        h('p', { class: 'avatar-price' }, goldArt(20), ` ${t('{gold} złota, jednorazowo i na zawsze', { gold: formatNumber(avatar.price) })}`),
        ...(short > 0 ? [h('p', { class: 'muted', text: t('Brakuje jeszcze {gold} złota.', { gold: formatNumber(short) }) })] : []),
        h('button', {
          type: 'button',
          class: 'button button--system',
          text: which === 2 ? t('Kup drugiego Awatara') : t('Kup Awatara'),
          disabled: short > 0,
          onClick: async (event) => {
            const button = event.currentTarget;
            const sure = await confirmAction({
              title: t('Kupić: {name}?', { name: avatar.name }),
              text: t('Zapłacisz {gold} złota. Zakup jest jednorazowy i na zawsze.', { gold: formatNumber(avatar.price) }),
              confirmLabel: t('Kup'),
            });
            if (!sure) return;
            await withButton(button, async () => {
              const { text } = await call('POST', '/api/avatar/buy', which === 2 ? { avatar: 2 } : undefined);
              toast(text);
            });
          },
        }),
      );
      return card;
    }
    const work = avatar.activity;
    if (!work) {
      card.append(h('p', { text: which === 2 ? t('Czeka na pracę. Wybierz profesję i przy starcie zaznacz, że pracuje Drugi Awatar.') : t('Czeka na pracę. Wybierz profesję i przy starcie zaznacz, że pracuje Awatar.') }));
      return card;
    }
    const done = activityFinished(work);
    card.append(
      h('p', { text: done ? t('Praca skończona. Raport czeka na odbiór.') : `${t(WORK[work.profession].busy)}: ${work.placeName}.` }),
      h('a', { class: 'button button--world', href: HASHES[work.profession] ?? HOME, text: done ? t('Odbierz raport') : t('Zobacz pracę') }),
    );
    return card;
  }

  function renderHerbalism(character) {
    const { list, gathering } = character.professions;
    const profession = list.find((candidate) => candidate.id === gathering.professionId);
    fill(
      container,
      backHeading(profession.name, t('poziom {level}', { level: profession.level }), HOME),
      // What the character and the Awatar are doing comes first, so a
      // report to claim is always at the top, above the place (the author).
      works(character, 'herbs', gatheringCard, 'Postać {doing}. Do Zagajnika wyruszy po powrocie.'),
      testTools(character, 'herbs', t('Tryb testowy: zbieranie skończy się od razu, z tym samym wynikiem.')),
      placeCard(gathering.place),
      levelCard(profession, t('zbierania')),
      anyFree(character) && gatherForm(character, gathering),
    );
  }

  function renderAlchemy(character) {
    const { list, brewing } = character.professions;
    const profession = list.find((candidate) => candidate.id === brewing.professionId);
    fill(
      container,
      backHeading(profession.name, t('poziom {level}', { level: profession.level }), HOME),
      works(character, 'potions', brewingCard, 'Postać {doing}. Warzenie możliwe po powrocie.'),
      testTools(character, 'potions', t('Tryb testowy: warzenie skończy się od razu, z tym samym wynikiem.')),
      placeCard(brewing.place),
      levelCard(profession, t('warzenia')),
      anyFree(character) && brewForm(character, brewing),
    );
  }

  // Under the works, two tabs: the Warsztat and its part exchange (the
  // author: the exchange at the top as a tab, not at the very bottom).
  function renderCrafting(character) {
    const { list, workshop, storage } = character.professions;
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
      backHeading(profession.name, t('poziom {level}', { level: profession.level }), HOME),
      works(character, 'items', craftingCard, 'Postać {doing}. Wyrób możliwy po powrocie.'),
      testTools(character, 'items', t('Tryb testowy: wyrób skończy się od razu, z tym samym wynikiem.')),
      h(
        'div',
        { class: 'segmented workshop-tabs', role: 'group', 'aria-label': workshop.place.name },
        tab('workshop', t('Warsztat')),
        tab('exchange', workshop.exchange.title),
        storage && tab('storage', storageLabel(storage)),
      ),
      workshopTab === 'storage' && storage
        ? storageCard(character)
        : workshopTab === 'exchange'
        ? partExchange(character, workshop)
        : [
            placeCard(workshop.place),
            levelCard(profession, t('wyrobu')),
            anyFree(character) && craftForm(character, workshop),
            anyFree(character) && scrollForm(character, workshop),
            anyFree(character) && workshop.steadyScroll && scrollForm(character, workshop, 'steadyScroll'),
          ],
    );
  }

  // Who is free for a new work: the character at home, and the Awatar
  // Systemu and the second Awatar (1066) once bought and not at work.
  const freeWorkers = (character) => {
    const { avatar } = character.professions;
    return { character: !character.activity, avatar: avatar.owned && !avatar.activity, avatar2: Boolean(avatar.second?.owned && !avatar.second.activity) };
  };
  const anyFree = (character) => {
    const free = freeWorkers(character);
    return free.character || free.avatar || free.avatar2;
  };

  // The works of `kind` here, by `card`: the character's, or what it does
  // elsewhere while no one can take this work (`busy`, a text of t() with
  // {doing}, says it and when it can come), and the Awatar's under its name.
  // A report to claim comes first.
  function works(character, kind, card, busy) {
    const { avatar } = character.professions;
    const activity = character.activity;
    const free = freeWorkers(character);
    const own = activity?.kind === kind ? card(activity, false) : activity && !free.avatar && !free.avatar2 && busyPanel(activity, busy);
    // Each Awatar's (the second's too, 1066) under its name.
    const theirs = (one, which) => {
      const work = one?.activity?.kind === kind ? one.activity : null;
      return work && { finished: activityFinished(work), element: h('section', { class: 'stack', 'aria-label': one.name }, h('h2', { class: 'section-title', text: one.name }), card(work, which)) };
    };
    const ownDone = activity?.kind === kind && activityFinished(activity);
    const all = [{ finished: ownDone, element: own }, theirs(avatar, true), theirs(avatar.second, 2)].filter((one) => one?.element);
    // A report to claim comes first, the character's before the Awatars'.
    return [...all.filter((one) => one.finished), ...all.filter((one) => !one.finished)].map((one) => one.element);
  }

  // What the character does elsewhere, and when it comes here.
  function busyPanel(activity, busy) {
    return systemPanel(t(busy, { doing: t(DOING[activity.kind] ?? 'jest na wyprawie') }));
  }

  // Who takes a new work, over its start button: with the Awatar bought,
  // the character or the Awatar when both are free (the last choice is
  // remembered), otherwise the one that is free; with the second Awatar too
  // (1066), three: Postać, Awatar and Drugi Awatar (1070.4). `body` adds
  // the choice to the start's request.
  function workerPicker(character) {
    const { avatar } = character.professions;
    const free = freeWorkers(character);
    if (!avatar.owned) return { element: null, body: () => ({}) };
    const second = avatar.second?.owned ? avatar.second : null;
    // With two Awatary the options and the notes name them shortly, as in
    // 1070.4; with one, by its whole name, as before.
    const names = second ? { avatar: t('Awatar'), avatar2: t('Drugi Awatar') } : { avatar: avatar.name };
    const options = [['character', t('Postać')], ['avatar', names.avatar], ...(second ? [['avatar2', names.avatar2]] : [])];
    const remembered = loadChoice(WORKER_CHOICE).worker;
    let worker = options.some(([id]) => id === remembered) && free[remembered] ? remembered : options.find(([id]) => free[id])?.[0] ?? 'character';
    const row = h('div', { class: `segmented${second ? ' segmented--three' : ''}`, role: 'group', 'aria-label': t('Kto pracuje') });
    const show = () =>
      fill(
        row,
        options.map(([id, name]) =>
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
    // Why one of them cannot take it. The Awatar's name and what it does
    // are joined here, not in one text of t(): a key of nothing but
    // "{name} {doing}." would match any message the server translates by
    // its shape (translateMessage, src/server/i18n.js).
    const busyNote = (one, name) => (activityFinished(one.activity) ? t('{name} czeka na odbiór raportu.', { name }) : `${name} ${t(DOING[one.activity.kind])}.`);
    const notes = [];
    if (!free.character) notes.push(t('Postać {doing}, więc pracę wykona {name}.', { doing: t(DOING[character.activity.kind] ?? 'jest na wyprawie'), name: names[worker] ?? names.avatar }));
    if (!free.avatar && avatar.activity) notes.push(busyNote(avatar, names.avatar));
    if (second && !free.avatar2 && second.activity) notes.push(busyNote(second, names.avatar2));
    return {
      element: h('div', { class: 'stack worker-picker' }, h('p', { class: 'duration-title', text: t('Kto pracuje') }), row, ...notes.map((note) => h('p', { class: 'muted', text: note }))),
      body: () => (worker === 'avatar' ? { avatar: true } : worker === 'avatar2' ? { avatar: 2 } : {}),
    };
  }

  // Test mode only: one button that ends the work of `kind` at once.
  function testTools(character, kind, text) {
    const going = [character.activity, character.professions.avatar.activity, character.professions.avatar.second?.activity].some((work) => work?.kind === kind && !activityFinished(work));
    if (!state.user.testMode || !testModeOn() || !going) return null;
    return h(
      'div',
      { class: 'test-tools' },
      h('p', { class: 'test-tools-text', text }),
      h('button', {
        type: 'button',
        class: 'button button--test',
        text: t('Pomiń czas'),
        onClick: (event) => withButton(event.currentTarget, () => call('POST', '/api/test/skip-time')),
      }),
    );
  }

  // The place's picture dim behind its name and the System's words, and how
  // its work goes folded under "Jak to działa?" (`about`), as on the Salon
  // Gier (the author: descriptions short, the rest folded).
  function placeCard(place, about = null) {
    const art = placeArt(place.id);
    const card = h(
      'section',
      { class: `card place-card${art ? ' place-card--art' : ''}`, 'aria-label': place.name },
      h('h2', { class: 'card-title', text: place.name }),
      h('p', { class: 'region-description', text: place.description }),
      about && howItWorks(null, about),
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
      { class: 'card profession-card', 'aria-label': t('{name}, poziom {level}', { name: profession.name, level: profession.level }) },
      h(
        'p',
        { class: 'profession-card-head' },
        h('strong', { text: t('Poziom {level}', { level: profession.level }) }),
        h('span', { class: 'muted', text: ` ${t('z {max}', { max: profession.maxLevel })}` }),
      ),
      h('div', { class: 'bar bar--xp', role: 'presentation' }, h('div', { class: 'bar-fill', style: { width: `${share}%` } })),
      h('p', { class: 'muted', text: top ? t('Najwyższy poziom.') : t('Do następnego poziomu: {time} {work}.', { time: formatMinutes(profession.xpToNext - profession.xp), work }) }),
      h('p', { class: 'profession-stats', text: profession.stats.map((stat) => `${stat.name} +${formatNumber(stat.bonus)}`).join(' · ') }),
    );
  }

  // "Odbierz raport" of a work that has ended, the character's or the
  // Awatar's (`avatar`: true the first, 2 the second): its mini-game first
  // (minigame.js; 1006), whose taps go with the claim, or none when skipped
  // or for a work without one.
  function claimButton(avatar) {
    return h('button', {
      type: 'button',
      class: 'button button--system',
      text: t('Odbierz raport'),
      onClick: (event) =>
        withButton(event.currentTarget, async () => {
          const professions = state.character?.professions;
          const work = avatar === 2 ? professions?.avatar?.second?.activity : avatar ? professions?.avatar?.activity : state.character?.activity;
          const played = await playMinigame(work, avatar);
          const body = { ...(avatar === 2 && { avatar: 2 }), ...(played && { minigame: played }) };
          const { report } = await call('POST', avatar ? '/api/avatar/claim' : '/api/hunts/claim', Object.keys(body).length > 0 ? body : undefined);
          // A work the game can no longer finish gave back what it took.
          if (report) openReport(report);
          else toast(t('Tej pracy nie da się już dokończyć. Zabrane rzeczy wróciły.'));
        }),
    });
  }

  // Calling the character or the Awatar (the second: `avatar` 2) back early.
  const cancelWork = (avatar) => call('POST', avatar ? '/api/avatar/cancel' : '/api/hunts/cancel', avatar === 2 ? { avatar: 2 } : undefined);

  function openReport(report) {
    reportCache.set(String(report.id), report);
    state.freshReport = String(report.id);
    navigate(`#/raport/${report.id}`);
  }

  // A work under way: its looping scene (scenes.js), what and for how long,
  // the countdown and its bar, the time of the report, "Przewiń" (`label`
  // names the work) and the button that calls the character, or the Awatar,
  // back; `extra`, what follows them and goes on with the time (the
  // Systemowe Pole's plants), { element, update(done) }.
  function workUnderWay(activity, what, label, cancel, avatar, extra = null) {
    const timer = {
      activity,
      countdown: h('p', { class: 'countdown', 'aria-live': 'off' }),
      progress: h('div', { class: 'bar-fill bar-fill--system' }),
      scene: workScene(activity.profession, activity, { avatar }),
      skipper: skipControl(avatar === 2 ? 'avatar2' : avatar ? 'avatar' : 'activity', (now) => activity.endsAt - now, label),
      extra,
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
        h('p', { class: 'system-hint', text: t('Raport będzie gotowy o {time}. Do tego czasu rozbuduj obóz albo sprawdź zadania.', { time: timeFormat.format(new Date(activity.endsAt)) }) }),
      ),
      timer.skipper.element,
      cancel,
      extra?.element,
    );
    showTimer(timer, serverNow());
    return card;
  }

  // The gathering under way, or its report waiting.
  function gatheringCard(activity, avatar) {
    const names = activity.herbs.map((herb) => herb.name).join(', ');
    if (activityFinished(activity)) {
      return systemPanel(t('Zbieranie zakończone: {herbs}, {time}.', { herbs: names, time: formatMinutes(activity.minutes) }), t('Raport czeka na odbiór.'), claimButton(avatar));
    }
    const cancel = h('button', {
      type: 'button',
      class: 'button button--world',
      text: t('Przerwij zbieranie'),
      onClick: async (event) => {
        const button = event.currentTarget;
        const sure = await confirmAction({
          title: t('Przerwać zbieranie?'),
          text: avatar ? t('Awatar wróci od razu, bez ziół i bez doświadczenia.') : t('Postać wróci od razu, bez ziół i bez doświadczenia.'),
          confirmLabel: t('Przerwij'),
          danger: true,
        });
        if (sure) await withButton(button, () => cancelWork(avatar));
      },
    });
    return workUnderWay(activity, t('Zbieranie w toku: {herbs}, {time}.', { herbs: names, time: formatMinutes(activity.minutes) }), t('Zbieranie'), cancel, avatar);
  }

  // The brewing under way, or its report waiting. Called back early, the
  // character brings the potions done, with their report.
  function brewingCard(activity, avatar) {
    const what = `${activity.count} × ${activity.potion?.name ?? t('mikstura')}`;
    if (activityFinished(activity)) {
      return systemPanel(t('Warzenie zakończone: {what}.', { what }), t('Raport czeka na odbiór.'), claimButton(avatar));
    }
    const cancel = h('button', {
      type: 'button',
      class: 'button button--world',
      text: t('Przerwij warzenie'),
      onClick: async (event) => {
        const button = event.currentTarget;
        const done = Math.min(activity.count, Math.floor((activity.count * (serverNow() - activity.startedAt)) / (activity.endsAt - activity.startedAt)));
        const sure = await confirmAction({
          title: t('Przerwać warzenie?'),
          text:
            done > 0
              ? t('Gotowe mikstury ({count}) trafią do plecaka, a zioła na resztę wrócą.', { count: formatNumber(done) })
              : t('Żadna mikstura nie jest jeszcze gotowa. Zioła wrócą do plecaka.'),
          confirmLabel: t('Przerwij'),
          danger: true,
        });
        if (!sure) return;
        await withButton(button, async () => {
          const { report } = await cancelWork(avatar);
          if (report) openReport(report);
        });
      },
    });
    return workUnderWay(activity, t('Warzenie w toku: {what}, {time}.', { what, time: formatMinutes(activity.minutes) }), t('Warzenie'), cancel, avatar);
  }

  // The order under way, or its report waiting. Called back early, the
  // character brings the items done, with their report.
  function craftingCard(activity, avatar) {
    const what = activity.scroll ? `${activity.count} × ${activity.base.name}` : `${activity.count} × ${activity.base?.name ?? t('przedmiot')} (${activity.rarityName})`;
    if (activityFinished(activity)) {
      return systemPanel(t('Wyrób zakończony: {what}.', { what }), t('Raport czeka na odbiór.'), claimButton(avatar));
    }
    const cancel = h('button', {
      type: 'button',
      class: 'button button--world',
      text: t('Przerwij wyrób'),
      onClick: async (event) => {
        const button = event.currentTarget;
        const done = Math.min(activity.count, Math.floor((activity.count * (serverNow() - activity.startedAt)) / (activity.endsAt - activity.startedAt)));
        const sure = await confirmAction({
          title: t('Przerwać wyrób?'),
          text:
            done > 0
              ? t('Ukończone przedmioty ({count}) zostaną, a części i zasoby na resztę wrócą.', { count: formatNumber(done) })
              : t('Żaden przedmiot nie jest jeszcze ukończony. Części i zasoby wrócą.'),
          confirmLabel: t('Przerwij'),
          danger: true,
        });
        if (!sure) return;
        await withButton(button, async () => {
          const { report } = await cancelWork(avatar);
          if (report) openReport(report);
        });
      },
    });
    return workUnderWay(activity, t('Wyrób w toku: {what}, {time}.', { what, time: formatMinutes(activity.minutes) }), t('Wyrób'), cancel, avatar);
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

    const list = choiceList(t('Zioła'), { multi: slots > 1, unknown: (count) => countOf(count, 'nieznane zioło', 'nieznane zioła', 'nieznanych ziół') });
    const estimate = h('p', { class: 'herb-estimate' });
    const room = h('p', { class: 'herb-room' });
    // How many kinds of herbs at once, and the level of the profession that
    // adds the next (the author's words).
    const next = gathering.slotLevels.find((slot) => slot.herbs > slots);
    const kinds = countOf(slots, 'rodzaj zioła', 'rodzaje ziół', 'rodzajów ziół');
    const slotsHint = h('p', {
      class: 'muted',
      text: next
        ? t('Obecnie możesz zbierać tylko {kinds}. Potrzebujesz wyższego poziomu Profesji, by zbierać więcej rodzajów naraz. Kolejny rodzaj przy poziomie: {level}.', { kinds, level: next.level })
        : t('Obecnie możesz zbierać naraz {kinds}.', { kinds }),
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
        toast(t('Naraz zbierzesz najwyżej {count}.', { count: countOf(slots, 'zioło', 'zioła', 'ziół') }));
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
          meta: slots > 1 ? t('wybrano {count} z {max}', { count: picked.length, max: slots }) : t('w plecaku: {count}', { count: formatNumber(picked[0].count) }),
        },
        known.map((herb) => ({ id: herb.id, art: herbIcon(herb.id), name: herb.name, meta: t('w plecaku: {count}', { count: formatNumber(herb.count) }), on: chosen.includes(herb.id) })),
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
      estimate.textContent = t('Spodziewany zbiór: {herbs}.', { herbs: expected.map(({ herb, low, high }) => `${herb.name} ${low === high ? low : `${low}–${high}`}`).join(', ') });
      const fits = roomFor(chosen);
      room.className = `herb-room${top > fits ? ' herb-room--full' : ''}`;
      room.textContent =
        top > fits
          ? t('W plecaku zmieści się tylko {count} szt. Reszta przepadnie.', { count: formatNumber(fits) })
          : t('W plecaku zmieści się jeszcze {count} szt. {herbs}.', { count: formatNumber(fits), herbs: share === 1 ? t('tego zioła') : t('tych ziół') });
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
      'aria-label': t('Czas zbierania'),
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
    const less = stepButton(-1, t('Krócej'));
    const more = stepButton(1, t('Dłużej'));
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
      text: t('Wyrusz po zioła'),
      onClick: (event) =>
        withButton(event.currentTarget, async () => {
          remember();
          await call('POST', '/api/professions/gather', { herbs: chosen, minutes, ...who.body() });
        }),
    });

    return h(
      'section',
      { class: 'card gather-card', 'aria-labelledby': 'herbs-title' },
      h('h2', { class: 'section-title', id: 'herbs-title', text: t('Zioła') }),
      who.element,
      list.element,
      slotsHint,
      h(
        'div',
        { class: 'duration-picker' },
        h('p', { class: 'duration-head' }, h('span', { class: 'duration-title' }, t('Czas zbierania')), value),
        h('div', { class: 'duration-row' }, less, slider, more),
        h('p', { class: 'duration-scale', 'aria-hidden': 'true' }, h('span', { text: formatMinutes(allowed[0]) }), h('span', { text: formatMinutes(allowed.at(-1)) })),
      ),
      estimate,
      // Past Zielarstwo's mastery, its chance of a herb twice (952.3 A).
      gathering.mastery && h('p', { class: 'muted', text: gathering.mastery }),
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

    const list = choiceList(t('Przepisy'), { unknown: (count) => countOf(count, 'nieznany przepis', 'nieznane przepisy', 'nieznanych przepisów') });
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
      `${t('w plecaku: {count}', { count: formatNumber(each.count) })}${each.most === 0 ? ` · ${t('brak ziół')}` : each.catalyst && each.catalyst.stacks.length === 0 ? ` · ${t('brak katalizatora')}` : ''}`;

    // A grade of a catalyst by its name with the rarity: "Rzadka łuska żmii".
    const stackTitle = (stack) => `${stack.label.charAt(0).toUpperCase()}${stack.label.slice(1)}`;

    // The grades of the catalyst the character has, the one chosen first:
    // the one remembered, or else the commonest.
    function catalystPicker() {
      const { stacks, name } = recipe.catalyst;
      if (stacks.length === 0) {
        fill(catalystBox, h('p', { class: 'herb-room herb-room--full', text: t('Brakuje katalizatora: {name}. Zostawiają go pokonane stwory.', { name }) }));
        return;
      }
      const select = h(
        'select',
        {
          class: 'anvil-material',
          'aria-label': t('Katalizator: {name}', { name }),
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
            text: t('{name}: {count} szt. · {chance}% na dodatkową', { name: stackTitle(stack), count: formatNumber(stack.count), chance: formatNumber(Math.round(stack.chance * 100)) }),
          }),
        ),
      );
      fill(
        catalystBox,
        h('p', { class: 'herb-estimate', text: t('Katalizator: 1 × {name} na miksturę. Rzadszy daje większą szansę na dodatkową miksturę.', { name }) }),
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
      needs.textContent = t('Na jedną miksturę: {herbs}.', {
        herbs: recipe.herbs.map((herb) => t('{count} × {name} (w plecaku {have})', { count: herb.need, name: herb.name, have: formatNumber(herb.have) })).join(', '),
      });
      const stacks = recipe.catalyst?.stacks ?? [];
      catalyst = stacks.find((stack) => stack.key === brewChoice.catalyst) ?? stacks[0] ?? null;
      limit = recipe.catalyst ? Math.min(recipe.most, catalyst?.count ?? 0) : recipe.most;
      lucky.textContent = t('Każda uwarzona mikstura ma {chance}% szans na jedną dodatkową.', { chance: formatNumber(Math.round((catalyst?.chance ?? brewing.bonusChance) * 100)) });
      if (recipe.catalyst) catalystPicker();
      else fill(catalystBox);
      if (recipe.most === 0) {
        fill(
          picker,
          h('p', { class: 'herb-room herb-room--full', text: t('Brakuje ziół na tę miksturę. Zbierzesz je w Zielarstwie.') }),
          h('a', { class: 'button button--world', href: HASHES.herbalism, text: t('Do Zielarstwa') }),
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
        'aria-label': t('Liczba mikstur'),
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
      const less = stepButton(-1, t('Mniej'));
      const more = stepButton(1, t('Więcej'));
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
        estimate.textContent = t('Czas warzenia: {time}. Zużyjesz: {used}.', { time: formatMinutes(workMinutes(count, brewing.potionMinutes)), used });
        const fits = roomFor(count);
        room.className = `herb-room${count > fits ? ' herb-room--full' : ''}`;
        room.textContent =
          count > fits
            ? t('W plecaku zmieści się tylko {count}. Reszta przepadnie.', { count: countOf(fits, 'mikstura', 'mikstury', 'mikstur') })
            : t('W plecaku zmieści się jeszcze {count}.', { count: countOf(fits, 'mikstura', 'mikstury', 'mikstur') });
      }
      set(count);
      const start = h('button', {
        type: 'button',
        class: 'button button--system',
        text: t('Warz mikstury'),
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
          h('p', { class: 'duration-head' }, h('span', { class: 'duration-title' }, t('Liczba mikstur')), value),
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
      h('h2', { class: 'section-title', id: 'recipes-title', text: t('Przepisy') }),
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
    // A slot's pattern for the character's gear comes first: its class's, or
    // its form's own (988: a Nekromanta's kostur, not the Cień's sztylet),
    // by the pattern's kind (classFits).
    const firstFor = (slot) => known(slot).find((pattern) => classFits(pattern, character)) ?? known(slot)[0];
    const rarities = workshop.rarities.filter((rarity) => !rarity.hidden);
    const next = workshop.rarities.find((rarity) => rarity.hidden);
    let slot = workshop.slots.find((candidate) => candidate.id === craftChoice.slot) ?? workshop.slots[0];
    let pattern = known(slot).find((candidate) => candidate.id === craftChoice.pattern) ?? firstFor(slot);
    let rarity = rarities.find((candidate) => candidate.id === craftChoice.rarity) ?? rarities[0];
    let count = 1;
    const partCount = (id) => character.crafting.parts.find((part) => part.id === id)?.count ?? 0;
    const need = (resource) => resource.amount * rarity.step;

    const slotRow = h('div', { class: 'segmented workshop-slots', role: 'group', 'aria-label': t('Rodzaj przedmiotu') });
    const list = choiceList(t('Wzory'), { unknown: (count) => countOf(count, 'nieznany wzór', 'nieznane wzory', 'nieznanych wzorów') });
    const rarityRow = h('div', { class: 'workshop-rarities', role: 'group', 'aria-label': t('Rzadkość') });
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

    // How many items the parts and the camp's resources allow, with no cap
    // of its own (the author, 12.11.2026: "Zrób warsztat i szlifiernie
    // zalezna od czesci i materialow po prostu"); the bag's room does not
    // count, as they wait in the Przechowalnia (842).
    function affordable() {
      const byParts = Math.floor(partCount(rarity.part.id) / pattern.parts);
      const byResources = Math.min(...pattern.resources.map((resource) => Math.floor((character.resources[resource.id] ?? 0) / need(resource))));
      return { byParts, byResources, most: Math.min(byParts, byResources) };
    }

    // For whom a pattern is, from which class level, and whether it came from
    // an item taken apart.
    const forWhom = (each) =>
      [
        each.classNames ? [...each.classNames, ...(each.formNames ?? [])].join(', ') : t('każda klasa'),
        each.classLevel && t('od poz. klasy {level}', { level: each.classLevel }),
        each.learned && t('z rozbiórki'),
      ]
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
      if (byParts === 0) lines.push(t('Brakuje części: {name} (masz {have}, potrzeba {need}).', { name: rarity.part.name, have: formatNumber(partCount(rarity.part.id)), need: formatNumber(pattern.parts) }));
      if (byResources === 0) {
        for (const resource of pattern.resources) {
          const have = character.resources[resource.id] ?? 0;
          if (have < need(resource)) lines.push(t('Brakuje zasobów: {name} (masz {have}, potrzeba {need}).', { name: resource.name, have: formatNumber(have), need: formatNumber(need(resource)) }));
        }
      }
      return [
        lines.map((text) => h('p', { class: 'herb-room herb-room--full', text })),
        byParts === 0 && h('p', { class: 'muted', text: t('Części zrobisz z materiałów na Stole rozbiórki albo kupisz w Skupie złomu.') }),
        byParts === 0 && h('a', { class: 'button button--world', href: TABLE, text: t('Do Stołu rozbiórki') }),
      ];
    }

    // A slider of the items with buttons for one at a time, what they take
    // and how long, the chance, where the items wait (the Przechowalnia, 842)
    // and the start.
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
        'aria-label': t('Liczba przedmiotów'),
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
      const less = stepButton(-1, t('Mniej'));
      const more = stepButton(1, t('Więcej'));
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
        const time =
          count === 1
            ? t('Czas wyrobu jednego przedmiotu: {time}', { time: each })
            : t('Czas wyrobu: {time}, po {each} na przedmiot', { time: formatMinutes(workMinutes(count, rarity.itemMinutes)), each });
        estimate.textContent = t('{time}. Zużyjesz: {used}.', { time, used: used.join(', ') });
      }
      set(count);
      const chance = Math.round(rarity.chance * 100);
      const start = h('button', {
        type: 'button',
        class: 'button button--system',
        text: t('Zacznij wyrób'),
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
          h('p', { class: 'duration-head' }, h('span', { class: 'duration-title' }, t('Liczba przedmiotów')), value),
          h('div', { class: 'duration-row' }, less, slider, more),
          h('p', { class: 'duration-scale', 'aria-hidden': 'true' }, h('span', { text: '1' }), h('span', { text: formatNumber(most) })),
        ),
        estimate,
        h('p', {
          class: 'muted',
          text: rarity.chance >= 1 ? t('Każdy przedmiot tej rzadkości się uda.') : t('Każdy przedmiot ma {chance}% szans na powodzenie. Nieudany zabiera swoje części, a zasoby wracają.', { chance }),
        }),
        h('p', { class: 'muted', text: upgradesText(workshop) }),
        h('p', { class: 'muted', text: luckText(workshop) }),
        h('p', { class: 'muted', text: t('Przedmioty dostaną poziom postaci: {level}.', { level: formatNumber(character.level) }) }),
        h('p', { class: 'muted', text: t('Gotowe przedmioty poczekają w Przechowalni, poza plecakiem.') }),
        start,
      ];
    }

    show();
    return h(
      'section',
      { class: 'card gather-card', 'aria-labelledby': 'patterns-title', 'data-guide': 'workshop-patterns' },
      h('h2', { class: 'section-title', id: 'patterns-title', text: t('Wzory') }),
      who.element,
      slotRow,
      list.element,
      h('h3', { class: 'workshop-subtitle', text: t('Rzadkość') }),
      rarityRow,
      next && h('p', { class: 'muted', text: t('Następna rzadkość: {name}, od {level}. poziomu Rzemieślnictwa.', { name: next.name, level: next.level }) }),
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
                h('strong', { class: 'shop-price', text: t('{count} × {name} za 1', { count: formatNumber(exchange.rate), name: source.name }) }),
                h('span', { text: t('masz {count}', { count: formatNumber(part.count) }) }),
              ),
              h('span', { class: 'item-meta', text: t('{name}: masz {count}', { name: source.name, count: formatNumber(source.count) }) }),
            ),
            h(
              'span',
              { class: 'shop-buttons' },
              exchange.counts.map((count) =>
                h('button', {
                  type: 'button',
                  class: 'button button--world button--small shop-button',
                  disabled: source.count < count * exchange.rate,
                  'aria-label': t('Wymień {given} × {from} na {count} × {to}', { given: formatNumber(count * exchange.rate), from: source.name, count: formatNumber(count), to: part.name }),
                  text: t('Wymień {count}', { count }),
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
    toast(
      t('Wymieniono {given} × {from} na {count} × {to}.', { given: formatNumber(exchanged.given), from: name(exchanged.from), count: formatNumber(exchanged.count), to: name(exchanged.partId) }),
    );
  }

  // The tab of the Przechowalnia, with how many items wait in it.
  const storageLabel = (storage) => (storage.items.length > 0 ? t('Przechowalnia ({count})', { count: formatNumber(storage.items.length) }) : t('Przechowalnia'));

  // The Przechowalnia (the author, 12.11.2026: "Niech w warsztacie będzie
  // przechowalnia niech to nie trafia od razu do plecaka i można od razu z
  // pozycji przechowalni rozbierać i sprzedawać wyprodukowane albo wlozyc do
  // plecaka jesli jest miejsce"): what the Warsztat and the Szlifiernia made
  // waits here, out of the bag, one place for both. A tap marks an item, and
  // the marked ones go to the bag while it has room, to the scrapper for
  // gold, or onto the Stół rozbiórki, as the bag's "Rozbierz kilka" does.
  function storageCard(character) {
    const { items } = character.professions.storage;
    const free = Math.max(0, character.bagCapacity - character.bagUsed);
    for (const id of [...storageMarks]) if (!items.some((item) => item.id === id)) storageMarks.delete(id);
    const chosen = () => items.filter((item) => storageMarks.has(item.id));
    let last = null;
    const described = h('div', { class: 'salvage-last', 'aria-live': 'polite', hidden: true });
    // The item marked last beside what the character wears in its place, as
    // the bag's card and the Targowisko compare them (the author, 13.11.2026:
    // „Niech porównywarka działa też w przechowalni w Warsztacie”).
    const compared = h('div', { class: 'storage-compare', hidden: true });
    const summary = h('p', { class: 'sheet-text', role: 'status' });
    const roomNote = h('p', { class: 'region-warning', hidden: true });
    const button = (kind, className) => h('button', { type: 'button', class: `button ${className}`, onClick: (event) => storageAct(event.currentTarget, kind, chosen()) });
    const toBag = button('take', 'button--system');
    const sell = button('sell', 'button--world');
    const salvage = button('salvage', 'button--world');
    const all = h('button', {
      type: 'button',
      class: 'button button--world button--small',
      onClick: () => {
        const every = chosen().length === items.length;
        for (const item of items) every ? storageMarks.delete(item.id) : storageMarks.add(item.id);
        for (const tile of grid.querySelectorAll('[aria-pressed]')) tile.setAttribute('aria-pressed', String(!every));
        update();
      },
    });
    // The parts the marked items make on the Stół rozbiórki, by kind.
    const partsOf = (marked) => {
      const parts = new Map();
      for (const { salvage: what } of marked) if (what) parts.set(what.part, { color: what.color, count: (parts.get(what.part)?.count ?? 0) + what.parts });
      return [...parts];
    };
    function update() {
      const marked = chosen();
      const gold = marked.reduce((sum, item) => sum + (item.price ?? 0), 0);
      const shown = marked.find((item) => item.id === last) ?? marked.at(-1);
      described.hidden = !shown;
      fill(described, shown && storageItem(shown));
      const comparison = shown && storageComparison(character, shown);
      compared.hidden = !comparison;
      fill(compared, comparison);
      fill(
        summary,
        marked.length === 0
          ? t('Nic jeszcze nie zaznaczono.')
          : [
              t('Zaznaczone: {count}. Złomiarz da za nie {gold} złota, a Stół rozbiórki zrobi z nich:', { count: formatNumber(marked.length), gold: formatNumber(gold) }),
              ' ',
              partsOf(marked).map(([part, { color, count }], index) => [index > 0 && ', ', h('span', { class: 'item-name', vars: { '--rarity': color }, text: `${part} ×${formatNumber(count)}` })]),
              '.',
            ],
      );
      roomNote.hidden = marked.length <= free;
      roomNote.textContent = free === 0 ? t('Plecak jest pełny. Zrób w nim miejsce albo sprzedaj lub rozbierz przedmioty stąd.') : t('W plecaku jest miejsce na {count}.', { count: countOf(free, 'przedmiot', 'przedmioty', 'przedmiotów') });
      const count = formatNumber(marked.length);
      toBag.textContent = t('Do plecaka ({count})', { count });
      sell.textContent = t('Sprzedaj ({count})', { count });
      salvage.textContent = t('Rozbierz ({count})', { count });
      toBag.disabled = marked.length === 0 || marked.length > free;
      sell.disabled = marked.length === 0;
      salvage.disabled = marked.length === 0 || marked.some((item) => !item.salvage || item.salvage.minutes === null);
      all.textContent = marked.length === items.length ? t('Odznacz wszystkie') : t('Zaznacz wszystkie');
    }
    const tile = (item) => {
      const pick = h(
        'button',
        {
          type: 'button',
          class: 'slot slot--bag salvage-pick',
          vars: { '--rarity': item.color },
          'aria-pressed': String(storageMarks.has(item.id)),
          'aria-label': [itemTitle(item), item.rarityName, item.slotName, t('poziom {level}', { level: item.level })].join(', '),
          onClick: () => {
            if (storageMarks.has(item.id)) storageMarks.delete(item.id);
            else {
              storageMarks.add(item.id);
              last = item.id;
            }
            pick.setAttribute('aria-pressed', String(storageMarks.has(item.id)));
            update();
          },
        },
        itemSprite(item) ?? icon('sword', { size: 24 }),
        item.upgrade > 0 && h('span', { class: 'slot-level', text: `+${item.upgrade}` }),
        h('span', { class: 'salvage-check', 'aria-hidden': 'true' }, icon('check', { size: 14 })),
      );
      return h('li', {}, pick);
    };
    const grid = h('ul', { class: 'bag-grid salvage-grid' }, items.map(tile));
    const body =
      items.length === 0
        ? [h('p', { class: 'muted', text: t('Pusto. Tu trafi to, co zrobisz w Warsztacie i w Szlifierni.') })]
        : [
            h('div', { class: 'storage-head' }, h('p', { class: 'muted', text: t('Przedmiotów: {count}. Nie zajmują miejsca w plecaku.', { count: formatNumber(items.length) }) }), all),
            grid,
            h('div', { class: 'salvage-bar salvage-bar--inline' }, described, compared, summary, roomNote, h('div', { class: 'storage-actions' }, toBag, sell, salvage)),
          ];
    update();
    return h(
      'section',
      { class: 'card gather-card', 'aria-labelledby': 'storage-title' },
      h('h2', { class: 'section-title', id: 'storage-title', text: t('Przechowalnia') }),
      h('p', { class: 'muted', text: t('Tu czekają przedmioty z Warsztatu i biżuteria ze Szlifierni. Zaznacz je i włóż do plecaka, sprzedaj złomiarzowi albo rozbierz na Stole rozbiórki.') }),
      body,
    );
  }

  // A marked item of the Przechowalnia beside the one worn in its place,
  // or that nothing is worn there; nothing for an item of another class.
  function storageComparison(character, item) {
    if (!classFits(item, character)) return null;
    const worn = character.equipment?.[item.slot] ?? null;
    return worn ? compareTable(item, worn) : h('p', { class: 'muted', text: t('W miejscu „{slot}” postać nic teraz nie nosi.', { slot: item.slotName }) });
  }

  // A marked item of the Przechowalnia as its card describes it, as the
  // bag's "Rozbierz kilka" shows the one marked last.
  const storageItem = (item) => [
    h('span', { class: 'salvage-last-art', vars: { '--rarity': item.color } }, itemSprite(item) ?? icon('sword', { size: 24 })),
    h(
      'span',
      { class: 'salvage-last-text' },
      h('span', { class: 'item-name', vars: { '--rarity': item.color }, text: itemTitle(item) }),
      h('span', { class: 'item-meta', text: [item.rarityName, item.slotName, t('poz. {level}', { level: item.level }), item.tier].filter(Boolean).join(' · ') }),
      item.properties?.length > 0 && h('span', { class: 'item-stats', text: item.properties.join(' · ') }),
    ),
  ];

  // The marked items of the Przechowalnia to the bag, to the scrapper or
  // onto the Stół rozbiórki (src/server/storage.js).
  async function storageAct(button, kind, items) {
    if (items.length === 0) return;
    await withButton(button, async () => {
      const answer = await call('POST', `/api/professions/storage/${kind}`, { ids: items.map((item) => item.id) });
      for (const item of items) storageMarks.delete(item.id);
      const pieces = (count) => countOf(count, 'przedmiot', 'przedmioty', 'przedmiotów');
      if (answer.salvaged) {
        playSound('build');
        toast(salvagedText(answer.salvaged));
      } else if (answer.sold) {
        playSound('coin');
        toast(t('Złomiarz zapłacił {gold} złota za {count}.', { gold: formatNumber(answer.sold.gold), count: pieces(answer.sold.count) }));
      } else {
        playSound('collect');
        toast(t('W plecaku: {count} z Przechowalni.', { count: pieces(answer.taken.count) }));
      }
    });
  }

  // A scroll for the Kowadło, the Zwoje ochronne or with `which`
  // "steadyScroll" the Zwoje utrwalenia: what they do and how many the
  // character has, then, from the scroll's level, how many to make from the
  // parts there are, with their time, and the start; before it, the level
  // the System shows them at.
  function scrollForm(character, workshop, which = 'scroll') {
    const scroll = workshop[which];
    const titleId = `${scroll.id}-title`;
    const head = [
      h('h2', { class: 'section-title forge-scroll-title', id: titleId }, scrollArt(scroll.id, 32), scroll.name),
      h('p', { class: 'muted', text: scroll.description }),
      h('p', { class: 'herb-estimate', text: t('Masz: {count}.', { count: countOf(scroll.owned, 'zwój', 'zwoje', 'zwojów') }) }),
    ];
    const card = (...children) => h('section', { class: 'card gather-card', 'aria-labelledby': titleId }, head, children);
    if (scroll.hidden) return card(h('p', { class: 'system-hint', text: scroll.hint }));
    const have = character.crafting.parts.find((part) => part.id === scroll.part.id)?.count ?? 0;
    const most = Math.floor(have / scroll.parts);
    const needs = t('Jeden zwój to {count} × {part} i {time}.', { count: formatNumber(scroll.parts), part: scroll.part.name, time: formatMinutes(workMinutes(1, scroll.minutes)) });
    if (most === 0) {
      return card(
        h('p', { class: 'herb-room herb-room--full', text: t('{needs} Masz: {count} × {part}.', { needs, count: formatNumber(have), part: scroll.part.name }) }),
        h('a', { class: 'button button--world', href: TABLE, text: t('Do Stołu rozbiórki') }),
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
      'aria-label': t('Liczba zwojów'),
      onInput: () => set(Number(slider.value)),
    });
    const stepButton = (sign, label) =>
      h('button', { type: 'button', class: 'button button--world duration-step', 'aria-label': label, text: sign < 0 ? '−' : '+', onClick: () => set(count + sign) });
    const less = stepButton(-1, t('Mniej'));
    const more = stepButton(1, t('Więcej'));
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
      const time = count === 1 ? t('Czas jednego zwoju: {time}', { time: each }) : t('Czas: {time}, po {each} na zwój', { time: formatMinutes(workMinutes(count, scroll.minutes)), each });
      estimate.textContent = t('{time}. Zużyjesz: {used}.', { time, used: `${formatNumber(scroll.parts * count)} × ${scroll.part.name}` });
    }
    set(count);
    const start = h('button', {
      type: 'button',
      class: 'button button--system',
      text: t('Zrób zwoje'),
      onClick: (event) =>
        withButton(event.currentTarget, async () => {
          await call('POST', '/api/professions/craft', { scroll: which === 'steadyScroll' ? 'steady' : true, count, ...who.body() });
          window.scrollTo(0, 0);
        }),
    });
    return card(
      who.element,
      h(
        'div',
        { class: 'duration-picker' },
        h('p', { class: 'duration-head' }, h('span', { class: 'duration-title' }, t('Liczba zwojów')), value),
        h('div', { class: 'duration-row' }, less, slider, more),
        h('p', { class: 'duration-scale', 'aria-hidden': 'true' }, h('span', { text: '1' }), h('span', { text: formatNumber(most) })),
      ),
      estimate,
      h('p', { class: 'muted', text: t('Każdy zwój się uda. Zwoje nie zajmują miejsca w plecaku.') }),
      start,
    );
  }

  // A slider of `allowed` minutes with buttons for one step at a time, as
  // for explorations, starting at `start` (an index), for a work's time;
  // `onSet(minutes)` follows every move and `onChange` the end of one.
  function minutesPicker(allowed, start, title, onSet, onChange) {
    let index = start;
    const value = h('output', { class: 'duration-value', 'aria-live': 'off' });
    const slider = h('input', {
      type: 'range',
      class: 'duration-slider',
      min: 0,
      max: allowed.length - 1,
      step: 1,
      value: index,
      'aria-label': title,
      onInput: () => set(Number(slider.value)),
      onChange: () => onChange(),
    });
    const stepButton = (sign, label) =>
      h('button', {
        type: 'button',
        class: 'button button--world duration-step',
        'aria-label': label,
        text: sign < 0 ? '−' : '+',
        onClick: () => {
          set(index + sign);
          onChange();
        },
      });
    const less = stepButton(-1, t('Krócej'));
    const more = stepButton(1, t('Dłużej'));
    function set(next) {
      index = Math.min(allowed.length - 1, Math.max(0, next));
      const minutes = allowed[index];
      slider.value = String(index);
      slider.setAttribute('aria-valuetext', formatMinutes(minutes));
      slider.style.setProperty('--fill', `${(index / Math.max(1, allowed.length - 1)) * 100}%`);
      value.textContent = formatMinutes(minutes);
      less.disabled = index === 0;
      more.disabled = index === allowed.length - 1;
      onSet(minutes);
    }
    const element = h(
      'div',
      { class: 'duration-picker' },
      h('p', { class: 'duration-head' }, h('span', { class: 'duration-title' }, title), value),
      h('div', { class: 'duration-row' }, less, slider, more),
      h('p', { class: 'duration-scale', 'aria-hidden': 'true' }, h('span', { text: formatMinutes(allowed[0]) }), h('span', { text: formatMinutes(allowed.at(-1)) })),
    );
    return { element, start: () => set(index) };
  }

  // What the System still hides, as shadows: a row for each level that
  // shows them, with its words (`unknown(count)` names them: "2 nieznane
  // minerały").
  function shadows(hidden, art, unknown) {
    const levels = [...new Set(hidden.map((each) => each.level))].sort((a, b) => a - b);
    if (levels.length === 0) return null;
    return h(
      'ul',
      { class: 'choice-rows mine-shadows' },
      levels.map((level) => {
        const group = hidden.filter((each) => each.level === level);
        return h(
          'li',
          { class: 'choice-hidden', role: 'img', 'aria-label': `${unknown(group.length)}. ${group[0].hint}` },
          h('span', { class: 'choice-shadows' }, group.map((each) => h('span', { class: 'choice-shadow' }, art(each.id)))),
          h('span', { class: 'choice-meta', text: group[0].hint }),
        );
      }),
    );
  }

  // Górnictwo: the works under way, the Systemowa Kopalnia with how digging
  // goes folded under "Jak to działa?", the level and the form.
  function renderMining(character) {
    const { list, mining } = character.professions;
    const profession = list.find((candidate) => candidate.id === mining.professionId);
    fill(
      container,
      backHeading(profession.name, t('poziom {level}', { level: profession.level }), HOME),
      works(character, 'minerals', miningCard, 'Postać {doing}. Do Kopalni zejdzie po powrocie.'),
      testTools(character, 'minerals', t('Tryb testowy: kopanie skończy się od razu, z tym samym wynikiem.')),
      placeCard(mining.place, mining.about),
      levelCard(profession, t('kopania')),
      anyFree(character) && mineForm(character, mining),
    );
  }

  // The time of a digging, what it should bring of each mineral known and
  // of the veins' gold, the shadows the System still hides and the start.
  function mineForm(character, mining) {
    const who = workerPicker(character);
    const known = mining.minerals.filter((mineral) => !mineral.hidden);
    const allowed = mining.minutes;
    let start = allowed.indexOf(mineChoice.minutes);
    if (start === -1) start = Math.max(0, allowed.indexOf(60));
    let minutes = allowed[start];
    const yields = h('ul', { class: 'herb-found mine-yield', 'aria-label': t('Spodziewany urobek') });
    const gold = h('p', { class: 'herb-estimate mine-gold' });
    const remember = () => {
      mineChoice.minutes = minutes;
      saveChoice(MINE_CHOICE, mineChoice);
    };
    // A count to expect: its range, or the chance of one for a rare gem.
    const expectedText = (expected) => {
      if (expected < 1) return t('szansa ok. {chance}', { chance: percentText(expected) });
      const low = Math.floor(expected * (1 - mining.spread));
      const high = Math.ceil(expected * (1 + mining.spread));
      return low === high ? formatNumber(low) : `${formatNumber(low)}–${formatNumber(high)}`;
    };
    const picker = minutesPicker(
      allowed,
      start,
      t('Czas kopania'),
      (chosen) => {
        minutes = chosen;
        const hours = minutes / 60;
        fill(
          yields,
          known.map((mineral) =>
            h(
              'li',
              { class: 'herb-found-row' },
              h('span', { class: 'herb-art' }, mineralIcon(mineral.id)),
              h('span', { class: 'herb-found-name', text: mineral.name }),
              h('span', { class: 'herb-found-count', text: expectedText(mineral.perHour * hours) }),
            ),
          ),
        );
        fill(gold, goldArt(20), ` ${t('Żyły złota: średnio {gold} złota.', { gold: formatNumber(Math.round(mining.goldPerHour * hours)) })}`);
      },
      remember,
    );
    picker.start();
    const begin = h('button', {
      type: 'button',
      class: 'button button--system',
      text: t('Zejdź do Kopalni'),
      onClick: (event) =>
        withButton(event.currentTarget, async () => {
          remember();
          await call('POST', '/api/professions/mine', { minutes, ...who.body() });
          window.scrollTo(0, 0);
        }),
    });
    return h(
      'section',
      { class: 'card gather-card', 'aria-labelledby': 'mine-title', 'data-guide': 'mining-form' },
      h('h2', { class: 'section-title', id: 'mine-title', text: t('Kopanie') }),
      who.element,
      picker.element,
      h('p', { class: 'duration-title', text: t('Spodziewany urobek') }),
      yields,
      gold,
      // Past Górnictwo's mastery, its chance of a mineral twice (952.4 A).
      mining.mastery && h('p', { class: 'muted', text: mining.mastery }),
      shadows(
        mining.minerals.filter((mineral) => mineral.hidden),
        mineralIcon,
        (count) => countOf(count, 'nieznany minerał', 'nieznane minerały', 'nieznanych minerałów'),
      ),
      begin,
    );
  }

  // The digging under way, or its report waiting. Called back early, the
  // character comes back with nothing, as from the Zagajnik.
  function miningCard(activity, avatar) {
    if (activityFinished(activity)) {
      return systemPanel(t('Kopanie zakończone: {place}, {time}.', { place: activity.placeName, time: formatMinutes(activity.minutes) }), t('Raport czeka na odbiór.'), claimButton(avatar));
    }
    const cancel = h('button', {
      type: 'button',
      class: 'button button--world',
      text: t('Przerwij kopanie'),
      onClick: async (event) => {
        const button = event.currentTarget;
        const sure = await confirmAction({
          title: t('Przerwać kopanie?'),
          text: avatar ? t('Awatar wróci od razu, bez urobku, złota i doświadczenia.') : t('Postać wróci od razu, bez urobku, złota i doświadczenia.'),
          confirmLabel: t('Przerwij'),
          danger: true,
        });
        if (sure) await withButton(button, () => cancelWork(avatar));
      },
    });
    return workUnderWay(activity, t('Kopanie w toku: {place}, {time}.', { place: activity.placeName, time: formatMinutes(activity.minutes) }), t('Kopanie'), cancel, avatar);
  }

  // Rybołówstwo (1057): the works under way, the Systemowy Staw with how
  // fishing goes folded under "Jak to działa?", the level and the form.
  function renderFishing(character) {
    const { list, fishing } = character.professions;
    const profession = list.find((candidate) => candidate.id === fishing.professionId);
    fill(
      container,
      backHeading(profession.name, t('poziom {level}', { level: profession.level }), HOME),
      works(character, 'fish', fishingCard, 'Postać {doing}. Nad Staw wyruszy po powrocie.'),
      testTools(character, 'fish', t('Tryb testowy: połów skończy się od razu, z tym samym wynikiem.')),
      placeCard(fishing.place, fishing.about),
      levelCard(profession, t('łowienia')),
      anyFree(character) && fishForm(character, fishing),
    );
  }

  // The fish to catch, as many kinds at once as the level allows, the time,
  // what the fishing should bring, past the mastery its chance of a fish
  // twice, and the start. The fish go to the Spiżarnia, which has no limit.
  function fishForm(character, fishing) {
    const who = workerPicker(character);
    const known = fishing.fish.filter((fish) => !fish.hidden);
    const slots = fishing.slots;
    // The last choice, without fish no longer known or too many for now.
    let chosen = (fishChoice.fish ?? []).filter((id) => known.some((fish) => fish.id === id)).slice(0, slots);
    if (chosen.length === 0) chosen = [known[0].id];
    const allowed = fishing.minutes;
    let start = allowed.indexOf(fishChoice.minutes);
    if (start === -1) start = Math.max(0, allowed.indexOf(60));
    let minutes = allowed[start];

    const list = choiceList(t('Ryby'), { multi: slots > 1, unknown: (count) => countOf(count, 'nieznana ryba', 'nieznane ryby', 'nieznanych ryb') });
    const estimate = h('p', { class: 'herb-estimate' });
    // How many kinds of fish at once, and the level that adds the next.
    const next = fishing.slotLevels.find((slot) => slot.fish > slots);
    const kinds = countOf(slots, 'rodzaj ryb', 'rodzaje ryb', 'rodzajów ryb');
    const slotsHint = h('p', {
      class: 'muted',
      text: next
        ? t('Obecnie możesz łowić tylko {kinds}. Kolejny rodzaj naraz przy poziomie Rybołówstwa: {level}.', { kinds, level: next.level })
        : t('Obecnie możesz łowić naraz {kinds}.', { kinds }),
    });
    const remember = () => {
      fishChoice.fish = chosen;
      fishChoice.minutes = minutes;
      saveChoice(FISH_CHOICE, fishChoice);
    };

    function toggle(id) {
      if (slots === 1) chosen = [id];
      else if (chosen.includes(id)) chosen = chosen.length > 1 ? chosen.filter((other) => other !== id) : chosen;
      else if (chosen.length < slots) chosen = [...chosen, id];
      else {
        toast(t('Naraz złowisz najwyżej {count}.', { count: kinds }));
        return;
      }
      remember();
      show();
    }

    function show() {
      const picked = chosen.map((id) => known.find((fish) => fish.id === id));
      list.show(
        {
          art: picked.map((fish) => fishIcon(fish.id)),
          name: picked.map((fish) => fish.name).join(', '),
          meta: slots > 1 ? t('wybrano {count} z {max}', { count: picked.length, max: slots }) : t('w Spiżarni: {count}', { count: formatNumber(picked[0].count) }),
        },
        known.map((fish) => ({ id: fish.id, art: fishIcon(fish.id), name: fish.name, meta: t('w Spiżarni: {count}', { count: formatNumber(fish.count) }), on: chosen.includes(fish.id) })),
        fishing.fish.filter((fish) => fish.hidden).map((fish) => ({ art: fishIcon(fish.id), level: fish.level, hint: fish.hint })),
        toggle,
      );
      const share = chosen.length;
      const expected = picked.map((fish) => {
        const middle = (fish.perHour * minutes) / 60 / share;
        const low = Math.max(0, Math.floor(middle * (1 - fishing.spread)));
        const high = Math.ceil(middle * (1 + fishing.spread));
        return `${fish.name} ${low === high ? formatNumber(low) : `${formatNumber(low)}–${formatNumber(high)}`}`;
      });
      estimate.textContent = t('Spodziewany połów: {fish}.', { fish: expected.join(', ') });
    }

    const picker = minutesPicker(
      allowed,
      start,
      t('Czas połowu'),
      (chosenMinutes) => {
        minutes = chosenMinutes;
        show();
      },
      remember,
    );
    picker.start();
    const begin = h('button', {
      type: 'button',
      class: 'button button--system',
      text: t('Wyrusz nad Staw'),
      onClick: (event) =>
        withButton(event.currentTarget, async () => {
          remember();
          await call('POST', '/api/professions/fish', { fish: chosen, minutes, ...who.body() });
          window.scrollTo(0, 0);
        }),
    });
    return h(
      'section',
      { class: 'card gather-card', 'aria-labelledby': 'fish-title' },
      h('h2', { class: 'section-title', id: 'fish-title', text: t('Ryby') }),
      who.element,
      list.element,
      slotsHint,
      picker.element,
      estimate,
      fishing.mastery && h('p', { class: 'muted', text: fishing.mastery }),
      begin,
    );
  }

  // The fishing under way, or its report waiting. Called back early, the
  // character comes back with nothing, as from the Zagajnik.
  function fishingCard(activity, avatar) {
    const names = (activity.fish ?? []).map((fish) => fish.name).join(', ');
    if (activityFinished(activity)) {
      return systemPanel(t('Połów zakończony: {fish}, {time}.', { fish: names, time: formatMinutes(activity.minutes) }), t('Raport czeka na odbiór.'), claimButton(avatar));
    }
    const cancel = h('button', {
      type: 'button',
      class: 'button button--world',
      text: t('Przerwij połów'),
      onClick: async (event) => {
        const button = event.currentTarget;
        const sure = await confirmAction({
          title: t('Przerwać połów?'),
          text: avatar ? t('Awatar wróci od razu, bez ryb i bez doświadczenia.') : t('Postać wróci od razu, bez ryb i bez doświadczenia.'),
          confirmLabel: t('Przerwij'),
          danger: true,
        });
        if (sure) await withButton(button, () => cancelWork(avatar));
      },
    });
    return workUnderWay(activity, t('Połów w toku: {fish}, {time}.', { fish: names, time: formatMinutes(activity.minutes) }), t('Połów'), cancel, avatar);
  }

  // Rolnictwo (1058): the works under way, the Systemowe Pole with how
  // farming goes folded under "Jak to działa?", the level and the field.
  function renderFarming(character) {
    const { list, farming } = character.professions;
    const profession = list.find((candidate) => candidate.id === farming.professionId);
    fill(
      container,
      backHeading(profession.name, t('poziom {level}', { level: profession.level }), HOME),
      works(character, 'crops', (activity, avatar) => farmingCard(activity, avatar, farming), 'Postać {doing}. Na Pole wyjdzie po powrocie.'),
      testTools(character, 'crops', t('Tryb testowy: uprawa skończy się od razu, z tym samym wynikiem.')),
      placeCard(farming.place, farming.about),
      levelCard(profession, t('uprawy')),
      anyFree(character) && farmForm(character, farming),
    );
  }

  // The field before the work (1005.1): a plot for each the level gives,
  // each plot's crop chosen in its sheet (1005.2), "Obsiej puste" and
  // "Wyczyść pole", who works, the time, what the field should bring, past
  // the mastery its chance of a crop twice, and the start. The crops go to
  // the Spiżarnia, which has no limit.
  function farmForm(character, farming) {
    const who = workerPicker(character);
    const known = farming.crops.filter((crop) => !crop.hidden);
    const byId = new Map(known.map((crop) => [crop.id, crop]));
    const count = farming.plots;
    const next = farming.plotLevels.find((tier) => tier.plots > count) ?? null;
    // The last field, without crops no longer known, as many plots as the
    // level gives now (new ones empty); the first time, all of the first
    // crop. `crop`: the last one chosen, which "Obsiej puste" sows.
    const saved = Array.isArray(farmChoice.plots) ? farmChoice.plots : null;
    let plots = Array.from({ length: count }, (_, index) => (saved ? (byId.has(saved[index]) ? saved[index] : null) : known[0].id));
    let crop = byId.has(farmChoice.crop) ? farmChoice.crop : known[0].id;
    const allowed = farming.minutes;
    let start = allowed.indexOf(farmChoice.minutes);
    if (start === -1) start = Math.max(0, allowed.indexOf(60));
    let minutes = allowed[start];

    const remember = () => {
      farmChoice.plots = plots;
      farmChoice.crop = crop;
      farmChoice.minutes = minutes;
      saveChoice(FARM_CHOICE, farmChoice);
    };
    const sow = (next) => {
      plots = next;
      remember();
      show();
    };
    const board = h('div', { class: 'farm-holder' });
    const later = farming.plotLevels.filter((tier) => tier.plots > count).map((tier) => tier.level);
    const legend = h('p', {
      class: 'muted farm-legend',
      text: [
        t('Stuknij grządkę, żeby wybrać, co na niej wyrośnie. Każda grządka może mieć inną roślinę.'),
        later.length > 0 && t('Więcej grządek odblokujesz na {levels} poziomie Rolnictwa.', { levels: levelList(later) }),
      ]
        .filter(Boolean)
        .join(' '),
    });
    const sowEmpty = h('button', { type: 'button', class: 'button button--world button--small', onClick: () => sow(plots.map((id) => id ?? crop)) });
    const clear = h('button', { type: 'button', class: 'button button--world button--small', text: t('Wyczyść pole'), onClick: () => sow(plots.map(() => null)) });
    const estimate = h('p', { class: 'herb-estimate' });
    const begin = h('button', {
      type: 'button',
      class: 'button button--system',
      text: t('Zacznij uprawę'),
      onClick: (event) =>
        withButton(event.currentTarget, async () => {
          remember();
          await call('POST', '/api/professions/farm', { plots, minutes, ...who.body() });
          window.scrollTo(0, 0);
        }),
    });

    // A plot's sheet (1005.2): the crops known, each with its level and
    // about how many it brings an hour from this plot, the field as it would
    // be then (the time is shared evenly among the sown plots); the next
    // crops the System still hides, as shadows; "Anuluj" and "Obsiej: …".
    function chooser(index) {
      let picked = plots[index] ?? crop;
      const sownAfter = plots.filter((id, other) => id && other !== index).length + 1;
      const rows = h('ul', { class: 'choice-rows farm-choices', 'aria-label': t('Rośliny') });
      const confirm = h('button', {
        type: 'button',
        class: 'button button--system',
        onClick: () => {
          crop = picked;
          closeSheet();
          sow(plots.map((id, other) => (other === index ? picked : id)));
        },
      });
      // The soonest of the crops still hidden, one row each (1005.2).
      const hidden = farming.crops
        .filter((one) => one.hidden)
        .slice(0, 3)
        .map((one) =>
          h(
            'li',
            { class: 'choice-hidden', role: 'img', 'aria-label': one.hint },
            h('span', { class: 'choice-shadows' }, h('span', { class: 'choice-shadow' }, cropIcon(one.id))),
            h('span', { class: 'choice-meta', text: one.hint }),
          ),
        );
      function showRows() {
        fill(
          rows,
          known.map((one) =>
            h(
              'li',
              {},
              h(
                'button',
                {
                  type: 'button',
                  class: 'choice-row',
                  'aria-pressed': one.id === picked,
                  onClick: () => {
                    picked = one.id;
                    showRows();
                  },
                },
                h('span', { class: 'choice-art' }, cropIcon(one.id)),
                h(
                  'span',
                  { class: 'choice-text' },
                  h('span', { class: 'choice-name', text: one.name }),
                  h('span', { class: 'choice-meta', text: t('od poz. {level} · ok. {count} szt. na godzinę', { level: one.level, count: formatDecimal(one.perHour / sownAfter) }) }),
                ),
                one.id === picked && icon('check', { size: 18 }),
              ),
            ),
          ),
          hidden,
        );
        confirm.textContent = t('Obsiej: {crop}', { crop: byId.get(picked).name });
      }
      showRows();
      openSheet(
        h('h2', { class: 'sheet-title', text: t('Grządka {number}: co tu wyrośnie?', { number: index + 1 }) }),
        rows,
        h('div', { class: 'sheet-actions' }, h('button', { type: 'button', class: 'button button--world', text: t('Anuluj'), onClick: closeSheet }), confirm),
      );
    }

    function show() {
      const sown = plots.filter(Boolean).length;
      fill(
        board,
        farmBoard(
          plots.map((id, index) =>
            id
              ? farmPlot('sown', { crop: byId.get(id), label: byId.get(id).name, ariaLabel: t('Grządka {number}: {crop}', { number: index + 1, crop: byId.get(id).name }), onClick: () => chooser(index) })
              : farmPlot('empty', { label: t('Obsiej'), ariaLabel: t('Grządka {number}: pusta', { number: index + 1 }), onClick: () => chooser(index) }),
          ),
          next,
        ),
      );
      sowEmpty.textContent = t('Obsiej puste: {crop}', { crop: byId.get(crop).name });
      sowEmpty.disabled = plots.every(Boolean);
      clear.disabled = sown === 0;
      begin.disabled = sown === 0;
      if (sown === 0) {
        estimate.textContent = t('Obsiej co najmniej jedną grządkę.');
        return;
      }
      // Each crop's share of the time: its plots of those sown.
      const counts = new Map();
      for (const id of plots) if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
      const expected = [...counts].map(([id, many]) => {
        const middle = (((byId.get(id).perHour * minutes) / 60) * many) / sown;
        const low = Math.max(0, Math.floor(middle * (1 - farming.spread)));
        const high = Math.ceil(middle * (1 + farming.spread));
        return `${byId.get(id).name} ${low === high ? formatNumber(low) : `${formatNumber(low)}–${formatNumber(high)}`}`;
      });
      estimate.textContent = t('Spodziewane plony: {crops}.', { crops: expected.join(', ') });
    }

    const picker = minutesPicker(
      allowed,
      start,
      t('Czas uprawy'),
      (chosenMinutes) => {
        minutes = chosenMinutes;
        show();
      },
      remember,
    );
    picker.start();
    return h(
      'section',
      { class: 'card farm-card', 'aria-labelledby': 'farm-title' },
      h('h2', { class: 'section-title', id: 'farm-title', text: fieldTitle(count, next) }),
      who.element,
      board,
      legend,
      h('div', { class: 'farm-actions' }, sowEmpty, clear),
      picker.element,
      estimate,
      farming.mastery && h('p', { class: 'muted', text: farming.mastery }),
      begin,
    );
  }

  // The field while it grows (1005.3): each sown plot's plants at the stage
  // the time gone has brought them to (four, the same for all crops), its
  // crop's icon in the corner, and the stage in words; ripe once the work
  // has ended. { element, update(done) }, done the share of the time gone.
  function growingField(activity, farming) {
    const stages = farming.stages.length;
    const plots = activity.plots ?? [];
    const next = farming.plotLevels.find((tier) => tier.plots > plots.length) ?? null;
    const note = h('p', { class: 'farm-stage-note' });
    const images = [];
    const cells = plots.map((one) => {
      if (!one) return farmPlot('fallow', { label: t('pusta') });
      const cell = farmPlot('sown', { crop: one, stage: 1, label: one.name });
      images.push(cell.querySelector('.farm-stage'));
      return cell;
    });
    let shown = 0;
    function update(done) {
      const stage = Math.min(stages, Math.max(1, Math.floor(done * stages) + 1));
      if (stage === shown) return;
      shown = stage;
      for (const image of images) image.src = farmArt.stage(stage);
      note.textContent = [
        t('Stadium: {stage} ({number} z {all}).', { stage: farming.stages[stage - 1], number: stage, all: stages }),
        motionOn() && t('Rośliny kołyszą się na wietrze.'),
      ]
        .filter(Boolean)
        .join(' ');
    }
    return { element: h('section', { class: 'card farm-card', 'aria-label': t('Pole') }, h('h2', { class: 'section-title', text: fieldTitle(plots.length, next) }), farmBoard(cells, next), note), update };
  }

  // The farming under way, its field growing, or its report waiting, the
  // plants ripe. Called back early, the character comes back with nothing,
  // as from the Zagajnik.
  function farmingCard(activity, avatar, farming) {
    const sown = (activity.plots ?? []).filter(Boolean).length;
    const what = countOf(sown, 'grządka', 'grządki', 'grządek');
    const field = growingField(activity, farming);
    if (activityFinished(activity)) {
      field.update(1);
      return h(
        'div',
        { class: 'stack' },
        systemPanel(t('Uprawa zakończona: {plots}, {time}.', { plots: what, time: formatMinutes(activity.minutes) }), t('Raport czeka na odbiór.'), claimButton(avatar)),
        field.element,
      );
    }
    const cancel = h('button', {
      type: 'button',
      class: 'button button--world',
      text: t('Przerwij uprawę'),
      onClick: async (event) => {
        const button = event.currentTarget;
        const sure = await confirmAction({
          title: t('Przerwać uprawę?'),
          text: avatar ? t('Awatar wróci od razu, bez plonów i bez doświadczenia.') : t('Postać wróci od razu, bez plonów i bez doświadczenia.'),
          confirmLabel: t('Przerwij'),
          danger: true,
        });
        if (sure) await withButton(button, () => cancelWork(avatar));
      },
    });
    return workUnderWay(activity, t('Uprawa na Systemowym Polu: {plots}, {time}.', { plots: what, time: formatMinutes(activity.minutes) }), t('Uprawa'), cancel, avatar, field);
  }

  // Gotowanie (1059): the works under way, the Systemowa Kuchnia with how
  // cooking and the meal go folded under "Jak to działa?", the level and
  // the recipes.
  function renderCooking(character) {
    const { list, cooking } = character.professions;
    const profession = list.find((candidate) => candidate.id === cooking.professionId);
    fill(
      container,
      backHeading(profession.name, t('poziom {level}', { level: profession.level }), HOME),
      works(character, 'dishes', cookingCard, 'Postać {doing}. Gotowanie możliwe po powrocie.'),
      testTools(character, 'dishes', t('Tryb testowy: gotowanie skończy się od razu, z tym samym wynikiem.')),
      placeCard(cooking.place, cooking.about),
      levelCard(profession, t('gotowania')),
      anyFree(character) && cookForm(character, cooking),
    );
  }

  // The recipes, as Alchemia's: the recipe chosen with its meal's bonus and
  // what one dish takes (the fish and crops from the Spiżarnia, the herbs
  // from the bag), past the mastery the chance of a dish twice, how many
  // dishes, their time and what they use up, and the start. The dishes go
  // to the Spiżarnia, which has no limit.
  function cookForm(character, cooking) {
    const who = workerPicker(character);
    const known = cooking.dishes.filter((dish) => !dish.hidden);
    let recipe = known.find((candidate) => candidate.id === cookChoice.recipe) ?? known[0];
    let count = 1;
    const list = choiceList(t('Przepisy'), { unknown: (many) => countOf(many, 'nieznany przepis', 'nieznane przepisy', 'nieznanych przepisów') });
    const about = h('p', { class: 'muted' });
    const bonus = h('p', { class: 'herb-estimate cook-bonus' });
    const needs = h('p', { class: 'herb-estimate' });
    const picker = h('div', { class: 'stack' });
    const remember = () => {
      cookChoice.recipe = recipe.id;
      cookChoice.count = count;
      saveChoice(COOK_CHOICE, cookChoice);
    };
    // Where an ingredient is kept, and what it has there.
    const held = (ingredient) =>
      ingredient.group === 'herb'
        ? t('{count} × {name} (w plecaku {have})', { count: ingredient.need, name: ingredient.name, have: formatNumber(ingredient.have) })
        : t('{count} × {name} (w Spiżarni {have})', { count: ingredient.need, name: ingredient.name, have: formatNumber(ingredient.have) });
    const recipeMeta = (each) => `${t('w Spiżarni: {count}', { count: formatNumber(each.count) })}${each.most === 0 ? ` · ${t('brak składników')}` : ''}`;
    // The professions that bring what is missing.
    const SOURCES = { fish: ['fishing', 'Do Rybołówstwa'], crop: ['farming', 'Do Rolnictwa'], herb: ['herbalism', 'Do Zielarstwa'] };

    function choose(id) {
      recipe = known.find((candidate) => candidate.id === id);
      remember();
      show();
    }

    function show() {
      list.show(
        { art: dishIcon(recipe.id), name: recipe.name, meta: recipeMeta(recipe) },
        known.map((each) => ({ id: each.id, art: dishIcon(each.id), name: each.name, meta: recipeMeta(each), on: each.id === recipe.id })),
        cooking.dishes.filter((each) => each.hidden).map((each) => ({ art: dishIcon(each.id), level: each.level, hint: each.hint })),
        choose,
      );
      about.textContent = recipe.description;
      bonus.textContent = t('Posiłek: {bonus} przez {time} wypraw.', { bonus: recipe.bonus, time: formatMinutes(cooking.mealMinutes) });
      needs.textContent = t('Na jedną potrawę: {ingredients}.', { ingredients: recipe.ingredients.map(held).join(', ') });
      if (recipe.most === 0) {
        const missing = [...new Set(recipe.ingredients.filter((ingredient) => ingredient.have < ingredient.need).map((ingredient) => ingredient.group))].filter((group) => SOURCES[group]);
        fill(
          picker,
          h('p', { class: 'herb-room herb-room--full', text: t('Brakuje składników na tę potrawę.') }),
          missing.length > 0 && h('div', { class: 'farm-actions' }, missing.map((group) => h('a', { class: 'button button--world', href: HASHES[SOURCES[group][0]], text: t(SOURCES[group][1]) }))),
        );
        return;
      }
      count = Math.min(recipe.most, Math.max(1, cookChoice.count ?? Math.min(recipe.most, 6)));
      fill(picker, countPicker());
    }

    // A slider of the dishes with buttons for one at a time, the time and
    // what they take, and the start.
    function countPicker() {
      const most = recipe.most;
      const value = h('output', { class: 'duration-value', 'aria-live': 'off' });
      const estimate = h('p', { class: 'herb-estimate' });
      const slider = h('input', {
        type: 'range',
        class: 'duration-slider',
        min: 1,
        max: most,
        step: 1,
        value: count,
        'aria-label': t('Liczba potraw'),
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
      const less = stepButton(-1, t('Mniej'));
      const more = stepButton(1, t('Więcej'));
      function set(next) {
        count = Math.min(most, Math.max(1, next));
        const label = countOf(count, 'potrawa', 'potrawy', 'potraw');
        slider.value = String(count);
        slider.setAttribute('aria-valuetext', label);
        slider.style.setProperty('--fill', `${most > 1 ? ((count - 1) / (most - 1)) * 100 : 100}%`);
        value.textContent = label;
        less.disabled = count === 1;
        more.disabled = count === most;
        const used = recipe.ingredients.map((ingredient) => `${ingredient.need * count} × ${ingredient.name}`).join(', ');
        estimate.textContent = t('Czas gotowania: {time}. Zużyjesz: {used}.', { time: formatMinutes(workMinutes(count, cooking.dishMinutes)), used });
      }
      set(count);
      const start = h('button', {
        type: 'button',
        class: 'button button--system',
        text: t('Gotuj potrawy'),
        onClick: (event) =>
          withButton(event.currentTarget, async () => {
            remember();
            await call('POST', '/api/professions/cook', { recipe: recipe.id, count, ...who.body() });
            window.scrollTo(0, 0);
          }),
      });
      return [
        h(
          'div',
          { class: 'duration-picker' },
          h('p', { class: 'duration-head' }, h('span', { class: 'duration-title' }, t('Liczba potraw')), value),
          h('div', { class: 'duration-row' }, less, slider, more),
          h('p', { class: 'duration-scale', 'aria-hidden': 'true' }, h('span', { text: '1' }), h('span', { text: formatNumber(most) })),
        ),
        estimate,
        h('p', { class: 'muted', text: t('Potrawy trafią do Spiżarni.') }),
        start,
      ];
    }

    show();
    return h(
      'section',
      { class: 'card gather-card', 'aria-labelledby': 'dishes-title' },
      h('h2', { class: 'section-title', id: 'dishes-title', text: t('Przepisy') }),
      who.element,
      list.element,
      about,
      bonus,
      needs,
      cooking.mastery && h('p', { class: 'muted', text: cooking.mastery }),
      picker,
    );
  }

  // The cooking under way, or its report waiting. Called back early, the
  // character brings the dishes done, with their report, and the
  // ingredients for the rest go back.
  function cookingCard(activity, avatar) {
    const what = `${activity.count} × ${activity.dish?.name ?? t('potrawa')}`;
    if (activityFinished(activity)) {
      return systemPanel(t('Gotowanie zakończone: {what}.', { what }), t('Raport czeka na odbiór.'), claimButton(avatar));
    }
    const cancel = h('button', {
      type: 'button',
      class: 'button button--world',
      text: t('Przerwij gotowanie'),
      onClick: async (event) => {
        const button = event.currentTarget;
        const done = Math.min(activity.count, Math.floor((activity.count * (serverNow() - activity.startedAt)) / (activity.endsAt - activity.startedAt)));
        const sure = await confirmAction({
          title: t('Przerwać gotowanie?'),
          text:
            done > 0
              ? t('Gotowe potrawy ({count}) trafią do Spiżarni, a składniki na resztę wrócą.', { count: formatNumber(done) })
              : t('Żadna potrawa nie jest jeszcze gotowa. Składniki wrócą na swoje miejsce.'),
          confirmLabel: t('Przerwij'),
          danger: true,
        });
        if (!sure) return;
        await withButton(button, async () => {
          const { report } = await cancelWork(avatar);
          if (report) openReport(report);
        });
      },
    });
    return workUnderWay(activity, t('Gotowanie w toku: {what}, {time}.', { what, time: formatMinutes(activity.minutes) }), t('Gotowanie'), cancel, avatar);
  }

  // Jubilerstwo: the works under way, its tabs (the jewellery, the setting
  // of gems, the przemiana and the Przechowalnia), the Systemowa Szlifiernia
  // with how the chosen work goes folded under "Jak to działa?", the level
  // and the tab's form.
  function renderJewelcraft(character) {
    const { list, jewelcrafting, storage } = character.professions;
    const profession = list.find((candidate) => candidate.id === jewelcrafting.professionId);
    const setting = jewelTab === 'set';
    const tab = (id, label) =>
      h(
        'button',
        {
          type: 'button',
          class: 'segmented-option',
          'aria-pressed': jewelTab === id,
          // The narrator's Górnictwo chapter points at the Oprawianie tab.
          'data-guide': `jewel-tab-${id}`,
          onClick: () => {
            jewelTab = id;
            render();
          },
        },
        label,
      );
    fill(
      container,
      backHeading(profession.name, t('poziom {level}', { level: profession.level }), HOME),
      works(character, 'jewels', jewelsCard, 'Postać {doing}. Praca w Szlifierni możliwa po powrocie.'),
      testTools(character, 'jewels', t('Tryb testowy: praca skończy się od razu, z tym samym wynikiem.')),
      h(
        'div',
        { class: 'segmented workshop-tabs', role: 'group', 'aria-label': jewelcrafting.place.name },
        tab('craft', t('Biżuteria')),
        tab('set', t('Oprawianie')),
        // The przemiana of gems (913 A): at once, so with no free worker too.
        jewelcrafting.transmute && tab('transmute', t('Przemiana')),
        storage && tab('storage', storageLabel(storage)),
      ),
      jewelTab === 'storage' && storage
        ? storageCard(character)
        : jewelTab === 'transmute' && jewelcrafting.transmute
          ? [
              placeCard(jewelcrafting.place, jewelcrafting.about.transmute),
              transmuteForm({
                chosen: transmuteChoice,
                onChoose: (id) => {
                  transmuteChoice = id;
                  render();
                },
              }),
            ]
          : [
              placeCard(jewelcrafting.place, setting ? jewelcrafting.about.set : jewelcrafting.about.craft),
              levelCard(profession, t('pracy')),
              anyFree(character) && (setting ? setForm(character, jewelcrafting) : jewelForm(character, jewelcrafting)),
            ],
    );
  }

  // The kinds of jewellery, the patterns of the kind chosen (those the
  // System still hides are shadows), the gem, which sets the rarity, how
  // many, what they take, the chance and the time, and the start.
  function jewelForm(character, jewelcrafting) {
    const who = workerPicker(character);
    const known = (slot) => slot.patterns.filter((pattern) => !pattern.hidden);
    const rarities = jewelcrafting.rarities.filter((rarity) => !rarity.hidden);
    const next = jewelcrafting.rarities.find((rarity) => rarity.hidden);
    let slot = jewelcrafting.slots.find((candidate) => candidate.id === jewelChoice.slot) ?? jewelcrafting.slots[0];
    let pattern = known(slot).find((candidate) => candidate.id === jewelChoice.pattern) ?? known(slot)[0];
    let rarity = rarities.find((candidate) => candidate.id === jewelChoice.rarity) ?? rarities[0];
    let count = 1;

    const slotRow = h('div', { class: 'segmented workshop-slots', role: 'group', 'aria-label': t('Rodzaj biżuterii') });
    const list = choiceList(t('Wzory'), { unknown: (count) => countOf(count, 'nieznany wzór', 'nieznane wzory', 'nieznanych wzorów') });
    const rarityRow = h('div', { class: 'workshop-rarities', role: 'group', 'aria-label': t('Kamień') });
    const needs = h('p', { class: 'herb-estimate' });
    const picker = h('div', { class: 'stack' });

    const remember = () => {
      jewelChoice.slot = slot.id;
      jewelChoice.pattern = pattern.id;
      jewelChoice.rarity = rarity.id;
      jewelChoice.count = count;
      saveChoice(JEWEL_CHOICE, jewelChoice);
    };
    function choose(change) {
      change();
      remember();
      show();
    }
    // How many jewels the gems and the ore allow; the bag's room does not
    // count, as they wait in the Przechowalnia (842).
    function affordable() {
      const byGems = rarity.gem.have;
      const byOre = Math.floor(rarity.ore.have / slot.ores);
      return { byGems, byOre, most: Math.min(byGems, byOre) };
    }
    // For whom, from which class level, and whether the pattern came from a
    // jewel taken apart, as in the Warsztat.
    const forWhom = (each) => [t('każda klasa'), each.classLevel && t('od poz. klasy {level}', { level: each.classLevel }), each.learned && t('z rozbiórki')].filter(Boolean).join(' · ');

    function show() {
      fill(
        slotRow,
        jewelcrafting.slots.map((each) =>
          h('button', {
            type: 'button',
            class: 'segmented-option',
            'aria-pressed': each.id === slot.id,
            text: each.name,
            onClick: () =>
              choose(() => {
                slot = each;
                pattern = known(each)[0];
              }),
          }),
        ),
      );
      list.show(
        { art: jewelIcon(pattern.id), name: pattern.name, meta: forWhom(pattern) },
        known(slot).map((each) => ({ id: each.id, art: jewelIcon(each.id), name: each.name, meta: forWhom(each), on: each.id === pattern.id })),
        slot.patterns.filter((each) => each.hidden).map((each) => ({ art: jewelIcon(each.id), level: each.level, hint: each.hint })),
        (id) => choose(() => (pattern = known(slot).find((each) => each.id === id))),
      );
      fill(
        rarityRow,
        rarities.map((each) =>
          h('button', {
            type: 'button',
            class: 'rarity-option',
            'aria-pressed': each.id === rarity.id,
            'aria-label': t('{gem}: rzadkość {rarity}', { gem: each.gem.name, rarity: each.name }),
            vars: { '--rarity': each.color },
            text: each.gem.name,
            onClick: () => choose(() => (rarity = each)),
          }),
        ),
      );
      needs.textContent = t('Rzadkość: {rarity}. Na sztukę: 1 × {gem} (masz {gems}) i {count} × {ore} (masz {ores}).', {
        rarity: rarity.name,
        gem: rarity.gem.name,
        gems: formatNumber(rarity.gem.have),
        count: formatNumber(slot.ores),
        ore: rarity.ore.name,
        ores: formatNumber(rarity.ore.have),
      });
      const plan = affordable();
      if (plan.most === 0) {
        fill(picker, shortage(plan));
        return;
      }
      count = Math.min(plan.most, Math.max(1, jewelChoice.count ?? 1));
      fill(picker, countPicker(plan));
    }

    // What one jewel still lacks, and where gems and ore come from.
    function shortage({ byGems, byOre }) {
      const lines = [];
      if (byGems === 0) lines.push(t('Brakuje kamienia: {name} (masz 0, potrzeba 1).', { name: rarity.gem.name }));
      if (byOre === 0) lines.push(t('Brakuje kruszcu: {name} (masz {have}, potrzeba {need}).', { name: rarity.ore.name, have: formatNumber(rarity.ore.have), need: formatNumber(slot.ores) }));
      return [
        lines.map((text) => h('p', { class: 'herb-room herb-room--full', text })),
        (byGems === 0 || byOre === 0) && h('p', { class: 'muted', text: t('Kamienie i kruszce wydobędziesz w Górnictwie.') }),
        (byGems === 0 || byOre === 0) && h('a', { class: 'button button--world', href: HASHES.mining, text: t('Do Górnictwa') }),
      ];
    }

    // A slider of the jewels with buttons for one at a time, what they take
    // and how long, the chance, where the jewels wait (the Przechowalnia,
    // 842) and the start.
    function countPicker({ byGems, byOre, most }) {
      const value = h('output', { class: 'duration-value', 'aria-live': 'off' });
      const estimate = h('p', { class: 'herb-estimate' });
      const slider = h('input', {
        type: 'range',
        class: 'duration-slider',
        min: 1,
        max: most,
        step: 1,
        value: count,
        'aria-label': t('Liczba sztuk'),
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
      const less = stepButton(-1, t('Mniej'));
      const more = stepButton(1, t('Więcej'));
      function set(nextCount) {
        count = Math.min(most, Math.max(1, nextCount));
        const label = countOf(count, 'sztuka', 'sztuki', 'sztuk');
        slider.value = String(count);
        slider.setAttribute('aria-valuetext', label);
        slider.style.setProperty('--fill', `${most > 1 ? ((count - 1) / (most - 1)) * 100 : 100}%`);
        value.textContent = label;
        less.disabled = count === 1;
        more.disabled = count === most;
        const each = formatMinutes(workMinutes(1, rarity.itemMinutes));
        const time =
          count === 1
            ? t('Czas wyrobu jednej sztuki: {time}', { time: each })
            : t('Czas wyrobu: {time}, po {each} na sztukę', { time: formatMinutes(workMinutes(count, rarity.itemMinutes)), each });
        estimate.textContent = t('{time}. Zużyjesz: {used}.', { time, used: `${formatNumber(count)} × ${rarity.gem.name}, ${formatNumber(count * slot.ores)} × ${rarity.ore.name}` });
      }
      set(count);
      const start = h('button', {
        type: 'button',
        class: 'button button--system',
        text: t('Zacznij wyrób'),
        onClick: (event) =>
          withButton(event.currentTarget, async () => {
            remember();
            await call('POST', '/api/professions/jewel', { baseId: pattern.id, rarity: rarity.id, count, ...who.body() });
            window.scrollTo(0, 0);
          }),
      });
      return [
        h(
          'div',
          { class: 'duration-picker' },
          h('p', { class: 'duration-head' }, h('span', { class: 'duration-title' }, t('Liczba sztuk')), value),
          h('div', { class: 'duration-row' }, less, slider, more),
          h('p', { class: 'duration-scale', 'aria-hidden': 'true' }, h('span', { text: '1' }), h('span', { text: formatNumber(most) })),
        ),
        estimate,
        h('p', {
          class: 'muted',
          text: rarity.chance >= 1 ? t('Każda sztuka tej rzadkości się uda.') : t('Każda sztuka ma {chance} szans na powodzenie. Nieudana zabiera swój kamień, a kruszec wraca.', { chance: percentText(rarity.chance) }),
        }),
        h('p', { class: 'muted', text: t('Biżuteria dostanie poziom postaci: {level}.', { level: formatNumber(character.level) }) }),
        h('p', { class: 'muted', text: t('Gotowa biżuteria poczeka w Przechowalni, poza plecakiem.') }),
        start,
      ];
    }

    show();
    return h(
      'section',
      { class: 'card gather-card', 'aria-labelledby': 'jewels-title', 'data-guide': 'jewel-patterns' },
      h('h2', { class: 'section-title', id: 'jewels-title', text: t('Wzory') }),
      who.element,
      slotRow,
      list.element,
      h('h3', { class: 'workshop-subtitle', text: t('Kamień') }),
      rarityRow,
      next && h('p', { class: 'muted', text: t('Następna rzadkość: {name}, od {level}. poziomu Jubilerstwa.', { name: next.name, level: next.level }) }),
      needs,
      picker,
    );
  }

  // Setting a gem (912 A, the author 13.11.2026: „Przy oprawianiu
  // przedmiotów powinna wyświetlać się karta postaci z ekwipunkiem w
  // odpowiednich miejscach i po prostu powinno się klikać przedmiot i
  // oprawiać”): the character's figure with its worn items in their places,
  // each with a mark of the gem set in it or an empty socket, and the Rdzeń
  // once open; a tap opens a sheet with the item and its gem now, the gem to
  // set (those the System still hides are shadows), what it gives, the time
  // and „Oprawiaj”. A gem already in the item is lost, and only a stronger
  // one takes its place (the author, 13.11.2026). Under the figure „Z
  // plecaka”, the bag's items, which open the same sheet; while the
  // character explores or serves as a mercenary only they do, the figure
  // dim (the author, 20.11.2026: „Dodatkowa rubryka na oprawianiu gdzie są
  // przedmioty z plecaka i w trakcie wyprawy ją tylko można ruszać”).
  function setForm(character, jewelcrafting) {
    // The Rdzeń takes a gem too, once it is open (863 A, screens/core.js).
    const coreSlot = state.content.slots.find((slot) => slot.id === 'core');
    const allGems = jewelcrafting.gems;
    const coreGem = character.core?.gem ? (typeof character.core.gem === 'string' ? allGems.find((gem) => gem.id === character.core.gem) : character.core.gem) : null;
    const core = character.core?.open ? { id: 'core', core: true, name: coreSlot?.name ?? t('Rdzeń'), slotName: t('Artefakty Rdzenia'), gem: coreGem } : null;
    const worn = [...state.content.slots.map((slot) => character.equipment[slot.id]).filter(Boolean), ...(core ? [core] : [])];
    // Every item of the bag takes a gem as a worn one does (settingOrder on
    // the server), the highest level first, then the rarest.
    const rarityRank = (item) => state.content.rarities.findIndex((one) => one.id === item.rarity);
    const bag = [...character.bag].sort((a, b) => b.level - a.level || rarityRank(b) - rarityRank(a));
    // On an exploration or a mercenary's service what the character wears
    // and the Rdzeń wait for its end, as the exploration's report is made
    // with them (requireAtHome on the server).
    const away = buildLocked(character);
    const head = h('h2', { class: 'section-title', id: 'set-title', text: t('Oprawianie') });
    const card = (...children) => h('section', { class: 'card gather-card', 'aria-labelledby': 'set-title', 'data-guide': 'jewel-setting' }, head, children);
    if (worn.length === 0 && bag.length === 0) return card(h('p', { class: 'muted', text: t('Załóż przedmiot, żeby oprawić w nim kamień.') }));
    const gems = allGems.filter((gem) => !gem.hidden);
    const who = workerPicker(character);
    const itemArt = (each) => (each.core ? icon('core', { size: 24 }) : (itemSprite(each) ?? icon('ring', { size: 24 })));
    const titleOf = (each) => (each.core ? each.name : itemTitle(each));
    const gemNow = (each) => (each.gem ? `${each.gem.name} +${percentText(each.gem.bonus)}` : t('bez kamienia'));
    const gemMeta = (each) => `+${percentText(each.bonus)} · ${t('w plecaku: {count}', { count: formatNumber(each.have) })} · ${formatMinutes(each.minutes)}`;
    // A gem's mark on a slot: its picture in a ring of its colour, or a
    // dashed socket when the item has none.
    const gemMark = (gem) => {
      if (!gem) return h('span', { class: 'set-socket', 'aria-hidden': 'true' });
      const mark = h('span', { class: 'set-gem', title: gem.name, 'aria-hidden': 'true' }, mineralSprite(gem.id));
      if (gem.color) mark.style.setProperty('--gem', gem.color);
      return mark;
    };

    // The figure as the Postać tab draws it: the forest (or the bought
    // background) with the class's figure in the character's look, the
    // slots in two columns, and over each worn item its gem's mark.
    const slotButton = (slot) => {
      if (slot.locked) {
        if (!core) return h('span', { class: 'slot slot--core slot--locked', 'aria-hidden': 'true' }, icon('core', { size: 24 }));
        return h(
          'button',
          {
            type: 'button',
            class: 'slot slot--core slot--open',
            'data-guide': `set-slot-${slot.id}`,
            disabled: away,
            'aria-label': t('{slot}: {gem}', { slot: core.name, gem: gemNow(core) }),
            onClick: () => openSetting(core),
          },
          icon('core', { size: 24 }),
          gemMark(core.gem),
        );
      }
      const item = character.equipment[slot.id];
      if (!item) return h('span', { class: 'slot slot--empty', 'aria-hidden': 'true' }, icon(SLOT_ICONS[slot.id], { size: 24 }));
      return h(
        'button',
        {
          type: 'button',
          class: 'slot',
          'data-guide': `set-slot-${slot.id}`,
          disabled: away,
          vars: { '--rarity': item.color },
          'aria-label': t('{slot}: {item}, {gem}', { slot: slot.name, item: itemTitle(item), gem: gemNow(item) }),
          onClick: () => openSetting(item),
        },
        itemSprite(item) ?? icon(SLOT_ICONS[slot.id], { size: 24 }),
        gemMark(item.gem),
      );
    };
    const column = (side) => h('div', { class: `slots slots--${side}` }, state.content.slots.filter((slot) => slot.column === side).map(slotButton));
    const layers = portraitLayers(characterLook(character), character.cosmetics);
    const frame = h('div', { class: `portrait${layers.length > 1 ? ' portrait--framed' : ''}` }, layers, column('left'), column('right'));
    const example = gems[0];
    const legend = h(
      'p',
      { class: 'set-legend muted' },
      example && h('span', {}, gemMark(example), t('oprawiony kamień')),
      h('span', {}, gemMark(null), t('bez kamienia')),
    );

    // „Z plecaka”: each item of the bag with its picture, name and level, and
    // its gem's mark or an empty socket as on the figure; a tap opens the
    // same sheet. A long bag shows SET_BAG_STEP of them, and as many more
    // with each „Pokaż kolejne”.
    const bagRow = (item) =>
      h(
        'button',
        { type: 'button', class: 'item-row set-bag-row', onClick: () => openSetting(item) },
        itemSummary(item),
        h('span', { class: 'set-bag-gem' }, gemMark(item.gem), h('span', { class: 'visually-hidden', text: gemNow(item) })),
      );
    const bagList = h('ul', { class: 'item-list' });
    const more = h('button', { type: 'button', class: 'button button--world', text: t('Pokaż kolejne'), onClick: () => showBag(bagList.childElementCount + SET_BAG_STEP) });
    const showBag = (count) => {
      fill(bagList, bag.slice(0, count).map((item) => h('li', {}, bagRow(item))));
      more.hidden = count >= bag.length;
    };
    showBag(SET_BAG_STEP);
    const bagSection = h(
      'section',
      { class: 'set-bag', 'aria-labelledby': 'set-bag-title' },
      h('h3', { class: 'workshop-subtitle', id: 'set-bag-title', text: t('Z plecaka') }),
      bag.length === 0 ? h('p', { class: 'muted', text: t('W plecaku nie ma przedmiotów do oprawienia.') }) : [bagList, more],
    );

    // The sheet of one item: the item and its gem now, the gem to set and
    // the start, as the tab's form was before.
    function openSetting(item) {
      setChoice.item = item.id;
      // The gem remembered, unless weaker than the one in the item; else the
      // first one the item can take that is in the bag, else the first it can take.
      const fits = (gem) => !(item.gem && (gem.id === item.gem.id || gem.bonus < item.gem.bonus));
      let gem =
        gems.find((candidate) => candidate.id === setChoice.gem && fits(candidate)) ??
        gems.find((candidate) => fits(candidate) && candidate.have > 0) ??
        gems.find(fits) ??
        gems.find((candidate) => candidate.id === setChoice.gem) ??
        gems[0];
      const stones = choiceList(t('Kamienie'), { unknown: (count) => countOf(count, 'nieznany kamień', 'nieznane kamienie', 'nieznanych kamieni') });
      const details = h('div', { class: 'stack' });
      const remember = () => {
        setChoice.gem = gem.id;
        saveChoice(SET_CHOICE, setChoice);
      };
      function show() {
        stones.show(
          { art: mineralIcon(gem.id), name: gem.name, meta: gemMeta(gem) },
          gems.map((each) => ({ id: each.id, art: mineralIcon(each.id), name: each.name, meta: gemMeta(each), on: each.id === gem.id })),
          allGems.filter((each) => each.hidden).map((each) => ({ art: mineralIcon(each.id), level: each.level, hint: each.hint })),
          (id) => {
            gem = gems.find((each) => each.id === id);
            remember();
            show();
          },
        );
        const same = item.gem?.id === gem.id;
        // A gem weaker than the one in the item never takes its place.
        const weaker = !same && Boolean(item.gem) && gem.bonus < item.gem.bonus;
        const start = h('button', {
          type: 'button',
          class: 'button button--system',
          text: t('Oprawiaj'),
          disabled: same || weaker || gem.have === 0,
          onClick: async (event) => {
            const button = event.currentTarget;
            if (item.gem) {
              const sure = await confirmAction({
                title: t('Oprawić nowy kamień?'),
                text: t('{old} w przedmiocie {item} rozpadnie się, a jego miejsce zajmie {gem}.', { old: item.gem.name, item: titleOf(item), gem: gem.name }),
                confirmLabel: t('Oprawiaj'),
                danger: true,
              });
              if (!sure) return;
            }
            await withButton(button, async () => {
              remember();
              await call('POST', '/api/professions/jewel', { set: true, itemId: item.id, gem: gem.id, ...who.body() });
              closeSheet();
              window.scrollTo(0, 0);
            });
          },
        });
        fill(
          details,
          h('p', {
            class: 'herb-estimate',
            text: item.core
              ? t('Wszystkie liczby wchłoniętych Artefaktów wzrosną o {bonus}.', { bonus: percentText(gem.bonus) })
              : t('Wszystkie liczby przedmiotu wzrosną o {bonus}, każda co najmniej o 1.', { bonus: percentText(gem.bonus) }),
          }),
          h('p', { class: 'herb-estimate', text: t('Czas oprawiania: {time}. Zużyjesz: 1 × {gem}.', { time: formatMinutes(gem.minutes), gem: gem.name }) }),
          item.gem && !same && !weaker && h('p', { class: 'herb-room herb-room--full', text: t('Nowy kamień zniszczy obecny: {gem}.', { gem: gemNow(item) }) }),
          same && h('p', { class: 'herb-room', text: item.core ? t('{gem} już tkwi w Rdzeniu.', { gem: gem.name }) : t('{gem} już tkwi w tym przedmiocie.', { gem: gem.name }) }),
          weaker &&
            h('p', {
              class: 'herb-room',
              text: item.core
                ? t('W Rdzeniu tkwi {gem}. Oprawisz w nim tylko mocniejszy kamień.', { gem: item.gem.name })
                : t('W tym przedmiocie tkwi {gem}. Oprawisz w nim tylko mocniejszy kamień.', { gem: item.gem.name }),
            }),
          !weaker && gem.have === 0 && h('p', { class: 'herb-room herb-room--full', text: t('Brakuje kamienia: {gem}. Wydobędziesz go w Górnictwie.', { gem: gem.name }) }),
          !weaker && gem.have === 0 && h('a', { class: 'button button--world', href: HASHES.mining, onClick: closeSheet, text: t('Do Górnictwa') }),
          start,
        );
      }
      show();
      openSheet(
        h('h2', { class: 'sheet-title', text: t('Oprawianie') }),
        h(
          'div',
          { class: 'set-chosen' },
          h('span', { class: 'set-chosen-art', vars: item.core ? {} : { '--rarity': item.color } }, itemArt(item)),
          h('div', {}, h('p', { class: 'item-title', vars: item.core ? {} : { '--rarity': item.color }, text: titleOf(item) }), h('p', { class: 'muted small', text: `${item.slotName} · ${gemNow(item)}` })),
        ),
        h('p', { class: 'duration-title', text: t('Kamień') }),
        stones.element,
        details,
      );
    }

    // Away, a note in the hint's place says why the figure is dim.
    const hint = !away
      ? t('Stuknij przedmiot albo Rdzeń, żeby oprawić w nim kamień.')
      : character.activity.kind === 'mercenary'
        ? t('Na usłudze najemnej oprawisz tylko przedmioty z plecaka.')
        : t('Na wyprawie oprawisz tylko przedmioty z plecaka.');
    return card(
      who.element,
      h('p', { class: 'herb-estimate set-hint', text: hint }),
      h('div', { class: 'set-doll' }, h('div', { class: 'portrait-wrap' }, frame)),
      legend,
      bagSection,
    );
  }

  // A work of the Szlifiernia under way, or its report waiting. Called back
  // early, an order brings the jewels done, with their report, and a
  // setting gives its gem back.
  function jewelsCard(activity, avatar) {
    const set = activity.set && { gem: activity.set.gem, item: activity.set.item };
    const what = !set && `${activity.count} × ${activity.base?.name ?? t('biżuteria')} (${activity.rarityName})`;
    if (activityFinished(activity)) {
      return systemPanel(set ? t('Oprawianie zakończone: {gem} w przedmiocie {item}.', set) : t('Wyrób zakończony: {what}.', { what }), t('Raport czeka na odbiór.'), claimButton(avatar));
    }
    const cancel = h('button', {
      type: 'button',
      class: 'button button--world',
      text: activity.set ? t('Przerwij oprawianie') : t('Przerwij wyrób'),
      onClick: async (event) => {
        const button = event.currentTarget;
        const done = activity.set ? 0 : Math.min(activity.count, Math.floor((activity.count * (serverNow() - activity.startedAt)) / (activity.endsAt - activity.startedAt)));
        const sure = await confirmAction({
          title: activity.set ? t('Przerwać oprawianie?') : t('Przerwać wyrób?'),
          text: activity.set
            ? t('Kamień wróci do plecaka.')
            : done > 0
              ? t('Gotowa biżuteria ({count}) zostanie, a kamienie i kruszec na resztę wrócą.', { count: formatNumber(done) })
              : t('Żadna sztuka nie jest jeszcze gotowa. Kamienie i kruszec wrócą.'),
          confirmLabel: t('Przerwij'),
          danger: true,
        });
        if (!sure) return;
        await withButton(button, async () => {
          const { report } = await cancelWork(avatar);
          if (report) openReport(report);
        });
      },
    });
    const time = formatMinutes(activity.minutes);
    return set
      ? workUnderWay(activity, t('Oprawianie w toku: {gem} w przedmiocie {item}, {time}.', { ...set, time }), t('Oprawianie'), cancel, avatar)
      : workUnderWay(activity, t('Wyrób w toku: {what}, {time}.', { what, time }), t('Wyrób'), cancel, avatar);
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

  function showTimer({ activity, countdown, progress, scene, skipper, extra }, now) {
    skipper.update(now);
    setTimer(countdown, formatCountdown(activity.endsAt - now));
    const done = (now - activity.startedAt) / (activity.endsAt - activity.startedAt);
    progress.style.width = `${Math.min(100, Math.max(0, done * 100))}%`;
    scene?.update(done);
    extra?.update(done);
  }

  render();
  return { update: render, tick };
}

// The XP, the profession's levels and the Time Points of a work's report.
// The Awatar Systemu's work names it, and since 10.11.2026 brings its share
// of the XP and of the levels too (src/server/professions.js, workGains);
// its report from before, with none, names only it.
function workSummary(report) {
  const { summary, profession } = report;
  const gains = !report.avatar || summary.xp > 0 || profession.levelAfter > profession.levelBefore;
  const rows = [
    report.avatar && [t('Wykonawca'), report.avatar === 2 ? t('Drugi Awatar Systemu') : t('Awatar Systemu')],
    gains && [t('XP postaci'), `+${formatNumber(summary.xp)} XP`],
    gains && [
      profession.name,
      profession.levelAfter > profession.levelBefore
        ? t('poziom {before} → {after}', { before: profession.levelBefore, after: profession.levelAfter })
        : t('poziom {level}', { level: profession.levelAfter }),
    ],
    gains && summary.timePoints > 0 && [t('Punkty Czasu'), `+${formatNumber(summary.timePoints)}`],
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
    heading(t('Raport ze zbierania'), `${report.placeName} · ${formatMinutes(report.minutes)} · ${dateTimeFormat.format(new Date(report.endsAt))}`),
    h(
      'section',
      { class: 'card report-summary', 'aria-label': t('Podsumowanie') },
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
            herb.lost > 0 && h('span', { class: 'herb-found-lost', text: t('przepadło {count}', { count: formatNumber(herb.lost) }) }),
          ),
        ),
      ),
      // The herbs the mastery added (952.3 A); an older report has none.
      report.lucky && h('p', { class: 'herb-room herb-room--lucky', text: report.lucky }),
      report.lost && h('p', { class: 'herb-room herb-room--full', text: report.lost }),
      workSummary(report),
    ),
    report.system.length > 0 && systemPanel(...report.system),
    // A card of Talia Systemu the work left (903).
    droppedCardsSection(report.cards),
    h('a', { class: 'button button--system', href: HASHES.herbalism, text: t('Do Zagajnika') }),
  ];
}

// The report of a brewing, in the same way: the workshop's line, the
// potions brewed, the lucky and the lost ones, whether it was stopped, the
// profession's levels, the XP and the System's lines.
export function potionsReport(report, heading) {
  const { potion } = report;
  return [
    heading(t('Raport z warzenia'), `${report.placeName} · ${formatMinutes(report.minutes)} · ${dateTimeFormat.format(new Date(report.endsAt))}`),
    h(
      'section',
      { class: 'card report-summary', 'aria-label': t('Podsumowanie') },
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
          potion.lost > 0 && h('span', { class: 'herb-found-lost', text: t('przepadło {count}', { count: formatNumber(potion.lost) }) }),
        ),
      ),
      report.lucky && h('p', { class: 'herb-room herb-room--lucky', text: report.lucky }),
      report.lost && h('p', { class: 'herb-room herb-room--full', text: report.lost }),
      workSummary(report),
    ),
    report.system.length > 0 && systemPanel(...report.system),
    // A card of Talia Systemu the work left (903).
    droppedCardsSection(report.cards),
    h('a', { class: 'button button--system', href: HASHES.alchemy, text: t('Do Pracowni') }),
  ];
}

// The report of an order in the Warsztat, in the same way: the workshop's
// line, whether it was stopped, the items made (each opens like a find of an
// exploration, by `findSheet`, and is marked like one) and the failed ones,
// the profession's levels, the XP and the System's lines.
export function itemsReport(report, heading, findSheet) {
  return [
    heading(t('Raport z wyrobu'), `${report.placeName} · ${formatMinutes(report.minutes)} · ${dateTimeFormat.format(new Date(report.endsAt))}`),
    h(
      'section',
      { class: 'card report-summary', 'aria-label': t('Podsumowanie') },
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
      // Where they wait: the Przechowalnia (842); an older report has no such line.
      report.stored && h('p', { class: 'muted', text: report.stored }),
      report.failedText && h('p', { class: 'herb-room herb-room--full', text: report.failedText }),
      workSummary(report),
    ),
    report.system.length > 0 && systemPanel(...report.system),
    // A card of Talia Systemu the work left (903).
    droppedCardsSection(report.cards),
    h('a', { class: 'button button--system', href: HASHES.crafting, text: t('Do Warsztatu') }),
  ];
}

// The report of a digging, in the same way: the mine's line, the minerals
// found, the veins of gold, the profession's levels, the XP and the System's
// lines.
export function mineralsReport(report, heading) {
  return [
    heading(t('Raport z kopania'), `${report.placeName} · ${formatMinutes(report.minutes)} · ${dateTimeFormat.format(new Date(report.endsAt))}`),
    h(
      'section',
      { class: 'card report-summary', 'aria-label': t('Podsumowanie') },
      h('p', { class: 'herb-line', text: report.line }),
      h(
        'ul',
        { class: 'herb-found' },
        report.minerals.map((mineral) =>
          h(
            'li',
            { class: 'herb-found-row' },
            h('span', { class: 'herb-art' }, mineralIcon(mineral.id)),
            h('span', { class: 'herb-found-name', text: mineral.name }),
            h('span', { class: 'herb-found-count', text: `×${formatNumber(mineral.count)}` }),
          ),
        ),
      ),
      // The minerals the mastery added (952.4 A); an older report has none.
      report.lucky && h('p', { class: 'herb-room herb-room--lucky', text: report.lucky }),
      h('p', { class: `herb-estimate mine-gold${report.gold > 0 ? ' herb-room--lucky' : ''}` }, report.gold > 0 && goldArt(20), report.gold > 0 ? ` ${report.veinsText}` : report.veinsText),
      workSummary(report),
    ),
    report.system.length > 0 && systemPanel(...report.system),
    // A card of Talia Systemu the work left (903).
    droppedCardsSection(report.cards),
    h('a', { class: 'button button--system', href: HASHES.mining, text: t('Do Kopalni') }),
  ];
}

// The report of a fishing (1057), as of a gathering: the Staw's line, the
// fish caught and those the mastery added, where they went, the
// profession's levels, the XP and the System's lines.
export function fishReport(report, heading) {
  return [
    heading(t('Raport z połowu'), `${report.placeName} · ${formatMinutes(report.minutes)} · ${dateTimeFormat.format(new Date(report.endsAt))}`),
    h(
      'section',
      { class: 'card report-summary', 'aria-label': t('Podsumowanie') },
      h('p', { class: 'herb-line', text: report.line }),
      h(
        'ul',
        { class: 'herb-found' },
        report.fish.map((fish) =>
          h(
            'li',
            { class: 'herb-found-row' },
            h('span', { class: 'herb-art' }, fishIcon(fish.id)),
            h('span', { class: 'herb-found-name', text: fish.name }),
            h('span', { class: 'herb-found-count', text: `×${formatNumber(fish.count)}` }),
          ),
        ),
      ),
      report.lucky && h('p', { class: 'herb-room herb-room--lucky', text: report.lucky }),
      h('p', { class: 'muted', text: t('Ryby trafiły do Spiżarni. Znajdziesz ją w plecaku.') }),
      workSummary(report),
    ),
    report.system.length > 0 && systemPanel(...report.system),
    // A card of Talia Systemu the work left (903).
    droppedCardsSection(report.cards),
    h('a', { class: 'button button--system', href: HASHES.fishing, text: t('Nad Staw') }),
  ];
}

// The report of a farming (1058): the field's line, the field with what
// each plot brought, the crops together and those the mastery added, where
// they went, the profession's levels, the XP and the System's lines.
export function cropsReport(report, heading) {
  const cells = (report.plots ?? []).map((one) => (one ? farmPlot('sown', { crop: one, stage: 4, count: one.count, label: one.name }) : farmPlot('fallow', { label: t('pusta') })));
  return [
    heading(t('Raport z uprawy'), `${report.placeName} · ${formatMinutes(report.minutes)} · ${dateTimeFormat.format(new Date(report.endsAt))}`),
    h(
      'section',
      { class: 'card report-summary', 'aria-label': t('Podsumowanie') },
      h('p', { class: 'herb-line', text: report.line }),
      cells.length > 0 && farmBoard(cells, null, { small: true }),
      h(
        'ul',
        { class: 'herb-found' },
        report.crops.map((crop) =>
          h(
            'li',
            { class: 'herb-found-row' },
            h('span', { class: 'herb-art' }, cropIcon(crop.id)),
            h('span', { class: 'herb-found-name', text: crop.name }),
            h('span', { class: 'herb-found-count', text: `×${formatNumber(crop.count)}` }),
          ),
        ),
      ),
      report.lucky && h('p', { class: 'herb-room herb-room--lucky', text: report.lucky }),
      h('p', { class: 'muted', text: t('Plony trafiły do Spiżarni. Znajdziesz ją w plecaku.') }),
      workSummary(report),
    ),
    report.system.length > 0 && systemPanel(...report.system),
    // A card of Talia Systemu the work left (903).
    droppedCardsSection(report.cards),
    h('a', { class: 'button button--system', href: HASHES.farming, text: t('Na Pole') }),
  ];
}

// The report of a cooking (1059), as of a brewing: the kitchen's line,
// whether it was stopped, the dishes made with their meal's bonus and the
// lucky ones, where they went, the profession's levels, the XP and the
// System's lines.
export function dishesReport(report, heading) {
  const { dish } = report;
  return [
    heading(t('Raport z gotowania'), `${report.placeName} · ${formatMinutes(report.minutes)} · ${dateTimeFormat.format(new Date(report.endsAt))}`),
    h(
      'section',
      { class: 'card report-summary', 'aria-label': t('Podsumowanie') },
      h('p', { class: 'herb-line', text: report.line }),
      report.stopped && h('p', { class: 'muted', text: report.stopped }),
      h(
        'ul',
        { class: 'herb-found' },
        h(
          'li',
          { class: 'herb-found-row' },
          h('span', { class: 'herb-art' }, dishIcon(dish.id)),
          h('span', { class: 'herb-found-name', text: dish.name }),
          h('span', { class: 'herb-found-count', text: `×${formatNumber(dish.count)}` }),
        ),
      ),
      h('p', { class: 'herb-estimate', text: t('Posiłek: {bonus}.', { bonus: dish.meal }) }),
      report.lucky && h('p', { class: 'herb-room herb-room--lucky', text: report.lucky }),
      h('p', { class: 'muted', text: t('Potrawy trafiły do Spiżarni. Wybierzesz je przy wyruszaniu na wyprawę.') }),
      workSummary(report),
    ),
    report.system.length > 0 && systemPanel(...report.system),
    // A card of Talia Systemu the work left (903).
    droppedCardsSection(report.cards),
    h('a', { class: 'button button--system', href: HASHES.cooking, text: t('Do Kuchni') }),
  ];
}

// The report of a work of the Szlifiernia: the place's line, whether it was
// stopped, and either the jewels made (each opens like a find, by
// `findSheet`) and the failed ones, or the gem set with its item and the
// gem it destroyed; then the profession's levels, the XP and the System's
// lines.
export function jewelsReport(report, heading, findSheet) {
  const { set } = report;
  const row = (item) => h('li', {}, h('button', { type: 'button', class: 'item-row', onClick: () => findSheet(item) }, itemSummary(item), findMark(item), icon('chevron', { size: 18 })));
  return [
    heading(set ? t('Raport z oprawiania') : t('Raport z wyrobu biżuterii'), `${report.placeName} · ${formatMinutes(report.minutes)} · ${dateTimeFormat.format(new Date(report.endsAt))}`),
    h(
      'section',
      { class: 'card report-summary', 'aria-label': t('Podsumowanie') },
      h('p', { class: 'herb-line', text: report.line }),
      report.stopped && h('p', { class: 'muted', text: report.stopped }),
      set && h('p', { class: 'herb-found-row' }, h('span', { class: 'herb-art' }, mineralIcon(set.gem.id)), h('span', { class: 'herb-estimate', text: set.text })),
      set?.replaced && h('p', { class: 'herb-room herb-room--full', text: set.replaced }),
      set?.item && h('ul', { class: 'item-list' }, row(set.item)),
      !set && report.made && h('p', { class: 'herb-estimate', text: report.made }),
      !set && report.items.length > 0 && h('ul', { class: 'item-list' }, report.items.map(row)),
      !set && report.stored && h('p', { class: 'muted', text: report.stored }),
      !set && report.failedText && h('p', { class: 'herb-room herb-room--full', text: report.failedText }),
      workSummary(report),
    ),
    report.system.length > 0 && systemPanel(...report.system),
    // A card of Talia Systemu the work left (903).
    droppedCardsSection(report.cards),
    h('a', { class: 'button button--system', href: HASHES.jewelcrafting, text: t('Do Szlifierni') }),
  ];
}

// What a work's report brought, for the journal's row: "Żywokost ×13",
// "Mniejsza mikstura leczenia ×12", "Miecz ×3, nieudane: 1", "Kwarc ×2,
// 170 złota" or "Szmaragd → Wilczy Pierścień", after "Awatar Systemu · " for
// the Awatar's work.
export const workSummaryText = (summary) =>
  (summary.avatar ? `${summary.avatar === 2 ? t('Drugi Awatar Systemu') : t('Awatar Systemu')} · ` : '') +
  [
    ...(summary.herbs ?? summary.potions ?? summary.items ?? summary.minerals ?? summary.fish ?? summary.crops ?? summary.dishes ?? []).map((entry) => `${entry.name} ×${formatNumber(entry.count)}`),
    summary.gold > 0 && t('{gold} złota', { gold: formatNumber(summary.gold) }),
    summary.set && (summary.set.item ? `${summary.set.gem} → ${summary.set.item}` : t('{gem} wrócił do plecaka', { gem: summary.set.gem })),
    summary.failed > 0 && t('nieudane: {count}', { count: formatNumber(summary.failed) }),
  ]
    .filter(Boolean)
    .join(', ');
