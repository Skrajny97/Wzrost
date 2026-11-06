// The Warownia's buildings on their screens (screens/camp.js): the Plac
// treningowy's training, the Ołtarz Systemu's blessing, the Szklarnia's herb
// and store and the Zbrojownia's gear sets; and the camp's transformation in
// the Kamień węgielny's window. The Sala trofeów and the Kapliczka work by
// themselves, so their screens only say what they give; the Strażnica's
// chances show before an exploration (screens/combat.js). The words are shown
// in the page's language (t(), i18n.js).

import { herbSprite, resourceArt } from './art.js';
import { h, icon } from './dom.js';
import { countOf, dateTimeFormat, formatCountdown, formatHours, formatMinutes, formatNumber } from './format.js';
import { t } from './i18n.js';
import { playSound } from './sound.js';
import { call, costShortfall, walletEntries } from './state.js';
import { confirmAction, toast, withButton } from './ui.js';
import { itemSummary } from './screens/character.js';

const DAY = 24 * 3600000;
const fights = (count) => countOf(count, 'walka', 'walki', 'walk');
const tapped = (action) => (event) => withButton(event.currentTarget, action);

// A part of a building's screen: a card with a title.
const part = (title, ...children) => h('section', { class: 'card fortress-part', 'aria-label': title }, h('h2', { class: 'card-title', text: title }), ...children);

// The Plac treningowy (420 A): "Trenuj" once a day, the training under way
// with its bar, and "Odbierz trening" once it ends. `ticks` gets its update.
export function trainingSection(training, ticks) {
  const current = training.current;
  if (!current) {
    return part(
      t('Trening'),
      h('p', { class: 'muted', text: t('Klon postaci trenuje {time} za Ciebie, także w czasie wyprawy, i daje {xp} XP klasy.', { time: formatHours(training.hours), xp: formatNumber(training.xp) }) }),
      training.canStart
        ? h('button', { type: 'button', class: 'button button--system', text: t('Trenuj'), onClick: tapped(startTraining) })
        : h('p', { class: 'store-hint', text: t('Dzisiejszy trening już był. Następny po północy.') }),
    );
  }
  const countdown = h('p', { class: 'store-hint', 'aria-live': 'off' });
  const fill = h('div', { class: 'bar-fill bar-fill--system' });
  const claim = h('button', { type: 'button', class: 'button button--system', text: t('Odbierz trening'), onClick: tapped(claimTraining) });
  ticks.push((now) => {
    const left = current.endsAt - now;
    countdown.textContent = left > 0 ? t('Do końca treningu: {time}', { time: formatCountdown(left) }) : t('Trening skończony.');
    fill.style.width = `${Math.min(100, Math.max(0, ((now - current.startedAt) / (current.endsAt - current.startedAt)) * 100))}%`;
    claim.disabled = left > 0;
  });
  return part(t('Trening'), h('p', { class: 'muted', text: t('Za ten trening: {xp} XP klasy.', { xp: formatNumber(current.xp) }) }), h('div', { class: 'bar' }, fill), countdown, claim);
}

async function startTraining() {
  await call('POST', '/api/fortress/training');
  playSound('build');
  toast(t('Klon postaci zaczął trening.'));
}

async function claimTraining() {
  const { trained } = await call('POST', '/api/fortress/training/claim');
  playSound('collect');
  toast([t('Trening dał {xp} XP klasy.', { xp: formatNumber(trained.xp) }), ...trained.messages].join(' '));
}

// The Ołtarz Systemu (424 A, 425 A): once a day one of its three blessings
// for the fights of explorations, and the one in force with its fights left.
export function blessingSection(blessing) {
  const current = blessing.current;
  const named = (kind) => blessing.choices.find((choice) => choice.id === kind)?.name ?? kind;
  return part(
    t('Błogosławieństwo'),
    current
      ? h('p', {}, h('strong', { text: named(current.kind) }), t(': jeszcze {fights} na wyprawach.', { fights: fights(current.left) }))
      : h('p', { class: 'muted', text: t('Wybrane błogosławieństwo działa przez {fights} na wyprawach.', { fights: fights(blessing.fights) }) }),
    blessing.canChoose
      ? h(
          'div',
          { class: 'fortress-choices' },
          blessing.choices.map((choice) => h('button', { type: 'button', class: 'button button--world', text: choice.name, onClick: tapped(() => chooseBlessing(choice, blessing.fights)) })),
        )
      : h('p', { class: 'store-hint', text: t('Następne błogosławieństwo po północy.') }),
    blessing.canChoose && current && h('p', { class: 'store-hint', text: t('Nowe błogosławieństwo zastąpi resztę obecnego.') }),
  );
}

async function chooseBlessing(choice, count) {
  await call('POST', '/api/fortress/blessing', { kind: choice.id });
  playSound('build');
  toast(t('Błogosławieństwo: {name} na {fights}.', { name: choice.name, fights: fights(count) }));
}

