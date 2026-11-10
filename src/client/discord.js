// Discord (the author, 10.11.2026: „Musimy dodać ikonkę Discorda do
// gry.”): the Discord mark by the Społeczność's title and the "Discord" row
// in the Ustawienia open the game's Discord server by its invite link
// (data/community.json, discord.invite) in a new card, or in the Discord
// app where the phone has it. Only the link: linking the game account
// through a Discord application is not built (the author: „Widzę że to
// trzeba być deweloperem i mieć firme zeby tego Discorda podpiac a jak chce
// tylko przycisk linku z zaproszeniem zrobić?”). While the link is empty,
// neither shows.

import { h } from './dom.js';
import { state } from './state.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
// Discord's mark, "Clyde", as its brand kit draws it (127.14 × 96.36), white
// on Discord's Blurple and unchanged, as Discord's brand guidelines ask.
const BLURPLE = '#5865F2';
const CLYDE =
  'M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z';

// The mark on its Blurple tile, `size` pixels square, for buttons.
export function discordMark(size = 24) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  const attributes = { class: 'discord-mark', width: size, height: size, viewBox: '0 0 180 180', 'aria-hidden': 'true', focusable: 'false' };
  for (const [key, value] of Object.entries(attributes)) svg.setAttribute(key, String(value));
  const tile = document.createElementNS(SVG_NS, 'rect');
  for (const [key, value] of Object.entries({ width: 180, height: 180, rx: 36, fill: BLURPLE })) tile.setAttribute(key, String(value));
  const clyde = document.createElementNS(SVG_NS, 'path');
  // The mark in the middle of the tile, with its clear space around it.
  for (const [key, value] of Object.entries({ d: CLYDE, fill: '#ffffff', transform: 'translate(26.43 41.82)' })) clyde.setAttribute(key, String(value));
  svg.append(tile, clyde);
  return svg;
}

// The invite link and the words for it ("Dołącz do serwera Discord"), or
// null while there is no link.
function invite() {
  const discord = state.content?.community?.discord;
  return discord?.invite && discord.texts?.join ? { href: discord.invite, label: discord.texts.join } : null;
}

const inviteLink = ({ href }, attributes, ...children) => h('a', { ...attributes, href, target: '_blank', rel: 'noopener noreferrer' }, children);

// The mark by the Społeczność's title, or null without an invite link.
export function discordButton() {
  const link = invite();
  if (!link) return null;
  return inviteLink(link, { class: 'community-discord', title: link.label }, discordMark(30), h('span', { class: 'visually-hidden', text: link.label }));
}

// "Discord" in the Ustawienia: the invite link as a game button with the
// mark, or null without an invite link.
export function discordRow() {
  const link = invite();
  if (!link) return null;
  return h(
    'div',
    { class: 'status-row status-row--discord' },
    h('dt', { text: 'Discord' }),
    h('dd', {}, inviteLink(link, { class: 'button button--world button--small discord-button' }, discordMark(22), h('span', { text: link.label }))),
  );
}
