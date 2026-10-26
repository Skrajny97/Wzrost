// A hunt report: the summary at the top, then every fight of the hunt to play
// back (tabs, or a swipe on the arena), the finds, and the full text account
// on request. The report opens on its key fight.

import { createArena } from '../arena.js';
import { itemSprite, materialSprite } from '../art.js';
import { fill, h, icon } from '../dom.js';
import { countOf, dateTimeFormat, formatMinutes, formatNumber, formatOffset } from '../format.js';
import { playSound } from '../sound.js';
import { activityFinished, avoidRareOn, call, reportCache, state, trackQuestsOn } from '../state.js';
import { confirmAction, guided, openSheet, systemPanel, toast, withButton } from '../ui.js';
import { materialIcon } from '../craft-table.js';
import { itemDetails, itemSheet, itemSummary } from './character.js';

// "skóra wilka ×2, rzadkie pióro kruka": what beaten creatures left.
const materialsText = (materials) => materials.map((material) => (material.count > 1 ? `${material.label} ×${material.count}` : material.label)).join(', ');
const capitalized = (text) => text.charAt(0).toUpperCase() + text.slice(1);

const RESULT_CLASS = { success: 'result--success', fainted: 'result--fainted', escaped: 'result--escaped' };
const FIGHT_RESULTS = { true: 'wygrana', false: 'przegrana', null: 'odwrót' };
const SWIPE_DISTANCE = 60;

// A report keeps copies of its finds; the same item in the bag has an id.
const sameItem = (a, b) =>
  a.name === b.name && a.level === b.level && a.rarityName === b.rarityName && a.properties.join('|') === b.properties.join('|');

function ownedItem(item) {
  const character = state.character;
  const inBag = character.bag.find((candidate) => sameItem(candidate, item));
  if (inBag) return { item: inBag, equipped: false };
  const worn = Object.values(character.equipment).find((candidate) => candidate && sameItem(candidate, item));
  return worn ? { item: worn, equipped: true } : null;
}

// Playback data of a fight. Reports from before every fight was kept have it
// only for the key fight.
function playable(report, index) {
  const fight = report.fights?.[index];
  if (fight?.events) return { allies: fight.allies, enemies: fight.enemies, events: fight.events, won: fight.won };
  if (report.keyFight?.index === index && report.keyFight.events) {
    return { ...report.keyFight, won: fight?.won ?? report.result === 'success' };
  }
  return null;
}

