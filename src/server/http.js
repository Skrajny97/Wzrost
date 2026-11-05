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

// A form with a file (multipart/form-data, as fetch sends a FormData), read
// to at most `limit` bytes; past them `tooLarge` is thrown, also for a body
// that comes in pieces without its length, before the rest is read.
export async function readForm(request, limit, tooLarge = bodyTooLarge()) {
  const type = request.headers.get('Content-Type') ?? '';
  if (!type.toLowerCase().startsWith('multipart/form-data')) {
    throw new ApiError(415, 'unsupported_media_type', 'Nieprawidłowy format danych.');
  }
  if (Number(request.headers.get('Content-Length') ?? 0) > limit) throw tooLarge;
  const chunks = [];
  let size = 0;
  const reader = request.body?.getReader();
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => {});
      throw tooLarge;
    }
    chunks.push(value);
  }
  try {
    return await new Response(new Blob(chunks), { headers: { 'Content-Type': type } }).formData();
  } catch {
    throw invalidBody();
  }
}
