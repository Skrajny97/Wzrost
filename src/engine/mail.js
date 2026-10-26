// The e-mail with the link that confirms an account's address
// (src/server/email.js sends it). The words come from data/texts.json.

import { say } from './text.js';

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

// The subject, and the same message as plain text and as a simple page with
// a button: a mail app shows one or the other.
export function confirmationEmail({ login, link }, content) {
  const { texts } = content;
  const words = {
    intro: say(texts, 'emailConfirmIntro', 0, { login }),
    button: say(texts, 'emailConfirmButton', 0),
    reward: say(texts, 'emailConfirmReward', 0, { points: content.balance.account.emailSystemPoints }),
    link: say(texts, 'emailConfirmLink', 0),
    ignore: say(texts, 'emailConfirmIgnore', 0),
  };
  const paragraph = (text, style = '') => `<p style="margin:0 0 16px;${style}">${escapeHtml(text)}</p>`;
  const href = escapeHtml(link);
  return {
    subject: say(texts, 'emailConfirmSubject', 0),
    text: [words.intro, link, words.reward, words.ignore].join('\n\n'),
    html: [
      '<!doctype html><html lang="pl"><body style="margin:0;padding:24px;background:#f4efe4;font-family:Georgia,serif;color:#2b2418;font-size:16px;line-height:1.5">',
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
