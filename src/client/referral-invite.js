// The invitation from a player's link (Poleć grę, 982; src/server/referrals.js):
// /?p=<code> is kept on this device until an account is made here (a few
// days, as a player may look around first), the address loses it, and the
// sign-up shows who invites, with the new account's form open. The code goes
// with the sign-up and on the way to Google.

import { request } from './api.js';
import { loadContent, state } from './state.js';

const KEY = 'insight-ref';
const KEEP_DAYS = 30;
// The server checks the code itself; here only its shape.
const SHAPE = /^[A-Z0-9]{5,12}$/;

const $ = (selector) => document.querySelector(selector);
const filled = (text, vars) => String(text ?? '').replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));

// The code of the link the page was opened with, kept, and the address
// without it.
export function takeReferral() {
  const url = new URL(location.href);
  const code = url.searchParams.get('p');
  if (code === null) return;
  url.searchParams.delete('p');
  history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
  if (!SHAPE.test(code)) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() }));
  } catch {
    // Without the storage the invitation lasts while the page is open.
    sessionCode = code;
  }
}

let sessionCode = null;

// The code kept, or null.
export function referralCode() {
  try {
    const kept = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (kept && SHAPE.test(kept.code) && Date.now() - kept.at < KEEP_DAYS * 86400000) return kept.code;
  } catch {
    // Nothing kept.
  }
  return sessionCode;
}

export function forgetReferral() {
  sessionCode = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing kept.
  }
}

// Over the sign-up: who invites (the character its account plays), with
// the new account's form open, and the way to Google carrying the code.
// Nothing for a code of no account.
export async function showInvite(openRegister) {
  const code = referralCode();
  const box = $('#referral-invite');
  if (!box) return;
  box.hidden = true;
  if (!code) return;
  const inviter = await request('GET', `/api/referral?code=${encodeURIComponent(code)}`).catch(() => null);
  if (!inviter) return;
  const content = state.content ?? (await loadContent().catch(() => null));
  const rules = content?.community?.referral;
  if (!rules) return;
  const later = rules.milestones.find((milestone) => milestone.newcomer > 0);
  $('#referral-invite-title').textContent = rules.texts.inviteTitle;
  $('#referral-invite-text').textContent = filled(rules.texts.invite, { name: inviter.name, level: inviter.level, start: rules.start, later: later?.newcomer ?? 0, laterLevel: later?.level ?? 0 });
  box.hidden = false;
  for (const link of document.querySelectorAll('a.google-button[href^="/api/auth/google/start"]')) {
    const url = new URL(link.href, location.origin);
    if (url.searchParams.get('mode') === 'link') continue;
    url.searchParams.set('ref', code);
    link.href = `${url.pathname}${url.search}`;
  }
  openRegister();
}
