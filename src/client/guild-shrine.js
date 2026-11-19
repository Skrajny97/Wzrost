// The Kącina in the Siedziba Gildii (src/server/guild-shrine.js; the
// author's 1201 A, accepted on the review page on 19.11.2026): a card
// among the Siedziba's buildings, folded under its picture, its name and
// the week's patron with its bonus, open by itself with the yellow dot
// while the character's vote of the week waits. Unfolded: the patron of
// this week (its bust, who it is, its bonus and its domain in the Próby, to
// Sunday), or the line that the guild has none; the vote for the next
// week, the three gods offered, each with its bust, bonus, domain, votes
// and the names of those who gave them, and "Głosuj" while the character
// has not voted (asked first, as a vote stays to the week's end), its own
// vote marked; who leads now, a tie said so; and "Jak to działa?". The
// words come with the answer (data/guilds.json, shrine.texts), in the
// page's language; the card's own few go through t() (i18n.js).
// guildShrineCard() makes the card, which asks for its part itself.

import { godBust, guildSeatSprite } from './art.js';
import { checkGuildTodo } from './chat-news.js';
import { fill, h, icon } from './dom.js';
import { formatNumber, plural } from './format.js';
import { t } from './i18n.js';
import { call } from './state.js';
import { confirmAction, foldPart, howItWorks, toast, withButton } from './ui.js';

const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));

export function guildShrineCard() {
  let view = null;
  const card = h('section', { class: 'card guild-seat-building guild-shrine', 'aria-labelledby': 'guild-shrine-title' }, h('p', { class: 'muted', text: t('Wczytywanie…') }));

  const votes = (count) => `${formatNumber(count)} ${plural(count, ...view.texts.voteForms)}`;

  // A god's bust beside its name, who it is, its bonus and its domain, and
  // `more` under them.
  const godHead = (god, className, more = null) =>
    h(
      'div',
      { class: `guild-god ${className}` },
      h('span', { class: 'guild-god-art', 'aria-hidden': 'true' }, godBust(god.id) ?? icon('spirit', { size: 32 })),
      h(
        'div',
        { class: 'guild-god-body' },
        h('p', { class: 'guild-god-name' }, h('strong', { text: god.name }), h('span', { class: 'guild-god-title', text: god.title })),
        h('p', { class: 'guild-god-bonus', text: filled(view.texts.bonus, { bonus: god.bonus }) }),
        h('p', { class: 'guild-god-domain', text: filled(view.texts.domain, { domain: god.domain }) }),
        more,
      ),
    );

  // This week's patron, to Sunday, or the line that the guild has none.
  function patronPart() {
    const { texts, patron } = view;
    return h(
      'div',
      { class: 'guild-part guild-shrine-patron' },
      h('h3', { class: 'guild-subtitle', text: texts.patron }),
      patron
        ? [
            h('p', { class: 'guild-shrine-now', text: filled(texts.patronNow, { god: patron.genitive }) }),
            godHead(patron, 'guild-god--patron', h('p', { class: 'guild-god-until', text: texts.until })),
          ]
        : h('p', { class: 'muted', text: texts.patronNone }),
    );
  }

  async function vote(god) {
    const { texts } = view;
    if (!(await confirmAction({ title: texts.castTitle, text: filled(texts.castText, { god: god.name }), confirmLabel: texts.cast }))) return;
    // A vote refused as the card stood (cast already, a week gone, 409)
    // brings the card as it is now, under the words why.
    const answer = await call('POST', '/api/guild/shrine/vote', { god: god.id, week: view.week }).catch((error) => {
      if (error?.status === 409) card.reload();
      throw error;
    });
    view = answer;
    render();
    checkGuildTodo({ now: true });
    if (answer.text) toast(answer.text);
  }

  // A god of the vote: its head, its votes on a bar against the most, the
  // names of its voters, and "Głosuj" or the character's own vote.
  function godRow(god, most) {
    const { texts, vote: ballot } = view;
    const fillBar = h('div', { class: 'meter-fill' });
    fillBar.style.width = `${most > 0 ? (god.votes / most) * 100 : 0}%`;
    return h(
      'li',
      { class: `guild-shrine-god${god.mine ? ' guild-shrine-god--mine' : ''}${ballot.leading === god.id ? ' guild-shrine-god--leading' : ''}` },
      godHead(god, 'guild-god--vote'),
      h(
        'div',
        { class: 'meter meter--xp guild-meter guild-shrine-meter' },
        h('div', { class: 'meter-label' }, h('span', { text: votes(god.votes) }), god.mine && h('span', { class: 'chip guild-chip guild-chip--done' }, icon('check', { size: 14 }), texts.mine)),
        h('div', { class: 'meter-track', role: 'progressbar', 'aria-label': god.name, 'aria-valuemin': 0, 'aria-valuemax': most, 'aria-valuenow': god.votes }, fillBar),
      ),
      god.voters.length > 0 && h('p', { class: 'guild-shrine-voters', text: filled(texts.voters, { names: god.voters.join(', ') }) }),
      !ballot.mine &&
        h('button', {
          type: 'button',
          class: 'button button--system button--small guild-shrine-cast',
          text: texts.cast,
          onClick: (event) => withButton(event.currentTarget, () => vote(god)),
        }),
    );
  }

  // The vote for next week: who leads, the gods offered and the end.
  function votePart() {
    const { texts, vote: ballot } = view;
    const most = Math.max(0, ...ballot.gods.map((god) => god.votes));
    const leader = ballot.gods.find((god) => god.id === ballot.leading);
    const status = !leader ? texts.noVotes : ballot.tied ? filled(texts.tied, { god: leader.name }) : filled(texts.leading, { god: leader.name });
    return h(
      'div',
      { class: 'guild-part guild-shrine-vote' },
      h('h3', { class: 'guild-subtitle', text: texts.vote }),
      h('p', { class: 'muted small', text: texts.voteUntil }),
      h('ul', { class: 'guild-shrine-gods' }, ballot.gods.map((god) => godRow(god, most))),
      h('p', { class: `guild-shrine-status${ballot.tied ? ' guild-shrine-status--tied' : ''}`, text: status }),
      ballot.mine && h('p', { class: 'guild-shrine-own', text: filled(texts.voted, { god: ballot.gods.find((god) => god.id === ballot.mine)?.name ?? '' }) }),
    );
  }

  function render() {
    if (!view) return;
    const { texts } = view;
    if (!view.guild) {
      fill(card, h('h2', { class: 'card-title', id: 'guild-shrine-title', text: texts.title }), h('p', { class: 'muted', text: texts.noGuild }));
      return;
    }
    const waiting = !view.vote.mine;
    fill(
      card,
      foldPart(
        {
          key: 'guild-shrine',
          title: view.shrine.name,
          card: true,
          id: 'guild-shrine-title',
          open: waiting,
          force: waiting,
          dot: waiting,
          art: guildSeatSprite(view.shrine.id),
          line: view.patron ? filled(texts.line, { god: view.patron.genitive, bonus: view.patron.bonus }) : texts.lineNone,
          className: 'guild-seat-fold',
        },
        h('div', { class: 'guild-seat-body' }, patronPart(), votePart(), howItWorks(texts.intro, texts.how)),
      ),
    );
  }

  card.reload = () =>
    call('GET', '/api/guild/shrine')
      .then((answer) => {
        view = answer;
        render();
      })
      .catch((error) => {
        if (!view) fill(card, h('p', { class: 'muted', text: error.message ?? t('Nie udało się wczytać Kąciny.') }));
      });
  card.reload();
  return card;
}
