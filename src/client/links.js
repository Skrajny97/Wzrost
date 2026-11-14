// Links in texts the author writes: the admin's chat messages
// (src/server/chat.js, ADMIN_LINK) and the "Co nowego?" entries (news.js).
// A label in square brackets with its address in round ones shows as the
// label, a bare address as itself, each opening in a new card; only http(s).
// The parts come back as text and links, for h()'s children.

import { h } from './dom.js';

const LINKED = /\[([^[\]]{1,80})\]\((https?:\/\/[^\s()]{1,500})\)|(https?:\/\/[^\s()]{1,500})/giu;

export function linkedText(text, className = 'chat-link') {
  const parts = [];
  let at = 0;
  for (const found of text.matchAll(LINKED)) {
    const [whole, label, labelled, bare] = found;
    const address = labelled ?? bare;
    let safe = null;
    try {
      const url = new URL(address);
      if (url.protocol === 'https:' || url.protocol === 'http:') safe = url.href;
    } catch {
      safe = null;
    }
    if (found.index > at) parts.push(text.slice(at, found.index));
    parts.push(safe ? h('a', { class: className, href: safe, target: '_blank', rel: 'noopener noreferrer', text: label ?? bare }) : whole);
    at = found.index + whole.length;
  }
  if (at < text.length) parts.push(text.slice(at));
  return parts;
}
