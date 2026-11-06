// The Osada, part I (src/server/settlement.js): a board of places to tap in
// the camp's style (question 73 A), twice as tall as the camp's, and a
// screen for each place with its resident's bust, story and greeting
// (question 76): the Tablica zleceń with its three orders, the week's big
// one and the brotherhoods' standings, the Zaklinaczka's reforging, the
// Pustelnik's prices and the Karczma's rumors (part II). The places of the
// later parts show what is to come.
//
// Where the deployment has no Osada yet, or the character is below its
// level, the tab says so as the other locked modules do.

import { placeArt, resourceArt, residentBust, scrollArt, settlementGround, settlementPlaceArt, settlementTorchArt } from '../art.js';
import { materialIcon } from '../craft-table.js';
import { fill, h, icon } from '../dom.js';
import { countOf, formatCountdown, formatDecimal, formatHours, formatMinutes, formatNumber, saleGold, tradePace } from '../format.js';
import { leaveView, openView } from '../history.js';
import { desktopLayout, onLayoutChange } from '../layout-mode.js';
import { setMusicPlace } from '../music.js';
import { dayPart } from '../scenes.js';
import { activityFinished, call, serverNow, state, unlockInfo } from '../state.js';
import { closeSheet, confirmAction, howItWorks, openSheet, pageHeading, systemPanel, toast, withButton } from '../ui.js';
import { companionCard } from '../companions.js';
import { mercenariesCard, mountMercenaryHire, serviceWaiting } from '../mercenaries.js';
import { askGuildButton } from '../guild-requests.js';
import { mountCasino } from '../casino.js';
import { trialHallCards } from '../trial-hall.js';
import { stableCard } from '../stable.js';
import { tanneryCard } from '../tannery.js';
import { wantedCard } from '../wanted.js';
import { itemSummary, piecesText } from './character.js';
import { mountMarket, numberField, stackArt, stackButton } from './market.js';

// Whether "Akceptacja Bractw" over the board is open, kept on the device.
const STANDINGS_KEY = 'insight-standings-open';
let standingsOpen = false;
try {
  standingsOpen = localStorage.getItem(STANDINGS_KEY) === '1';
} catch {
  // Folded at first without storage.
}

// A rarity's colour in the game (data/rarities.json), as items show it.
const rarityColor = (id) => state.content.rarities.find((rarity) => rarity.id === id)?.color;

// What is left of an order's week on the board: days, then hours.
function timeLeft(ms) {
  const hours = Math.max(0, ms) / 3600000;
  const days = Math.floor(hours / 24);
  return days > 0 ? `${days} ${days === 1 ? 'dzień' : 'dni'}` : formatHours(Math.max(hours, 1 / 60));
}

const SETTLEMENT = '#/osada';
const HISTORY_KEY = 'osada'; // a place's screen lies one view below the board
// The Karczma's tabs, the first one opened by default; the address may
// name another (#/osada/tavern/mercenaries).
const TAVERN_TABS = ['mug', 'companions', 'mercenaries'];
// The board's ground, in its pixels: a place's picture keeps its own size on it.
const BOARD_WIDTH = 384;
// Its shape, as styles.css draws it (.settlement-map, aspect-ratio 384 / 768).
const MAP_SIZE = { width: BOARD_WIDTH, height: 768 };
// On a computer: the room left beside the board for its title and the
// Akceptacja Bractw, and the gap between (styles.css, .settlement-board-view).
const SIDE_MIN = 220;
const SIDE_GAP = 20;

