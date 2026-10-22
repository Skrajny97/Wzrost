// Worker entry point. Static files from src/client are served by Workers Static
// Assets before this code runs; only /api/* and unknown paths reach the Worker.

import { login, logout, me, register } from './accounts.js';
import { ApiError, errorResponse, json } from './http.js';

const routes = {
  '/api/health': { GET: health },
  '/api/auth/register': { POST: register },
  '/api/auth/login': { POST: login },
  '/api/auth/logout': { POST: logout },
  '/api/me': { GET: me },
};

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
      const route = routes[url.pathname];
      if (!route) throw new ApiError(404, 'not_found', 'Nie znaleziono.');
      const handler = route[request.method];
      if (!handler) {
        throw new ApiError(405, 'method_not_allowed', 'Niedozwolona metoda.', {
          Allow: Object.keys(route).join(', '),
        });
      }
      if (request.method !== 'GET') checkOrigin(request, url);
      // The server clock is the only source of truth about time.
      return await handler({ request, env, now: Date.now() });
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