// The Szklarnia (426 A): the herb it grows, one known from Zielarstwo, its
// store filling all day (a day's growth at most) and "Zbierz". `ticks` gets
// its update.
export function greenhouseSection(greenhouse, ticks) {
  const current = greenhouse.current;
  const herbs = h(
    'div',
    { class: 'fortress-choices' },
    greenhouse.herbs.map((herb) =>
      h(
        'button',
        {
          type: 'button',
          class: `button button--world fortress-herb${herb.id === current?.herb ? ' fortress-herb--chosen' : ''}`,
          'aria-pressed': herb.id === current?.herb,
          onClick: tapped(() => (herb.id === current?.herb ? null : chooseHerb(herb, current))),
        },
        herbSprite(herb.id),
        h('span', { text: herb.name }),
      ),
    ),
  );
  const intro = h('p', { class: 'muted', text: t('Szklarnia hoduje jedno zioło znane z Zielarstwa: na dobę tyle, ile {time} zbierania w Systemowym Zagajniku.', { time: formatHours(greenhouse.hours) }) });
  if (!current) return part(t('Grządki'), intro, h('p', { class: 'store-hint', text: t('Wybierz zioło:') }), herbs);
  const amount = h('strong', {});
  const fill = h('div', { class: 'bar-fill bar-fill--gold' });
  const hint = h('p', { class: 'store-hint' });
  let collecting = false; // the tick must not enable the button mid-request
  const collect = h('button', {
    type: 'button',
    class: 'button button--world',
    text: t('Zbierz'),
    onClick: tapped(async () => {
      collecting = true;
      try {
        await collectHerbs();
      } finally {
        collecting = false;
      }
    }),
  });
  // As the server counts it (greenhouseStore): a day's growth and the herb
  // still growing at most.
  const grown = (now) => Math.min(current.limit, ((now - current.since) / DAY) * current.perDay);
  ticks.push((now) => {
    const held = Math.floor(grown(now) + 1e-9);
    amount.textContent = `${formatNumber(held)} / ${formatNumber(current.capacity)}`;
    fill.style.width = `${(grown(now) / current.capacity) * 100}%`;
    const fullAt = current.since + (current.limit / current.perDay) * DAY;
    hint.textContent = held >= current.capacity ? t('Grządki pełne: zioła rosną dalej po zebraniu.') : t('Pełne za {time}.', { time: formatCountdown(fullAt - now) });
    collect.disabled = collecting || held < 1;
  });
  return part(
    t('Grządki'),
    intro,
    h(
      'div',
      { class: 'store' },
      h('p', { class: 'store-head' }, herbSprite(current.herb), h('span', { text: t('{name}: {count} na dobę', { name: current.name, count: formatNumber(Math.floor(current.perDay)) }) }), amount),
      h('div', { class: 'bar' }, fill),
      hint,
      collect,
    ),
    h('p', { class: 'store-hint', text: t('Zmień zioło:') }),
    herbs,
  );
}

async function chooseHerb(herb, current) {
  // What has grown of the herb before goes to the bag first.
  const { collected } = await call('POST', '/api/fortress/greenhouse', { herb: herb.id });
  playSound('build');
  toast(collected > 0 ? t('Zebrano: {name} +{count}. Teraz rośnie: {herb}.', { name: current.name, count: formatNumber(collected), herb: herb.name }) : t('Teraz rośnie: {herb}.', { herb: herb.name }));
}

async function collectHerbs() {
  const { collected } = await call('POST', '/api/fortress/greenhouse/collect');
  playSound('collect');
  toast(t('Zebrano: {resource} +{amount}.', { resource: collected.name, amount: formatNumber(collected.count) }));
}

// The Zbrojownia (421 A): its sets, each with what it keeps, "Załóż",
// "Zapisz" (what the character wears now, under a name) and "Usuń".
export function gearSetsSection(gearSets) {
  return part(
    t('Zestawy ekwipunku'),
    h('p', { class: 'muted', text: t('Zestaw zapamiętuje to, co postać ma na sobie. Rzeczy z zestawów, których nie nosisz, wiszą na stojakach i nie zajmują miejsca w plecaku.') }),
    h(
      'ul',
      { class: 'gear-sets' },
      gearSets.sets.map((set) => gearSetRow(set, gearSets.nameLength)),
    ),
  );
}

