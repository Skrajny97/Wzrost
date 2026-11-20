// Pomoc przy budowach i przy pracy on the Gildia tab (src/server/guild-help.js;
// the author's 1196 A and B, accepted on the review page on 19.11.2026):
// a card that folds under its title, open by itself while there is someone
// to help, with the yellow dot then. On top the character's own build in
// the Obóz or the Warownia and its work in a profession, each with its time
// left, its helps and the names of those who helped; under it the other
// members' builds and work, each with its owner, its time left, its helps
// and "Pomóż" with what one help cuts off, or "Pomoc wysłana" and "Komplet
// pomocy"; "Pomóż wszystkim" over them while any waits; the character's
// Sława for helping this week and "Jak to działa?". The words come with the
// answer (data/guilds.json, help.texts), in the page's language; the card's
// own few go through t() (i18n.js). guildHelpCard() makes the card, which
// asks for its part itself and draws its times anew every half a minute
// while it is on the page. guildHelpStrip() makes the shortcut to it on the
// Walka screen (the author, 20.11.2026).

import { campArt, guildHelpArt, professionSprite } from './art.js';
import { buildingTier } from './camp-art.js';
import { checkGuildTodo, guildHelpWaiting, onChatNews } from './chat-news.js';
import { fill, h, icon } from './dom.js';
import { formatCountdown, formatMinutes, formatNumber } from './format.js';
import { t } from './i18n.js';
import { CLASS_ICONS } from './icons.js';
import { openProfile } from './profile.js';
import { call, serverNow, state } from './state.js';
import { foldPart, framedName, howItWorks, toast, withButton } from './ui.js';

const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
const REDRAW_MS = 30000;
// How long the shortcut shows the game's answer before it hides.
const ANSWER_MS = 6000;

// "14 min", "1 h 5 min": a length in whole minutes, at least one.
const minutes = (ms) => formatMinutes(Math.max(1, Math.round(ms / 60000)));
// The time left of a build or a work: "2 h 14 min", or the seconds of its
// last minute.
const left = (endsAt) => {
  const ms = Math.max(0, endsAt - serverNow());
  return ms < 60000 ? formatCountdown(ms) : minutes(ms);
};

