// The Walka tab: explorations in three steps. The main view lists the regions
// (or shows the running exploration and the report to claim). A region shows
// its inner regions as circles, open from the class level each needs. An
// inner region shows the length, the threat level and the start. Dungeons
// appear here once unlocked. The code calls explorations hunts and
// inner regions areas.

import { areaArt } from '../area-art.js';
import { landArt, materialSprite, monsterSprite, potionSprite } from '../art.js';
import { leaveView as leaveHistoryView, openView as openHistoryView } from '../history.js';
import { fill, h, icon } from '../dom.js';
import { formatCountdown, formatMinutes, formatNumber, timeFormat } from '../format.js';
import { preloadReportMusic } from '../music.js';
import { systemPoints } from '../quests.js';
import { walkScene } from '../scenes.js';
import {
  activityFinished,
  avoidRareOn,
  call,
  currentHp,
  isUnlocked,
  reportCache,
  restRate,
  seekRareOn,
  serverNow,
  setAvoidRare,
  setSeekRare,
  setTrackQuests,
  state,
  testModeOn,
  trackQuestsOn,
  unlockInfo,
} from '../state.js';
import { playSound } from '../sound.js';
import { skipControl, timePoints } from '../time.js';
import { confirmAction, lockLabel, openSheet, systemPanel, toast, withButton } from '../ui.js';
import { openEvent } from '../event.js';

const THREAT_NAMES = { low: 'niskie', moderate: 'umiarkowane', high: 'wysokie', 'very-high': 'bardzo wysokie' };
const CHOICE_KEY = 'wzrost.hunt-choice';
// The potions to take along and the healing mark: { potions: { [id]: count }, healBelow }.
const POTION_KEY = 'wzrost.potion-choice';
const HOME = '#/walka';

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

// A chance of meeting a creature: whole percents, below 10% to a tenth.
function chanceText(chance) {
  const percent = chance * 100;
  return `${percent >= 10 ? Math.round(percent) : percent.toFixed(1).replace('.', ',')}%`;
}

// The Bestiariusz: the creatures of an inner region with the levels they
// come at and the chance of meeting each in a fight, or of a whole land
// (`land`), all of its inner regions' creatures. One the character has not
// met in a fight yet is only a shadow with "???"; its levels and chance
// show from the start.
function dangersSheet(place, land = false) {
  const met = new Set(state.character.met ?? []);
  openSheet(
    h('h2', { class: 'sheet-title', text: 'Bestiariusz' }),
    h('p', { class: 'sheet-text', text: place.name }),
    h(
      'ul',
      { class: 'danger-list' },
      place.dangers.map((danger) => {
        const known = met.has(danger.monsterId);
        const levels = danger.minLevel === danger.maxLevel ? `poz. ${danger.minLevel}` : `poz. ${danger.minLevel}–${danger.maxLevel}`;
        const rank = danger.champion ? 'czempion' : danger.elite ? 'elita' : null;
        const chance = danger.chance === undefined ? null : chanceText(danger.chance);
        return h(
          'li',
          {
            class: `danger-row${known ? '' : ' danger-row--unknown'}`,
            'aria-label': `${known ? danger.name : 'Nieznany stwór'}, ${levels}${rank ? `, ${rank}` : ''}${chance ? `, ${chance}` : ''}`,
          },
          h('span', { class: 'danger-art' }, monsterSprite(danger.monsterId) ?? icon(danger.family, { size: 28 })),
          h(
            'span',
            { class: 'danger-text' },
            h('span', { class: 'danger-name', text: known ? danger.name : '???' }),
            h('span', { class: `danger-meta${danger.champion ? ' danger-meta--champion' : ''}`, text: rank ? `${levels} · ${rank}` : levels }),
          ),
          chance && h('span', { class: 'danger-chance', text: chance }),
        );
      }),
    ),
    // The author's sentence, in the feminine for a woman, like the narrator's lines.
    h('p', {
      class: 'muted',
      text: `Zobaczysz tutaj pełne informacje jedynie o stworach, z którymi ${state.character.appearance === 'female' ? 'stoczyłaś' : 'stoczyłeś'} potyczkę.`,
    }),
    h('p', { class: 'muted', text: `Skrzynia Bestiariusza dostarcza ${chestText(place.chest)}, gdy poznasz wszystkie stwory ${whose(land)}.` }),
  );
}

