// JSON responses and request parsing shared by all API handlers.

const MAX_BODY_BYTES = 4096;

// An error that is safe to show to the player: `message` is in Polish.
export class ApiError extends Error {
  constructor(status, code, message, headers = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
}

export function errorResponse(error) {
  return json({ error: { code: error.code, message: error.message } }, error.status, error.headers);
}

const invalidBody = () => new ApiError(400, 'invalid_json', 'Nieprawidłowe dane żądania.');
const bodyTooLarge = () => new ApiError(413, 'payload_too_large', 'Za dużo danych w żądaniu.');

export async function readJson(request) {
  const type = request.headers.get('Content-Type') ?? '';
  if (!type.toLowerCase().startsWith('application/json')) {
    throw new ApiError(415, 'unsupported_media_type', 'Nieprawidłowy format danych.');
  }
  if (Number(request.headers.get('Content-Length') ?? 0) > MAX_BODY_BYTES) throw bodyTooLarge();

  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) throw bodyTooLarge();

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw invalidBody();
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) throw invalidBody();
  return data;
}