export function guildHelpCard() {
  let view = null;
  const card = h('section', { class: 'card guild-help', 'aria-labelledby': 'guild-help-title' }, h('p', { class: 'muted', text: t('Wczytywanie…') }));

  // A build's picture (its camp look at the level it reaches) or a work's
  // profession square, else a line icon.
  const picture = (entry) => {
    const src = entry.kind === 'build' ? campArt(entry.buildingId, buildingTier(entry.level ?? 1)) : null;
    const art = src ? h('img', { src, alt: '', class: 'sprite guild-help-building', decoding: 'async', draggable: 'false' }) : entry.profession ? professionSprite(entry.profession) : null;
    return h('span', { class: 'guild-help-art', 'aria-hidden': 'true' }, art ?? icon(entry.kind === 'build' ? 'hammer' : 'leaf', { size: 22 }));
  };

  // The line of a build or a work: its time left and its helps.
  const facts = (entry) =>
    h(
      'p',
      { class: 'guild-help-facts' },
      h('span', { class: 'guild-help-left', 'data-ends': String(entry.endsAt), text: filled(view.texts.left, { time: left(entry.endsAt) }) }),
      h('span', { class: 'guild-help-count', text: filled(view.texts.helps, { count: formatNumber(entry.helps), max: formatNumber(entry.max) }) }),
    );

  // The owner of another member's build or work: class, name, level.
  const owner = (person) =>
    h(
      'span',
      { class: 'guild-help-owner' },
      icon(CLASS_ICONS[person.classId] ?? 'person', { size: 16, className: 'chat-class' }),
      framedName(
        h('button', { type: 'button', class: 'chat-name', text: person.name, 'aria-label': t('{name}: zobacz postać', { name: person.name }), onClick: (event) => withButton(event.currentTarget, () => openProfile(person.name)) }),
        person.nameColor,
      ),
      h('span', { class: 'chat-level', text: t('poz. {level}', { level: formatNumber(person.level) }) }),
    );

  // A help refused as the card stood (a build or a work over, full or
  // changed meanwhile, 409) brings the card as it is now, under the words why.
  async function act(path, body) {
    const answer = await call('POST', path, body).catch((error) => {
      if (error?.status === 409) card.reload();
      throw error;
    });
    view = answer;
    render();
    checkGuildTodo({ now: true });
    if (answer.text) toast(answer.text);
  }

  // The character's own build and work, with who helped and how much.
  function minePart() {
    const { texts, mine } = view;
    return h(
      'div',
      { class: 'guild-part guild-help-mine' },
      h('h3', { class: 'guild-subtitle', text: texts.mine }),
      mine.length === 0
        ? h('p', { class: 'muted', text: texts.noneMine })
        : h(
            'ul',
            { class: 'guild-help-list' },
            mine.map((entry) =>
              h(
                'li',
                { class: 'guild-help-row guild-help-row--mine' },
                picture(entry),
                h(
                  'div',
                  { class: 'guild-help-body' },
                  h('p', { class: 'guild-help-title', text: entry.title }),
                  facts(entry),
                  entry.cut > 0 && h('p', { class: 'guild-help-note', text: filled(texts.cutTotal, { time: minutes(entry.cut) }) }),
                  h('p', { class: 'guild-help-helpers', text: entry.helpers.length > 0 ? filled(texts.helpers, { names: entry.helpers.join(', ') }) : texts.noHelpers }),
                ),
              ),
            ),
          ),
    );
  }

  // What a row of another member's offers: "Pomóż" with the cut of one
  // help, or why not.
  function helpButton(entry) {
    const { texts } = view;
    if (entry.helped) return h('span', { class: 'chip guild-chip guild-chip--done' }, icon('check', { size: 14 }), texts.helped);
    if (!entry.open) return h('span', { class: 'chip guild-chip', text: texts.full });
    return h(
      'button',
      {
        type: 'button',
        class: 'button button--system button--small guild-help-button',
        onClick: (event) => withButton(event.currentTarget, () => act('/api/guild/help', { ownerId: entry.owner.id, target: entry.target })),
      },
      h('span', { text: texts.help }),
      h('span', { class: 'guild-help-cut', text: filled(texts.cut, { time: minutes(entry.next) }) }),
    );
  }

  // The other members' builds and work, those the character may help
  // first, "Pomóż wszystkim" over them.
  function othersPart() {
    const { texts, others } = view;
    const all =
      view.open > 0 &&
      h('button', {
        type: 'button',
        class: 'button button--system guild-help-all',
        text: filled(texts.helpAll, { count: formatNumber(view.open) }),
        onClick: (event) => withButton(event.currentTarget, () => act('/api/guild/help/all')),
      });
    return h(
      'div',
      { class: 'guild-part guild-help-others' },
      h('h3', { class: 'guild-subtitle', text: texts.others }),
      all,
      others.length === 0
        ? h('p', { class: 'muted', text: texts.empty })
        : [
            view.open === 0 && h('p', { class: 'muted', text: texts.allHelped }),
            h(
              'ul',
              { class: 'guild-help-list' },
              others.map((entry) =>
                h(
                  'li',
                  { class: `guild-help-row${entry.open ? ' guild-help-row--open' : ''}` },
                  picture(entry),
                  h('div', { class: 'guild-help-body' }, owner(entry.owner), h('p', { class: 'guild-help-title', text: entry.title }), facts(entry)),
                  h('div', { class: 'guild-help-action' }, helpButton(entry)),
                ),
              ),
            ),
          ],
    );
  }

  function render() {
    if (!view) return;
    const { texts } = view;
    if (!view.guild) {
      fill(card, h('h2', { class: 'card-title', id: 'guild-help-title', text: texts.title }));
      return;
    }
    const waiting = view.open > 0;
    fill(
      card,
      foldPart(
        {
          key: 'guild-help',
          title: texts.title,
          card: true,
          id: 'guild-help-title',
          open: true,
          force: waiting,
          dot: waiting,
          art: guildHelpArt(),
          line: waiting ? filled(texts.waiting, { count: formatNumber(view.open) }) : texts.intro,
          className: 'guild-help-fold',
        },
        minePart(),
        othersPart(),
        h('p', { class: 'guild-help-fame' }, icon('trophy', { size: 16 }), h('span', { text: filled(texts.fame, { count: formatNumber(view.weekHelps.count), cap: formatNumber(view.weekHelps.cap) }) })),
        howItWorks(texts.intro, texts.how),
      ),
    );
  }

  // The times left move on between answers.
  const timer = setInterval(() => {
    if (!card.isConnected && view) {
      clearInterval(timer);
      return;
    }
    for (const line of card.querySelectorAll('.guild-help-left[data-ends]')) line.textContent = filled(view?.texts.left ?? '{time}', { time: left(Number(line.dataset.ends)) });
  }, REDRAW_MS);

  card.reload = () =>
    call('GET', '/api/guild/help')
      .then((answer) => {
        view = answer;
        render();
      })
      .catch((error) => {
        if (!view) fill(card, h('p', { class: 'muted', text: error.message ?? t('Nie udało się wczytać pomocy.') }));
      });
  card.reload();
  return card;
}

