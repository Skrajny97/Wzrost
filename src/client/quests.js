// The narrator's daily and weekly quests (quests.js in the engine): a
// parchment that unrolls under his face in the top bar, with a tab for each
// period on top, the time to its new quests, the quests with their rewards
// and "Odbierz", the period's chest in the top right corner, and at the
// bottom "Odbierz wszystkie" while a reward of the open tab waits.

import { materialSprite, monsterSprite, resourceArt } from './art.js';
import { $, fill, h, icon } from './dom.js';
import { countOf, formatCountdown, formatNumber } from './format.js';
import { SYSTEM_POINTS_ICON } from './icons.js';
import { rod, roll, stopRoll } from './parchment.js';
import { playSound } from './sound.js';
import { call, onCharacterChange, serverNow, state } from './state.js';
import { timePoints } from './time.js';
import { toast, withButton } from './ui.js';

const PERIODS = ['daily', 'weekly'];

let open = null; // { dialog, sheet, page, timer, endsAt, countdown, closing } while the parchment is out
let tab = 'daily';

export const systemPoints = (count) => countOf(count, 'Punkt Systemu', 'Punkty Systemu', 'Punktów Systemu');

// What can be taken: rewards of quests done and chests ready, by period.
export const claimable = (quests, periodId) =>
  quests[periodId].quests.filter((quest) => quest.done && !quest.claimed).length + (quests[periodId].chest.ready && !quests[periodId].chest.opened ? 1 : 0);

export const anyClaimable = (character = state.character) => Boolean(character?.quests) && PERIODS.some((periodId) => claimable(character.quests, periodId) > 0);

// The time to a period's new quests: "5:12:33", with the days of a week in front.
function untilNew(ms) {
  const days = Math.floor(Math.max(0, ms) / 86400000);
  const rest = formatCountdown(ms - days * 86400000);
  return days > 0 ? `${countOf(days, 'dzień', 'dni', 'dni')} ${rest}` : rest;
}

// A reward as its icon and amount, and as words for a message.
function rewardName(reward) {
  if (reward.kind === 'gold') return 'Złoto';
  const list = reward.kind === 'resource' ? state.content.resources : state.content.parts;
  return list.find((entry) => entry.id === reward.id)?.name ?? reward.id;
}

// Rewards in words, those of one name added up: "Drewno +6, Złoto +16".
function rewardsText(rewards) {
  const totals = new Map();
  for (const reward of rewards) totals.set(rewardName(reward), (totals.get(rewardName(reward)) ?? 0) + reward.amount);
  return [...totals].map(([name, amount]) => `${name} +${formatNumber(amount)}`).join(', ');
}

function rewardChip(reward) {
  const art =
    reward.kind === 'part'
      ? (materialSprite(reward.id) ?? icon('hammer', { size: 20 }))
      : resourceArt(reward.kind === 'gold' ? 'gold' : reward.id, 18);
  return h(
    'span',
    { class: `quest-reward quest-reward--${reward.kind}`, title: rewardName(reward) },
    h('span', { class: 'quest-reward-art', 'aria-hidden': 'true' }, art),
    h('span', { text: `+${formatNumber(reward.amount)}` }),
  );
}

// The picture of a quest: the creature to beat (a shadow until met), or what
// the work is done with.
const QUEST_ICONS = { explore: 'swords', unlock: 'unlocked' };

function questArt(quest) {
  if (quest.kind === 'kill') {
    const known = (state.character.met ?? []).includes(quest.monsterId);
    const sprite = monsterSprite(quest.monsterId);
    return h('span', { class: `quest-art${known ? '' : ' quest-art--unknown'}`, 'aria-hidden': 'true' }, sprite ?? icon('beast', { size: 24 }));
  }
  return h('span', { class: 'quest-art', 'aria-hidden': 'true' }, icon(QUEST_ICONS[quest.kind] ?? 'hammer', { size: 24 }));
}

