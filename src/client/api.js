// Thin wrapper over fetch for the game API. Errors carry a message in the
// page's language that can be shown to the player as is: each request tells
// the server the language (X-Lang, where the server offers English, i18n.js).

import { englishOffered, language, t } from './i18n.js';

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// `body`: an object sent as JSON, or a FormData with a file ("Zgłoś błąd"
// with a screenshot), sent as it is: the browser writes its Content-Type
// with the boundary between the parts.
export async function request(method, path, body) {
  const options = { method, headers: { Accept: 'application/json', ...(englishOffered() && { 'X-Lang': language() }) }, credentials: 'same-origin' };
  if (method !== 'GET' && body instanceof FormData) options.body = body;
  else if (method !== 'GET') {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body ?? {});
  }

  let response;
  try {
    response = await fetch(path, options);
  } catch {
    throw new ApiError(0, 'network', t('Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.'));
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      response.status,
      data?.error?.code ?? 'unknown',
      data?.error?.message ?? t('Wystąpił nieoczekiwany błąd. Spróbuj ponownie.'),
    );
  }
  return data;
}
