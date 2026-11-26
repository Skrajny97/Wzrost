// The Walka tab: explorations in three steps. The main view lists the regions
// (or shows the running exploration and the report to claim). A region shows
// its inner regions as circles, open from the class level each needs. An
// inner region shows the length, the threat level and the start. The
// Portale, the Wieże, the Postrach Krainy and the Kultywacja are tabs beside
// it (combat-modes.js), shown from the start. The code calls explorations
// hunts and inner regions areas. Its texts are written in Polish and shown
// in the page's language (t(), i18n.js).

import { areaArt } from '../area-art.js';
import { dishSprite, landArt, materialSprite, monsterSprite, potionSprite } from '../art.js';
import { bonusList } from '../bonuses.js';
import { askMealSwap } from '../meal.js';
import { leaveView as leaveHistoryView, openView as openHistoryView } from '../history.js';
import { fill, h, icon, setTimer } from '../dom.js';
import { countOf, dateTimeFormat, formatCountdown, formatMinutes, formatNumber, timeFormat } from '../format.js';
import { language, t } from '../i18n.js';
import { preloadReportMusic } from '../music.js';
import { systemPoints } from '../quests.js';
import { walkScene } from '../scenes.js';
import { orbField } from '../orbs.js';
import {
  activityFinished,
  avoidRareOn,
  call,
  currentHp,
  hardHuntOn,
  hellHuntOn,
  huntOptionsOpen,
  isUnlocked,
  reportCache,
  restRate,
  seekRareOn,
  serverNow,
  setAvoidRare,
  setHardHunt,
  setHellHunt,
  setHuntOptionsOpen,
  setSeekRare,
  setTrackQuests,
  setTrackUnknown,
  state,
  testModeOn,
  trackQuestsOn,
  trackUnknownOn,
} from '../state.js';
import { playSound } from '../sound.js';
import { skipControl, timePoints } from '../time.js';
import { formatWait, stableNote, stableWait } from '../stable.js';
import { confirmAction, lockLabel, openSheet, systemLink, systemPanel, toast, withButton } from '../ui.js';
import { openEvent } from '../event.js';
import { partyFree, partyWent, skipLines } from './party.js';
import { clockAt, doingText } from '../party-doing.js';
import { mercenaryChoice, servicePanel } from '../mercenaries.js';
import { combatModes } from '../combat-modes.js';
import { weekLine } from '../weeks.js';
import { omenLines } from '../andrzejki.js';
import { partyGated } from '../party-gate.js';
import { guildHelpStrip } from '../guild-help.js';
import { bannerChip, bannerLine } from '../guild-lands.js';
import { cultivationBusy } from '../cultivation.js';

// Shown through t(), as the page loads its English after this module.
const THREAT_NAMES = { low: 'niskie', moderate: 'umiarkowane', high: 'wysokie', 'very-high': 'bardzo wysokie' };
const CHOICE_KEY = 'wzrost.hunt-choice';
// The potions to take along and the healing mark: { potions: { [id]: count },
// picks: { heal, mana }, strengths: { heal, mana }, counts: { heal, mana },
// healBelow } (picks, their strengths and counts since 959, for the kinds
// chosen from a list).
const POTION_KEY = 'wzrost.potion-choice';
// The dish last chosen to eat as an exploration sets out (mealPicker).
const MEAL_KEY = 'wzrost.meal-choice';
// And how many portions of it at once, when fewer than the most were last
// chosen (mealPicker, 24.11.2026); none for the most.
const MEAL_PORTIONS_KEY = 'wzrost.meal-portions';
// The kinds of potions taken as one choice from a list (959 B), with the
// name of the row.
const POTION_GROUPS = { heal: 'Leczenie', mana: 'Mana' };
const HOME = '#/walka';
// How long a party leader's box "Z drużyną" stands before it is asked again.
const PARTY_FRESH_MS = 20000;

function loadChoice(key = CHOICE_KEY) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? {};
  } catch {
    return {};
  }
}

function saveChoice(choice, key = CHOICE_KEY) {
  try {
    localStorage.setItem(key, JSON.stringify(choice));
  } catch {
    // Without storage the page simply forgets the last choice.
  }
}

// The fights of an exploration of `minutes`, and so the most potions of a
// kind it takes along (potionsPerKind in the engine).
const fightsFor = (use, minutes) => use.fightsByMinutes.filter(([from]) => from <= minutes).at(-1)?.[1] ?? 1;

// What the threat rating depends on, apart from HP.
// Each item whole (an upgrade, a reforged affix or an element keeps its
// id), the skills and the evolution, which goes by the class's name (the
// code review: the threat stayed as before them). The companions who would
// go along too, by the server's mark of them: a hire, a dismissal, a wound
// or a closer bond asks again (the code review, 13.11.2026: it was picked
// up only when the screen opened again).
const buildKey = (character) =>
  JSON.stringify([
    character.level,
    character.classLevel,
    character.className,
    character.maxHp,
    character.stats.map((stat) => stat.total),
    Object.values(character.equipment),
    character.skills,
    character.companionsKey ?? null,
  ]);

// Names in a sentence: "A", "A i B", "A, B i C".
const listNames = (all) => (all.length === 1 ? all[0] : t('{first} i {last}', { first: all.slice(0, -1).join(', '), last: all.at(-1) }));

// The companions who wait wounded and will not go along on an exploration
// till the character has rested to full HP, under the rest's time (a
// player, 16.11.2026: „nie wiesz klikając kolejną wyprawę i idziesz sam bez
// nich”).
function woundedLine(character) {
  const companions = character.woundedCompanions?.companions ?? [];
  if (companions.length === 0) return null;
  const all = companions.map((one) => one.name);
  const names = all.length === 1 ? all[0] : t('{first} i {last}', { first: all.slice(0, -1).join(', '), last: all.at(-1) });
  const female = companions.every((one) => one.appearance === 'female');
  const text =
    companions.length === 1
      ? female
        ? t('{name} jest ranna i nie pójdzie z Tobą na wyprawę, dopóki nie odpoczniesz do pełna HP.', { name: names })
        : t('{name} jest ranny i nie pójdzie z Tobą na wyprawę, dopóki nie odpoczniesz do pełna HP.', { name: names })
      : female
        ? t('{names} są ranne i nie pójdą z Tobą na wyprawę, dopóki nie odpoczniesz do pełna HP.', { names })
        : t('{names} są ranni i nie pójdą z Tobą na wyprawę, dopóki nie odpoczniesz do pełna HP.', { names });
  return h('p', { class: 'region-warning wounded-line' }, icon('heart', { size: 18 }), h('span', { text }));
}

// "bardzo krótka", "krótka"… for a length, from the content.
const lengthName = (minutes) => (state.content.lengths.find((length) => length.upTo === undefined || minutes <= length.upTo) ?? {}).name ?? '';

// Open by the class level, or early in the Sala prób (trial-hall.js; 620 B).
const areaOpen = (area, character) => character.classLevel >= area.unlockClassLevel || character.earlyArea === area.id;

const chip = (text, className = '') => h('span', { class: `chip ${className}`.trim(), text });

// A decimal as the page's language writes it: "2,5" in Polish, "2.5" in English.
const decimal = (text) => (language() === 'pl' ? text.replace('.', ',') : text);

// A chance of meeting a creature: whole percents, below 10% to a tenth.
function chanceText(chance) {
  const percent = chance * 100;
  return `${percent >= 10 ? Math.round(percent) : decimal(percent.toFixed(1))}%`;
}

// A known creature's weak points or resistances under its levels (1074 A):
// "Słaby punkt: sakrum +50%", "Odporność: ogień −13%", each element's name
// in its colour. `entries` are [element, percent text] pairs; none, no line.
function elementLine(label, kind, entries) {
  if (!entries.length) return null;
  return h(
    'span',
    { class: `danger-elements danger-elements--${kind}` },
    h('span', { class: 'danger-elements-label', text: `${label}: ` }),
    entries.map(([element, percent], index) => [
      index > 0 && ', ',
      h('span', { class: 'danger-element', text: element.name, vars: { '--element': element.color } }),
      h('span', { class: 'danger-element-value', text: ` ${percent}` }),
    ]),
  );
}

// The Bestiariusz: the creatures of an inner region with the levels they
// come at and the chance of meeting each in a fight, or of a whole land
// (`land`), all of its inner regions' creatures. One the character has not
// met in a fight yet is only a shadow with "???"; its levels and chance
// show from the start, its weak points and resistances (1074 A) once met:
// the share of more damage from an element, and a resistance as the share
// less against the character's level (reduction in formulas.js); one that
// comes to 0% is left out.
function dangersSheet(place, land = false) {
  const met = new Set(state.character.met ?? []);
  const elements = new Map((state.content.elements ?? []).map((element) => [element.id, element]));
  const { resistK } = state.content;
  const k = resistK ? resistK.base + resistK.perLevel * (state.character.level ?? 1) : Infinity;
  const weakOf = (danger) =>
    Object.entries(danger.weak ?? {})
      .filter(([id, share]) => share > 0 && elements.has(id))
      .map(([id, share]) => [elements.get(id), `+${Math.round(share * 100)}%`]);
  const resistOf = (danger) =>
    Object.entries(danger.resist ?? {})
      .map(([id, value]) => [id, value > 0 ? Math.round((100 * value) / (value + k)) : 0])
      .filter(([id, percent]) => percent > 0 && elements.has(id))
      .map(([id, percent]) => [elements.get(id), `−${percent}%`]);
  const said = (label, entries) => (entries.length ? `, ${label}: ${entries.map(([element, percent]) => `${element.name} ${percent}`).join(', ')}` : '');
  let explained = false;
  openSheet(
    h('h2', { class: 'sheet-title', text: t('Bestiariusz') }),
    h('p', { class: 'sheet-text', text: place.name }),
    h(
      'ul',
      { class: 'danger-list' },
      place.dangers.map((danger) => {
        const known = met.has(danger.monsterId);
        const levels =
          danger.minLevel === danger.maxLevel ? t('poz. {level}', { level: danger.minLevel }) : t('poz. {min}–{max}', { min: danger.minLevel, max: danger.maxLevel });
        const rank = danger.champion ? t('czempion') : danger.elite ? t('elita') : null;
        const chance = danger.chance === undefined ? null : chanceText(danger.chance);
        const weak = known ? weakOf(danger) : [];
        const resist = known ? resistOf(danger) : [];
        if (weak.length || resist.length) explained = true;
        return h(
          'li',
          {
            class: `danger-row${known ? '' : ' danger-row--unknown'}`,
            'aria-label': `${known ? danger.name : t('Nieznany stwór')}, ${levels}${rank ? `, ${rank}` : ''}${said(t('Słaby punkt'), weak)}${said(t('Odporność'), resist)}${chance ? `, ${chance}` : ''}`,
          },
          h('span', { class: 'danger-art' }, monsterSprite(danger.monsterId) ?? icon(danger.family, { size: 28 })),
          h(
            'span',
            { class: 'danger-text' },
            h('span', { class: 'danger-name', text: known ? danger.name : '???' }),
            h('span', { class: `danger-meta${danger.champion ? ' danger-meta--champion' : ''}`, text: rank ? `${levels} · ${rank}` : levels }),
            elementLine(t('Słaby punkt'), 'weak', weak),
            elementLine(t('Odporność'), 'resist', resist),
          ),
          chance && h('span', { class: 'danger-chance', text: chance }),
        );
      }),
    ),
    // What the two lines mean, under a list that has any.
    explained && h('p', { class: 'muted danger-note', text: t('Słaby punkt: tym żywiołem zadasz stworowi więcej. Odporność: tym żywiołem zadasz mniej (procent na Twoim poziomie).') }),
    // The author's sentence, in the feminine for a woman, like the narrator's
    // lines (English has one for both).
    h('p', {
      class: 'muted',
      text:
        state.character.appearance === 'female'
          ? t('Zobaczysz tutaj pełne informacje jedynie o stworach, z którymi stoczyłaś potyczkę.')
          : t('Zobaczysz tutaj pełne informacje jedynie o stworach, z którymi stoczyłeś potyczkę.'),
    }),
    h('p', { class: 'muted', text: t('Skrzynia Bestiariusza dostarcza {chest}, gdy poznasz wszystkie stwory {whose}.', { chest: chestText(place.chest), whose: whose(land) }) }),
  );
}