function questRow(periodId, quest) {
  const share = Math.min(1, quest.progress / quest.count);
  const status = quest.claimed
    ? h('span', { class: 'quest-taken', text: 'Odebrano' })
    : quest.done
      ? h('button', { type: 'button', class: 'button quest-claim', text: 'Odbierz', onClick: (event) => withButton(event.currentTarget, () => claimReward(periodId, quest)) })
      : null;
  return h(
    'li',
    { class: `quest${quest.done ? ' quest--done' : ''}${quest.claimed ? ' quest--claimed' : ''}` },
    questArt(quest),
    h(
      'div',
      { class: 'quest-body' },
      h('p', { class: 'quest-text', text: quest.text }),
      h(
        'div',
        { class: 'quest-progress' },
        h('div', { class: 'quest-track', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': quest.count, 'aria-valuenow': quest.progress, 'aria-label': quest.text }, h('div', { class: 'quest-fill', style: { width: `${share * 100}%` } })),
        h('span', { class: 'quest-count', text: `${formatNumber(quest.progress)}/${formatNumber(quest.count)}` }),
      ),
    ),
    h('div', { class: 'quest-side' }, rewardChip(quest.reward), status),
  );
}

// What the chest holds, in words.
function chestText(chest) {
  return [chest.item && 'przedmiot', timePoints(chest.timePoints), systemPoints(chest.systemPoints)].filter(Boolean).join(', ');
}

function chestButton(periodId, period) {
  const { chest } = period;
  const done = period.quests.filter((quest) => quest.done).length;
  const look = chest.opened ? 'opened' : chest.ready ? 'ready' : 'locked';
  const caption = chest.opened ? 'Otwarta' : chest.ready ? 'Otwórz' : `${done}/${period.quests.length}`;
  const label = chest.opened
    ? 'Skrzynia otwarta'
    : chest.ready
      ? `Otwórz skrzynię: ${chestText(chest)}`
      : `Skrzynia za wszystkie zadania: ${chestText(chest)}. Wykonane: ${done} z ${period.quests.length}`;
  return h(
    'button',
    {
      type: 'button',
      class: `quest-chest quest-chest--${look}`,
      'aria-label': label,
      onClick: (event) => withButton(event.currentTarget, () => openChest(periodId, period)),
    },
    h('span', { class: 'quest-chest-art', 'aria-hidden': 'true' }, materialSprite('chest') ?? icon('pouch', { size: 28 })),
    h('span', { class: 'quest-chest-caption', text: caption }),
  );
}

function tabButton(periodId, quests) {
  const count = claimable(quests, periodId);
  return h(
    'button',
    {
      type: 'button',
      role: 'tab',
      id: `quests-tab-${periodId}`,
      class: `quests-tab${count > 0 ? ' quests-tab--ready' : ''}`,
      'aria-selected': String(tab === periodId),
      'aria-controls': 'quests-panel',
      tabindex: tab === periodId ? '0' : '-1',
      onClick: () => {
        tab = periodId;
        draw();
      },
    },
    quests[periodId].name,
  );
}

// The page of the open parchment, drawn again on every change.
function draw(now = serverNow()) {
  if (!open) return;
  const quests = state.character.quests;
  const period = quests[tab];
  const waiting = period.quests.some((quest) => quest.done && !quest.claimed);
  open.endsAt = period.endsAt;
  open.countdown = h('span', { class: 'quests-timer', text: untilNew(period.endsAt - now) });
  fill(
    open.page,
    h('p', { class: 'narrator-label quests-label', id: 'quests-label', text: 'Zadania od narratora' }),
    h(
      'div',
      { class: 'quests-head' },
      h('div', { class: 'quests-tabs', role: 'tablist', 'aria-labelledby': 'quests-label' }, PERIODS.map((periodId) => tabButton(periodId, quests))),
      chestButton(tab, period),
    ),
    h(
      'div',
      { class: 'quests-panel', id: 'quests-panel', role: 'tabpanel', 'aria-labelledby': `quests-tab-${tab}` },
      h('p', { class: 'quests-reset' }, 'Nowe zadania za ', open.countdown),
      period.quests.length > 0
        ? h('ul', { class: 'quests-list' }, period.quests.map((quest) => questRow(tab, quest)))
        : h('p', { class: 'quests-empty', text: 'Na razie nie mam dla Ciebie zadań.' }),
      h('p', { class: 'quests-note', text: period.chest.text }),
    ),
    h(
      'div',
      { class: 'narrator-actions' },
      waiting &&
        h('button', {
          type: 'button',
          class: 'button quest-claim quests-claim-all',
          text: 'Odbierz wszystkie',
          onClick: (event) => withButton(event.currentTarget, () => claimAll(tab)),
        }),
      h('button', { type: 'button', class: 'button narrator-next', text: 'Zwiń', onClick: () => showQuests(false) }),
    ),
  );
}

// Every second the time to the new quests counts down.
function tick() {
  if (open && !open.closing && open.countdown) open.countdown.textContent = untilNew(open.endsAt - serverNow());
}

// When a period ends, the character is fetched again with its new quests
// (from the app's clock, every second). Without a connection it tries again
// every 30 seconds.
let questsRetryAt = 0;
export function watchQuests(now) {
  const quests = state.character?.quests;
  if (!quests || now < Math.min(...PERIODS.map((periodId) => quests[periodId].endsAt)) + 1000 || now < questsRetryAt) return;
  questsRetryAt = now + 30000;
  call('GET', '/api/character').catch((error) => toast(error.message));
}

async function claimReward(periodId, quest) {
  const { reward } = await call('POST', '/api/quests/claim', { period: periodId, index: quest.index });
  playSound('collect');
  toast(`Nagroda za zadanie: ${rewardName(reward)} +${formatNumber(reward.amount)}.`);
}

// Every reward of the period's quests done, in one go; the chest opens on its own.
async function claimAll(periodId) {
  const { rewards } = await call('POST', '/api/quests/claim-all', { period: periodId });
  playSound('collect');
  toast(`Nagrody za zadania: ${rewardsText(rewards)}.`);
}

async function openChest(periodId, period) {
  if (period.chest.opened) {
    toast('Ta skrzynia jest już otwarta. Nowa przyjdzie z nowymi zadaniami.');
    return;
  }
  if (!period.chest.ready) {
    toast(`Wykonaj wszystkie zadania, a skrzynia się otworzy. W środku: ${chestText(period.chest)}.`);
    return;
  }
  const { chest } = await call('POST', '/api/quests/chest', { period: periodId });
  // Coins spilling from the chest (data/sounds.json).
  playSound('chest');
  const item = chest.item ? `${chest.item.name}, ` : '';
  toast(`Skrzynia otwarta: ${item}${timePoints(chest.timePoints)}, ${systemPoints(chest.systemPoints)}.`);
}

// Opens or closes the parchment of quests; it opens on the tab with
// something to take.
export function showQuests(show = true) {
  if (!show) {
    closeQuests();
    return;
  }
  if (open || !state.character?.quests) return;
  const quests = state.character.quests;
  if (claimable(quests, tab) === 0) tab = PERIODS.find((periodId) => claimable(quests, periodId) > 0) ?? tab;
  const dialog = h('dialog', { class: 'quests', 'aria-labelledby': 'quests-label' });
  const page = h('div', { class: 'narrator-page quests-page' });
  const sheet = h('div', { class: 'narrator-sheet' }, page);
  dialog.append(h('div', { class: 'narrator-scroll' }, rod(), sheet, rod()));
  // A tap beside the parchment, or Escape, rolls it up.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closeQuests();
  });
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeQuests();
  });
  document.body.append(dialog);
  open = { dialog, sheet, page, timer: setInterval(tick, 1000) };
  draw();
  dialog.showModal();
  playSound('open');
  roll(sheet, true);
  $('[aria-selected="true"]', page)?.focus({ preventScroll: true });
  document.querySelector('.quest-button')?.setAttribute('aria-expanded', 'true');
}

async function closeQuests() {
  if (!open || open.closing) return;
  const current = open;
  current.closing = true;
  clearInterval(current.timer);
  document.querySelector('.quest-button')?.setAttribute('aria-expanded', 'false');
  await roll(current.sheet, false);
  stopRoll(current.sheet);
  if (current.dialog.open) current.dialog.close();
  current.dialog.remove();
  if (open === current) open = null;
}

// An open parchment follows the character: progress, rewards taken.
onCharacterChange(() => {
  if (open && !open.closing && state.character?.quests) draw();
});