const whose = (land) => (land ? 'tej krainy' : 'tego regionu');

// The way to a Bestiariusz, of an inner region or a whole land, with its chest.
function bestiaryRow(place, land = false) {
  return h(
    'div',
    { class: 'bestiary-row' },
    h(
      'button',
      { type: 'button', class: 'danger-link', onClick: () => dangersSheet(place, land) },
      icon('beast', { size: 20 }),
      h('span', { text: 'Bestiariusz' }),
      icon('chevron', { size: 18 }),
    ),
    chestButton(place, land),
  );
}

const chestText = (chest) => `+${formatNumber(chest.gold)} złota, +${timePoints(chest.timePoints)} i +${systemPoints(chest.systemPoints)}`;

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
    ? 'Skrzynia Bestiariusza otwarta'
    : ready
      ? `Otwórz skrzynię Bestiariusza: ${inside}`
      : `Skrzynia Bestiariusza: ${inside}. Poznane stwory: ${known} z ${all}`;
  const open = async () => {
    if (opened) {
      toast('Ta skrzynia jest już otwarta.');
      return;
    }
    if (!ready) {
      toast(`Poznaj wszystkie stwory ${whose(land)} (${known} z ${all}), a skrzynia się otworzy. W środku: ${inside}.`);
      return;
    }
    const { chest } = await call('POST', '/api/bestiary/chest', land ? { region: place.id } : { area: place.id });
    // Coins spilling from the chest (data/sounds.json).
    playSound('chest');
    toast(`Skrzynia otwarta: ${chestText(chest)}.`);
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
    h('span', { class: 'quest-chest-caption', text: opened ? 'Otwarta' : ready ? 'Otwórz' : `${known}/${all}` }),
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
  let loading = false;
  let loadAgain = false;
  let countdown = null;
  let progress = null;
  let shownFinished = null;
  let shownSkip = null;
  // "Przewiń" for the exploration or the rest on the screen, kept right every second.
  let skipper = null;

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
        const healing = healingQuery();
        const known = options[areaId];
        if (known && known.build === build && known.hp === hp && known.healing === healing) continue;
        const { areas } = await call('GET', `/api/hunts/options?area=${encodeURIComponent(areaId)}${healing}`);
        options[areaId] = { build, hp, healing, threat: areas[0].threat, threatAvoiding: areas[0].threatAvoiding };
        showThreat?.();
      } while (loadAgain);
    } catch (error) {
      toast(error.message);
    } finally {
      loading = false;
    }
  }

  // The healing potions taken along, for the threat: "&heal=2&below=0.4".
  function healingQuery() {
    const healing = potions?.healing();
    return healing && healing.count > 0 ? `&heal=${healing.count}&below=${healing.below}` : '';
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
      { class: 'segmented', role: 'group', 'aria-label': 'Rodzaj walki' },
      tab('Eksploracja'),
      tab('Lochy', 'dungeons'),
    );
  }

  function activityCard(activity) {
    // A gathering of herbs, a brewing of potions and an order of items live
    // on their own screens; here they only say so.
    if (activity.kind === 'herbs') {
      return systemPanel(
        activityFinished(activity) ? 'Zbieranie ziół zakończone. Raport czeka w Zielarstwie.' : `Postać zbiera zioła w miejscu: ${activity.placeName}.`,
        h('a', { class: 'button button--system', href: '#/profesje/zielarstwo', text: 'Do Zielarstwa' }),
      );
    }
    if (activity.kind === 'potions') {
      return systemPanel(
        activityFinished(activity) ? 'Warzenie mikstur zakończone. Raport czeka w Alchemii.' : `Postać warzy mikstury w miejscu: ${activity.placeName}.`,
        h('a', { class: 'button button--system', href: '#/profesje/alchemia', text: 'Do Alchemii' }),
      );
    }
    if (activity.kind === 'items') {
      return systemPanel(
        activityFinished(activity) ? 'Wyrób przedmiotów zakończony. Raport czeka w Rzemieślnictwie.' : `Postać wykonuje przedmioty w miejscu: ${activity.placeName}.`,
        h('a', { class: 'button button--system', href: '#/profesje/rzemieslnictwo', text: 'Do Rzemieślnictwa' }),
      );
    }
    preloadReportMusic();
    if (activityFinished(activity)) {
      const claim = h('button', {
        type: 'button',
        class: 'button button--system',
        'data-guide': 'claim',
        text: 'Odbierz raport',
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
    skipper = skipControl('activity', (now) => activity.endsAt - now, 'Eksploracja');
    const scene = walkScene(activity);
    const card = h(
      'div',
      { class: 'stack' },
      ...(scene ? [scene.element] : []),
      systemPanel(
        `Eksploracja w toku: ${activity.areaName}, ${formatMinutes(activity.minutes)}.`,
        countdown,
        h('div', { class: 'bar bar--system' }, progress),
        ...(activity.avoidRare ? [h('p', { class: 'system-hint', text: 'Postać omija elity i czempionów.' })] : []),
        ...(activity.seekRare ? [h('p', { class: 'system-hint', text: 'Postać tropi elity i czempiony.' })] : []),
        ...(activity.tracksQuests ? [h('p', { class: 'system-hint', text: 'Postać tropi stwory z zadań.' })] : []),
        h('p', { class: 'system-hint', text: `Raport będzie gotowy o ${timeFormat.format(new Date(activity.endsAt))}. Możesz zamknąć grę.` }),
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
        ? systemPanel('Wiatrołomy to najbezpieczniejsze miejsce na start. Wybierz czas eksploracji i wyrusz.')
        : unarmed && systemPanel('Walczysz gołymi rękami. Załóż broń z plecaka w zakładce Postać, jeśli już ją masz.'),
      state.content.regions.map((candidate) => regionLink(candidate, character)),
    );
  }

  function regionLink(candidate, character) {
    const hash = `${HOME}/${candidate.id}`;
    const open = candidate.areas.filter((place) => areaOpen(place, character)).length;
    const art = landArt(candidate.id);
    const card = h(
      'a',
      {
        class: `card region-card region-link${art ? ' region-card--art' : ''}`,
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
        { class: 'area-tile area-tile--locked', role: 'img', 'aria-label': `${place.name}: od poziomu klasy ${place.unlockClassLevel}` },
        circle,
        h('span', { class: 'area-tile-name', text: place.name }),
        lockLabel(`poz. klasy ${place.unlockClassLevel}`),
      );
    }
    const hash = `${regionHash}/${place.id}`;
    return h(
      'a',
      { class: 'area-tile', href: hash, 'data-guide': `area-${place.id}`, onClick: (event) => openView(event, hash) },
      circle,
      h('span', { class: 'area-tile-name', text: place.name }),
      h('span', { class: 'area-levels', text: `poz. ${place.minLevel}–${place.maxLevel}` }),
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
    const threatLine = h('p', { class: 'threat' }, 'Zagrożenie: ', threatValue);
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
    const avoid = !first && h('label', { class: 'avoid-rare', for: 'avoid-rare' }, avoidBox, h('span', { text: 'Unikaj elit i czempionów' }));
    const seek = !first && h('label', { class: 'avoid-rare', for: 'seek-rare' }, seekBox, h('span', { text: 'Trop elity i czempiony' }));
    // The box under the dangers sends the character mostly after the
    // creatures its quests still ask for; a note says when none lives here.
    const tracking = () => !first && trackQuestsOn();
    const wanted = new Set(
      Object.values(character.quests ?? {}).flatMap((period) => period.quests.filter((quest) => quest.kind === 'kill' && !quest.done).map((quest) => quest.monsterId)),
    );
    const trackNone = h('p', { class: 'muted track-quests-note', text: 'Żaden stwór z Twoich zadań nie żyje w tym miejscu.' });
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
      },
    });
    showTrackNote();
    const track =
      !first &&
      h(
        'div',
        { class: 'track-quests' },
        h('label', { class: 'avoid-rare', for: 'track-quests' }, trackBox, h('span', { text: 'Trop przede wszystkim stwory z zadań' })),
        trackNone,
      );
    // Potions to take along, once the character carries some that work in fights.
    const use = character.professions?.potionUse;
    // One from a Wymiana stays home until its recipe is known.
    const carried = use && !first ? (character.potions ?? []).filter((potion) => potion.fight && potion.known) : [];
    potions = carried.length > 0 ? potionPicker(carried, use) : null;
    showThreat = () => {
      const known = options[area.id];
      const ratings =
        known && known.build === buildKey(state.character) && known.healing === healingQuery()
          ? avoiding()
            ? known.threatAvoiding
            : seeking()
              ? (known.threatSeeking ?? known.threat)
              : known.threat
          : undefined;
      const threat = ratings?.[minutes];
      threatLine.className = `threat threat--${threat ?? 'unknown'}`;
      threatValue.textContent = threat ? THREAT_NAMES[threat] : '…';
    };

    // A slider with buttons for one step at a time, and the length's name.
    const value = h('output', { class: 'duration-value', 'aria-live': 'off' });
    const kind = h('span', { class: 'duration-kind' });
    const slider = h('input', {
      type: 'range',
      class: 'duration-slider',
      'data-guide': 'duration',
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
      potions?.update(minutes);
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
      longer && h('p', { class: 'duration-lock', text: `Dłuższe wyprawy, do ${formatMinutes(longer.minutes)}, od poziomu ${longer.level}.` }),
    );

    const start = h('button', {
      type: 'button',
      class: 'button button--system',
      'data-guide': 'start',
      text: 'Wyrusz',
      onClick: (event) =>
        withButton(event.currentTarget, async () => {
          remember();
          await call('POST', '/api/hunts', {
            areaId: area.id,
            minutes,
            avoidRare: avoiding(),
            seekRare: seeking(),
            trackQuests: tracking(),
            ...(potions && { potions: potions.taken(), healBelow: potions.below() }),
          });
          leaveView(HOME, 2);
        }),
    });

    // Szybkie Polowanie: the same choices as "Wyrusz", its own length and
    // the report at once, a few times a day (hunts.js).
    const quick =
      character.quickHunts &&
      quickHuntBox(character.quickHunts, () => ({
        areaId: area.id,
        avoidRare: avoiding(),
        seekRare: seeking(),
        trackQuests: tracking(),
        ...(potions && { potions: potions.taken(), healBelow: potions.below() }),
      }));

    const levelNote =
      character.level < area.minLevel
        ? h('p', { class: 'region-warning', text: `Przeciwnicy mają tu poziom ${area.minLevel}–${area.maxLevel}, wyżej niż Twoja postać.` })
        : character.level > area.maxLevel + (state.content.easyAbove ?? 3)
          ? h('p', { class: 'region-warning', text: 'To miejsce jest już dla Ciebie za łatwe: dostaniesz mało doświadczenia.' })
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
            chip(`poz. ${area.minLevel}–${area.maxLevel}`),
            region.safe && chip('bezpieczny', 'chip--safe'),
          ),
        ),
        h('p', { class: 'region-description', text: area.description }),
        area.dangers?.length > 0 && bestiaryRow(area),
        track,
        levelNote,
        durations,
        potions?.element,
        avoid,
        seek,
        threatLine,
        start,
        quick,
      ),
      h('p', { class: 'muted threat-note', text: 'Zagrożenie to szansa omdlenia na wyprawie.' }),
    );
  }

  // "Szybkie Polowanie" under "Wyrusz", with how many are left today.
  function quickHuntBox({ left, perDay, minutes }, choices) {
    return h(
      'div',
      { class: 'quick-hunt', 'data-guide': 'quick-hunt' },
      h('button', {
        type: 'button',
        class: 'button button--world',
        text: 'Szybkie Polowanie',
        disabled: left === 0,
        onClick: (event) =>
          withButton(event.currentTarget, async () => {
            const { report } = await call('POST', '/api/hunts/quick', choices());
            reportCache.set(String(report.id), report);
            state.freshReport = String(report.id);
            navigate(`#/raport/${report.id}`);
          }),
      }),
      h('p', {
        class: 'muted',
        text:
          left > 0
            ? `Wyprawa jak na ${formatMinutes(minutes)}, z raportem od razu. Zostało dziś: ${left} z ${perDay}.`
            : 'Szybkie Polowania na dziś się skończyły. Nowe od północy.',
      }),
    );
  }

  // The potions to take along, each kind with −/+ up to one for each fight
  // of the length (a fern brew one at all: its `carry`), and the healing
  // mark, both remembered in this browser.
  // The wish is kept apart from what a shorter length allows, so it comes
  // back with a longer one. A change asks for the threat again.
  function potionPicker(carried, use) {
    const stored = loadChoice(POTION_KEY);
    const wanted = { ...stored.potions };
    let below = use.healBelowChoices.includes(stored.healBelow) ? stored.healBelow : use.healBelow;
    let fights = 1;
    const save = () => saveChoice({ potions: wanted, healBelow: below }, POTION_KEY);
    const changed = () => {
      save();
      loadOptions();
      showThreat?.();
    };
    const stepper = (label, onStep) => {
      const less = h('button', { type: 'button', class: 'button button--world duration-step', 'aria-label': `${label}: mniej`, text: '−', onClick: () => onStep(-1) });
      const more = h('button', { type: 'button', class: 'button button--world duration-step', 'aria-label': `${label}: więcej`, text: '+', onClick: () => onStep(1) });
      return { less, more };
    };
    const rows = carried.map((potion) => {
      const limit = () => Math.min(potion.count, fights, potion.carry ?? Infinity);
      const count = () => Math.min(wanted[potion.id] ?? 0, limit());
      const value = h('output', { class: 'potion-pick-value' });
      const { less, more } = stepper(potion.name, (sign) => {
        wanted[potion.id] = Math.max(0, Math.min(limit(), count() + sign));
        show();
        changed();
      });
      const show = () => {
        value.textContent = `${count()} z ${limit()}`;
        less.disabled = count() === 0;
        more.disabled = count() >= limit();
      };
      const element = h(
        'div',
        { class: 'potion-pick' },
        h('span', { class: 'potion-pick-art' }, potionSprite(potion.id) ?? icon('flask', { size: 20 })),
        h('span', { class: 'potion-pick-name', text: potion.name }),
        less,
        value,
        more,
      );
      return { potion, count, show, element };
    });
    const healRow = rows.find((row) => row.potion.fight === 'heal');
    const markValue = h('output', { class: 'potion-pick-value' });
    const mark = stepper('Próg leczenia', (sign) => {
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
    const element = h(
      'section',
      { class: 'potion-picks', 'aria-label': 'Mikstury na wyprawę' },
      h('p', { class: 'duration-title', text: 'Mikstury na wyprawę' }),
      rows.map((row) => row.element),
      healRow && h('div', { class: 'potion-pick' }, h('span', { class: 'potion-pick-name', text: 'Lecz poniżej' }), mark.less, markValue, mark.more),
      h('p', { class: 'muted', text: 'Każdego rodzaju najwyżej jedna na walkę, a Napar z kwiatu paproci jeden na wyprawę. Postać pije sama: leczenia poniżej progu, many, gdy zabraknie jej na umiejętność, Odtrutkę, gdy ją zatrują, a Napar, gdy padnie. Niewypite wrócą do plecaka.' }),
    );
    return {
      element,
      update(minutes) {
        fights = fightsFor(use, minutes);
        for (const row of rows) row.show();
      },
      taken: () => Object.fromEntries(rows.map((row) => [row.potion.id, row.count()]).filter(([, count]) => count > 0)),
      // The healing potions wished for, whatever the length: the server
      // takes one for each fight of every length.
      healing: () => healRow && { count: Math.min(wanted[healRow.potion.id] ?? 0, healRow.potion.count), below },
      below: () => below,
    };
  }

  // Resting can be skipped with Punkty Czasu on every Walka screen, from the
  // regions to the start: at the top, by what it shortens, so it does not
  // read as part of the exploration. Hidden once HP is full.
  function restSkip(character) {
    const left = (now) => ((character.maxHp - currentHp(state.character, now)) / Math.max(1e-9, restRate(state.character))) * 60000;
    const control = skipControl('rest', left, 'Odpoczynek');
    const text = h('p', { class: 'rest-skip-text' });
    const panel = h('div', { class: 'rest-skip', 'aria-live': 'off' }, text, control.element);
    const update = (now = serverNow()) => {
      control.update(now);
      panel.hidden = control.element.hidden;
      text.textContent = `Odpoczynek: pełne HP za ${formatMinutes(Math.max(1, Math.ceil(left(now) / 60000)))}.`;
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