const whose = (land) => (land ? t('tej krainy') : t('tego regionu'));

// The way to a Bestiariusz, of an inner region or a whole land, with its chest.
export function bestiaryRow(place, land = false) {
  return h(
    'div',
    { class: 'bestiary-row', 'data-guide': `bestiary-${place.id}` },
    h(
      'button',
      { type: 'button', class: 'danger-link', onClick: () => dangersSheet(place, land) },
      icon('beast', { size: 20 }),
      h('span', { text: t('Bestiariusz') }),
      icon('chevron', { size: 18 }),
    ),
    chestButton(place, land),
  );
}

const chestText = (chest) =>
  t('+{gold} złota, +{time} i +{points}', { gold: formatNumber(chest.gold), time: timePoints(chest.timePoints), points: systemPoints(chest.systemPoints) });

// The Bestiariusz chest beside its name, as at the quests: shut, with the
// creatures met so far, until all are met, then ready to open, then open.
// `land`: the chest of a whole land.
function chestButton(place, land = false) {
  const met = new Set(state.character.met ?? []);
  const known = place.dangers.filter((danger) => met.has(danger.monsterId)).length;
  const all = place.dangers.length;
  const opened = (state.character.bestiary ?? []).includes(place.id);
  const ready = !opened && known === all;
  const inside = chestText(place.chest);
  const label = opened
    ? t('Skrzynia Bestiariusza otwarta')
    : ready
      ? t('Otwórz skrzynię Bestiariusza: {inside}', { inside })
      : t('Skrzynia Bestiariusza: {inside}. Poznane stwory: {known} z {all}', { inside, known, all });
  const open = async () => {
    if (opened) {
      toast(t('Ta skrzynia jest już otwarta.'));
      return;
    }
    if (!ready) {
      toast(t('Poznaj wszystkie stwory {whose} ({known} z {all}), a skrzynia się otworzy. W środku: {inside}.', { whose: whose(land), known, all, inside }));
      return;
    }
    const { chest } = await call('POST', '/api/bestiary/chest', land ? { region: place.id } : { area: place.id });
    // Coins spilling from the chest (data/sounds.json).
    playSound('chest');
    toast(t('Skrzynia otwarta: {inside}.', { inside: chestText(chest) }));
  };
  return h(
    'button',
    {
      type: 'button',
      class: `quest-chest quest-chest--${opened ? 'opened' : ready ? 'ready' : 'locked'} bestiary-chest`,
      'aria-label': label,
      onClick: (event) => withButton(event.currentTarget, open),
    },
    h('span', { class: 'quest-chest-art', 'aria-hidden': 'true' }, materialSprite('chest') ?? icon('pouch', { size: 28 })),
    h('span', { class: 'quest-chest-caption', text: opened ? t('Otwarta') : ready ? t('Otwórz') : `${known}/${all}` }),
  );
}

