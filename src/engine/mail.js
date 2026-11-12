// @ts-check
// The e-mails with a link: the one that confirms an account's address
// (src/server/email.js sends it) and the one that sets a new password
// (src/server/password.js, the author's 838 A). The words come from data/texts.json, in
// the content's language, which the page names too (`language`, from
// src/server/content.js; Polish for the data as it is).

import { say } from './text.js';

/** @type {Record<string, string>} */
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** @param {unknown} text */
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (char) => ESCAPES[char]);

// The subject, and the same message as plain text and as a simple page with
// a button: a mail app shows one or the other.
/**
 * @param {{ login: string, link: string }} account
 * @param {{ texts: Record<string, string[]>, balance: { account: { emailSystemPoints: number } }, language?: string }} content
 * @returns {{ subject: string, text: string, html: string }}
 */
export function confirmationEmail({ login, link }, content) {
  const { texts } = content;
  const words = {
    intro: say(texts, 'emailConfirmIntro', 0, { login }),
    button: say(texts, 'emailConfirmButton', 0),
    reward: say(texts, 'emailConfirmReward', 0, { points: content.balance.account.emailSystemPoints }),
    link: say(texts, 'emailConfirmLink', 0),
    ignore: say(texts, 'emailConfirmIgnore', 0),
  };
  /** @param {string} text */
  const paragraph = (text, style = '') => `<p style="margin:0 0 16px;${style}">${escapeHtml(text)}</p>`;
  const href = escapeHtml(link);
  return {
    subject: say(texts, 'emailConfirmSubject', 0),
    text: [words.intro, link, words.reward, words.ignore].join('\n\n'),
    html: [
      `<!doctype html><html lang="${escapeHtml(content.language ?? 'pl')}"><body style="margin:0;padding:24px;background:#f4efe4;font-family:Georgia,serif;color:#2b2418;font-size:16px;line-height:1.5">`,
      '<div style="max-width:480px;margin:0 auto">',
      paragraph(words.intro),
      `<p style="margin:0 0 16px"><a href="${href}" style="display:inline-block;padding:12px 20px;background:#5b3f1d;color:#fff8e7;text-decoration:none;border-radius:6px;font-weight:bold">${escapeHtml(words.button)}</a></p>`,
      paragraph(words.reward),
      paragraph(words.link, 'font-size:14px'),
      `<p style="margin:0 0 16px;font-size:14px;word-break:break-all"><a href="${href}" style="color:#5b3f1d">${href}</a></p>`,
      paragraph(words.ignore, 'font-size:14px;color:#6b5f4b'),
      '</div></body></html>',
    ].join(''),
  };
}

// The mail of "Nie pamiętam hasła" (the author's 838 A, 12.11.2026): the
// link that opens the window for a new password, as the subject, plain text
// and a simple page with a button, as the confirmation's.
/**
 * @param {{ login: string, link: string }} account
 * @param {{ texts: Record<string, string[]>, language?: string }} content
 * @returns {{ subject: string, text: string, html: string }}
 */
export function passwordResetEmail({ login, link }, content) {
  const { texts } = content;
  const words = {
    intro: say(texts, 'passwordResetIntro', 0, { login }),
    button: say(texts, 'passwordResetButton', 0),
    time: say(texts, 'passwordResetTime', 0),
    link: say(texts, 'emailConfirmLink', 0),
    ignore: say(texts, 'passwordResetIgnore', 0),
  };
  /** @param {string} text */
  const paragraph = (text, style = '') => `<p style="margin:0 0 16px;${style}">${escapeHtml(text)}</p>`;
  const href = escapeHtml(link);
  return {
    subject: say(texts, 'passwordResetSubject', 0),
    text: [words.intro, link, words.time, words.ignore].join('\n\n'),
    html: [
      `<!doctype html><html lang="${escapeHtml(content.language ?? 'pl')}"><body style="margin:0;padding:24px;background:#f4efe4;font-family:Georgia,serif;color:#2b2418;font-size:16px;line-height:1.5">`,
      '<div style="max-width:480px;margin:0 auto">',
      paragraph(words.intro),
      `<p style="margin:0 0 16px"><a href="${href}" style="display:inline-block;padding:12px 20px;background:#5b3f1d;color:#fff8e7;text-decoration:none;border-radius:6px;font-weight:bold">${escapeHtml(words.button)}</a></p>`,
      paragraph(words.time),
      paragraph(words.link, 'font-size:14px'),
      `<p style="margin:0 0 16px;font-size:14px;word-break:break-all"><a href="${href}" style="color:#5b3f1d">${href}</a></p>`,
      paragraph(words.ignore, 'font-size:14px;color:#6b5f4b'),
      '</div></body></html>',
    ].join(''),
  };
}
