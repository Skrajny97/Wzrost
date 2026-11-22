// @ts-check
// Facebook, TikTok and Wattpad (the author, 18.11.2026: „podepnij
// facebooka, tiktoka i wattpada do gry, gdzieś w ustawienia albo
// społeczność obok discorda z przyciskami”), and the players' wiki on Fandom
// (22.11.2026: „Podepnij Wiki społecznościową jako przycisk pod grę”): a row
// each in the Ustawienia,
// right below the Discord row and like it, with a game button that bears the
// place's mark and its words (data/community.json, social.places) and opens
// the link in a new card, or in the place's app where the phone has it. A
// place without a link does not show. Only in the Ustawienia: by the
// Społeczność's title three more marks beside Discord's leave no room for
// the title on a phone.

import { h } from './dom.js';
import { state } from './state.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// The marks as Simple Icons draws them (simpleicons.org, CC0; 24 × 24), in
// their brands' colours and otherwise unchanged: Facebook's "f" logo, a white
// f in its blue circle; TikTok's note, white on black; Wattpad's W, white on
// its orange, as on the apps' own tiles; Fandom's mark, white on its pink,
// for the wiki its players keep there.
/** @type {Record<string, { name: string, color: string, path: string, circle?: boolean }>} */
export const MARKS = {
  facebook: {
    name: 'Facebook',
    color: '#0866FF',
    circle: true,
    path: 'M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z',
  },
  tiktok: {
    name: 'TikTok',
    color: '#000000',
    path: 'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z',
  },
  wattpad: {
    name: 'Wattpad',
    color: '#FF500A',
    path: 'M13.034 3.09c-1.695.113-3.9 2.027-6.9 6.947.245-2.758.345-4.716-.857-5.743-.823-.702-2.764-.974-3.926.536C.18 6.349-.09 9.312.024 12.432c.238 6.518 2.544 8.487 4.59 8.487h.001c3.623 0 4.13-4.439 6.604-8.4-.09 1.416-.008 2.668.266 3.532 1.078 3.398 4.784 3.663 6.467.21 2.374-4.87 3.058-6.016 5.453-9.521 1.58-2.314-.252-3.812-2.374-2.735-1.09.554-2.86 1.935-5.065 4.867.387-2.23.28-5.996-2.932-5.782z',
  },
  wiki: {
    name: 'Wiki',
    color: '#FA005A',
    path: 'M8.123.008a.431.431 0 00-.512.42v9.746L4.104 6.666a.432.432 0 00-.66.064.428.428 0 00-.071.239v10.064a2.387 2.387 0 00.701 1.694l4.565 4.57a2.4 2.4 0 001.693.703h3.34c.635 0 1.242-.252 1.691-.701l4.565-4.572a2.394 2.394 0 00.699-1.694V13.41a2.39 2.39 0 00-.7-1.693L8.343.125a.427.427 0 00-.219-.117zM9.646 12.51a.719.719 0 01.508.21l1.848 1.85 1.844-1.85a.714.714 0 011.015 0l1.32 1.321a.724.724 0 01.212.508v1.406a.72.72 0 01-.21.508l-3.68 3.7a.72.72 0 01-1.019 0l-3.668-3.7a.716.716 0 01-.209-.506v-1.408a.71.71 0 01.211-.506l1.32-1.322a.713.713 0 01.508-.211Z',
  },
};

/**
 * @param {string} tag
 * @param {Record<string, string | number>} attributes
 */
function svgNode(tag, attributes) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

/**
 * A place's mark, `size` pixels square, for its button: Facebook's circle
 * with a white f, the others white on their tile, rounded as Discord's.
 * @param {string} id
 * @param {number} [size]
 */
export function socialMark(id, size = 22) {
  const mark = MARKS[id];
  const svg = svgNode('svg', { class: 'social-mark', width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' });
  if (mark.circle) {
    // The f is a hole in the blue circle: white shows through it.
    svg.append(svgNode('circle', { cx: 12, cy: 12, r: 11.9, fill: '#ffffff' }), svgNode('path', { d: mark.path, fill: mark.color }));
  } else {
    // The glyph in the middle of the tile, with clear space around it.
    svg.append(svgNode('rect', { width: 24, height: 24, rx: 4.8, fill: mark.color }), svgNode('path', { d: mark.path, fill: '#ffffff', transform: 'translate(4.5 4.5) scale(0.625)' }));
  }
  return svg;
}

/**
 * The places with a link and a mark, in the data's order.
 * @returns {{ id: string, url: string, label: string }[]}
 */
function places() {
  const list = state.content?.community?.social?.places ?? [];
  return list.filter((/** @type {{ id: string, url: string, label: string }} */ place) => place.url && place.label && MARKS[place.id]);
}

/**
 * The rows in the Ustawienia: the place's name, and its link as a game
 * button with the mark and the words.
 */
export function socialRows() {
  return places().map((place) =>
    h(
      'div',
      { class: `status-row status-row--social status-row--${place.id}` },
      h('dt', { text: MARKS[place.id].name }),
      h(
        'dd',
        {},
        h('a', { class: 'button button--world button--small social-button', href: place.url, target: '_blank', rel: 'noopener noreferrer' }, socialMark(place.id), h('span', { text: place.label })),
      ),
    ),
  );
}