export function mountSettlement(container, { params = {} } = {}) {
  const placeId = params.place ?? null;
  let data = null;
  let failure = null;
  let gone = false;
  let timer = null;
  // The orders the player unfolded: the Tablica lists them folded to their
  // names (the author: "powinny być zwinięte do nazw").
  const unfolded = new Set();
  // Jagna's tab: Kup first (the author: "trzeba zacząć u niej od zakładki
  // Kup/Sprzedaj"), kept while the screen redraws.
  let herbalistTab = 'buy';
  // Wszebor's tab in the Garbarnia (tannery.js), as Jagna's.
  let tanneryTab = 'buy';
  // The Tablica zleceń's tab: the sołtys's orders first, then Poszukiwani
  // (the author: "Podziel tablicę zleceń na dwie zakładki - zlecenia i
  // poszukiwani bo za dużo scrollowania"), kept while the screen redraws.
  let boardTab = 'orders';
  // The Karczma's tab: the mug with the rumor first, then the companions
  // and the mercenaries (the author: "Daj też opcję wynajęcia z pozycji
  // Karczmy i zrób zakładki, bo też trzeba scrollować"), kept while the
  // screen redraws. The address may name it (the top bar leads a mercenary
  // to its tab) and follows the tab chosen, as the Encyklopedia's does.
  let tavernTab = TAVERN_TABS.includes(params.tab) ? params.tab : 'mug';
  // The mercenaries waiting to be hired (mercenaries.js), mounted once their
  // tab opens and kept while the screen redraws, as the Targowisko is.
  let hire = null;
  const hirePanel = () => {
    if (!hire) {
      const holder = h('section', { class: 'stack mercenary-hire', 'data-guide': 'tavern-hire' });
      hire = { holder, ...mountMercenaryHire(holder) };
    } else hire.refresh();
    return hire.holder;
  };
  // The Targowisko's panel, mounted once and kept while the screen redraws
  // itself, so that a redraw does not ask the server for it again.
  let market = null;
  const marketPanel = () => {
    if (!market) {
      const holder = h('div', { class: 'market' });
      market = { holder, ...mountMarket(holder) };
    } else market.refresh();
    return market.holder;
  };
  // The Salon Gier's games (casino.js), kept so too.
  let casino = null;
  const casinoPanel = () => {
    if (!casino) {
      const holder = h('div', { class: 'casino' });
      casino = { holder, ...mountCasino(holder) };
    } else casino.refresh();
    return casino.holder;
  };

  async function load() {
    try {
      data = (await call('GET', '/api/settlement')).settlement;
      failure = null;
    } catch (error) {
      // With the Osada already on the screen, it stays and the game asks
      // again in half a minute (the code review: one refresh failed as the
      // phone woke without a network left an error for good).
      if (data && error.status !== 403 && error.status !== 404) {
        if (gone) return;
        clearTimeout(timer);
        timer = setTimeout(load, 30000);
        return;
      }
      failure = error;
    }
    if (gone) return;
    // The Osada's own music (the author's, question 78 A), once it is open,
    // or a place's own, as the Salon Gier's (the author's of 3.11.2026).
    if (data) setMusicPlace(placeId ? [`settlement:${placeId}`, 'settlement'] : ['settlement']);
    render();
  }

  // What an action answers with: the Osada as it is after it.
  const apply = (answer) => {
    if (answer.settlement) data = answer.settlement;
    if (!gone) render();
  };

  function locked() {
    const unlock = unlockInfo('settlement');
    const message =
      failure.status === 403
        ? `Dostęp zablokowany. ${unlock.name}: od poziomu postaci ${unlock.level}. Twój poziom: ${state.character.level}.`
        : `Moduł ${unlock.name} pojawi się w jednej z kolejnych aktualizacji gry.`;
    fill(container, pageHeading('Osada'), systemPanel(message));
  }

  function orderCard(order) {
    const enough = order.have >= order.count;
    const deliver = h('button', {
      type: 'button',
      class: 'button button--world',
      text: 'Oddaj',
      disabled: !enough,
      onClick: (event) =>
        withButton(event.currentTarget, async () => {
          const answer = await call('POST', '/api/settlement/deliver', { orderId: order.id });
          // `taught`: the rare recipes Jagna teaches as the Bractwo
          // Zielarzy's reputation reaches a standing (682 A and C).
          const { gold, systemPoints, taught } = answer.delivered;
          toast(`Zlecenie oddane: +${formatNumber(gold)} złota${systemPoints ? `, +${systemPoints} PS` : ''}.${taught ? ` ${taught}` : ''}`);
          apply(answer);
        }),
    });
    const reject =
      order.id !== 'weekly' &&
      h('button', {
        type: 'button',
        class: 'button button--small',
        text: 'Odrzuć',
        onClick: async (event) => {
          const button = event.currentTarget;
          const wait = data.board.refillMinutes ? `za ${formatMinutes(data.board.refillMinutes)}` : 'za kilka godzin';
          if (!(await confirmAction({ title: 'Odrzucić zlecenie?', text: `Nowe zlecenie przyjdzie ${wait}.`, confirmLabel: 'Odrzuć' }))) return;
          withButton(button, async () => apply(await call('POST', '/api/settlement/reject', { orderId: order.id })));
        },
      });
    // Folded, an order shows its name, and a gold dot when it can be delivered.
    return h(
      'details',
      {
        class: 'card settlement-order settlement-fold',
        open: unfolded.has(order.id),
        onToggle: (event) => (event.currentTarget.open ? unfolded.add(order.id) : unfolded.delete(order.id)),
      },
      h(
        'summary',
        { class: 'settlement-fold-head' },
        h(
          'span',
          { class: 'settlement-fold-name' },
          order.weekly && h('span', { class: 'settlement-weekly', text: 'Zlecenie tygodnia' }),
          order.special && h('span', { class: 'settlement-weekly', text: 'Zlecenie specjalne' }),
          h('span', { class: 'settlement-ask', text: order.forms ? countOf(order.count, ...order.forms) : `${formatNumber(order.count)} × ${order.label}` }),
        ),
        enough && [h('span', { class: 'settlement-fold-dot', 'aria-hidden': 'true' }), h('span', { class: 'visually-hidden', text: 'Można oddać' })],
        icon('chevron', { size: 18, className: 'settlement-fold-chevron' }),
      ),
      h(
        'div',
        { class: 'settlement-fold-body' },
        h('p', { class: 'settlement-story', text: `„${order.story}”` }),
        h('p', { class: 'settlement-ask', text: `Masz ${formatNumber(order.have)} z ${formatNumber(order.count)}` }),
        h('p', { class: 'muted', text: `Zapłata: ${formatNumber(order.gold)} złota, +${order.reputation} reputacji: ${order.brotherhoodName}${order.special ? ', +1 PS' : ''}` }),
        order.expiresAt && h('p', { class: 'muted', text: `Termin: jeszcze ${timeLeft(order.expiresAt - serverNow())}` }),
        order.kind === 'craft' && h('p', { class: 'muted', text: 'Wyroby z Warsztatu oddajesz z plecaka, najpierw najsłabsze.' }),
        // Any materials of a rarity: what delivering takes, from the biggest stacks.
        order.forms &&
          h('p', {
            class: 'muted',
            text: order.takes ? `Oddasz: ${order.takes.map((one) => `${formatNumber(one.count)} × ${one.name}`).join(', ')}.` : `Pasuje każdy ${order.forms[0]}.`,
          }),
        h('div', { class: 'settlement-actions' }, deliver, reject),
        !enough && orderAsk(order),
      ),
    );
  }

  // "Poproś gildię" for what an order lacks (346 A): its herb or potion, its
  // material, or, when any materials of a rarity will do, one of them that
  // is no trophy (as the order takes them).
  function orderAsk(order) {
    const missing = order.count - order.have;
    if (order.kind === 'herb' || order.kind === 'potion') return askGuildButton({ kind: order.kind, key: order.key, name: order.label, missing });
    if (order.kind !== 'material') return null;
    const rarity = order.key.slice(order.key.lastIndexOf(':') + 1);
    return order.forms ? askGuildButton({ kind: 'material', rarity, ordinary: true, missing }) : askGuildButton({ kind: 'material', key: order.key, name: order.label, missing });
  }

  function boardCard() {
    const slots = data.board.slots.map((slot) =>
      slot.order
        ? orderCard(slot.order)
        : h('div', { class: 'card settlement-order settlement-order--empty' }, h('p', { class: 'muted', text: `Nowe zlecenie za ${formatCountdown(slot.readyAt - serverNow())}.` })),
    );
    const weekly = data.board.weekly ? orderCard({ ...data.board.weekly, weekly: true }) : data.board.weeklyDone && h('p', { class: 'muted', text: 'Zlecenie tygodnia oddane. Następne w poniedziałek.' });
    return h('section', { class: 'settlement-board' }, h('h2', { class: 'section-title', text: 'Tablica zleceń' }), slots, weekly);
  }

  // "Akceptacja Bractw" over the board (the author: "Niech przy wejściu do
  // Osady wyświetla się gdzieś łatwo dostepny (zwijalny) poziom akceptacji
  // przez Bractwa"): folded, each brotherhood's standing in one line;
  // unfolded, its bar to the next standing with the points, what the
  // standing gives now and what the next adds. Open or folded as the player
  // left it, on this device.
  function standingsPanel() {
    const words = data.brotherhoodsPanel;
    if (!words) return null;
    const say = (text, vars) => text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
    const perkList = (label, perks, muted) =>
      perks.length > 0 &&
      h('div', { class: `settlement-standing-perks${muted ? ' settlement-standing-perks--next' : ''}` }, h('p', { class: 'settlement-standing-label', text: label }), h('ul', {}, perks.map((perk) => h('li', { text: perk }))));
    // The reward for the standings reached and not rewarded yet (593 A and
    // B): what comes, and "Odbierz".
    const goodsText = (goods) => goods.map((good) => `${good.name} ×${formatNumber(good.count)}`).join(', ');
    const rewardBlock = (brotherhood) =>
      brotherhood.reward &&
      h(
        'div',
        { class: 'settlement-standing-reward' },
        h('p', { class: 'settlement-standing-label', text: say(words.reward, { standings: brotherhood.reward.standings.join(', ') }) }),
        h('ul', {}, brotherhood.reward.goods.map((good) => h('li', { text: `${good.name} ×${formatNumber(good.count)}` }))),
        h('button', {
          type: 'button',
          class: 'button button--world',
          text: words.claim,
          onClick: (event) =>
            withButton(event.currentTarget, async () => {
              const answer = await call('POST', '/api/settlement/brotherhoods/reward', { brotherhood: brotherhood.id });
              toast(say(words.claimed, { list: goodsText(answer.reward.goods) }));
              apply(answer);
            }),
        }),
      );
    const row = (brotherhood) => {
      const { name, points, standing, perks } = brotherhood;
      const floor = standing.points;
      const ceiling = standing.next?.points ?? floor;
      const share = standing.next ? Math.max(0, Math.min(1, (points - floor) / (ceiling - floor))) : 1;
      const bar = h('div', { class: 'meter-fill' });
      bar.style.width = `${share * 100}%`;
      const where = standing.next ? say(words.toNext, { toNext: formatNumber(standing.toNext), next: standing.next.name }) : words.top;
      return h(
        'li',
        { class: 'settlement-standing' },
        h('p', { class: 'settlement-standing-head' }, h('strong', { text: name }), h('span', { class: 'chip settlement-standing-chip', text: standing.name })),
        h('div', { class: 'meter settlement-standing-meter' }, h('div', { class: 'meter-track', role: 'progressbar', 'aria-label': `${name}: reputacja`, 'aria-valuemin': floor, 'aria-valuemax': ceiling, 'aria-valuenow': points }, bar)),
        h('p', { class: 'muted settlement-standing-points', text: `${say(words.points, { points: formatNumber(points) })} · ${where}` }),
        rewardBlock(brotherhood),
        perkList(words.now, perks.now, false),
        standing.next && perkList(say(words.next, { next: standing.next.name }), perks.next, true),
      );
    };
    const fold = h(
      'details',
      {
        class: 'card settlement-standings',
        // The narrator's line about the brotherhoods points here.
        'data-guide': 'osada-standings',
        open: standingsOpen,
        onToggle: () => {
          standingsOpen = fold.open;
          try {
            localStorage.setItem(STANDINGS_KEY, standingsOpen ? '1' : '0');
          } catch {
            // Kept while the page is open.
          }
          fitMap();
        },
      },
      h(
        'summary',
        { class: 'settlement-standings-summary' },
        h('span', { class: 'settlement-standings-title', text: words.title }),
        h('span', { class: 'settlement-standings-line', text: data.brotherhoods.map((one) => `${one.short ?? one.name}: ${one.standing.name}`).join(' · ') }),
        data.brotherhoods.some((one) => one.reward) &&
          h('span', { class: 'settlement-standings-waiting' }, h('span', { class: 'settlement-fold-dot', 'aria-hidden': 'true' }), words.waiting),
      ),
      h('ul', { class: 'settlement-standings-list' }, data.brotherhoods.map(row)),
      h('p', { class: 'muted settlement-standings-how', text: words.how }),
    );
    return fold;
  }

  const brotherhoodsCard = () =>
    h(
      'section',
      { class: 'card settlement-brotherhoods' },
      h('h2', { class: 'section-title', text: 'Bractwa' }),
      data.brotherhoods.map(({ name, standing, goods }) =>
        h(
          'p',
          {},
          h('strong', { text: name }),
          `: ${standing.name}`,
          standing.next ? `, ${formatNumber(standing.toNext)} pkt do stopnia ${standing.next.name}` : '',
          goods.length === 0 ? ' (handel na Targowisku)' : '',
        ),
      ),
    );

  // An item the Zaklinaczka can reforge as the bag and the equipment show
  // it, with its picture and rarity, or its name alone.
  const itemView = (id) => (state.character.bag ?? []).find((one) => one.id === id) ?? Object.values(state.character.equipment ?? {}).find((one) => one?.id === id);
  const itemHead = (item) => {
    const view = itemView(item.id);
    return view ? itemSummary(view) : h('span', { class: 'item-name', text: item.name });
  };
  const pickMark = () => h('span', { class: 'trade-pick-mark', 'aria-hidden': 'true' }, icon('check', { size: 18 }));

  // What a service takes, as the Kowadło shows it: gold and the materials,
  // each as had / needed, red while short, and what is missing (a tester
  // via the author: "Co masz ile ci czego brakuje", "Może żeby jakoś
  // graficznie to przedstawić"). `need` is the materials' count and rarity
  // with the pieces of that rarity held in all (`have`: any materials of it
  // add up, 481 B) and those the server takes (`takes`, the most plentiful
  // material first; null while too few), or null; `who` begins the sentence
  // on them ("Kowal").
  function costPart({ gold, need, title, who }) {
    const goldShort = Math.max(0, gold - state.character.gold);
    const chip = (art, label, have, wanted) =>
      h('li', { class: `cost${have < wanted ? ' cost--missing' : ''}` }, art, h('span', { text: label }), h('strong', { text: `${formatNumber(have)} / ${formatNumber(wanted)}` }));
    const materialShort = need && !need.takes ? Math.max(1, need.count - need.have) : 0;
    const materialChip =
      need && chip(need.takes ? materialIcon(need.takes[0].materialId, 16) : icon('unknown', { size: 16 }), `Materiały (${need.rarityName})`, need.have, need.count);
    const missing = [goldShort > 0 && `${formatNumber(goldShort)} złota`, materialShort > 0 && `${formatNumber(materialShort)} szt. materiałów (${need.rarityName})`].filter(Boolean);
    return {
      goldShort,
      // The materials there to give, or none needed.
      materialReady: !need || Boolean(need.takes),
      element: [
        h('p', { class: 'field-label', text: title }),
        h('ul', { class: 'cost-list', 'aria-label': title }, chip(resourceArt('gold', 16), 'Złoto', state.character.gold, gold), materialChip),
        // Which pieces go, the server's pick, or the rule while too few.
        need &&
          h('p', {
            class: 'muted',
            text: need.takes
              ? `${who} weźmie: ${piecesText(need.takes)}.`
              : `${who} bierze ${formatNumber(need.count)} szt. materiałów o rzadkości „${need.rarityName}” (dowolnych, sumują się).`,
          }),
        missing.length > 0 && h('p', { class: 'region-warning', text: `Brakuje: ${missing.join(', ')}.` }),
        materialShort > 0 && h('p', { class: 'system-hint', text: 'Materiały tej rzadkości wypadają ze stworów na wyprawach. Kupisz je też na Targowisku.' }),
        // A material of the rarity, from the guild (346 A): what is missing
        // in all, of whichever material is asked for.
        materialShort > 0 && askGuildButton({ kind: 'material', rarity: need.rarity, missing: materialShort }),
      ],
    };
  }

  // The Zaklinaczka's reforging in a sheet, a step at a time, in the game's
  // own rows (the author: "ekran wyboru przy afiksie powinien być
  // ingameowy"): the item, then its affix with what it takes, then what
  // the affix became, or the affixes she drew to keep one of.
  // The zaklęcie żywiołu in a sheet (part III, question 101 A): a weapon or
  // a body armour, then its element, each with what it gives and costs.
  function imbueSheet() {
    const body = h('div', { class: 'settlement-reforge' });
    const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);
    openSheet(h('h2', { class: 'sheet-title', text: 'Zaklęcie żywiołu' }), body);
    pickItem();

    function pickItem() {
      const { items } = data.imbue;
      fill(
        body,
        items.length === 0
          ? h('p', { class: 'muted', text: 'Nie masz broni ani pancerza do zaklęcia.' })
          : [
              h('p', { class: 'sheet-text', text: 'Wybierz broń albo pancerz. Broń zamieni część obrażeń na żywioł, a pancerz dostanie odporność na niego.' }),
              h(
                'ul',
                { class: 'item-list' },
                items.map((item) =>
                  h(
                    'li',
                    {},
                    h('button', { type: 'button', class: 'item-row', onClick: () => pickElement(item.id) }, itemHead(item), item.equipped && h('span', { class: 'chip', text: 'Założony' })),
                  ),
                ),
              ),
            ],
      );
    }

    function pickElement(itemId) {
      const item = data.imbue.items.find((one) => one.id === itemId);
      if (!item) return pickItem();
      const now = item.element && data.imbue.elements.find((one) => one.element === item.element);
      fill(
        body,
        h('button', { type: 'button', class: 'link-button settlement-back', onClick: pickItem }, icon('back', { size: 16 }), 'Inny przedmiot'),
        h('div', { class: 'settlement-reforge-item' }, itemHead(item)),
        now && h('p', { class: 'muted', text: `Ma już żywioł: ${now.name}. Nowy zastąpi stary.` }),
        data.imbue.elements.map((element) => {
          const effect = item.effects[element.element];
          const gives = effect.share ? `${Math.round(effect.share * 100)}% obrażeń jako ${element.name}` : `odporność na ${element.name} +${effect.value}`;
          const ready = element.have >= element.count && state.character.gold >= item.gold && item.element !== element.element;
          return h(
            'div',
            { class: 'settlement-choice' },
            h('p', {}, h('strong', { text: capital(element.name) }), ` · ${gives}`),
            h('p', { class: 'muted', text: `${formatNumber(item.gold)} zł. i ${element.count} × ${element.material} (masz ${formatNumber(element.have)})` }),
            // The element's material, from the guild (346 A).
            element.have < element.count && askGuildButton({ kind: 'material', key: element.key, name: element.material, missing: element.count - element.have }),
            h('button', {
              type: 'button',
              class: 'button button--world button--small',
              text: `Zaklnij: ${element.name}`,
              disabled: !ready,
              onClick: (event) =>
                withButton(event.currentTarget, async () => {
                  const answer = await call('POST', '/api/settlement/imbue', { itemId: item.id, element: element.element });
                  apply(answer);
                  closeSheet();
                  toast(`Zaklinaczka zaklęła żywioł w przedmiot ${answer.imbued.item}: ${answer.imbued.element}.`);
                }),
            }),
          );
        }),
      );
    }
  }

  function reforgeSheet() {
    const body = h('div', { class: 'settlement-reforge' });
    openSheet(h('h2', { class: 'sheet-title', text: 'Zaklęcie afiksu' }), body);
    if (data.reforge.pending) choose(data.reforge.pending);
    else pickItem();

    function pickItem() {
      const items = data.reforge.items;
      fill(
        body,
        items.length === 0
          ? h('p', { class: 'muted', text: 'Nie masz przedmiotów z afiksami do zaklęcia.' })
          : [
              h('p', { class: 'sheet-text', text: 'Wybierz przedmiot. Zaklinaczka zaklnie jeden jego afiks: wylosuje go od nowa.' }),
              h(
                'ul',
                { class: 'item-list' },
                items.map((item) =>
                  h(
                    'li',
                    {},
                    h('button', { type: 'button', class: 'item-row', onClick: () => pickAffix(item.id) }, itemHead(item), item.equipped && h('span', { class: 'chip', text: 'Założony' })),
                  ),
                ),
              ),
            ],
      );
    }

    function pickAffix(itemId, affix = null) {
      const item = data.reforge.items.find((one) => one.id === itemId);
      if (!item) return pickItem();
      // An item with one affix has nothing to choose.
      let chosen = affix ?? (item.affixes.length === 1 ? 0 : null);
      const draw = () => {
        const cost = costPart({ gold: item.gold, need: item.materials, title: 'Koszt zaklęcia', who: 'Zaklęcie' });
        const ready = chosen !== null && cost.goldShort === 0 && cost.materialReady;
        fill(
          body,
          h('button', { type: 'button', class: 'link-button settlement-back', onClick: pickItem }, icon('back', { size: 16 }), 'Inny przedmiot'),
          h('div', { class: 'settlement-reforge-item' }, itemHead(item)),
          // The cost first, seen at once.
          cost.element,
          h('p', { class: 'field-label', text: 'Afiks do zaklęcia' }),
          h(
            'div',
            { class: 'settlement-picks' },
            item.affixes.map((label, index) => {
              // ★ for a stat the class needs, and the one worth reforging
              // (319 A).
              const hint = item.hints?.[index] ?? {};
              return h(
                'button',
                {
                  type: 'button',
                  class: 'item-row trade-pick settlement-pick',
                  'aria-pressed': String(index === chosen),
                  'aria-label': [label, hint.important && 'ważne dla Twojej klasy', hint.worth && 'warto zakląć'].filter(Boolean).join(', '),
                  onClick: () => {
                    chosen = index;
                    draw();
                  },
                },
                h(
                  'span',
                  { class: 'settlement-pick-text' },
                  hint.important && h('span', { class: 'affix-star', 'aria-hidden': 'true', text: '★ ' }),
                  label,
                  hint.worth && h('span', { class: 'affix-worth', text: 'Warto zakląć' }),
                ),
                pickMark(),
              );
            }),
          ),
          data.reforge.choices > 1 && h('p', { class: 'muted', text: `Zaklinaczka wylosuje ${data.reforge.choices} nowe afiksy, a Ty zatrzymasz jeden z nich.` }),
          h('button', {
            type: 'button',
            class: 'button button--world',
            text: chosen === null ? 'Wybierz afiks' : cost.goldShort > 0 ? 'Brakuje złota' : !cost.materialReady ? 'Brakuje materiału' : 'Zaklnij',
            disabled: !ready,
            onClick: (event) =>
              withButton(event.currentTarget, async () => {
                const answer = await call('POST', '/api/settlement/reforge', { itemId, affix: chosen });
                await load();
                if (answer.pending) choose(answer.pending, { affix: chosen });
                else showResult(answer.result, { affix: chosen });
              }),
          }),
        );
      };
      draw();
    }

    // The affixes she drew: the one tapped goes on the item.
    function choose(pending, again = {}) {
      fill(
        body,
        h('div', { class: 'settlement-reforge-item' }, itemHead({ id: pending.itemId, name: pending.name })),
        h('p', { class: 'sheet-text', text: `Zaklinaczka wylosowała ${pending.options.length} afiksy. Wybierz ten, który zastąpi „${pending.old}”.` }),
        h(
          'div',
          { class: 'settlement-picks' },
          pending.options.map((label, option) =>
            h(
              'button',
              {
                type: 'button',
                class: 'item-row settlement-pick',
                onClick: (event) =>
                  withButton(event.currentTarget, async () => {
                    const answer = await call('POST', '/api/settlement/reforge/choose', { option });
                    await load();
                    showResult(answer.result, again);
                  }),
              },
              h('span', { class: 'settlement-pick-text', text: label }),
              icon('chevron', { size: 18 }),
            ),
          ),
        ),
      );
    }

    // What the affix became; the same affix can be reforged again at once.
    function showResult(result, { affix = null } = {}) {
      fill(
        body,
        h('p', { class: 'settlement-result-title', text: 'Zaklinaczka zaklęła afiks' }),
        h('div', { class: 'settlement-reforge-item' }, itemHead({ id: result.itemId, name: result.name })),
        h(
          'p',
          { class: 'settlement-change' },
          h('span', { class: 'settlement-change-old', text: result.old }),
          icon('chevron', { size: 18 }),
          h('span', { class: 'settlement-change-new', text: result.new }),
        ),
        h(
          'div',
          { class: 'sheet-actions' },
          h('button', { type: 'button', class: 'button button--world', text: 'Zaklnij ponownie', onClick: () => pickAffix(result.itemId, affix) }),
          h('button', { type: 'button', class: 'button button--system', text: 'Gotowe', onClick: closeSheet }),
        ),
      );
    }
  }

  // A Pustelnik's reset, after the player says yes.
  const hermitButton = (service, label, text) =>
    h('button', {
      type: 'button',
      class: 'button button--world button--small',
      text: label,
      onClick: async (event) => {
        const button = event.currentTarget;
        if (!(await confirmAction({ title: 'Zerowanie u Pustelnika', text, confirmLabel: 'Zeruj' }))) return;
        withButton(button, async () => {
          const answer = await call('POST', '/api/settlement/hermit', { service });
          toast(`Pustelnik wziął ${formatNumber(answer.gold)} złota. Gotowe.`);
          load();
        });
      },
    });

  // The affixes a reforging drew, waiting in the Osada for the one the
  // player keeps: the sheet picks up there.
  const choiceCard = ({ name, old }) =>
    h(
      'div',
      { class: 'settlement-choice' },
      h('p', {}, h('strong', { text: name }), `: Zaklinaczka czeka, aż wybierzesz afiks w miejsce „${old}”.`),
      h('button', { type: 'button', class: 'button button--world', text: 'Wybierz afiks', onClick: reforgeSheet }),
    );

  // The Pustelnik's change of evolution: the class's other evolutions, the
  // first change free.
  function evolutionSheet() {
    const offer = data.hermit.evolution;
    const price = offer.price > 0 ? `${formatNumber(offer.price)} złota` : 'za darmo, pierwszy raz';
    openSheet(
      h('h2', { class: 'sheet-title', text: 'Zmiana ewolucji' }),
      h(
        'div',
        { class: 'settlement-choice' },
        h('p', { class: 'muted', text: `Teraz: ${offer.current}. Zmiana: ${price}. Umiejętności nowej ewolucji zaczniesz od zera, a punkty z nich wrócą do rozdania.` }),
        h(
          'div',
          { class: 'settlement-actions' },
          offer.choices.map((choice) =>
            h('button', {
              type: 'button',
              class: 'button button--world button--small',
              text: choice.name,
              disabled: state.character.gold < offer.price,
              onClick: async (event) => {
                const button = event.currentTarget;
                if (!(await confirmAction({ title: `Zmienić ewolucję na: ${choice.name}?`, text: `Koszt: ${price}.`, confirmLabel: 'Zmień' }))) return;
                withButton(button, async () => {
                  await call('POST', '/api/settlement/hermit', { service: 'evolution', evolutionId: choice.id });
                  closeSheet();
                  toast(`Nowa ewolucja: ${choice.name}.`);
                  load();
                });
              },
            }),
          ),
        ),
      ),
    );
  }

  // The Karczma (question 116): a mug and, with it, today's rumor of an
  // elite or a champion; one a day.
  // The rumor is the innkeeper's words alone: what it means, the player
  // finds out (the author: "nie informuj z pozycji Systemu co oznacza
  // plotka, zeby gracz sie domyślił").
  function tavernCard() {
    const { mug, rumor } = data.tavern;
    if (!rumor) {
      return h(
        'div',
        { class: 'settlement-choice', 'data-guide': 'tavern-mug' },
        h('p', { class: 'muted', text: 'Za kufel Zbylut chętnie podzieli się plotką z traktu.' }),
        h('button', {
          type: 'button',
          class: 'button button--world',
          text: `Postaw kufel (${formatNumber(mug)} zł.)`,
          disabled: state.character.gold < mug,
          onClick: (event) =>
            withButton(event.currentTarget, async () => {
              apply(await call('POST', '/api/settlement/tavern'));
            }),
        }),
      );
    }
    return h(
      'div',
      { class: 'settlement-choice', 'data-guide': 'tavern-mug' },
      h('p', { class: 'settlement-greeting', text: rumor.text }),
      h('p', { class: 'muted', text: 'Następną plotkę Zbylut usłyszy jutro.' }),
    );
  }

  // The werbunek: this week's candidates; the companions hired live in the
  // camp's Kwatery (the author: "Po zwerbowaniu postac powinna zniknąć z
  // Karczmy i pojawić się w Kwaterach"), each with a bed there.
  function companionsCard() {
    const { places, moreBeds, hired, candidates } = data.companions;
    const full = hired.length >= places;
    // The author's words, the camp's Kwatery stressed in them; every
    // standing with Zbylut may hire, a lower one for more gold.
    const intro = howItWorks(
      'Towarzysze idą z tobą na każdą wyprawę poza Szybkim i Błyskawicznym Polowaniem.',
      h(
        'p',
        { class: 'muted' },
        'Rosną w siłę razem z tobą. Opłata za werbunek jest jednorazowa, a im lepiej zna cię Zbylut, tym jest tańsza. Towarzysz potrzebuje posłania: ',
        h('strong', { class: 'text-stress', 'data-guide': 'tavern-quarters', text: 'zbuduj Kwatery w obozie' }),
        '.',
      ),
    );
    const beds =
      places > 0 &&
      h(
        'p',
        { class: 'muted' },
        `Posłania: ${hired.length} z ${places}.${full && moreBeds ? ' Kolejne da rozbudowa Kwater.' : ''} `,
        hired.length > 0 && h('a', { href: '#/oboz/quarters', text: hired.length === 1 ? 'Twój towarzysz czeka w Kwaterach.' : 'Twoi towarzysze czekają w Kwaterach.' }),
      );
    const hire = (candidate) =>
      h('button', {
        type: 'button',
        class: 'button button--world button--small',
        text: `Zwerbuj (${formatNumber(candidate.price)} zł.)`,
        disabled: full || state.character.gold < candidate.price,
        onClick: (event) =>
          withButton(event.currentTarget, async () => {
            apply(await call('POST', '/api/settlement/hire', { candidateId: candidate.id }));
            toast(`${candidate.name} ${candidate.appearance === 'female' ? 'zamieszkała' : 'zamieszkał'} w Kwaterach w obozie.`);
          }),
      });
    return h(
      'section',
      { class: 'stack', 'data-guide': 'tavern-companions' },
      h('h2', { class: 'section-title', text: 'Towarzysze' }),
      intro,
      beds,
      h('h2', { class: 'section-title', text: 'Szukają pracy w tym tygodniu' }),
      candidates.length === 0
        ? h('p', { class: 'muted', text: 'Nikt więcej nie szuka pracy. Nowi przyjdą w poniedziałek.' })
        : candidates.map((candidate) =>
            // One line each, the whole card under a tap (316 A).
            h(
              'details',
              { class: 'tavern-candidate' },
              h(
                'summary',
                { class: 'tavern-candidate-line' },
                h('span', { class: 'tavern-candidate-name', text: `${candidate.name}, ${candidate.className}, poz. ${candidate.level}` }),
                h('span', { class: 'tavern-candidate-price', text: `${formatNumber(candidate.price)} zł.` }),
              ),
              companionCard(candidate, hire(candidate), apply),
            ),
          ),
    );
  }

  // Jagna's herb for sale: how many the gold and the bag allow, typed in.
  function herbalistBuySheet(good) {
    const most = Math.min(good.fits, Math.floor(state.character.gold / good.price));
    const field = numberField('herbalist-buy-count', 'Ile sztuk', 1, 1, Math.max(1, most));
    openSheet(
      h('h2', { class: 'sheet-title', text: good.name }),
      h('p', { class: 'sheet-text', text: `${formatNumber(good.price)} zł. za sztukę. Możesz kupić najwyżej ${formatNumber(most)} szt.: na tyle starczy złota i miejsca w plecaku.` }),
      field.element,
      h(
        'div',
        { class: 'sheet-actions' },
        h('button', { type: 'button', class: 'button button--world', text: 'Anuluj', onClick: closeSheet }),
        h('button', {
          type: 'button',
          class: 'button button--system',
          text: 'Kup',
          onClick: (event) =>
            withButton(event.currentTarget, async () => {
              const answer = await call('POST', '/api/settlement/herbalist/buy', { id: good.key, count: field.read() });
              closeSheet();
              apply(answer);
              // `taught`: the rare recipes the trade made her teach (121 A).
              const { name, count, gold, points, taught } = answer.bought;
              toast(`Kupione: ${name} ×${formatNumber(count)} za ${formatNumber(gold)} zł.${points > 0 ? ` Relacja z Jagną i reputacja Bractwa Zielarzy +${points}.` : ''}${taught ? ` ${taught}` : ''}`);
            }),
        }),
      ),
    );
  }

  // Jagna's Kup tab: the herbs she sells at the relation with her (the
  // author: "Niech ma na początku 3 podstawowe zioła, a w miarę zwiekszania
  // znajomości coraz więcej"), each opening its card under a tap, dearer
  // than anyone buys them ("Kup oczywiście zawsze drożej"), and the standing
  // that brings more.
  function herbalistShop() {
    const { shop, trade } = data.herbalist;
    const gold = state.character.gold;
    return h(
      'section',
      { class: 'stack', 'data-guide': 'herbalist-buy' },
      h('h2', { class: 'section-title', text: 'Zioła Jagny' }),
      h('p', {
        class: 'muted',
        text: `Jagna sprzedaje zioła drożej, niż je skupuje. ${shop.discount > 0 ? `Dzięki relacji z nią ceny są niższe o ${formatDecimal(shop.discount * 100)}%.` : 'Z lepszą relacją ceny będą niższe.'} Handel daje relację z nią i reputację Bractwa Zielarzy: dziś ${trade.today} z ${trade.daily} punktów.${tradePace(trade)}`,
      }),
      shop.goods.some((good) => good.fits < 1) && h('p', { class: 'region-warning', text: 'Plecak jest pełny. Zrób w nim miejsce, żeby kupić więcej ziół.' }),
      h(
        'ul',
        { class: 'stack market-list' },
        shop.goods.map((good) => {
          const button = (small) =>
            h('button', {
              type: 'button',
              class: `button button--world${small ? ' button--small' : ''}`,
              text: 'Kup',
              disabled: good.fits < 1 || gold < good.price,
              onClick: () => herbalistBuySheet(good),
            });
          const price = `${formatNumber(good.price)} zł. za sztukę`;
          return h(
            'li',
            { class: 'card herbalist-good' },
            stackButton(good, { count: false, meta: price }, () => [h('p', { class: 'market-price', text: `Jagna: ${price}.` }), button(false)]),
            button(true),
          );
        }),
      ),
      shop.next && h('p', { class: 'muted', text: `Od stopnia relacji ${shop.next.standing} dojdą: ${shop.next.herbs.join(', ')}.` }),
      herbalistRecipes(),
    );
  }

  // Jagna's rare recipes of Alchemia under her herbs (121 A: "zaufanym
  // zdradza rzadkie receptury"): those she has taught, each with its icon
  // and when the Pracownia brews it, and the standing that teaches the next.
  function herbalistRecipes() {
    const { recipes } = data.herbalist;
    if (!recipes || (recipes.taught.length === 0 && !recipes.next)) return null;
    return h(
      'div',
      { class: 'stack' },
      h('h2', { class: 'section-title', text: recipes.title }),
      recipes.taught.length > 0 &&
        h(
          'ul',
          { class: 'settlement-goods' },
          recipes.taught.map((recipe) =>
            h(
              'li',
              { class: 'settlement-good' },
              h('p', { class: 'settlement-good-name' }, h('span', { class: 'potion-pick-art' }, stackArt({ kind: 'potion', key: recipe.id })), h('strong', { text: recipe.name })),
              h('p', { class: 'muted', text: recipe.note }),
            ),
          ),
        ),
      recipes.next && h('p', { class: 'muted', text: recipes.next }),
    );
  }

  // The Chata zielarki (part III, questions 120 A and 121 A): the tabs Kup
  // and Sprzedaj. In Sprzedaj Jagna buys the bag's herbs and potions for more
  // than the scrapper, and the trade raises the relation with her and the
  // herbalists' reputation up to the day's limit.
  function herbalistCard() {
    const tabs = h(
      'div',
      { class: 'chat-tabs market-tabs', role: 'tablist', 'aria-label': 'Chata zielarki' },
      [
        ['buy', 'Kup'],
        ['sell', 'Sprzedaj'],
      ].map(([id, label]) =>
        h(
          'button',
          {
            type: 'button',
            class: 'chat-tab',
            role: 'tab',
            'data-guide': `herbalist-tab-${id}`,
            'aria-selected': String(herbalistTab === id),
            onClick: () => {
              herbalistTab = id;
              render();
            },
          },
          h('span', { class: 'chat-tab-name', text: label }),
        ),
      ),
    );
    return h('div', { class: 'stack' }, tabs, herbalistTab === 'buy' ? herbalistShop() : herbalistSale());
  }

  // Selling to Jagna: as many pieces as chosen, one at first (the author:
  // "Powinno się móc tez sprzedać pojedyncze sztuki tego co mam u Zielarki
  // a nie tylko wszystko"), as at the scrapper's in the bag.
  function herbalistSellSheet(good) {
    let count = 1;
    const value = h('output', { class: 'herb-count-value' });
    const sell = h('button', { type: 'button', class: 'button button--system' });
    const less = h('button', { type: 'button', class: 'button button--world duration-step', 'aria-label': 'Mniej', text: '−', onClick: () => set(count - 1) });
    const more = h('button', { type: 'button', class: 'button button--world duration-step', 'aria-label': 'Więcej', text: '+', onClick: () => set(count + 1) });
    const all = h('button', { type: 'button', class: 'link-button', text: 'wszystkie', onClick: () => set(good.count) });
    function set(next) {
      count = Math.min(good.count, Math.max(1, next));
      value.textContent = `${formatNumber(count)} szt.`;
      sell.textContent = `Sprzedaj za ${formatNumber(saleGold(good.price, count))} zł.`;
      less.disabled = count === 1;
      more.disabled = count === good.count;
    }
    set(count);
    sell.addEventListener('click', (event) =>
      withButton(event.currentTarget, async () => {
        const answer = await call('POST', '/api/settlement/herbalist', { kind: good.kind, id: good.id, count });
        closeSheet();
        apply(answer);
        const { gold, points, taught } = answer.sold;
        toast(`Jagna płaci ${formatNumber(gold)} zł.${points > 0 ? ` Relacja z nią i reputacja Bractwa Zielarzy +${points}.` : ''}${taught ? ` ${taught}` : ''}`);
      }),
    );
    openSheet(
      h('h2', { class: 'sheet-title', text: good.name }),
      h('p', { class: 'sheet-text', text: `Masz ${formatNumber(good.count)} szt. Jagna płaci ${formatDecimal(good.price)} zł. za sztukę, złomiarz ${formatDecimal(good.scrap)} zł.` }),
      h('div', { class: 'herb-count' }, less, value, more, all),
      h('div', { class: 'sheet-actions' }, h('button', { type: 'button', class: 'button button--world', text: 'Anuluj', onClick: closeSheet }), sell),
    );
  }

  function herbalistSale() {
    const { premium, best, goods, trade } = data.herbalist;
    return h(
      'section',
      { class: 'stack', 'data-guide': 'herbalist-sell' },
      h('h2', { class: 'section-title', text: 'Skup ziół i mikstur' }),
      h('p', {
        class: 'muted',
        text: `Jagna płaci o ${Math.round(premium * 100)}% więcej niż złomiarz${best ? '' : ', a z lepszą relacją jeszcze więcej'}. Handel daje relację z nią i reputację Bractwa Zielarzy: dziś ${trade.today} z ${trade.daily} punktów.${tradePace(trade)}`,
      }),
      goods.length === 0
        ? h('p', { class: 'muted', text: 'W torbie nie ma ziół ani mikstur.' })
        : h(
            'ul',
            { class: 'settlement-goods' },
            goods.map((good) =>
              h(
                'li',
                { class: 'settlement-good' },
                // The herb's or the potion's icon by its name (the author: "niech
                // u Zielarki będą ikony danych przedmiotów przy ich nazwach").
                h(
                  'p',
                  { class: 'settlement-good-name' },
                  h('span', { class: 'potion-pick-art' }, stackArt({ kind: good.kind, key: good.id })),
                  h('strong', { text: `${good.name} × ${formatNumber(good.count)}` }),
                ),
                h('p', { class: 'muted', text: `${formatDecimal(good.price)} zł. za sztukę, u złomiarza ${formatDecimal(good.scrap)} zł.` }),
                h('button', {
                  type: 'button',
                  class: 'button button--world button--small',
                  text: 'Sprzedaj',
                  onClick: () => herbalistSellSheet(good),
                }),
              ),
            ),
          ),
    );
  }

  // The Kuźnia's two scrolls for the Kowadło: the Zwój ochronny (`scroll`)
  // and the Zwój utrwalenia (`steadyScroll`, the author's of 4.11.2026), each
  // with its plural name, the words of its card and its icon.
  const SCROLLS = {
    scroll: { kind: 'ward', icon: 'ward-scroll', name: 'Zwój ochronny', plural: 'Zwoje ochronne', does: 'Zwój ochronny chroni przedmiot przed rozpadem na Kowadle.' },
    steadyScroll: {
      kind: 'steady',
      icon: 'steady-scroll',
      name: 'Zwój utrwalenia',
      plural: 'Zwoje utrwalenia',
      does: 'Zwój utrwalenia chroni przed spadkiem ulepszenia na Kowadle: po nieudanej próbie przedmiot zostaje na swoim poziomie.',
    },
  };

  // A scroll of the Kuźnia: as many as today's left and the gold allow.
  function scrollSheet(which = 'scroll') {
    const scroll = data.forge[which];
    const words = SCROLLS[which];
    const most = Math.min(scroll.left, Math.floor(state.character.gold / scroll.price));
    const field = numberField('forge-scroll-count', 'Ile zwojów', 1, 1, Math.max(1, most));
    openSheet(
      h('h2', { class: 'sheet-title forge-scroll-title' }, scrollArt(words.icon, 32), words.plural),
      h('p', { class: 'sheet-text', text: `${formatNumber(scroll.price)} zł. za sztukę. Możesz kupić najwyżej ${formatNumber(most)}: tyle kowal ma dziś dla Ciebie i na tyle starczy złota.` }),
      field.element,
      h(
        'div',
        { class: 'sheet-actions' },
        h('button', { type: 'button', class: 'button button--world', text: 'Anuluj', onClick: closeSheet }),
        h('button', {
          type: 'button',
          class: 'button button--system',
          text: 'Kup',
          onClick: (event) =>
            withButton(event.currentTarget, async () => {
              const answer = await call('POST', '/api/settlement/forge/scrolls', { count: field.read(), kind: words.kind });
              closeSheet();
              apply(answer);
              const { count, gold, points } = answer.bought;
              toast(`Kupione: ${words.name} ×${formatNumber(count)} za ${formatNumber(gold)} zł.${points > 0 ? ` Relacja z Żelisławem i reputacja Bractwa Kowali +${points}.` : ''}`);
            }),
        }),
      ),
    );
  }

  // The raise of an item's rarity in a sheet, as the Zaklinaczka's
  // reforging: the item, then what it takes, then what the item became.
  function raiseSheet() {
    const body = h('div', { class: 'settlement-reforge' });
    openSheet(h('h2', { class: 'sheet-title', text: 'Przekucie na wyższą rzadkość' }), body);
    pickItem();

    function pickItem() {
      const items = data.forge.items.filter((item) => item.gold !== undefined);
      fill(
        body,
        h('p', { class: 'sheet-text', text: `Kowal przekuje przedmiot o stopień rzadkości wyżej, raz na przedmiot, teraz najwyżej do rzadkości „${data.forge.topName}”.` }),
        items.length === 0
          ? h('p', { class: 'muted', text: 'Nie masz przedmiotu, który kowal może teraz przekuć.' })
          : h(
              'ul',
              { class: 'item-list' },
              items.map((item) =>
                h(
                  'li',
                  {},
                  h('button', { type: 'button', class: 'item-row', onClick: () => raiseItem(item.id) }, itemHead(item), item.equipped && h('span', { class: 'chip', text: 'Założony' })),
                ),
              ),
            ),
      );
    }

    function raiseItem(itemId) {
      const item = data.forge.items.find((one) => one.id === itemId && one.gold !== undefined);
      if (!item) return pickItem();
      const draw = () => {
        const need = { count: item.materials, rarity: item.material, rarityName: item.materialName, have: item.have, takes: item.takes };
        const cost = costPart({ gold: item.gold, need, title: 'Koszt przekucia', who: 'Kowal' });
        const ready = cost.goldShort === 0 && cost.materialReady;
        fill(
          body,
          h('button', { type: 'button', class: 'link-button settlement-back', onClick: pickItem }, icon('back', { size: 16 }), 'Inny przedmiot'),
          h('div', { class: 'settlement-reforge-item' }, itemHead(item)),
          h(
            'p',
            { class: 'settlement-change' },
            h('span', { class: 'settlement-change-old settlement-change-rarity', vars: { '--rarity': rarityColor(item.rarity) }, text: item.rarityName }),
            icon('chevron', { size: 18 }),
            h('span', { class: 'settlement-change-new settlement-change-rarity', vars: { '--rarity': rarityColor(item.next) }, text: item.nextName }),
          ),
          h('p', { class: 'muted', text: 'Afiksy urosną do wartości nowej rzadkości, a przedmiot dostanie jeden nowy afiks. Drugi raz kowal go nie przekuje.' }),
          cost.element,
          h('button', {
            type: 'button',
            class: 'button button--world',
            text: cost.goldShort > 0 ? 'Brakuje złota' : !cost.materialReady ? 'Brakuje materiału' : 'Przekuj',
            disabled: !ready,
            onClick: (event) =>
              withButton(event.currentTarget, async () => {
                const answer = await call('POST', '/api/settlement/forge/raise', { itemId });
                apply(answer);
                showResult(answer.raised);
              }),
          }),
        );
      };
      draw();
    }

    function showResult(raised) {
      fill(
        body,
        h('p', { class: 'settlement-result-title', text: 'Kowal przekuł przedmiot' }),
        h('div', { class: 'settlement-reforge-item' }, itemHead({ id: raised.itemId, name: raised.name })),
        h(
          'p',
          { class: 'settlement-change' },
          h('span', { class: 'settlement-change-old settlement-change-rarity', vars: { '--rarity': rarityColor(raised.before) }, text: raised.beforeName }),
          icon('chevron', { size: 18 }),
          h('span', { class: 'settlement-change-new settlement-change-rarity', vars: { '--rarity': rarityColor(raised.after) }, text: raised.afterName }),
        ),
        raised.points > 0 && h('p', { class: 'muted', text: `Relacja z Żelisławem i reputacja Bractwa Kowali +${raised.points}.` }),
        h('div', { class: 'sheet-actions' }, h('button', { type: 'button', class: 'button button--system', text: 'Gotowe', onClick: closeSheet })),
      );
    }
  }

  // The Kuźnia (question 326 A): Żelisław's Zwoje ochronne, a few a day,
  // and the raise of an item's rarity by one step, once per item; the
  // Bractwo Kowali's reputation lowers his gold prices (the author: "Kowal i
  // to i rzadkość, niech to Bractwo ma zastosowanie jakieś").
  function forgeCard() {
    const { topName, best, discount, trade, items } = data.forge;
    const raisable = items.some((item) => item.gold !== undefined);
    // A scroll's card; the Zwój utrwalenia's waits for a Kuźnia that sells it.
    const scrollCard = (which, guide) => {
      const scroll = data.forge[which];
      if (!scroll) return null;
      const words = SCROLLS[which];
      const most = Math.min(scroll.left, Math.floor(state.character.gold / scroll.price));
      return h(
        'section',
        { class: 'card stack', ...(guide && { 'data-guide': guide }) },
        h('h2', { class: 'section-title forge-scroll-title' }, scrollArt(words.icon, 32), words.plural),
        h('p', {
          class: 'muted',
          text: `${words.does} ${formatNumber(scroll.price)} zł. za sztukę. Dziś kowal sprzeda jeszcze ${scroll.left} z ${scroll.daily}. Masz: ${formatNumber(scroll.have)}.`,
        }),
        h('button', {
          type: 'button',
          class: 'button button--world',
          text: scroll.left === 0 ? 'Na dziś koniec zwojów' : most < 1 ? 'Brakuje złota' : 'Kup zwoje',
          disabled: most < 1,
          onClick: () => scrollSheet(which),
        }),
      );
    };
    return h(
      'div',
      { class: 'stack' },
      scrollCard('scroll', 'forge-scrolls'),
      scrollCard('steadyScroll', 'forge-scrolls'),
      h(
        'section',
        { class: 'card stack', 'data-guide': 'forge-raise' },
        h('h2', { class: 'section-title', text: 'Przekucie na wyższą rzadkość' }),
        h('p', {
          class: 'muted',
          text: `Kowal przekuwa przedmiot o stopień rzadkości wyżej, raz na przedmiot: afiksy rosną do wartości nowej rzadkości i dochodzi jeden nowy. Teraz najwyżej do rzadkości „${topName}”.${best ? '' : ' Lepsza relacja z nim pozwoli iść wyżej.'}`,
        }),
        h('button', { type: 'button', class: 'button button--world', text: raisable ? 'Wybierz przedmiot' : 'Brak przedmiotów do przekucia', disabled: !raisable, onClick: raiseSheet }),
      ),
      h('p', {
        class: 'muted',
        text: `${discount > 0 ? `Reputacja Bractwa Kowali obniża ceny kowala w złocie o ${formatDecimal(discount * 100)}%.` : 'Z lepszą reputacją Bractwa Kowali ceny kowala w złocie będą niższe.'} Handel daje relację z kowalem i reputację Bractwa Kowali: dziś ${trade.today} z ${trade.daily} punktów.${tradePace(trade)}`,
      }),
    );
  }

  // A resident's services, on their place's screen.
  function services(resident) {
    if (resident.service === 'reforge')
      return h(
        'div',
        { class: 'stack', 'data-guide': 'enchanter-services' },
        data.reforge.pending ? choiceCard(data.reforge.pending) : h('button', { type: 'button', class: 'button button--world', text: 'Zaklnij afiks', onClick: reforgeSheet }),
        data.imbue && h('button', { type: 'button', class: 'button button--world', text: 'Zaklnij żywioł', onClick: imbueSheet }),
      );
    if (resident.service === 'tavern') return tavernTabs();
    if (resident.service === 'herbalist') return herbalistCard();
    if (resident.service === 'forge') return forgeCard();
    if (resident.service === 'tannery') {
      const pick = (id) => {
        tanneryTab = id;
        render();
      };
      return tanneryCard(data.tannery, { tab: tanneryTab, pick, apply });
    }
    if (resident.service !== 'hermit') return null;
    return h(
      'div',
      { class: 'settlement-actions settlement-actions--stack', 'data-guide': 'hermit-services' },
      data.hermit.path !== null &&
        hermitButton('path', `Wyzeruj ścieżkę (${formatNumber(data.hermit.path)} zł.)`, 'Umiejętności klasy wrócą jako Punkty Umiejętności, a ścieżki wybierzesz od nowa.'),
      data.hermit.stats !== null && hermitButton('stats', `Wyzeruj statystyki (${formatNumber(data.hermit.stats)} zł.)`, 'Wszystkie rozdane punkty statystyk wrócą do rozdania.'),
      data.hermit.evolution &&
        h('button', {
          type: 'button',
          class: 'button button--world button--small',
          text: data.hermit.evolution.price > 0 ? `Zmień ewolucję (${formatNumber(data.hermit.evolution.price)} zł.)` : 'Zmień ewolucję (pierwszy raz darmo)',
          onClick: evolutionSheet,
        }),
    );
  }

  // The resident of a place (question 76): the bust, who they are, their
  // story and how they greet the character at its relation; the place's
  // room dim behind, where it has one (the Salon Gier's, 550.5 D), as the
  // professions' places behind their cards.
  const residentCard = (resident, backdrop) => {
    const art = backdrop && placeArt(backdrop);
    const card = h(
      'section',
      { class: `card settlement-resident${art ? ' place-card place-card--art' : ''}`, 'data-guide': 'resident-card' },
      h(
        'div',
        { class: 'settlement-resident-head' },
        h('span', { class: 'settlement-resident-bust' }, residentBust(resident.id)),
        h(
          'div',
          {},
          h('p', { class: 'settlement-resident-name', text: `${resident.name}, ${resident.title}` }),
          h('p', { class: 'muted', text: `Relacja: ${resident.standing.name}` }),
          h('p', { class: 'muted settlement-resident-story', text: resident.story }),
        ),
      ),
      h('p', { class: 'settlement-greeting', text: `„${resident.greeting}”` }),
    );
    if (art) card.style.setProperty('--place-art', `url("${art}")`);
    return card;
  };

  // Whether the Tablica has an order to deliver now, or a wanted poster's
  // bounty waits (wanted.js), for its dot on the board and on its tabs.
  const ordersReady = () => [...data.board.slots.map((slot) => slot.order), data.board.weekly].some((order) => order && order.have >= order.count);
  const bountyReady = () => [data.wanted?.earlier, ...(data.wanted?.posters ?? [])].some((poster) => poster?.state === 'beaten');
  const deliverable = () => ordersReady() || bountyReady();

  // The Tablica's two tabs: the sołtys's orders with the brotherhoods, and
  // the wanted posters (619 B), each with a dot while something waits to be
  // handed in there. Without the posters, the orders alone.
  function boardTabs() {
    const wanted = wantedCard(data.wanted, apply);
    if (!wanted) return [boardCard(), brotherhoodsCard()];
    const tab = (id, label, waiting) =>
      h(
        'button',
        {
          type: 'button',
          class: 'chat-tab',
          role: 'tab',
          'data-guide': `board-tab-${id}`,
          'aria-selected': String(boardTab === id),
          onClick: () => {
            boardTab = id;
            render();
          },
        },
        h('span', { class: 'chat-tab-name', text: label }),
        waiting && h('span', { class: 'community-dot', role: 'img', 'aria-label': 'do odebrania' }),
      );
    return h(
      'div',
      { class: 'stack' },
      h('div', { class: 'chat-tabs market-tabs', role: 'tablist', 'aria-label': 'Tablica zleceń' }, tab('orders', 'Zlecenia', ordersReady()), tab('wanted', 'Poszukiwani', bountyReady())),
      boardTab === 'wanted' ? wanted : [boardCard(), brotherhoodsCard()],
    );
  }

  // The Karczma's tabs: the mug with today's rumor, the companions, and
  // from their level the mercenaries, with a dot while the pay of a
  // service, or the close of an offer nobody took, waits there (as the
  // Osada's dot lights for it). The narrator's lines open the tab that
  // holds their place (narrator.js).
  function tavernTabs() {
    const names = data.tavern.tabs;
    const mercenaries = state.character.mercenaries;
    const shown = tavernTab === 'mercenaries' && !mercenaries ? 'mug' : tavernTab;
    const tab = (id, label, dot = null) =>
      h(
        'button',
        {
          type: 'button',
          class: 'chat-tab',
          role: 'tab',
          'data-guide': `tavern-tab-${id}`,
          'aria-selected': String(shown === id),
          onClick: () => pickTavernTab(id),
        },
        h('span', { class: 'chat-tab-name', text: label }),
        dot && h('span', { class: 'community-dot', role: 'img', 'aria-label': dot }),
      );
    const body = {
      mug: () => tavernCard(),
      companions: () => companionsCard(),
      mercenaries: () => [mercenariesCard(() => apply({})), hirePanel()],
    }[shown]();
    const name = data.places.find((place) => place.id === 'tavern')?.name;
    return h(
      'div',
      { class: 'stack' },
      h(
        'div',
        { class: 'chat-tabs market-tabs', role: 'tablist', 'aria-label': name },
        tab('mug', names.mug),
        tab('companions', names.companions),
        mercenaries && tab('mercenaries', mercenaries.texts.title, serviceWaiting()),
      ),
      body,
    );
  }

  function pickTavernTab(id) {
    tavernTab = id;
    history.replaceState(history.state, '', id === TAVERN_TABS[0] ? `${SETTLEMENT}/tavern` : `${SETTLEMENT}/tavern/${id}`);
    // Those waiting to be hired are asked for anew each time their tab opens.
    if (id === 'mercenaries') hire?.reload();
    render();
  }

  // A torch on the board, at its own size, standing on its spot: its flame
  // flickers and glows as the camp's fire does, more at dusk and at night
  // (the author: "pochodnie [...] które będą działać jak małe ogniska");
  // each keeps its own beat. Still with the animations off. By day it is
  // put out (the author: "Niech za dnia beda zgaszone te pochodnie całkiem").
  function torchLight({ x, y }, index, lit) {
    const art = settlementTorchArt(lit);
    if (!art) return null;
    const torch = h(
      'span',
      { class: 'settlement-torch', style: { left: `${x}%`, top: `${y}%` }, 'aria-hidden': 'true' },
      art,
      lit && h('span', { class: 'settlement-torch-glow', style: { animationDelay: `${-index * 0.61}s` } }),
      lit && h('span', { class: 'settlement-torch-flame', style: { animationDelay: `${-index * 0.29}s` } }),
    );
    const size = () => (torch.style.width = `${(art.naturalWidth / BOARD_WIDTH) * 100}%`);
    if (art.complete && art.naturalWidth) size();
    else art.addEventListener('load', size, { once: true });
    return torch;
  }

  // A place on the board: its picture at its own size on the ground, its
  // name, and a dot on the Tablica when an order waits, on the Targowisko
  // when a parcel does, on the Karczma when a mercenary's pay does.
  function placeLink(place) {
    const hash = `${SETTLEMENT}/${place.id}`;
    const art = settlementPlaceArt(place.id);
    const link = h(
      'a',
      {
        // `flip`: the building's picture mirrored, its front to the main road.
        class: `settlement-place${place.soon ? ' settlement-place--soon' : ''}${place.flip ? ' settlement-place--flip' : ''}`,
        href: hash,
        style: { left: `${place.x}%`, top: `${place.y}%` },
        'aria-label': place.soon ? `${place.name}, wkrótce` : place.name,
        // Where the narrator's Osada chapter points (narrator.js).
        'data-guide': `osada-${place.id}`,
        onClick: (event) => openView(event, hash, HISTORY_KEY),
      },
      art ? h('span', { class: 'settlement-place-art-box' }, art) : h('span', { class: 'settlement-place-empty' }),
      h('span', { class: 'settlement-place-label', text: place.name }),
      ((place.id === 'board' && deliverable()) || (place.id === 'market' && data.market?.waiting > 0) || (place.id === 'tavern' && serviceWaiting())) &&
        h('span', { class: 'settlement-place-dot', 'aria-hidden': 'true' }),
    );
    if (art) {
      const size = () => (link.style.width = `${(art.naturalWidth / BOARD_WIDTH) * 100}%`);
      if (art.complete && art.naturalWidth) size();
      else art.addEventListener('load', size, { once: true });
    }
    return link;
  }

  // The board (question 73 A): the ground of Rozstaje, twice as tall as the
  // camp's (the author: "Ja to bym dał nawet z 2 razy większą tę Osadę"),
  // scrolling with the page, and its places.
  function boardView() {
    const ground = settlementGround();
    const part = dayPart();
    fill(
      container,
      h(
        'div',
        { class: 'settlement-board-view' },
        // On a computer the title and the Akceptacja Bractw stand beside the
        // board (styles.css), on a phone above it.
        h('div', { class: 'settlement-board-side' }, pageHeading(`Osada: ${data.name}`, data.description), standingsPanel()),
        h(
          'div',
          // The camp's light of the hour in Poland (scenes.js), as on its board.
          { class: `settlement-map settlement-map--${part}`, role: 'group', 'aria-label': 'Plansza Osady' },
          ground && h('img', { class: 'settlement-map-ground', src: ground, alt: '', decoding: 'async', draggable: 'false' }),
          (data.torches ?? []).map((torch, index) => torchLight(torch, index, part !== 'day')),
          data.places.map(placeLink),
        ),
      ),
    );
    fitMap();
  }

  // On a computer the board fits the screen's height, shrunk evenly, as the
  // camp's does (screens/camp.js; a player: "wyświetlanie osady jakbyś mógł
  // zrobić bez scrollowania na pc, obóz już pokazuje ładnie"): with the title
  // and the Akceptacja Bractw beside it, as wide as its shape allows in the
  // room from its top down to the screen's bottom, past its own margin and
  // the page's, and leaving them SIDE_MIN beside it. styles.css keeps it
  // between the narrowest phone's board and its usual width.
  function fitMap() {
    const view = container.querySelector('.settlement-board-view');
    const map = view?.querySelector('.settlement-map');
    if (!map || !desktopLayout()) return;
    const page = container.closest('.screen--game');
    const below = (page ? parseFloat(getComputedStyle(page).paddingBottom) || 0 : 0) + (parseFloat(getComputedStyle(map).marginBottom) || 0);
    const room = window.innerHeight - (map.getBoundingClientRect().top + window.scrollY) - below;
    const { width, height } = MAP_SIZE;
    const beside = view.clientWidth - SIDE_GAP - SIDE_MIN;
    view.style.setProperty('--board-fit', `${Math.floor(Math.min((room * width) / height, beside))}px`);
  }
  window.addEventListener('resize', fitMap);
  const stopLayout = onLayoutChange(fitMap);
  // The page's letters, loaded after the first look, may move the board.
  document.fonts?.ready.then(() => !gone && fitMap());

  // A place's screen: its resident and what they do, the Tablica's orders
  // and the brotherhoods; a place of a later part says so.
  function placeView(place) {
    const resident = data.residents.find((one) => one.id === place.resident);
    fill(
      container,
      h(
        'div',
        { class: 'page-heading page-heading--back' },
        h(
          'div',
          { class: 'page-heading-text' },
          h('h1', { class: 'page-title', tabindex: '-1', text: place.name }),
          h('p', { class: 'page-subtitle', text: resident ? `${resident.name}, ${resident.title}` : `Osada: ${data.name}` }),
        ),
        h('button', { type: 'button', class: 'button button--system back-button', onClick: () => leaveView(SETTLEMENT, 1, HISTORY_KEY) }, icon('back', { size: 20 }), 'Powrót'),
      ),
      place.soon && systemPanel(`${place.name} otworzy się w jednej z kolejnych aktualizacji gry.`),
      resident && residentCard(resident, place.backdrop),
      !place.soon && resident && services(resident),
      // The sołtys's orders and Poszukiwani (619 B), each in its tab.
      place.id === 'board' && boardTabs(),
      place.id === 'market' && !place.soon && marketPanel(),
      // The Stajnia's mounts (327 A), under Mirosław's card.
      place.id === 'stable' && !place.soon && data.stable && stableCard(data.stable, apply),
      // The Salon Gier's Loteria and Koło Fortuny (523–526), under Szczęsny's.
      place.id === 'casino' && !place.soon && casinoPanel(),
      // The Sala prób's trial of the day (620 B), its report at once.
      place.id === 'trial-hall' && !place.soon && trialHallCards(data.trialHall, place, (hash) => (location.hash = hash)),
    );
  }

  function render() {
    clearTimeout(timer);
    if (failure && (failure.status === 403 || failure.status === 404)) return locked();
    if (failure) return fill(container, pageHeading('Osada'), systemPanel(failure.message));
    if (!data) return fill(container, pageHeading('Osada'), h('p', { class: 'muted', text: 'Wczytywanie…' }));
    const place = placeId && data.places.find((one) => one.id === placeId);
    // An unknown place in the address leads back to the board, and a tab
    // the place does not have to the place.
    if (placeId && !place) return location.replace(SETTLEMENT);
    if (place && params.tab && (place.id !== 'tavern' || !TAVERN_TABS.includes(params.tab))) return location.replace(`${SETTLEMENT}/${place.id}`);
    if (place) placeView(place);
    else boardView();
    // An empty slot fills when its time comes, a wounded companion is ready
    // again when the character has rested to full HP, and a mercenary's
    // pay waits once its offer or service ends (its dots).
    const wounds = (data.companions?.hired ?? []).map((companion) => companion.healsAt).filter((at) => at > serverNow());
    const activity = state.character.activity;
    const service = activity?.kind === 'mercenary' && !activityFinished(activity) ? [activity.endsAt + 1000] : [];
    const next = Math.min(...data.board.slots.filter((slot) => slot.readyAt).map((slot) => slot.readyAt), ...wounds, ...service);
    if (Number.isFinite(next)) timer = setTimeout(load, Math.max(1000, next - serverNow() + 1000));
  }

  render();
  load();
  return {
    update: render,
    unmount() {
      gone = true;
      clearTimeout(timer);
      window.removeEventListener('resize', fitMap);
      stopLayout();
      market?.unmount();
      casino?.unmount();
      hire?.unmount();
    },
  };
}