export function mountReport(container, { params, navigate, backHash = '#/walka' }) {
  let arena = null;
  let report = reportCache.get(params.id) ?? null;
  let selected = null;
  let firstPlayback = true;
  const actionBox = h('div', { class: 'stack' });
  const fightBox = h('div', { class: 'fight-view' });
  // The narrator points at the tabs, or at the title of a single fight.
  const tabList = h('div', { class: 'fight-tabs', role: 'tablist', 'aria-label': 'Walki wyprawy', 'data-guide': 'report-fights' });

  // "Powrót" leads back to the tab the report was opened from: Walka or Dziennik.
  const heading = (title, subtitle) =>
    h(
      'div',
      { class: 'page-heading page-heading--back' },
      h(
        'div',
        { class: 'page-heading-text' },
        h('h1', { class: 'page-title', tabindex: '-1', text: title }),
        subtitle && h('p', { class: 'page-subtitle', text: subtitle }),
      ),
      h('a', { class: 'button button--system back-button', href: backHash }, icon('back', { size: 20 }), 'Powrót'),
    );

  async function load() {
    try {
      const data = await call('GET', `/api/reports/${params.id}`);
      report = data.report;
      reportCache.set(params.id, report);
      render();
    } catch (error) {
      fill(container, heading('Raport'), systemPanel(error.message));
    }
  }

  function render() {
    if (!report) {
      fill(container, heading('Raport z wyprawy'), h('p', { class: 'muted', text: 'Wczytywanie raportu…' }));
      return;
    }
    const count = report.fights?.length ?? 0;
    selected ??= report.keyFight?.index ?? 0;

    fill(
      container,
      heading('Raport z wyprawy', `${report.areaName ?? report.regionName} · ${formatMinutes(report.minutes)} · ${dateTimeFormat.format(new Date(report.endsAt))}`),
      summaryCard(report),
      report.system.length > 0 && guided(systemPanel(...report.system), 'report-system'),
      count > 0 &&
        h(
          'section',
          { class: 'report-section', 'aria-labelledby': 'fights-title' },
          h('h2', { class: 'section-title', id: 'fights-title', 'data-guide': count === 1 && 'report-fights', text: `Walki (${count})` }),
          count > 1 && tabList,
          fightBox,
        ),
      itemsSection(report),
      materialsSection(report),
      accountSection(report),
      actionBox,
    );
    renderTabs();
    showFight(selected);
    renderActions();
    if (report.system.length > 0 && firstPlayback) playSound('system');
  }

  function renderTabs() {
    const count = report.fights?.length ?? 0;
    fill(
      tabList,
      Array.from({ length: count }, (_, index) => {
        const fight = report.fights[index];
        const isKey = report.keyFight?.index === index;
        return h(
          'button',
          {
            type: 'button',
            class: `fight-tab fight-tab--${String(fight.won)}`,
            role: 'tab',
            'aria-selected': index === selected,
            'aria-label': `Walka ${index + 1}: ${FIGHT_RESULTS[String(fight.won)]}${isKey ? ', najważniejsza' : ''}`,
            onClick: () => select(index),
          },
          h('span', { text: index + 1 }),
          isKey && h('span', { class: 'fight-tab-key', 'aria-hidden': 'true', text: '★' }),
        );
      }),
    );
    tabList.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  function select(index) {
    const count = report.fights?.length ?? 0;
    if (index < 0 || index >= count || index === selected) return;
    selected = index;
    renderTabs();
    showFight(index, { autoplay: 'now' });
  }

  function showFight(index, { autoplay } = {}) {
    arena?.stop();
    arena = null;
    const fight = report.fights?.[index];
    if (!fight) {
      fill(fightBox);
      return;
    }
    const count = report.fights.length;
    const data = playable(report, index);
    const enemies = (fight.enemies ?? []).map((enemy) => `${enemy.name} (${enemy.level})`).join(', ');
    // Reports from before materials count the items dropped (`loot`).
    const left = fight.materials?.length > 0 ? ` · łup: ${materialsText(fight.materials)}` : fight.loot ? ` · łup: ${fight.loot}` : '';
    const chest = fight.chests > 0 ? ` · ${fight.chests === 1 ? 'skrzynia' : `skrzynie: ${fight.chests}`}` : '';
    const outcome =
      fight.won === true
        ? `HP ${fight.hpBefore} → ${fight.hpAfter} · +${formatNumber(fight.xp)} XP · +${formatNumber(fight.gold)} złota${left}${chest}`
        : `HP ${fight.hpBefore} → ${fight.hpAfter} · ${FIGHT_RESULTS[String(fight.won)]}`;
    const header = h(
      'div',
      { class: 'fight-header' },
      h(
        'p',
        { class: 'fight-title' },
        `Walka ${index + 1} z ${count}`,
        report.keyFight?.index === index && h('span', { class: 'chip chip--key', text: 'najważniejsza' }),
        fight.champion && h('span', { class: 'chip chip--champion', text: 'czempion' }),
        fight.elite && h('span', { class: 'chip chip--elite', text: 'elita' }),
        fight.tough && h('span', { class: 'chip chip--tough', text: 'wymagająca' }),
      ),
      h('p', { class: 'fight-meta', text: `${formatOffset(fight.t)} · ${enemies}` }),
      h('p', { class: `fight-outcome fight-outcome--${String(fight.won)}`, text: outcome }),
    );

    const pager =
      count > 1 &&
      h(
        'div',
        { class: 'fight-pager' },
        h('button', {
          type: 'button',
          class: 'button button--world button--small',
          disabled: index === 0,
          onClick: () => select(index - 1),
          text: '‹ Poprzednia',
        }),
        h('button', {
          type: 'button',
          class: 'button button--world button--small',
          disabled: index === count - 1,
          onClick: () => select(index + 1),
          text: 'Następna ›',
        }),
      );

    if (!data) {
      fill(fightBox, header, systemPanel('Ta walka nie ma zapisu do odtworzenia: raport powstał przed tą aktualizacją gry.'), pager);
      return;
    }
    arena = createArena(data, { autoplay: autoplay ?? (firstPlayback ? 'visible' : 'now') });
    firstPlayback = false;
    // The narrator lights the fight playing here together with the tabs.
    arena.arena.dataset.guide = 'report-fight';
    swipe(arena.arena);
    fill(fightBox, header, arena.element, pager);
  }

  // A horizontal swipe on the arena moves to the next or previous fight.
  function swipe(element) {
    let start = null;
    element.addEventListener('pointerdown', (event) => {
      start = { x: event.clientX, y: event.clientY };
    });
    element.addEventListener('pointerup', (event) => {
      if (!start) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      start = null;
      if (Math.abs(dx) > SWIPE_DISTANCE && Math.abs(dx) > Math.abs(dy) * 2) select(selected + (dx < 0 ? 1 : -1));
    });
    element.addEventListener('pointercancel', () => {
      start = null;
    });
  }

  // "Drewno +6 · Kamień +3", in the order of the content; none before the camp.
  function resourcesRow(found = {}) {
    const parts = state.content.resources
      .filter((resource) => found[resource.id] > 0)
      .map((resource) => `${resource.name} +${formatNumber(found[resource.id])}`);
    return parts.length > 0 && ['Zasoby', parts.join(' · ')];
  }

  function summaryCard(report) {
    const summary = report.summary;
    const rows = [
      ['XP postaci', `+${formatNumber(summary.xp)} XP`],
      summary.penalty > 0 && ['Kara za omdlenie', `−${formatNumber(summary.penalty)} XP postaci`],
      // Reports from before the split have no classXp: the class got the same XP.
      ['XP klasy', `+${formatNumber(summary.classXp ?? summary.xp)} XP`],
      ['Złoto', `+${formatNumber(summary.gold)}`],
      resourcesRow(summary.resources),
      summary.materials?.length > 0 && ['Materiały', capitalized(materialsText(summary.materials))],
      summary.timePoints > 0 && ['Punkty Czasu', `+${formatNumber(summary.timePoints)}`],
      ['Walki', formatNumber(summary.fights)],
      ['HP', `${summary.hpStart} → ${summary.hpEnd} / ${summary.maxHp}`],
    ].filter(Boolean);
    const best = summary.bestFind;
    return h(
      'section',
      { class: 'card report-summary', 'aria-label': 'Podsumowanie', 'data-guide': 'report-summary' },
      h('p', { class: `result ${RESULT_CLASS[report.result] ?? ''}`, text: report.resultText }),
      h(
        'dl',
        { class: 'status-list' },
        rows.map(([label, value]) => h('div', { class: 'status-row' }, h('dt', { text: label }), h('dd', { text: value }))),
        h(
          'div',
          { class: 'status-row' },
          h('dt', { text: 'Najlepsze znalezisko' }),
          h(
            'dd',
            {},
            best
              ? h(
                  'button',
                  {
                    type: 'button',
                    class: 'link-button item-name',
                    vars: { '--rarity': best.color },
                    'aria-label': `${best.name}: pokaż przedmiot`,
                    onClick: () => findSheet(best),
                  },
                  itemSprite(best),
                  best.name,
                )
              : 'brak',
          ),
        ),
      ),
    );
  }

  // A find the character still has opens like in the bag: with what wearing
  // it changes and the buttons.
  function findSheet(item) {
    const owned = ownedItem(item);
    if (owned) {
      itemSheet(owned.item, { equipped: owned.equipped });
      return;
    }
    openSheet(itemDetails(item), h('p', { class: 'muted', text: 'Tego przedmiotu nie ma już w plecaku ani w ekwipunku.' }));
  }

  // The scrapper buys what is in the bag, up to a rarity; worn and upgraded
  // items stay.
  function scrapperSheet() {
    const bag = state.character.bag.filter((item) => !(item.upgrade > 0));
    const rarities = state.content.rarities;
    const rank = (item) => rarities.findIndex((rarity) => rarity.id === item.rarity);
    openSheet(
      h('h2', { class: 'sheet-title', text: 'Złomiarz' }),
      h('p', { class: 'sheet-text', text: 'Sprzedaj przedmioty z plecaka o rzadkości niższej lub równej:' }),
      h(
        'div',
        { class: 'scrap-options' },
        rarities.map((rarity, index) => {
          const items = bag.filter((item) => rank(item) <= index);
          const gold = items.reduce((sum, item) => sum + item.price, 0);
          const amount = countOf(items.length, 'przedmiot', 'przedmioty', 'przedmiotów');
          return h(
            'button',
            {
              type: 'button',
              class: 'button button--world scrap-option',
              disabled: items.length === 0,
              onClick: () => sell(rarity, amount, gold),
            },
            h('span', { class: 'item-name', vars: { '--rarity': rarity.color }, text: rarity.name }),
            h('span', { class: 'scrap-detail', text: items.length > 0 ? `${amount} · ${formatNumber(gold)} złota` : 'nic do sprzedania' }),
          );
        }),
      ),
      h('p', { class: 'muted', text: 'Założone i ulepszone przedmioty zostają.' }),
    );
  }

  async function sell(rarity, amount, gold) {
    const sure = await confirmAction({
      title: 'Sprzedać przedmioty?',
      text: `Złomiarz kupi ${amount} (do rzadkości: ${rarity.name}) za ${formatNumber(gold)} złota.`,
      confirmLabel: 'Sprzedaj',
    });
    if (!sure) return;
    try {
      const { sold } = await call('POST', '/api/items/sell', { maxRarity: rarity.id });
      toast(`Sprzedano: ${countOf(sold.count, 'przedmiot', 'przedmioty', 'przedmiotów')} za ${formatNumber(sold.gold)} złota.`);
    } catch (error) {
      toast(error.message);
    }
  }

  function itemsSection(report) {
    if (report.items.length === 0) return null;
    return h(
      'section',
      { class: 'report-section', 'aria-labelledby': 'items-title', 'data-guide': 'report-items' },
      // Before materials, monsters also dropped items.
      h(
        'h2',
        { class: 'section-title section-title--art', id: 'items-title' },
        report.summary.materials && materialSprite('chest'),
        `${report.summary.materials ? 'Skrzynie skarbów' : 'Łupy i znaleziska'} (${report.items.length})`,
      ),
      h(
        'ul',
        { class: 'item-list' },
        report.items.map((item) =>
          h(
            'li',
            {},
            h(
              'button',
              { type: 'button', class: 'item-row', onClick: () => findSheet(item) },
              itemSummary(item),
              // Bought by the scrapper at once, because the bag was full.
              item.sold && h('span', { class: 'chip chip--dashed', text: 'sprzedany' }),
              icon('chevron', { size: 18 }),
            ),
          ),
        ),
      ),
    );
  }

  // What beaten creatures left, and the way to the Stół rzemieślniczy.
  function materialsSection(report) {
    const materials = report.summary.materials ?? [];
    if (materials.length === 0) return null;
    const table = state.character.camp.buildings.find((building) => building.crafts);
    return h(
      'section',
      { class: 'report-section', 'aria-labelledby': 'materials-title' },
      h('h2', { class: 'section-title', id: 'materials-title', text: `Materiały (${materials.reduce((sum, material) => sum + material.count, 0)})` }),
      h(
        'ul',
        { class: 'craft-list' },
        materials.map((material) =>
          h(
            'li',
            { class: 'craft-row' },
            h('span', { class: 'craft-art' }, materialIcon(material.materialId)),
            h(
              'span',
              { class: 'craft-text' },
              h('span', { class: 'item-name', vars: { '--rarity': material.color }, text: `${material.name} ×${formatNumber(material.count)}` }),
              h('span', { class: 'item-meta', text: `${material.rarityName} · daje: ${material.part} ×${formatNumber(material.count)}` }),
            ),
          ),
        ),
      ),
      table &&
        h(
          'a',
          { class: 'button button--world', href: `#/oboz/${table.id}` },
          table.level > 0 ? `Przerób na stole: ${table.name}` : `Zbuduj w obozie: ${table.name}`,
        ),
    );
  }

  // The narrator lights the button with the whole account under it, and
  // unfolds the account first ("unfold").
  function accountSection(report) {
    const list = h(
      'ol',
      { class: 'account', hidden: true, 'data-guide': 'report-account' },
      report.entries.map((entry) => h('li', {}, h('span', { class: 'account-time', text: formatOffset(entry.t) }), h('span', { text: entry.text }))),
    );
    const show = (open) => {
      list.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
    };
    const toggle = h('button', {
      type: 'button',
      class: 'button button--world',
      'data-guide': 'report-account',
      'aria-expanded': false,
      text: `Pełna relacja (${countOf(report.entries.length, 'wpis', 'wpisy', 'wpisów')})`,
      onClick: () => show(list.hidden),
    });
    toggle.addEventListener('unfold', () => show(true));
    return h('section', { class: 'report-section' }, toggle, list);
  }

  function renderActions() {
    const character = state.character;
    const idle = !character.activity;
    const again =
      idle &&
      character.huntDurations.includes(report.minutes) &&
      h('button', {
        type: 'button',
        class: 'button button--system',
        text: `Wyrusz ponownie: ${report.areaName ?? report.regionName}, ${formatMinutes(report.minutes)}`,
        onClick: (event) =>
          withButton(event.currentTarget, async () => {
            await call('POST', '/api/hunts', { areaId: report.areaId ?? report.regionId, minutes: report.minutes, avoidRare: avoidRareOn(), trackQuests: trackQuestsOn() });
            navigate('#/walka');
          }),
      });
    const waiting = character.activity && activityFinished(character.activity);
    const scrap =
      idle &&
      character.bag.length > 0 &&
      h('button', { type: 'button', class: 'button button--world', onClick: scrapperSheet, text: 'Sprzedaj zbędne przedmioty u złomiarza' });
    fill(
      actionBox,
      again,
      scrap,
      waiting && h('a', { class: 'button button--system', href: '#/walka', text: 'Kolejny raport czeka na odbiór' }),
      h('a', { class: 'button button--world', href: '#/postac', text: 'Postać i plecak' }),
      h('a', { class: 'button button--world', href: '#/dziennik', text: 'Dziennik' }),
    );
  }

  render();
  if (!report) load();
  return {
    // A change of the character (e.g. a new hunt) only changes the buttons.
    update: () => {
      if (report) renderActions();
    },
    unmount: () => arena?.stop(),
  };
}