// The shortcut to help on the Walka screen (the author, 20.11.2026: „Trzeba
// zrobić jakoś łatwo dostepny skrót do pomagania innym z gildii w ramach tej
// nowej funkcji”; DECISIONS.md, „Skrót do pomocy w gildii (20.11.2026)”): a
// slim strip while the Gildia tab's dot says there is someone to help
// (chat-news.js, from the guild's todo the page asks for anyway): the
// help's icon and „Gildia czeka na pomoc: N”, which open the help card on
// the Gildia tab, and „Pomóż wszystkim”, which helps at once, as the card's
// button does. The game's answer stays in the strip for a moment, then it
// hides. Hidden with nobody to help, outside a guild and before the
// Społeczność. Made once for a visit of the screen; `stop()` ends its
// following of the news. Its words: data/guilds.json, help.texts.strip and
// stripAll (state.content.guildHelp).
export function guildHelpStrip() {
  const strip = h('div', { class: 'guild-help-strip', role: 'status' });
  let answer = null;
  let answerTimer = null;

  async function helpAll() {
    const result = await call('POST', '/api/guild/help/all');
    answer = result.text;
    render();
    checkGuildTodo({ now: true });
    clearTimeout(answerTimer);
    answerTimer = setTimeout(() => {
      answer = null;
      render();
    }, ANSWER_MS);
  }

  function render() {
    const words = state.content?.guildHelp;
    const count = guildHelpWaiting();
    strip.classList.toggle('guild-help-strip--done', Boolean(answer));
    strip.hidden = !answer && (!words || count === 0);
    if (answer) {
      fill(strip, h('span', { class: 'guild-help-strip-art', 'aria-hidden': 'true' }, guildHelpArt(24)), h('span', { class: 'guild-help-strip-text', text: answer }));
      return;
    }
    if (strip.hidden) {
      fill(strip);
      return;
    }
    fill(
      strip,
      h(
        'a',
        { class: 'guild-help-strip-link', href: '#/gildia/guild' },
        h('span', { class: 'guild-help-strip-art', 'aria-hidden': 'true' }, guildHelpArt(24)),
        h('span', { class: 'guild-help-strip-text', text: filled(words.waiting, { count: formatNumber(count) }) }),
      ),
      h('button', {
        type: 'button',
        class: 'button button--system button--small guild-help-strip-button',
        text: words.all,
        onClick: (event) => withButton(event.currentTarget, helpAll),
      }),
    );
  }

  render();
  strip.stop = onChatNews(render);
  return strip;
}
