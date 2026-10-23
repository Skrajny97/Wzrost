// Worker entry point. Static files from src/client are served by Workers Static
// Assets before this code runs; only /api/* and unknown paths reach the Worker.

import { login, logout, me, register } from './accounts.js';
import { autoPoints, createCharacter, deleteCharacter, getCharacter, resetPoints, spendPoints } from './characters.js';
import { publicContent } from './content.js';
import { ApiError, errorResponse, json } from './http.js';
import { cancelHunt, claimHunt, huntOptions, startHunt } from './hunts.js';
import { discardItem, equipItem, previewItem, unequipItem } from './inventory.js';
import { getReport, listReports } from './reports.js';

const routes = [
  ['GET', '/api/health', health],
  ['POST', '/api/auth/register', register],
  ['POST', '/api/auth/login', login],
  ['POST', '/api/auth/logout', logout],
  ['GET', '/api/me', me],
  ['GET', '/api/content', () => json(publicContent())],
  ['GET', '/api/character', getCharacter],
  ['POST', '/api/character', createCharacter],
  ['DELETE', '/api/character', deleteCharacter],
  ['POST', '/api/character/points', spendPoints],
  ['POST', '/api/character/points/auto', autoPoints],
  ['POST', '/api/character/points/reset', resetPoints],
  ['POST', '/api/items/:id/equip', equipItem],
  ['POST', '/api/items/:id/unequip', unequipItem],
  ['POST', '/api/items/:id/discard', discardItem],
  ['GET', '/api/items/:id/preview', previewItem],
  ['GET', '/api/hunts/options', huntOptions],
  ['POST', '/api/hunts', startHunt],
  ['POST', '/api/hunts/cancel', cancelHunt],
  ['POST', '/api/hunts/claim', claimHunt],
  ['GET', '/api/reports', listReports],
  ['GET', '/api/reports/:id', getReport],
].map(([method, pattern, handler]) => ({ method, parts: pattern.split('/'), handler }));

// Returns the :params of a matching pattern, or null.
function match(parts, path) {
  const segments = path.split('/');
  if (segments.length !== parts.length) return null;
  const params = {};
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].startsWith(':')) params[parts[i].slice(1)] = decodeURIComponent(segments[i]);
    else if (parts[i] !== segments[i]) return null;
  }
  return params;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      return new Response('Nie znaleziono strony.', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    try {
      const matching = routes
        .map((route) => ({ route, params: match(route.parts, url.pathname) }))
        .filter(({ params }) => params);
      if (matching.length === 0) throw new ApiError(404, 'not_found', 'Nie znaleziono.');
      const found = matching.find(({ route }) => route.method === request.method);
      if (!found) {
        throw new ApiError(405, 'method_not_allowed', 'Niedozwolona metoda.', {
          Allow: matching.map(({ route }) => route.method).join(', '),
        });
      }
      if (request.method !== 'GET') checkOrigin(request, url);
      // The server clock is the only source of truth about time.
      return await found.route.handler({ request, env, now: Date.now(), params: found.params });
    } catch (error) {
      if (error instanceof ApiError) return errorResponse(error);
      console.error(error);
      return errorResponse(
        new ApiError(500, 'internal', 'Wystąpił błąd serwera. Spróbuj ponownie za chwilę.'),
      );
    }
  },
};

async function health({ env, now }) {
  await env.DB.prepare('SELECT 1').first();
  return json({ ok: true, time: now, version: env.APP_VERSION });
}

// Browsers always send Origin with POST requests made by fetch; a foreign one is refused.
function checkOrigin(request, url) {
  const origin = request.headers.get('Origin');
  if (origin !== null && origin !== url.origin) {
    throw new ApiError(403, 'forbidden_origin', 'Odrzucono żądanie z innej strony.');
  }
}