// The region and inner region views go on the browser history (history.js),
// and starting an exploration returns to the main view.
const openView = (event, hash) => openHistoryView(event, hash, 'walka');
const leaveView = (hash, levels) => leaveHistoryView(hash, levels, 'walka');

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
  // The potions to take along on the screen (potionPicker), whose healing
  // ones count in the threat.
  let potions = null;
  // The meal to eat as it sets out (mealPicker), or null.
  let meal = null;
  let loading = false;
  let loadAgain = false;
  let countdown = null;
  let progress = null;
  let shownFinished = null;
  let shownSkip = null;
  // "Przewiń" for the exploration or the rest on the screen, kept right every second.
  let skipper = null;
  // The Drużyna for "Z drużyną", asked once a visit, and the box's tick,
  // kept over the screen's renders (the code review: each render asked the
  // server again and ticked the box anew, also after the leader unticked it).
  let partyAsked = null;
  let partyTicked = true;
  // When it was asked, whether the character leads a party of two or more
  // by the last answer, and how the box on the screen asks again: a
  // leader's box is asked again every PARTY_FRESH_MS while a place is on
  // the screen (tick), so a member back meanwhile shows up in it (a
  // player's bug report, 12.11.2026: a leader who waited on the screen for
  // a member went alone, the box still saying nobody would go).
  let partyAskedAt = 0;
  let partyLeads = false;
  let partyAgain = null;
  // The members a party's trip would take now while "Z drużyną" is ticked
  // (partyChoice), or null: the threat is then the whole party's (gracz
  // (poz. 95), 24.11.2026: „żeby system przeliczał ryzyko wyprawy dla
  // drużyny razem z innymi graczami w drużynie”; partyQuery).
  let partyGoers = null;
  // The shortcut to help in the guild (guild-help.js, 20.11.2026), made once
  // for the visit and kept over the screen's renders.
  const helpStrip = guildHelpStrip();

  // HP in tenths of the maximum: resting moves the threat now and then.
  const hpStep = (character, now) => Math.floor((currentHp(character, now) / character.maxHp) * 10);

  // The threat of the inner region on the screen, one request at a time, so
  // each stays within the server's CPU limit. The rating follows the whole
  // character, so a change of level, class level, stats, equipment or HP
  // asks again. Until the new answer comes, a new build shows "…", while
  // resting keeps the old rating.
  // After a failed request the threat waits half a minute before asking
  // again and says so once (the code review: offline, it asked and showed a
  // message every second).
  let retryAt = 0;
  let failed = false;
  async function loadOptions() {
    if (loading) {
      loadAgain = true;
      return;
    }
    if (Date.now() < retryAt) return;
    loading = true;
    try {
      do {
        loadAgain = false;
        const areaId = shownArea;
        const character = state.character;
        if (!areaId || !character || character.activity) return;
        const build = buildKey(character);
        const hp = hpStep(character, serverNow());
        const healing = healingQuery();
        const hard = hardQuery();
        const party = partyKey();
        const known = options[areaId];
        if (known && known.build === build && known.hp === hp && known.healing === healing && known.hard === hard && known.party === party) continue;
        const { areas } = await call('GET', `/api/hunts/options?area=${encodeURIComponent(areaId)}${healing}${hard}${party ? '&party=1' : ''}`);
        const [found] = areas;
        options[areaId] = {
          build,
          hp,
          healing,
          hard,
          party,
          // Whether the server counted the party: without a member to take
          // the threat is the character's own.
          partyCounted: Boolean(found.party),
          threat: found.threat,
          threatAvoiding: found.threatAvoiding,
          threatSeeking: found.threatSeeking,
          chances: found.chances,
          chancesSeeking: found.chancesSeeking,
          scout: found.scout,
        };
        showThreat?.();
      } while (loadAgain);
      failed = false;
    } catch (error) {
      retryAt = Date.now() + 30000;
      if (!failed) toast(error.message);
      failed = true;
    } finally {
      loading = false;
    }
  }

  // The threat of a Drużyna's trip: while "Z drużyną" is ticked with members
  // to take, the server counts them all as the trip would go ("&party=1",
  // hunts.js: huntOptions), and a change of who goes asks again; before
  // 24.11.2026 it was the character's alone (926 B).
  const partyKey = () => (partyGoers?.length > 0 ? partyGoers.join('|') : '');

  // A Trudna wyprawa for the threat (629 A): "&hard=1" while its box is
  // ticked, where the character has it; a Piekielna's "&hell=1" the same.
  // So with "Z drużyną" ticked too, as the party's trip goes in it
  // (parties.js), for the whole party (partyKey).
  function hardQuery() {
    if (state.character?.hellHunt && hellHuntOn()) return '&hell=1';
    return state.character?.hardHunt && hardHuntOn() ? '&hard=1' : '';
  }

  // The healing potions taken along, for the threat: "&heal=2&below=0.4",
  // with the kind chosen from the list (959); and the mana potions,
  // "&mana=3&manaKind=mana", which its explorations with companions drink
  // too, as the mana goes on from fight to fight (1220 B).
  function healingQuery() {
    const healing = potions?.healing();
    const mana = potions?.mana();
    const heal = healing && healing.count > 0 ? `&heal=${healing.count}&below=${healing.below}${healing.kind ? `&kind=${encodeURIComponent(healing.kind)}` : ''}` : '';
    return heal + (mana && mana.count > 0 ? `&mana=${mana.count}${mana.kind ? `&manaKind=${encodeURIComponent(mana.kind)}` : ''}` : '');
  }

  function render() {
    const character = state.character;
    const activity = character.activity;
    shownFinished = activityFinished(activity);
    shownSkip = skipKind(character);
    countdown = null;
    progress = null;
    skipper = null;
    shownArea = null;
    showThreat = null;
    potions = null;
    meal = null;

    // While the character is away, every view shows the exploration. The
    // main view has the shortcut to help in the guild under the top bar
    // while someone waits for it (guild-help.js, 20.11.2026), the week of
    // the year (weeks.js) and the Andrzejki omens running under it
    // (andrzejki.js, 1082 C). The fortune evenings' card is at the
    // Zaklinaczka's in the Osada (24.11.2026).
    if (activity || !region) {
      fill(
        container,
        helpStrip,
        weekLine(character),
        omenLines(character),
        h('div', { class: 'page-heading' }, h('h1', { class: 'page-title', tabindex: '-1', text: t('Walka') })),
        modeTabs(),
        testTools(),
        partyReportNote(character),
        activity ? [activityCard(activity), wantedStrip(character)] : regionList(character),
      );
      return;
    }
    if (!area) {
      fill(
        container,
        backHeading(region.name, t('poz. {min}–{max}', { min: region.minLevel, max: region.maxLevel }), () => leaveView(HOME, 1)),
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
      open ? areaView(character) : systemPanel(t('To miejsce odblokujesz na poziomie klasy {level}.', { level: area.unlockClassLevel })),
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
      h('button', { type: 'button', class: 'button button--system back-button', onClick: onBack }, icon('back', { size: 20 }), t('Powrót')),
    );
  }

  // What "Pomiń czas" would skip now: the hunt, the rest, or nothing.
  function skipKind(character, now = serverNow()) {
    if (!state.user.testMode || !testModeOn()) return null;
    if (character.activity) return activityFinished(character.activity, now) || character.activity.kind !== 'hunt' ? null : 'hunt';
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
            ? t('Tryb testowy: wyprawa skończy się od razu, z tym samym wynikiem.')
            : t('Tryb testowy: HP wróci od razu do pełna.'),
      }),
      h('button', {
        type: 'button',
        class: 'button button--test',
        text: t('Pomiń czas'),
        onClick: (event) => withButton(event.currentTarget, () => call('POST', '/api/test/skip-time')),
      }),
    );
  }

  // The switch over the Walka's parts (combat-modes.js), the Eksploracja
  // pressed.
  const modeTabs = () => combatModes('explore', navigate);

  function activityCard(activity) {
    // A mercenary's offer or service lives in the Karczma (mercenaries.js).
    if (activity.kind === 'mercenary') return servicePanel(activity);
    // A Kultywacja lives on its own tab (cultivation.js): here a line, as
    // the character sets out on no exploration meanwhile, with the way there.
    if (activity.kind === 'cultivation') return cultivationBusy(activity);
    // A gathering of herbs, a brewing of potions and an order of items live
    // on their own screens; here they only say so.
    if (activity.kind === 'herbs') {
      return systemPanel(
        activityFinished(activity) ? t('Zbieranie ziół zakończone. Raport czeka w Zielarstwie.') : t('Postać zbiera zioła w miejscu: {place}.', { place: activity.placeName }),
        h('a', { class: 'button button--system', href: '#/profesje/zielarstwo', text: t('Do Zielarstwa') }),
      );
    }
    if (activity.kind === 'potions') {
      return systemPanel(
        activityFinished(activity) ? t('Warzenie mikstur zakończone. Raport czeka w Alchemii.') : t('Postać warzy mikstury w miejscu: {place}.', { place: activity.placeName }),
        h('a', { class: 'button button--system', href: '#/profesje/alchemia', text: t('Do Alchemii') }),
      );
    }
    if (activity.kind === 'items') {
      return systemPanel(
        activityFinished(activity) ? t('Wyrób przedmiotów zakończony. Raport czeka w Rzemiośle.') : t('Postać wykonuje przedmioty w miejscu: {place}.', { place: activity.placeName }),
        h('a', { class: 'button button--system', href: '#/profesje/rzemieslnictwo', text: t('Do Rzemiosła') }),
      );
    }
    if (activity.kind === 'minerals') {
      return systemPanel(
        activityFinished(activity) ? t('Kopanie zakończone. Raport czeka w Górnictwie.') : t('Postać kopie w miejscu: {place}.', { place: activity.placeName }),
        h('a', { class: 'button button--system', href: '#/profesje/gornictwo', text: t('Do Górnictwa') }),
      );
    }
    if (activity.kind === 'jewels') {
      return systemPanel(
        activityFinished(activity) ? t('Praca w Szlifierni zakończona. Raport czeka w Jubilerstwie.') : t('Postać pracuje w miejscu: {place}.', { place: activity.placeName }),
        h('a', { class: 'button button--system', href: '#/profesje/jubilerstwo', text: t('Do Jubilerstwa') }),
      );
    }
    if (activity.kind === 'fish') {
      return systemPanel(
        activityFinished(activity) ? t('Połów zakończony. Raport czeka w Rybołówstwie.') : t('Postać łowi ryby w miejscu: {place}.', { place: activity.placeName }),
        h('a', { class: 'button button--system', href: '#/profesje/rybolowstwo', text: t('Do Rybołówstwa') }),
      );
    }
    if (activity.kind === 'dishes') {
      return systemPanel(
        activityFinished(activity) ? t('Gotowanie zakończone. Raport czeka w Gotowaniu.') : t('Postać gotuje w miejscu: {place}.', { place: activity.placeName }),
        h('a', { class: 'button button--system', href: '#/profesje/gotowanie', text: t('Do Gotowania') }),
      );
    }
    if (activity.kind === 'crops') {
      return systemPanel(
        activityFinished(activity) ? t('Uprawa zakończona. Raport czeka w Rolnictwie.') : t('Postać uprawia pole w miejscu: {place}.', { place: activity.placeName }),
        h('a', { class: 'button button--system', href: '#/profesje/rolnictwo', text: t('Do Rolnictwa') }),
      );
    }
    preloadReportMusic();
    if (activityFinished(activity)) {
      const claim = h('button', {
        type: 'button',
        class: 'button button--system',
        'data-guide': 'claim',
        text: t('Odbierz raport'),
        onClick: (event) =>
          withButton(event.currentTarget, async () => {
            const open = (report) => {
              reportCache.set(String(report.id), report);
              state.freshReport = String(report.id);
              navigate(`#/raport/${report.id}`);
            };
            // An event at the exploration's end comes before the report.
            const answer = await call('POST', '/api/hunts/claim');
            if (answer.event) openEvent(answer.event, open);
            else open(answer.report);
          }),
      });
      return h(
        'div',
        { class: 'stack' },
        partySkips(activity),
        partyClaimed(activity),
        systemPanel(t('Eksploracja zakończona: {area}, {time}.', { area: activity.areaName, time: formatMinutes(activity.minutes) }), t('Raport czeka na odbiór.'), claim),
      );
    }

    countdown = h('p', { class: 'countdown', 'aria-live': 'off' });
    progress = h('div', { class: 'bar-fill bar-fill--system' });
    const cancel = h('button', {
      type: 'button',
      class: 'button button--world',
      text: t('Przerwij eksplorację'),
      onClick: async (event) => {
        const button = event.currentTarget;
        // On a Drużyna's trip only the one who stops comes back: the others
        // who went go on with it to its end (0.0.75, trips.js), and it says
        // so, with when they are back (25.11.2026: a leader who had stopped
        // saw its members „na wyprawie” and could take none of them).
        const goOn = (activity.party?.names ?? []).some((name) => name !== state.character.name);
        const sure = await confirmAction({
          title: t('Przerwać eksplorację?'),
          text: [
            t('Postać wróci od razu, bez doświadczenia, złota i łupów.'),
            goOn && t('Wraca tylko ona: reszta drużyny idzie dalej i wróci o {time}.', { time: clockAt(activity.endsAt, serverNow()) }),
          ]
            .filter(Boolean)
            .join(' '),
          confirmLabel: t('Przerwij'),
          danger: true,
        });
        if (sure) await withButton(button, () => call('POST', '/api/hunts/cancel'));
      },
    });
    // A Drużyna's trip shares its timer: a skip shortens it for everyone.
    skipper = skipControl('activity', (now) => activity.endsAt - now, activity.party ? t('Wyprawa drużyny, dla wszystkich') : t('Eksploracja'));
    const scene = walkScene(activity);
    const card = h(
      'div',
      { class: 'stack' },
      partySkips(activity),
      partyClaimed(activity),
      // With the Kulki Systemu over it (orbs.js).
      ...(scene ? [orbField(activity, scene.element)] : []),
      systemPanel(
        t('Eksploracja w toku: {area}, {time}.', { area: activity.areaName, time: formatMinutes(activity.minutes) }),
        countdown,
        h('div', { class: 'bar bar--system' }, progress),
        ...(activity.avoidRare ? [h('p', { class: 'system-hint', text: t('Postać omija elity i czempionów.') })] : []),
        ...(activity.seekRare ? [h('p', { class: 'system-hint', text: t('Postać tropi elity i czempiony.') })] : []),
        ...(activity.hard ? [h('p', { class: 'system-hint', text: t('Trudna wyprawa: silniejsze stwory, więcej XP i złota.') })] : []),
        ...(activity.hell ? [h('p', { class: 'system-hint', text: t('Piekielna wyprawa: dużo silniejsze stwory, więcej XP, złota i łupów.') })] : []),
        ...(activity.mercenary
          ? [h('p', { class: 'system-hint', text: t('Najemnik: {name}, zapłata {gold} zł.', { name: activity.mercenary.name, gold: formatNumber(activity.mercenary.gold) }) })]
          : []),
        ...(activity.tracksQuests ? [h('p', { class: 'system-hint', text: t('Postać tropi stwory z zadań.') })] : []),
        // The Stajnia's mount made the wait shorter than the length (327 A).
        ...(activity.endsAt - activity.startedAt < activity.minutes * 60000
          ? [h('p', { class: 'system-hint', text: t('Z wierzchowcem: {time}.', { time: formatWait(activity.endsAt - activity.startedAt) }) })]
          : []),
        ...(activity.party ? [h('p', { class: 'system-hint', text: t('Wyprawa drużyny ma wspólny czas: przewinięcie skraca ją wszystkim.') })] : []),
        h('p', {
          class: 'system-hint',
          text: t('Raport będzie gotowy o {time}. Do tego czasu rozbuduj obóz albo sprawdź zadania.', { time: timeFormat.format(new Date(activity.endsAt)) }),
        }),
      ),
      skipper.element,
      cancel,
    );
    tick(serverNow());
    return card;
  }

  // Step one: the regions.
  function regionList(character) {
    const first = character.level === 1 && character.xp === 0;
    const unarmed = !character.equipment.weapon;
    return h(
      'div',
      { class: 'stack' },
      restSkip(character),
      first
        ? systemPanel(t('Wiatrołomy to najbezpieczniejsze miejsce na start. Wybierz czas eksploracji i wyrusz.'))
        : unarmed && systemPanel(t('Walczysz gołymi rękami. Załóż broń z plecaka w zakładce Postać, jeśli już ją masz.')),
      wantedStrip(character),
      landList(character),
    );
  }

  // The lands open to the character as cards, the one of its level marked,
  // and the lands still shut folded into one row under them (993).
  function landList(character) {
    const lands = state.content.regions;
    const open = lands.filter((candidate) => candidate.areas.some((place) => areaOpen(place, character)));
    const shut = lands.filter((candidate) => !open.includes(candidate));
    const yours =
      open.find((candidate) => character.level >= candidate.minLevel && character.level <= candidate.maxLevel) ?? open.at(-1);
    return [
      ...open.map((candidate) => regionLink(candidate, character, candidate === yours)),
      shut.length > 0 && laterLands(shut),
    ];
  }

  function laterLands(shut) {
    return h(
      'details',
      { class: 'card region-later' },
      h(
        'summary',
        { class: 'region-later-head' },
        h('span', { class: 'region-later-title', text: t('Kolejne krainy ({count})', { count: shut.length }) }),
        h('span', { class: 'region-later-from', text: t('od poz. klasy {level}', { level: shut[0].areas[0].unlockClassLevel }) }),
        icon('chevron', { size: 20 }),
      ),
      h(
        'div',
        { class: 'region-later-list' },
        shut.map((candidate) => {
          const hash = `${HOME}/${candidate.id}`;
          const art = landArt(candidate.id);
          const thumb = h('span', { class: 'region-later-art' });
          if (art) thumb.style.setProperty('--land-art', `url("${art}")`);
          return h(
            'a',
            { class: 'region-later-row', href: hash, onClick: (event) => openView(event, hash) },
            thumb,
            h(
              'span',
              { class: 'region-later-text' },
              h('strong', { text: candidate.name }),
              h('span', { text: t('poz. {min}–{max}', { min: candidate.minLevel, max: candidate.maxLevel }) }),
            ),
            lockLabel(t('poz. klasy {level}', { level: candidate.areas[0].unlockClassLevel })),
          );
        }),
      ),
    );
  }

  // The wanted poster in hand from the Osada's Tablica zleceń (the
  // character's `wanted`, characters.js): its target and where to seek it,
  // a tap away from its place, and once the target has fallen, the way to
  // its bounty on the Tablica (a player's remark, 12.11.2026: „w okienku
  // wypraw fajnie byłoby widzieć, które zlecenie na elitę obecnie mamy
  // wybrane z tablicy zleceń”). On its own place's screen (`here`) it
  // leads nowhere while its target stands.
  function wantedStrip(character, here = false) {
    const poster = character.wanted;
    if (!poster) return null;
    const land = state.content.regions.find((candidate) => candidate.areas.some((place) => place.id === poster.areaId));
    const link = poster.beaten ? '#/osada/board/wanted' : !here && land ? `${HOME}/${land.id}/${poster.areaId}` : null;
    return h(
      link ? 'a' : 'div',
      {
        class: `wanted-strip${poster.beaten ? ' wanted-strip--beaten' : ''}`,
        ...(link && { href: link }),
        ...(link && !poster.beaten && { onClick: (event) => openView(event, link) }),
      },
      h('span', { class: 'wanted-strip-art' }, monsterSprite(poster.monsterId)),
      h(
        'span',
        { class: 'wanted-strip-text' },
        h('span', { class: 'wanted-strip-label', text: poster.label }),
        h('strong', { class: 'wanted-strip-name', text: poster.name }),
        h('span', { class: 'wanted-strip-note', text: poster.note }),
      ),
      link && icon('chevron', { size: 20 }),
    );
  }

  function regionLink(candidate, character, yours = false) {
    const hash = `${HOME}/${candidate.id}`;
    const open = candidate.areas.filter((place) => areaOpen(place, character)).length;
    const art = landArt(candidate.id);
    const card = h(
      'a',
      {
        class: `card region-card region-link${art ? ' region-card--art' : ''}${yours ? ' region-card--yours' : ''}`,
        href: hash,
        'data-guide': `region-${candidate.id}`,
        onClick: (event) => openView(event, hash),
      },
      h(
        'div',
        { class: 'region-head' },
        h('h2', { class: 'card-title', text: candidate.name }),
        h(
          'span',
          { class: 'region-chips' },
          yours && chip(t('Twój poziom'), 'chip--yours'),
          chip(t('poz. {min}–{max}', { min: candidate.minLevel, max: candidate.maxLevel })),
          candidate.safe && chip(t('bezpieczny'), 'chip--safe'),
          // The banner of the guild that holds the land this week (1200 A).
          bannerChip(candidate.id),
        ),
      ),
      h('p', { class: 'region-trait' }, h('strong', { text: `${candidate.trait.name}. ` }), candidate.trait.description),
      h(
        'p',
        { class: 'region-foot' },
        open > 0
          ? h('span', { text: t('Otwarte miejsca: {open} z {all}', { open, all: candidate.areas.length }) })
          : lockLabel(t('poz. klasy {level}', { level: candidate.areas[0].unlockClassLevel })),
        icon('chevron', { size: 20 }),
      ),
    );
    // The land's scene, dim behind the text (styles.css).
    if (art) card.style.setProperty('--land-art', `url("${art}")`);
    return card;
  }

  // Step two: the inner regions of a region, as circles, under the
  // Bestiariusz of the whole land.
  function regionView(character) {
    return h(
      'div',
      { class: 'stack' },
      restSkip(character),
      h('p', { class: 'region-description', text: region.description }),
      // Whose banner stands over the land this week, and its bonus for the
      // character's own guild (1200 A).
      bannerLine(region.id),
      h('p', { class: 'region-trait' }, h('strong', { text: `${region.trait.name}. ` }), region.trait.description),
      region.dangers?.length > 0 && bestiaryRow(region, true),
      h('div', { class: 'area-grid' }, region.areas.map((place) => areaTile(place, character))),
    );
  }

  function areaTile(place, character) {
    const circle = h('span', { class: 'area-circle' }, areaArt(place.id));
    if (!areaOpen(place, character)) {
      circle.append(h('span', { class: 'area-lock' }, icon('lock', { size: 28 })));
      return h(
        'div',
        { class: 'area-tile area-tile--locked', role: 'img', 'aria-label': t('{name}: od poziomu klasy {level}', { name: place.name, level: place.unlockClassLevel }) },
        circle,
        h('span', { class: 'area-tile-name', text: place.name }),
        lockLabel(t('poz. klasy {level}', { level: place.unlockClassLevel })),
      );
    }
    const hash = `${regionHash}/${place.id}`;
    // The place of the wanted poster in hand, while its target stands.
    const sought = character.wanted && !character.wanted.beaten && character.wanted.areaId === place.id;
    return h(
      'a',
      { class: 'area-tile', href: hash, 'data-guide': `area-${place.id}`, onClick: (event) => openView(event, hash) },
      circle,
      h('span', { class: 'area-tile-name', text: place.name }),
      h('span', { class: 'area-levels', text: t('poz. {min}–{max}', { min: place.minLevel, max: place.maxLevel }) }),
      sought && h('span', { class: 'area-wanted-tag', text: t('List gończy') }),
    );
  }

  // Step three: the length, the threat level and the start.
  function areaView(character) {
    const allowed = character.huntDurations;
    const longer = character.huntNext;
    // The slider moves over the allowed lengths (1, 5, 10… minutes). The last
    // length is kept for each inner region (before them: for each region).
    // The narrator sends the first exploration out for the longest time,
    // whatever this browser remembers from an earlier character.
    const first = character.tutorial && !character.tutorial.includes('skip') && character.xp === 0 && character.level === 1;
    let index = first ? allowed.length - 1 : allowed.indexOf(choice[area.id] ?? choice[region.id]);
    if (index === -1) index = Math.max(0, allowed.indexOf(15));
    let minutes = allowed[index];
    shownArea = area.id;

    const threatValue = h('strong', {});
    const threatLine = h('p', { class: 'threat' }, t('Zagrożenie: '), threatValue);
    // With "Z drużyną" ticked, the line under it says whom the threat
    // counts: the whole party as it would go (gracz (poz. 95), 24.11.2026),
    // or the character alone where the server had no member to take (the
    // author's 926 B, 13.11.2026, before the party's threat); hidden while
    // the exploration is the character's own (partyChoice's ride).
    const threatAlone = h('p', { class: 'threat-alone', hidden: true });
    // The Warownia's Strażnica: the chances of the length chosen under the
    // threat, and from its 2nd level one of the place's creatures to track
    // (fortress.js in the engine). Not on a Drużyna's trip, whose fights are
    // shared.
    const watchLine = h('p', { class: 'watch-chances', hidden: true });
    let scouted = null;
    let scoutShown = false;
    const scoutBox = h('div', { class: 'hunt-scout', hidden: true });
    const showScout = (scout) => {
      if (scoutShown || !scout || first) return;
      scoutShown = true;
      const pick = (id) => {
        scouted = id;
        for (const button of scoutBox.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.id === (id ?? '')));
        showSummary();
      };
      fill(
        scoutBox,
        h('p', { class: 'hunt-scout-title', text: t('Strażnica: tropiony stwór, spotykany o {share}% częściej', { share: Math.round(scout.share * 100) }) }),
        h(
          'div',
          { class: 'fortress-choices' },
          [{ id: '', name: t('Żaden') }, ...scout.creatures].map((creature) =>
            h('button', { type: 'button', class: 'button button--world button--small', 'data-id': creature.id, 'aria-pressed': creature.id === '', text: creature.name, onClick: () => pick(creature.id || null) }),
          ),
        ),
      );
      scoutBox.hidden = false;
    };
    const percent = (share) => `${Math.round(share * 100)}%`;
    // The box by "Wyrusz" keeps the elite and the champion away and lowers
    // the threat; the one under it sends the character after them, twice as
    // often, and raises it. One unticks the other. The first exploration
    // meets neither, so it has no boxes.
    const avoiding = () => !first && avoidRareOn();
    const seeking = () => !first && seekRareOn();
    const avoidBox = h('input', {
      type: 'checkbox',
      id: 'avoid-rare',
      class: 'avoid-rare-box',
      checked: avoidRareOn(),
      onChange: () => {
        setAvoidRare(avoidBox.checked);
        seekBox.checked = seekRareOn();
        showThreat();
      },
    });
    const seekBox = h('input', {
      type: 'checkbox',
      id: 'seek-rare',
      class: 'avoid-rare-box',
      checked: seekRareOn(),
      onChange: () => {
        setSeekRare(seekBox.checked);
        avoidBox.checked = avoidRareOn();
        showThreat();
      },
    });
    const avoid = !first && h('label', { class: 'avoid-rare', for: 'avoid-rare' }, avoidBox, h('span', { text: t('Unikaj elit i czempionów') }));
    const seek = !first && h('label', { class: 'avoid-rare', for: 'seek-rare' }, seekBox, h('span', { text: t('Trop elity i czempiony') }));
    // The box under the dangers sends the character mostly after the
    // creatures its quests still ask for; a note says when none lives here.
    const tracking = () => !first && trackQuestsOn();
    const wanted = new Set(
      Object.values(character.quests ?? {}).flatMap((period) => period.quests.filter((quest) => quest.kind === 'kill' && !quest.done).map((quest) => quest.monsterId)),
    );
    const trackNone = h('p', { class: 'muted track-quests-note', text: t('Żaden stwór z Twoich zadań nie żyje w tym miejscu.') });
    const showTrackNote = () => {
      trackNone.hidden = !trackQuestsOn() || (area.dangers ?? []).some((danger) => wanted.has(danger.monsterId));
    };
    const trackBox = h('input', {
      type: 'checkbox',
      id: 'track-quests',
      class: 'avoid-rare-box',
      checked: trackQuestsOn(),
      onChange: () => {
        setTrackQuests(trackBox.checked);
        showTrackNote();
        showSummary();
      },
    });
    showTrackNote();
    // The one under it: the creatures not met yet, a tenth more often, to
    // fill the Bestiariusz; a note says when all of this place's are known.
    const tracingUnknown = () => !first && trackUnknownOn();
    const met = new Set(character.met ?? []);
    const unknownNone = h('p', { class: 'muted track-quests-note', text: t('Wszystkie stwory z tego miejsca są już w Bestiariuszu.') });
    const showUnknownNote = () => {
      unknownNone.hidden = !trackUnknownOn() || (area.dangers ?? []).some((danger) => !met.has(danger.monsterId));
    };
    const unknownBox = h('input', {
      type: 'checkbox',
      id: 'track-unknown',
      class: 'avoid-rare-box',
      checked: trackUnknownOn(),
      onChange: () => {
        setTrackUnknown(unknownBox.checked);
        showUnknownNote();
        showSummary();
      },
    });
    showUnknownNote();
    // The Trudna wyprawa (629 A), from the level the server opens it at:
    // stronger creatures for more XP and gold, on "Wyrusz" alone or with
    // the Drużyna (the author, 19.11.2026: „Trudne i Piekielne wyprawy zrób
    // tak by można je bylo robić z drużyną”), not on a Szybkie or a
    // Błyskawiczne polowanie.
    const hardRules = !first && character.hardHunt;
    const hardOn = () => Boolean(hardRules) && hardHuntOn();
    const times = (value) => `×${decimal(String(value))}`;
    const hardBox =
      hardRules &&
      h('input', {
        type: 'checkbox',
        id: 'hard-hunt',
        class: 'avoid-rare-box',
        checked: hardHuntOn(),
        onChange: () => {
          setHardHunt(hardBox.checked);
          if (hellBox) hellBox.checked = hellHuntOn();
          loadOptions();
          showThreat();
        },
      });
    const hard =
      hardRules &&
      h(
        'div',
        // The narrator opens "Opcje wyprawy" and points here (narrator.js).
        { class: 'track-quests hard-hunt', 'data-guide': 'hard-hunt' },
        h('label', { class: 'avoid-rare', for: 'hard-hunt' }, hardBox, h('span', { text: t('Trudna wyprawa') })),
        h('p', {
          class: 'muted track-quests-note',
          text: t('Stwory: obrażenia {damage}, HP {hp}. Nagroda: +{xp}% XP i +{gold}% złota. Nie na Szybkim i Błyskawicznym polowaniu.', {
            damage: times(hardRules.damage),
            hp: times(hardRules.hp),
            xp: Math.round(hardRules.xp * 100),
            gold: Math.round(hardRules.gold * 100),
          }),
        }),
      );
    // The Piekielna wyprawa under it (the author, 19.11.2026: „2 razy
    // trudniejsza niz Trudna wyprawa 1,5x lepszy drop”), on the same terms;
    // one box unticks the other.
    const hellRules = !first && character.hellHunt;
    const hellOn = () => Boolean(hellRules) && hellHuntOn();
    const hellBox =
      hellRules &&
      h('input', {
        type: 'checkbox',
        id: 'hell-hunt',
        class: 'avoid-rare-box',
        checked: hellHuntOn(),
        onChange: () => {
          setHellHunt(hellBox.checked);
          if (hardBox) hardBox.checked = hardHuntOn();
          loadOptions();
          showThreat();
        },
      });
    const hell =
      hellRules &&
      h(
        'div',
        { class: 'track-quests hell-hunt' },
        h('label', { class: 'avoid-rare', for: 'hell-hunt' }, hellBox, h('span', { text: t('Piekielna wyprawa') })),
        h('p', {
          class: 'muted track-quests-note',
          text: t('Stwory: obrażenia {damage}, HP {hp}. Nagroda: +{xp}% XP, +{gold}% złota i {drop} raza więcej przedmiotów i materiałów. Nie na Szybkim i Błyskawicznym polowaniu.', {
            damage: times(hellRules.damage),
            hp: times(hellRules.hp),
            xp: Math.round(hellRules.xp * 100),
            gold: Math.round(hellRules.gold * 100),
            drop: decimal(String(1 + hellRules.drop)),
          }),
        }),
      );
    // A mercenary from the Karczma (mercenaries.js), from its level: on a
    // plain "Wyrusz" only, for the length chosen. One taken in the Karczma
    // ("Weź na wyprawę") comes chosen.
    const mercenary = !first && character.mercenaries ? mercenaryChoice(() => minutes, () => showSummary()) : null;
    // The boxes of the exploration; they go into "Opcje wyprawy" below.
    const choices =
      !first &&
      h(
        'div',
        { class: 'hunt-options-boxes' },
        avoid,
        seek,
        h(
          'div',
          { class: 'track-quests' },
          h('label', { class: 'avoid-rare', for: 'track-quests' }, trackBox, h('span', { text: t('Trop przede wszystkim stwory z zadań') })),
          trackNone,
          h('label', { class: 'avoid-rare', for: 'track-unknown' }, unknownBox, h('span', { text: t('Trop nieznane stwory') })),
          unknownNone,
        ),
        hard,
        hell,
        mercenary?.element,
      );
    // Potions to take along, once the character carries some that work in fights.
    const use = character.professions?.potionUse;
    // One the character may not use yet stays home: above its level, with
    // its recipe unknown (1272).
    const carried = use && !first ? (character.potions ?? []).filter((potion) => potion.fight && potion.usable) : [];
    potions = carried.length > 0 ? potionPicker(carried, use) : null;
    // A dish of the Spiżarnia to eat as it sets out (cooking.js), in place
    // of the meal at work once asked; not on the narrator's first exploration.
    meal = first ? null : mealPicker(character);
    showThreat = () => {
      const known = options[area.id];
      const ratings =
        known && known.build === buildKey(state.character) && known.healing === healingQuery() && known.hard === hardQuery() && known.party === partyKey()
          ? avoiding()
            ? known.threatAvoiding
            : seeking()
              ? (known.threatSeeking ?? known.threat)
              : known.threat
          : undefined;
      const threat = ratings?.[minutes];
      threatLine.className = `threat threat--${threat ?? 'unknown'}`;
      threatValue.textContent = threat ? t(THREAT_NAMES[threat]) : '…';
      threatAlone.hidden = !partyKey() || !ratings;
      threatAlone.textContent = known?.partyCounted ? t('Zagrożenie liczone dla całej drużyny.') : t('Zagrożenie liczone dla Ciebie samego.');
      const chances = !first && known ? (seeking() ? known.chancesSeeking : known.chances)?.[minutes] : null;
      watchLine.hidden = !chances;
      if (chances) {
        watchLine.textContent = t('Strażnica: {chances}.', {
          chances: [
            !avoiding() && t('elita {chance}', { chance: percent(chances.elite) }),
            !avoiding() && chances.champion > 0 && t('czempion {chance}', { chance: percent(chances.champion) }),
            t('zdarzenie {chance}', { chance: percent(chances.event) }),
          ]
            .filter(Boolean)
            .join(', '),
        });
      }
      showScout(known?.scout);
      showSummary();
    };
    // The folded "Opcje wyprawy" tells the length, the potions taken and
    // how many boxes are ticked.
    const summary = h('span', { class: 'hunt-options-summary' });
    function showSummary() {
      const taken = Object.values(potions?.taken() ?? {}).reduce((sum, count) => sum + count, 0);
      const ticked = [avoiding(), seeking(), tracking(), tracingUnknown(), Boolean(scouted), hardOn(), hellOn(), Boolean(mercenary?.chosen())].filter(Boolean).length;
      summary.textContent = [
        formatMinutes(minutes),
        taken > 0 && countOf(taken, 'mikstura', 'mikstury', 'mikstur'),
        ticked > 0 && countOf(ticked, 'opcja', 'opcje', 'opcji'),
      ]
        .filter(Boolean)
        .join(' · ');
    }

    // A slider with buttons for one step at a time, and the length's name.
    const value = h('output', { class: 'duration-value', 'aria-live': 'off' });
    const kind = h('span', { class: 'duration-kind' });
    // With the Stajnia's mount the wait is shorter than the length (327 A);
    // a Drużyna's trip waits as long as its slowest mount (parties.js), so
    // with "Z drużyną" ticked the line says the party's (`partyRide`).
    const riding = character.mount ? h('p', { class: 'duration-lock duration-mount' }) : null;
    let partyRide;
    const showRide = () => {
      if (!riding) return;
      riding.textContent =
        partyRide === undefined
          ? stableNote(minutes, character.mount)
          : partyRide.shorter > 0
            ? t('Z wierzchowcami drużyny: {time} (najwolniejszy ma {name})', { time: formatWait(stableWait(minutes, partyRide)), name: partyRide.by })
            : t('Wyprawa drużyny trwa pełny czas: {name} nie ma wierzchowca.', { name: partyRide.by });
    };
    const slider = h('input', {
      type: 'range',
      class: 'duration-slider',
      'data-guide': 'duration',
      min: 0,
      max: allowed.length - 1,
      step: 1,
      value: index,
      'aria-label': t('Czas wyprawy: {area}', { area: area.name }),
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
      showRide();
      less.disabled = index === 0;
      more.disabled = index === allowed.length - 1;
      potions?.update(minutes);
      mercenary?.update();
      showThreat();
      startLabel();
    }
    // "Wyrusz" with the length chosen, as it stays in sight (312 A).
    let start = null;
    const startLabel = () => {
      if (start) start.textContent = t('Wyrusz · {time}', { time: formatMinutes(minutes) });
    };
    set(index);

    const durations = h(
      'div',
      { class: 'duration-picker' },
      h('p', { class: 'duration-head' }, h('span', { class: 'duration-title' }, t('Czas wyprawy'), kind), value),
      h('div', { class: 'duration-row' }, less, slider, more),
      h(
        'p',
        { class: 'duration-scale', 'aria-hidden': 'true' },
        h('span', { text: formatMinutes(allowed[0]) }),
        h('span', { text: formatMinutes(allowed.at(-1)) }),
      ),
      riding,
      longer && h('p', { class: 'duration-lock', text: t('Dłuższe wyprawy, do {time}, od poziomu {level}.', { time: formatMinutes(longer.minutes), level: longer.level }) }),
    );

    // A Drużyna's leader takes the members free now along (parties.js):
    // the box comes once the party is known, ticked; the party goes only as
    // far and as long as its lowest member may (the server says so).
    // Not on the narrator's first exploration: there the box is null, never
    // false, since "Wyrusz" asks it for along() (since 0.0.71 a false here
    // threw "party?.along is not a function" and the introduction stopped
    // at its first exploration; the author's video).
    const party = first
      ? null
      : partyChoice((ride) => {
          partyRide = ride;
          showRide();
          // The threat of the trip as it would go now: the party's, or the
          // character's own.
          loadOptions();
          showThreat?.();
        });
    start = h('button', {
      type: 'button',
      class: 'button button--system',
      'data-guide': 'start',
      text: t('Wyrusz'),
      onClick: (event) =>
        withButton(event.currentTarget, async () => {
          remember();
          const along = party?.along();
          const hiring = !along && mercenary?.chosen();
          let answer;
          try {
            answer = await partyGated(along ? '/api/party/hunt' : '/api/hunts', {
              areaId: area.id,
              minutes,
              avoidRare: avoiding(),
              seekRare: seeking(),
              trackQuests: tracking(),
              trackUnknown: tracingUnknown(),
              ...(potions && { potions: potions.taken(), healBelow: potions.below() }),
              ...(meal?.chosen() && { meal: meal.chosen(), mealPortions: meal.portions(), mealReplaces: meal.replaces() }),
              ...(scouted && !along && { scout: scouted }),
              // The Trudna or the Piekielna, alone or the whole Drużyna's
              // trip (parties.js).
              ...(hardOn() && { hard: true }),
              ...(hellOn() && { hell: true }),
              ...(hiring && { mercenary: hiring }),
            });
          } catch (error) {
            // A mercenary hired by someone else meanwhile, or whose offer
            // changed, is chosen no more; the server's words say why.
            if (hiring) mercenary.failed(error);
            throw error;
          }
          // Asked to leave the Drużyna to set out alone, the player stayed
          // in it (1178 B, party-gate.js).
          if (answer === null) return;
          // Those who went, as the server says: one may have got busy
          // meanwhile. A mercenary chosen stays home, chosen for a plain
          // exploration (mercenaries.js).
          if (along) {
            // With who must first choose in the event of its exploration
            // (`notes`, parties.js): it stays home.
            const went = partyWent(answer);
            toast(mercenary?.chosen() ? `${went} ${character.mercenaries.texts.plainOnly}` : went);
          } else if (hiring) {
            toast(t('{name} idzie z Tobą. Zapłacono {gold} zł.', { name: mercenary.hired().name, gold: formatNumber(mercenary.hired().gold) }));
            mercenary.forget();
          }
          leaveView(HOME, 2);
        }),
    });
    startLabel();

    // Szybkie Polowanie and Błyskawiczne polowanie: the same choices as
    // "Wyrusz", their own lengths and the report at once, a few times a day
    // and a few times every 12 hours (hunts.js).
    const quick =
      character.quickHunts &&
      quickHuntBox(character.quickHunts, () => ({
        areaId: area.id,
        avoidRare: avoiding(),
        seekRare: seeking(),
        trackQuests: tracking(),
        trackUnknown: tracingUnknown(),
        ...(potions && { potions: potions.taken(), healBelow: potions.below() }),
        ...(meal?.chosen() && { meal: meal.chosen(), mealPortions: meal.portions(), mealReplaces: meal.replaces() }),
        ...(scouted && { scout: scouted }),
      }));

    const levelNote =
      character.level < area.minLevel
        ? h('p', { class: 'region-warning', text: t('Przeciwnicy mają tu poziom {min}–{max}, wyżej niż Twoja postać.', { min: area.minLevel, max: area.maxLevel }) })
        : character.level > area.maxLevel + (state.content.easyAbove ?? 3)
          ? h('p', { class: 'region-warning', text: t('To miejsce jest już dla Ciebie za łatwe: dostaniesz mało doświadczenia.') })
          : null;

    return h(
      'div',
      { class: 'stack' },
      restSkip(character),
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
            chip(t('poz. {min}–{max}', { min: area.minLevel, max: area.maxLevel })),
            region.safe && chip(t('bezpieczny'), 'chip--safe'),
          ),
        ),
        h('p', { class: 'region-description', text: area.description }),
        area.dangers?.length > 0 && bestiaryRow(area),
        character.wanted?.areaId === area.id && wantedStrip(character, true),
        levelNote,
        // From the strong inner regions on (content.js, 438.2 A).
        area.companionsAdvice && h('p', { class: 'region-warning', text: area.companionsAdvice }),
        // The bonuses that will work on this exploration, before it is set
        // up (the author: "powinny byc bonusy przed wyprawą napisane").
        bonusList(character),
        // Everything the exploration is set up with in one frame, above the
        // threat it changes and "Wyrusz" (the author: not scattered over the
        // card). The narrator's first exploration has only its length.
        // Open while a mercenary is chosen, so its fee is in sight.
        first ? durations : huntOptions(summary, [durations, potions?.element, meal?.element, choices, scoutBox], Boolean(mercenary?.chosen())),
        threatLine,
        threatAlone,
        watchLine,
        party?.element,
        // Held in sight above the tabs while the card goes on below (the
        // author: 312 A); the narrator's first exploration keeps it plain.
        first ? start : h('div', { class: 'start-bar' }, start),
        quick,
      ),
      h('p', { class: 'muted threat-note', text: t('Zagrożenie to szansa porażki podczas wyprawy.') }),
    );
  }

  // At the top of a Drużyna's exploration, the time the others skipped for
  // everyone (parties.js: the trip's shared timer).
  function partySkips(activity) {
    const lines = skipLines(activity.party?.skips);
    return lines.length > 0 ? systemPanel(...lines) : null;
  }

  // A Drużyna's trip another claimed for the whole party (hunts.js:
  // claimTrip; the author, 24.11.2026: „niech lider odbiera raport za
  // wszystkich”), not opened yet: who claimed it, and the way to the shared
  // report, which the server marks opened as it opens.
  function partyReportNote(character) {
    const waiting = character.partyReport;
    const texts = state.content.community?.party?.texts;
    if (!waiting || !texts?.waiting) return null;
    const open = systemLink(`#/raport/${waiting.id}`, texts.open);
    open.addEventListener('click', () => {
      if (state.character?.partyReport?.id === waiting.id) state.character.partyReport = null;
    });
    return systemPanel(texts.waiting.replace('{name}', waiting.by), open);
  }

  // On a Drużyna's trip that set out with the character's waiting report
  // claimed (parties.js, since 10.11.2026), the word of it and the way to
  // that report, in the Dziennik as any other.
  function partyClaimed(activity) {
    const claimed = activity.party?.claimed;
    if (!claimed) return null;
    // A mercenary's offer or service over, closed as the party set out, as
    // its own close in the Karczma would (src/server/parties.js,
    // claimForTrip; 25.11.2026): its pay, or the offer nobody took.
    if (claimed.kind === 'mercenary') {
      return systemPanel(
        claimed.gold > 0
          ? t('Twoja zapłata za usługę najemną została odebrana, gdy drużyna wyruszała: +{gold} zł.', { gold: formatNumber(claimed.gold) })
          : t('Twoje wygasłe ogłoszenie najemnika zostało zamknięte, gdy drużyna wyruszała.'),
      );
    }
    return systemPanel(t('Twój czekający raport został odebrany, gdy drużyna wyruszała.'), systemLink(`#/raport/${claimed.id}`, t('Zobacz raport')));
  }

  // The box "Z drużyną" over "Wyrusz", for a party's leader with members
  // free now; along() gives their names while it is ticked, else null. The
  // members busy elsewhere stay home and in the party (parties.js), and the
  // lines under the box name them; with none free, only those lines.
  // `onRide` hears the party's slowest mount while "Z drużyną" is ticked,
  // and undefined when the trip is the character's own. A leader's box is
  // asked again now and then (partyAskedAt), and drawn again only when what
  // it says changed, so it does not jump under the finger.
  function partyChoice(told) {
    const element = h('div', { class: 'party-choice', hidden: true });
    let free = [];
    let said = null;
    // Who the trip takes for the threat (partyGoers), with the ride.
    const onRide = (ride) => {
      partyGoers = ride === undefined || free.length === 0 ? null : [...free];
      told(ride);
    };
    const show = ({ party, ownCompanions = [] }) => {
      // A box of a view drawn over since is left as it is.
      if (!element.isConnected) return;
      const own = party?.members.find((member) => member.own);
      partyLeads = Boolean(own?.leader && party.members.length > 1);
      free = partyFree(party);
      // The companions who go on the character's own explorations in a
      // Drużyna too (hunts.js companionsGoing; players and the author,
      // 18.11.2026: „z drużyną/z towarzyszami”), named.
      const mates = ownCompanions.length > 0 ? listNames(ownCompanions) : null;
      if (!partyLeads) {
        if (said !== null) onRide(undefined);
        // A member who does not lead: its own exploration takes them.
        const line = party && mates ? JSON.stringify(['member', mates]) : null;
        if (line === said) return;
        said = line;
        if (!line) {
          element.hidden = true;
          return;
        }
        fill(element, h('p', { class: 'muted', text: t('Na Twoją wyprawę pójdą z Tobą towarzysze: {names}. Na wyprawę drużyny wysyła lider.', { names: mates }) }));
        element.hidden = false;
        return;
      }
      const others = party.members.filter((member) => !member.own);
      // What keeps each busy one home and until when, without the place of
      // its exploration (../party-doing.js; the author, 25.11.2026:
      // „powinno być widoczne co robi dany gracz z drużyny i dlaczego nie
      // może iść na wyprawę”): „Ala (na wyprawie drużyny, wróci o 13:31)”.
      const at = serverNow();
      const busy = others.filter((member) => member.status !== 'free').map((member) => `${member.name} (${doingText(member, at, { place: false })})`);
      const now = JSON.stringify([free, busy, party.limits]);
      if (now === said) return;
      said = now;
      if (free.length === 0) {
        onRide(undefined);
        fill(element, h('p', { class: 'muted', text: t('Z drużyny nikt teraz nie pójdzie: {names}. Wyprawa będzie tylko Twoja.', { names: busy.join(', ') }) }));
        element.hidden = false;
        return;
      }
      const limits = h('p', {
        class: 'muted',
        text: t('Drużyna idzie najwyżej na {time} ({timeBy}) i tylko tam, gdzie wejdzie {levelBy} (poziom klasy {level}).', {
          time: formatMinutes(party.limits.minutes),
          timeBy: party.limits.minutesBy,
          levelBy: party.limits.classLevelBy,
          level: party.limits.classLevel,
        }),
      });
      const stay =
        busy.length > 0 &&
        h('p', {
          class: 'muted',
          text:
            busy.length === 1
              ? t('Nie idzie, ale zostaje w drużynie: {names}.', { names: busy.join(', ') })
              : t('Nie idą, ale zostają w drużynie: {names}.', { names: busy.join(', ') }),
        });
      // What goes with the character on the exploration it picks: the
      // Drużyna, its companions staying in the Kwatery, or its companions.
      const goes = h('p', { class: 'muted' });
      const say = () => {
        goes.textContent = partyTicked
          ? mates
            ? t('Towarzysze zostają w Kwaterach: drużyna poluje bez nich.')
            : ''
          : mates
            ? t('Wyprawa będzie tylko Twoja: pójdą z Tobą towarzysze {names}.', { names: mates })
            : t('Wyprawa będzie tylko Twoja.');
        goes.hidden = goes.textContent === '';
        limits.hidden = !partyTicked;
        if (stay) stay.hidden = !partyTicked;
      };
      const pick = (along) => {
        partyTicked = along;
        onRide(partyTicked ? party.limits.mount : undefined);
        say();
      };
      onRide(partyTicked ? party.limits.mount : undefined);
      if (mates) {
        // "Z drużyną" or "Z towarzyszami", side by side (1099 B, accepted
        // by the author 18.11.2026); without companions the box as before.
        const options = [
          [true, t('Z drużyną')],
          [false, t('Z towarzyszami')],
        ].map(([along, label]) =>
          h('button', {
            type: 'button',
            class: 'segmented-option',
            'aria-pressed': String(partyTicked === along),
            text: label,
            onClick: () => {
              pick(along);
              for (const [index, button] of options.entries()) button.setAttribute('aria-pressed', String(partyTicked === (index === 0)));
            },
          }),
        );
        const who = h('p', { class: 'party-pick-who', text: t('Drużyna: {party} · Towarzysze: {mates}', { party: free.join(', '), mates }) });
        fill(element, h('div', { class: 'segmented party-pick', role: 'group', 'aria-label': t('Z kim wyruszasz') }, options), who, goes, limits, stay);
      } else {
        const box = h('input', {
          type: 'checkbox',
          id: 'party-along',
          class: 'avoid-rare-box',
          checked: partyTicked,
          onChange: () => pick(box.checked),
        });
        fill(element, h('label', { class: 'avoid-rare', for: 'party-along' }, box, h('span', { text: t('Z drużyną: {names}', { names: free.join(', ') }) })), limits, stay, goes);
      }
      say();
      element.hidden = false;
    };
    const ask = () => {
      if (!isUnlocked('party')) return;
      if (!partyAsked || Date.now() - partyAskedAt > PARTY_FRESH_MS) {
        partyAsked = call('GET', '/api/party');
        partyAskedAt = Date.now();
      }
      partyAsked.then(show).catch(() => {
        partyAsked = null;
      });
    };
    ask();
    partyAgain = ask;
    return { element, along: () => (partyTicked && free.length > 0 && !element.hidden ? free : null) };
  }

  // "Szybkie Polowanie" and "Błyskawiczne polowanie" under "Wyrusz", each
  // with how many are left and when they come back once all are used.
  function quickHuntBox(quick, choices) {
    const { flash } = quick;
    const start = (label, kind, none) =>
      h('button', {
        type: 'button',
        class: 'button button--world',
        text: label,
        disabled: none,
        onClick: (event) =>
          withButton(event.currentTarget, async () => {
            const { report } = await call('POST', '/api/hunts/quick', { ...choices(), ...(kind && { kind }) });
            reportCache.set(String(report.id), report);
            state.freshReport = String(report.id);
            navigate(`#/raport/${report.id}`);
          }),
      });
    return h(
      'div',
      { class: 'quick-hunt', 'data-guide': 'quick-hunt' },
      start(t('Szybkie Polowanie'), null, quick.left === 0),
      h('p', { class: 'muted', text: leftText(quick, t('Szybkie Polowania się skończyły. Wrócą {when}.', { when: quick.backAt && dateTimeFormat.format(new Date(quick.backAt)) })) }),
      // A second button (the author): shorter ones, back sooner.
      flash && start(t('Błyskawiczne polowanie'), 'flash', flash.left === 0),
      flash && h('p', { class: 'muted', text: leftText(flash, t('Błyskawiczne polowania się skończyły. Wrócą {when}.', { when: flash.backAt && dateTimeFormat.format(new Date(flash.backAt)) })) }),
    );
  }

  // How many of a kind are left and when they come back, or `none` once
  // all are used.
  function leftText(kind, none) {
    return kind.left > 0
      ? t('Wyprawa jak na {time}, z raportem od razu. Zostało: {left} z {all}. Gdy zużyjesz wszystkie, wrócą po {hours} godzinach.', {
          time: formatMinutes(kind.minutes),
          left: kind.left,
          all: kind.count,
          hours: kind.refillHours,
        })
      : none;
  }

  // "Opcje wyprawy" as a tab that unfolds (the author: "niech staną się
  // rozwijaną zakładką"): a bar with the summary, the choices under it.
  // Folded as the player left it last, unless `force` (a mercenary chosen).
  function huntOptions(summary, parts, force = false) {
    const body = h('div', { class: 'hunt-options-body', id: 'hunt-options-body', hidden: !(force || huntOptionsOpen()) }, parts);
    const toggle = h(
      'button',
      {
        type: 'button',
        class: 'hunt-options-toggle',
        'aria-expanded': String(force || huntOptionsOpen()),
        'aria-controls': 'hunt-options-body',
        onClick: () => {
          const open = body.hidden;
          body.hidden = !open;
          toggle.setAttribute('aria-expanded', String(open));
          setHuntOptionsOpen(open);
        },
      },
      h('span', { class: 'hunt-options-title', text: t('Opcje wyprawy') }),
      summary,
      icon('chevron', { size: 18, className: 'hunt-options-chevron' }),
    );
    return h('section', { class: 'hunt-options', 'aria-label': t('Opcje wyprawy') }, toggle, body);
  }

  // The meal (cooking.js; 999.5 v2): a dish of the Spiżarnia to eat as the
  // character sets out, or none, the last choice remembered in this
  // browser; its bonus works for 4 hours of explorations. With a meal at
  // work, the other dishes too (the author, 20.11.2026: „może dam opcję
  // zjedzenia innego posiłku i zmarnowania poprzedniego bonusu”): the
  // choice starts at keeping it, and another dish first asks, as the meal
  // at work would end with its bonus lost (hunts.js, mealAtStart).
  // Up to 3 portions of one dish at once (the author, 20.11.2026:
  // „maksymalnie do 3 potraw jednego rodzaju na raz (i analogicznie dodane
  // 3x procenty danej potrawy)”): how many to eat now with −/+, as many as
  // the Spiżarnia has and the meal has room for, the meal at work's own
  // dish on top of its portions; the line shows the meal they make. A dish
  // picked starts at the most of them, or at as many as the player last
  // chose, remembered beside the dish (the author, 24.11.2026:
  // „Automatyczne jedzenie w drużynie i w ogóle trzeba ustawić tak mogło
  // jeść 3 te same posiłki na raz nie tylko jeden”).
  // { element, chosen(): the dish's id or null, portions(): how many of it,
  // replaces(): the meal at work, { dish, portions }, or null }, or null.
  function mealPicker(character) {
    const current = character.meal ?? null;
    // The portions of a dish the meal at work already has, and how many
    // more of it can be eaten now (`stacks`: its meals, one to the most).
    const had = (dish) => (dish && dish.id === current?.id ? current.portions : 0);
    const room = (dish) => (dish ? Math.min(dish.count, dish.stacks.length - had(dish)) : 0);
    const dishes = (character.pantry ?? []).filter((good) => good.group === 'dish' && room(good) > 0);
    if (dishes.length === 0) return null;
    // The most portions of one dish at once (cooking.meal.portions).
    const atOnce = dishes[0].stacks.length;
    let stored = null;
    let storedPortions = 0;
    try {
      stored = localStorage.getItem(MEAL_KEY);
      storedPortions = Number(localStorage.getItem(MEAL_PORTIONS_KEY));
    } catch {
      // Without storage nothing is remembered.
    }
    // How many portions a dish picked starts at: as many as last chosen,
    // the most without a choice, then as many as there is room for (show).
    let wanted = Number.isInteger(storedPortions) && storedPortions >= 1 && storedPortions < atOnce ? storedPortions : atOnce;
    let picked = current ? null : (dishes.find((dish) => dish.id === stored) ?? null);
    let portions = wanted;
    // The meal a dish makes with `count` portions eaten now: its name and bonus.
    const made = (dish, count) => dish.stacks[Math.min(dish.stacks.length, had(dish) + count) - 1];
    const art = (dish) => ((dish ?? current) && dishSprite((dish ?? current).id)) ?? icon('pot', { size: 24 });
    // The meal's name over its bonuses and how many dishes there are, which
    // wrap; without one, the meal at work with its time left, or none.
    const name = (dish, count) =>
      dish
        ? `${made(dish, count).name} · ${t('masz {count}', { count: dish.count })}`
        : current
          ? `${t('Posiłek: {dish}', { dish: current.name })} · ${t('jeszcze {time} wypraw', { time: formatMinutes(current.left) })}`
          : t('Bez posiłku');
    const line = (dish, count = 1) => [
      h('span', { class: 'potion-pick-art' }, art(dish)),
      h(
        'span',
        { class: 'meal-kind-text' },
        h('span', { class: 'potion-kind-name', text: name(dish, count) }),
        h('span', { class: 'potion-kind-meta cook-bonus', text: dish ? made(dish, count).bonus : (current?.bonus ?? t('bez premii')) }),
      ),
    ];
    // How many portions of the dish picked, once more than one can be eaten.
    // The choice made with no meal at work is the one remembered, as the
    // dish: all there is room for counts as the most, for when the
    // Spiżarnia has more again.
    const step = (sign) => {
      portions = Math.max(1, Math.min(room(picked), portions + sign));
      if (!current) {
        wanted = portions >= room(picked) ? atOnce : portions;
        try {
          if (wanted < atOnce) localStorage.setItem(MEAL_PORTIONS_KEY, String(wanted));
          else localStorage.removeItem(MEAL_PORTIONS_KEY);
        } catch {
          // Without storage nothing is remembered.
        }
      }
      show();
    };
    const less = h('button', { type: 'button', class: 'button button--world duration-step', 'aria-label': t('{name}: mniej', { name: t('Porcje') }), text: '−', onClick: () => step(-1) });
    const more = h('button', { type: 'button', class: 'button button--world duration-step', 'aria-label': t('{name}: więcej', { name: t('Porcje') }), text: '+', onClick: () => step(1) });
    const value = h('output', { class: 'potion-pick-value' });
    const portionsRow = h('div', { class: 'potion-pick', hidden: true }, h('span', { class: 'potion-pick-name', text: t('Porcje') }), less, value, more);
    const shown = h('span', { class: 'potion-kind-current' });
    const options = h('ul', { class: 'potion-kind-options', hidden: true, role: 'listbox', 'aria-label': t('Posiłek') });
    const setOpen = (open) => {
      options.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
    };
    const toggle = h('button', { type: 'button', class: 'potion-kind', 'aria-expanded': 'false', 'aria-label': t('Posiłek'), onClick: () => setOpen(options.hidden) }, shown, h('span', { class: 'potion-kind-caret', 'aria-hidden': 'true', text: '▾' }));
    const show = () => {
      const most = room(picked);
      portions = Math.max(1, Math.min(portions, most));
      shown.replaceChildren(...line(picked, portions));
      portionsRow.hidden = most < 2;
      value.textContent = t('{count} z {all}', { count: portions, all: most });
      less.disabled = portions <= 1;
      more.disabled = portions >= most;
      options.replaceChildren(
        ...[null, ...dishes].map((dish) =>
          h(
            'li',
            {},
            h(
              'button',
              {
                type: 'button',
                role: 'option',
                class: 'potion-kind-option',
                'aria-selected': String((dish?.id ?? null) === (picked?.id ?? null)),
                onClick: async () => {
                  setOpen(false);
                  // Another dish in place of the meal at work, once the player agrees.
                  if (dish && current && dish.id !== current.id && dish.id !== picked?.id && !(await askMealSwap(current, dish))) return;
                  if (dish?.id !== picked?.id) portions = wanted;
                  picked = dish;
                  // The choice made with no meal at work is the one remembered.
                  if (!current) {
                    try {
                      if (dish) localStorage.setItem(MEAL_KEY, dish.id);
                      else localStorage.removeItem(MEAL_KEY);
                    } catch {
                      // Without storage nothing is remembered.
                    }
                  }
                  show();
                },
              },
              // Each with the meal it makes as picked now.
              ...line(dish, dish?.id === picked?.id ? portions : Math.max(1, Math.min(wanted, room(dish)))),
            ),
          ),
        ),
      );
    };
    show();
    return {
      element: h(
        'div',
        { class: 'stack meal-picker' },
        h('p', { class: 'duration-title', text: t('Posiłek') }),
        h('div', { class: 'potion-kind-box' }, toggle, options),
        portionsRow,
        h('p', {
          class: 'muted',
          text: t('Zjedzona potrawa działa przez 4 godziny wypraw. Tej samej potrawy możesz mieć naraz do {most} porcji: premie się sumują, a każda porcja przywraca pełny czas. Inna potrawa zastępuje poprzednią, a premia poprzedniej przepada.', {
            most: atOnce,
          }),
        }),
      ),
      chosen: () => picked?.id ?? null,
      portions: () => (picked ? portions : 1),
      replaces: () => (picked && current ? { dish: current.id, portions: current.portions } : null),
    };
  }

  // The potions to take along, up to one for each fight of the length, and
  // the healing mark, all remembered in this browser. Of healing and of mana
  // the kind is picked from a list and how many with −/+, the weaker ones of
  // the kind making up for what the bag lacks (959 B, the author: "biorę
  // tylko jeden dostępny rodzaj lub jeśli nie mam tyle zapasów uzupełniam
  // wtedy tymi słabszymi"); the cures and the revivals each with −/+ (a
  // revival one at all: its `carry`).
  // The wish is kept apart from what a shorter length allows, so it comes
  // back with a longer one. A change asks for the threat again.
  function potionPicker(carried, use) {
    const stored = loadChoice(POTION_KEY);
    const wanted = { ...stored.potions };
    const picks = { ...stored.picks };
    // How strong the kind picked is, for when the bag runs out of it.
    const strengths = { ...stored.strengths };
    const counts = { ...stored.counts };
    let below = use.healBelowChoices.includes(stored.healBelow) ? stored.healBelow : use.healBelow;
    let fights = 1;
    const save = () => saveChoice({ potions: wanted, picks, strengths, counts, healBelow: below }, POTION_KEY);
    const changed = () => {
      save();
      loadOptions();
      showThreat?.();
    };
    const stepper = (label, onStep) => {
      const less = h('button', { type: 'button', class: 'button button--world duration-step', 'aria-label': t('{name}: mniej', { name: label }), text: '−', onClick: () => onStep(-1) });
      const more = h('button', { type: 'button', class: 'button button--world duration-step', 'aria-label': t('{name}: więcej', { name: label }), text: '+', onClick: () => onStep(1) });
      return { less, more };
    };
    const art = (potion) => potionSprite(potion.id) ?? icon('flask', { size: 20 });
    // The cures and the revivals one by one, as before.
    const rows = carried
      .filter((potion) => !POTION_GROUPS[potion.fight])
      .map((potion) => {
        const limit = () => Math.min(potion.count, fights, potion.carry ?? Infinity);
        const count = () => Math.min(wanted[potion.id] ?? 0, limit());
        const value = h('output', { class: 'potion-pick-value' });
        const { less, more } = stepper(potion.name, (sign) => {
          wanted[potion.id] = Math.max(0, Math.min(limit(), count() + sign));
          show();
          changed();
        });
        const show = () => {
          value.textContent = t('{count} z {all}', { count: count(), all: limit() });
          less.disabled = count() === 0;
          more.disabled = count() >= limit();
        };
        const element = h('div', { class: 'potion-pick' }, h('span', { class: 'potion-pick-art' }, art(potion)), h('span', { class: 'potion-pick-name', text: potion.name }), less, value, more);
        return { taken: () => ({ [potion.id]: count() }), show, element };
      });
    // Healing and mana: the kind chosen from a list and how many, the weaker
    // ones of the kind making up for what the bag lacks, the strongest of
    // them first.
    const groups = Object.entries(POTION_GROUPS).flatMap(([kind, title]) => {
      const kinds = carried.filter((potion) => potion.fight === kind).sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
      if (kinds.length === 0) return [];
      // A kind picked that the bag has run out of gives way to the strongest
      // of those weaker than it (the stronger ones stay home), or to the
      // weakest there is. A choice kept from the list of single potions:
      // the strongest of them wished for, and as many as all of them together.
      if (!kinds.some((potion) => potion.id === picks[kind])) {
        const weaker = Number.isFinite(strengths[kind]) ? (kinds.find((potion) => (potion.amount ?? 0) < strengths[kind]) ?? kinds.at(-1)) : null;
        picks[kind] = (weaker ?? kinds.find((potion) => (wanted[potion.id] ?? 0) > 0) ?? kinds[0]).id;
        counts[kind] ??= kinds.reduce((sum, potion) => sum + (wanted[potion.id] ?? 0), 0);
      }
      const chosen = () => kinds.find((potion) => potion.id === picks[kind]) ?? kinds[0];
      strengths[kind] = chosen().amount;
      const line = () => kinds.slice(kinds.indexOf(chosen()));
      const limit = () => Math.min(fights, line().reduce((sum, potion) => sum + potion.count, 0));
      const count = () => Math.min(counts[kind] ?? 0, limit());
      const taken = () => {
        let left = count();
        /** @type {Record<string, number>} */
        const out = {};
        for (const potion of line()) {
          const take = Math.min(left, potion.count);
          if (take > 0) out[potion.id] = take;
          left -= take;
        }
        return out;
      };
      const strength = (potion) => t(kind === 'heal' ? '+{amount}% HP' : '+{amount}% many', { amount: Math.round((potion.amount ?? 0) * 100) });
      const label = t(title);
      const headArt = h('span', { class: 'potion-pick-art' });
      const value = h('output', { class: 'potion-pick-value' });
      const { less, more } = stepper(label, (sign) => {
        counts[kind] = Math.max(0, Math.min(limit(), count() + sign));
        show();
        changed();
      });
      const note = h('p', { class: 'potion-group-note muted', hidden: true });
      const choose = (id) => {
        picks[kind] = id;
        strengths[kind] = chosen().amount;
        show();
        changed();
      };
      // The list unfolds under the row, with the potions' pictures, their
      // strength and how many the bag holds (959 B).
      const shown = h('span', { class: 'potion-kind-current' });
      const options = h('ul', { class: 'potion-kind-options', hidden: true, role: 'listbox', 'aria-label': label });
      const toggle = h('button', { type: 'button', class: 'potion-kind', 'aria-expanded': 'false', 'aria-label': t('{name}: rodzaj', { name: label }), onClick: () => setOpen(options.hidden) }, shown, h('span', { class: 'potion-kind-caret', 'aria-hidden': 'true', text: '▾' }));
      const setOpen = (open) => {
        options.hidden = !open;
        toggle.setAttribute('aria-expanded', String(open));
      };
      const showChooser = () => {
        const potion = chosen();
        shown.replaceChildren(
          h('span', { class: 'potion-pick-art' }, art(potion)),
          h('span', { class: 'potion-kind-name', text: potion.name }),
          h('span', { class: 'potion-kind-meta', text: `${strength(potion)} · ${t('masz {count}', { count: potion.count })}` }),
        );
        options.replaceChildren(
          ...kinds.map((one) =>
            h(
              'li',
              {},
              h(
                'button',
                {
                  type: 'button',
                  role: 'option',
                  class: 'potion-kind-option',
                  'aria-selected': String(one.id === potion.id),
                  onClick: () => {
                    setOpen(false);
                    choose(one.id);
                  },
                },
                h('span', { class: 'potion-pick-art' }, art(one)),
                h('span', { class: 'potion-kind-name', text: one.name }),
                h('span', { class: 'potion-kind-meta', text: `${strength(one)} · ${t('masz {count}', { count: one.count })}` }),
              ),
            ),
          ),
        );
      };
      const chooser = h('div', { class: 'potion-kind-box' }, toggle, options);
      const show = () => {
        headArt.replaceChildren(art(chosen()));
        value.textContent = t('{count} z {all}', { count: count(), all: limit() });
        less.disabled = count() === 0;
        more.disabled = count() >= limit();
        showChooser();
        const parts = Object.entries(taken());
        note.hidden = parts.length < 2;
        note.textContent = t('Weźmiesz: {potions}.', { potions: parts.map(([id, many]) => `${many} × ${kinds.find((potion) => potion.id === id)?.name}`).join(', ') });
      };
      const element = h(
        'div',
        { class: 'potion-group' },
        h('div', { class: 'potion-pick' }, headArt, h('span', { class: 'potion-pick-name potion-group-title', text: label }), less, value, more),
        chooser,
        note,
      );
      return [{ kind, taken, show, element, count }];
    });
    const heal = groups.find((group) => group.kind === 'heal');
    const manaGroup = groups.find((group) => group.kind === 'mana');
    // Jagna's burn brew (667) is named only when the character carries it:
    // until she teaches the recipe, it has never heard of it.
    const burnCure = carried.some((potion) => potion.cures === 'burning');
    const markValue = h('output', { class: 'potion-pick-value' });
    const mark = stepper(t('Próg leczenia'), (sign) => {
      const choices = use.healBelowChoices;
      below = choices[Math.max(0, Math.min(choices.length - 1, choices.indexOf(below) + sign))];
      showMark();
      changed();
    });
    const showMark = () => {
      markValue.textContent = `${Math.round(below * 100)}% HP`;
      mark.less.disabled = below === use.healBelowChoices[0];
      mark.more.disabled = below === use.healBelowChoices.at(-1);
    };
    showMark();
    const all = [...groups, ...rows];
    const element = h(
      'section',
      { class: 'potion-picks', 'aria-label': t('Mikstury na wyprawę') },
      h('p', { class: 'duration-title', text: t('Mikstury na wyprawę') }),
      heal?.element,
      heal && h('div', { class: 'potion-pick' }, h('span', { class: 'potion-pick-name', text: t('Lecz poniżej') }), mark.less, markValue, mark.more),
      groups.filter((group) => group !== heal).map((group) => group.element),
      rows.map((row) => row.element),
      h('p', {
        class: 'muted',
        text: t(
          'Każdego rodzaju najwyżej jedna na walkę, a Napar z kwiatu paproci jeden na wyprawę. Postać pije sama: leczenia poniżej progu, many, gdy zabraknie jej na umiejętność, Odtrutkę, gdy ją zatrują, {burn}a Napar, gdy padnie. Niewypite wrócą do plecaka.',
          { burn: burnCure ? t('Wywar od oparzeń, gdy ją poparzy, ') : '' },
        ),
      }),
    );
    return {
      element,
      update(minutes) {
        fights = fightsFor(use, minutes);
        for (const one of all) one.show();
      },
      taken: () => Object.fromEntries(all.flatMap((one) => Object.entries(one.taken())).filter(([, count]) => count > 0)),
      // The healing potions wished for, whatever the length: the server
      // takes one for each fight of every length.
      healing: () => heal && { count: counts.heal ?? 0, below, kind: picks.heal },
      // And the mana potions, the same way (1220 B).
      mana: () => manaGroup && { count: counts.mana ?? 0, kind: picks.mana },
      below: () => below,
    };
  }

  // Resting can be skipped with Punkty Czasu on every Walka screen, from the
  // regions to the start: at the top, by what it shortens, so it does not
  // read as part of the exploration. Hidden once HP is full.
  function restSkip(character) {
    const left = (now) => ((character.maxHp - currentHp(state.character, now)) / Math.max(1e-9, restRate(state.character))) * 60000;
    const control = skipControl('rest', left, t('Odpoczynek'));
    const text = h('p', { class: 'rest-skip-text' });
    const panel = h('div', { class: 'rest-skip', 'aria-live': 'off' }, text, woundedLine(character), control.element);
    const update = (now = serverNow()) => {
      control.update(now);
      panel.hidden = control.element.hidden;
      text.textContent = t('Odpoczynek: pełne HP za {time}.', { time: formatMinutes(Math.max(1, Math.ceil(left(now) / 60000))) });
    };
    update();
    skipper = { element: panel, update };
    return panel;
  }

  function tick(now) {
    const activity = state.character.activity;
    if (skipKind(state.character, now) !== shownSkip) {
      render();
      return;
    }
    skipper?.update(now);
    if (!activity) {
      loadOptions();
      // A party's leader on a place's screen: its box asked again now and then.
      if (partyLeads && Date.now() - partyAskedAt > PARTY_FRESH_MS) partyAgain?.();
      return;
    }
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
  return {
    update: render,
    tick,
    unmount: () => {
      helpStrip.stop();
    },
  };
}