function gearSetRow(set, nameLength) {
  const fallback = t('Zestaw {number}', { number: set.index + 1 });
  const title = set.name ?? fallback;
  const saved = set.name !== null;
  const name = h('input', { type: 'text', maxlength: String(nameLength), autocomplete: 'off', value: set.name ?? '', placeholder: fallback, 'aria-label': t('Nazwa zestawu: {name}', { name: title }) });
  return h(
    'li',
    { class: 'gear-set' },
    h('p', { class: 'gear-set-head' }, h('strong', { text: title }), set.worn && h('span', { class: 'chip', text: t('założony') })),
    !saved
      ? h('p', { class: 'muted', text: t('Pusty stojak.') })
      : set.items.length === 0
        ? h('p', { class: 'muted', text: t('Rzeczy z tego zestawu już nie ma.') })
        : h(
            'ul',
            { class: 'item-list' },
            set.items.map((item) => h('li', { class: 'gear-set-item' }, itemSummary(item), !item.worn && h('span', { class: 'chip', text: t('na stojaku') }))),
          ),
    saved && set.items.length > 0 && !set.worn && h('button', { type: 'button', class: 'button button--system', text: t('Załóż'), onClick: tapped(() => wearSet(set, title)) }),
    h(
      'form',
      {
        class: 'gear-set-save',
        onSubmit: (event) => {
          event.preventDefault();
          withButton(event.currentTarget.querySelector('button'), () => saveSet(set, name.value, title));
        },
      },
      name,
      h('button', { type: 'submit', class: 'button button--world', text: t('Zapisz to, co masz na sobie') }),
    ),
    saved && h('button', { type: 'button', class: 'button button--world button--small', text: t('Usuń zestaw'), onClick: tapped(() => clearSet(set, title)) }),
  );
}

async function wearSet(set, title) {
  await call('POST', '/api/fortress/sets/wear', { index: set.index });
  toast(t('Założono zestaw „{name}”.', { name: title }));
}

async function saveSet(set, name, title) {
  if (set.name !== null) {
    const sure = await confirmAction({ title: t('Zapisać zestaw na nowo?'), text: t('Zestaw „{name}” zapamięta to, co postać ma teraz na sobie.', { name: title }), confirmLabel: t('Zapisz') });
    if (!sure) return;
  }
  await call('POST', '/api/fortress/sets', { index: set.index, name });
  playSound('build');
  toast(t('Zestaw zapisany.'));
}

async function clearSet(set, title) {
  const sure = await confirmAction({
    title: t('Usunąć zestaw?'),
    text: t('Rzeczy zestawu „{name}”, których nie trzyma inny zestaw ani postać, zejdą ze stojaka do plecaka.', { name: title }),
    confirmLabel: t('Usuń'),
  });
  if (!sure) return;
  await call('POST', '/api/fortress/sets/clear', { index: set.index });
  toast(t('Zestaw „{name}” usunięty.', { name: title }));
}

// The camp's transformation in the Kamień węgielny's window (419 A, 430 A):
// what it costs and takes and its button once the camp is at the top, the
// build under way or waiting, or the Warownia standing. `back` opens the
// window again with the new state.
export function fortressPart(fortress, back) {
  const title = h('h3', { class: 'fortress-subtitle', text: fortress.name });
  if (fortress.stands) return h('section', { class: 'fortress-transform' }, title, h('p', { text: fortress.texts.done }));
  if (fortress.building) {
    return h('section', { class: 'fortress-transform' }, title, h('p', { text: fortress.texts.building }), h('p', { class: 'store-hint', text: t('Koniec: {time}.', { time: dateTimeFormat.format(new Date(fortress.building.endsAt)) }) }));
  }
  if (fortress.queued) return h('section', { class: 'fortress-transform' }, title, h('p', { class: 'muted', text: t('Przemiana czeka w kolejce budowy.') }));
  const have = Object.fromEntries(walletEntries().map((entry) => [entry.id, entry.amount]));
  const lacking = costShortfall(fortress.cost);
  return h(
    'section',
    { class: 'fortress-transform' },
    title,
    h('p', { class: 'muted', text: fortress.description }),
    h(
      'ul',
      { class: 'cost-list', 'aria-label': t('Koszt') },
      Object.entries(fortress.cost).map(([resource, amount]) =>
        h(
          'li',
          { class: `cost${(have[resource] ?? 0) < amount ? ' cost--missing' : ''}` },
          resourceArt(resource, 16),
          h('span', { text: walletEntries().find((entry) => entry.id === resource)?.name ?? resource }),
          h('strong', { text: `${formatNumber(have[resource] ?? 0)} / ${formatNumber(amount)}` }),
        ),
      ),
    ),
    h('p', { class: 'building-time' }, icon('hourglass', { size: 16 }), t('Czas przemiany: {time}', { time: formatMinutes(fortress.minutes) })),
    h('button', {
      type: 'button',
      class: 'button button--system',
      disabled: !fortress.ready || lacking.length > 0,
      text: fortress.ready && lacking.length > 0 ? t('Brakuje: {missing}', { missing: lacking.join(', ') }) : fortress.texts.start,
      onClick: tapped(async () => {
        await call('POST', '/api/camp/build', { buildingId: fortress.id });
        playSound('build');
        back();
      }),
    }),
    !fortress.ready && h('p', { class: 'system-hint', text: t('Przemiana ruszy, gdy Obóz i wszystkie jego budynki dojdą do najwyższego poziomu.') }),
  );
}
