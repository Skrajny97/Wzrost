// The Krainy pod sztandarem (1200 A; the server's guild-lands.js;
// DECISIONS.md, "Krainy pod sztandarem"): a card of the Wojna tab
// (guild-war.js) with the week live, each land anyone explored this week
// with the guild's minutes there and whether it leads or chases, by how
// much and whom, and the lands under the guild's banner this week with
// their bonus; and the banner on a land's card for every player (bannerChip
// and bannerLine, screens/combat.js), from the banners the character's
// answer brings (state.landBanners). The words come with the answer
// (data/guilds.json, lands), in the page's language.

import { landArt, landBannerArt } from './art.js';
import { fill, h } from './dom.js';
import { formatMinutes } from './format.js';
import { t } from './i18n.js';
import { call, state } from './state.js';
import { howItWorks } from './ui.js';

const filled = (text, vars) => text.replace(/\{(\w+)\}/g, (whole, name) => (Object.hasOwn(vars, name) ? String(vars[name]) : whole));

// The words of a land's state for the guild: "Prowadzisz o 1 h 20 min
// przed [KK]", "Gonisz [KK]: brakuje 25 min", a tie won or lost by the
// older guild, or a land only the guild explored.
function stateText(land, texts) {
  const vars = { gap: formatMinutes(land.gap), tag: land.rival?.tag ?? '' };
  if (land.state === 'alone') return texts.alone;
  if (land.state === 'lead') return filled(land.gap > 0 ? texts.ahead : texts.tieWin, vars);
  return filled(land.gap > 0 ? texts.chase : texts.tieLose, vars);
}

// A land's picture, small, beside its name.
function landThumb(id) {
  const thumb = h('span', { class: 'lands-thumb', 'aria-hidden': 'true' });
  const art = landArt(id);
  if (art) thumb.style.setProperty('--land-art', `url("${art}")`);
  return thumb;
}

export function guildLandsCard() {
  const card = h('section', { class: 'card guild-lands', 'aria-labelledby': 'guild-lands-title' }, h('p', { class: 'muted', text: t('Wczytywanie…') }));

  function render(answer) {
    const { texts } = answer;
    if (!answer.guild) {
      fill(card, h('h2', { class: 'card-title', id: 'guild-lands-title' }, landBannerArt(22), texts.title), h('p', { class: 'muted', text: texts.lead }));
      return;
    }
    const bonus = filled(texts.bonus, { bonus: texts.bonusPercent });
    fill(
      card,
      h('h2', { class: 'card-title', id: 'guild-lands-title' }, landBannerArt(22), texts.title),
      h('p', { class: 'muted', text: texts.lead }),
      h(
        'div',
        { class: 'lands-banners' },
        h('p', { class: 'lands-banners-title', text: texts.banners }),
        answer.banners.length === 0
          ? h('p', { class: 'muted', text: texts.noBanners })
          : [
              h(
                'ul',
                { class: 'lands-banner-list' },
                answer.banners.map((land) => h('li', { class: 'lands-banner' }, landBannerArt(16), h('span', { text: land.name }))),
              ),
              h('p', { class: 'lands-bonus', text: bonus }),
            ],
      ),
      h('h3', { class: 'lands-week', text: texts.week }),
      answer.lands.length === 0
        ? h('p', { class: 'muted', text: texts.empty })
        : h(
            'ul',
            { class: 'lands-list' },
            answer.lands.map((land) =>
              h(
                'li',
                { class: `lands-row lands-row--${land.state === 'chase' ? 'chase' : 'lead'}` },
                landThumb(land.id),
                h(
                  'span',
                  { class: 'lands-text' },
                  h('strong', { class: 'lands-name', text: land.name }),
                  h('span', { class: 'lands-own', text: filled(texts.yours, { minutes: formatMinutes(land.own) }) }),
                  h('span', { class: 'lands-state', text: stateText(land, texts) }),
                ),
              ),
            ),
          ),
      howItWorks(null, texts.how),
    );
  }

  call('GET', '/api/guild/lands')
    .then(render)
    .catch((error) => fill(card, h('p', { class: 'muted', text: error.message ?? t('Nie udało się wczytać krain.') })));
  return card;
}

// The banner over a land this week (state.landBanners), or null.
const bannerOf = (landId) => state.landBanners?.[landId] ?? null;
const ownBanner = (banner) => Boolean(banner && state.character?.guildTag && banner.tag === state.character.guildTag);

// The banner's tag on a land's card, for every player: the guild's in a
// small flag, lit when it is the character's own guild's.
export function bannerChip(landId) {
  const banner = bannerOf(landId);
  if (!banner) return null;
  const words = state.content?.guildLands;
  const tip = words ? filled(words.chip, { name: banner.name, tag: banner.tag }) : `[${banner.tag}]`;
  return h(
    'span',
    { class: `chip land-banner-chip${ownBanner(banner) ? ' land-banner-chip--own' : ''}`, title: tip, 'aria-label': tip },
    landBannerArt(14),
    h('span', { text: `[${banner.tag}]` }),
  );
}

// The line over a land's places: whose banner stands there, and for the
// character's own guild, the bonus it gives.
export function bannerLine(landId) {
  const banner = bannerOf(landId);
  const words = state.content?.guildLands;
  if (!banner || !words) return null;
  const own = ownBanner(banner);
  return h(
    'p',
    { class: `land-banner-line${own ? ' land-banner-line--own' : ''}` },
    landBannerArt(18),
    h('span', { text: own ? filled(words.ownBanner, { bonus: words.bonusPercent }) : filled(words.otherBanner, { name: banner.name, tag: banner.tag }) }),
  );
}
