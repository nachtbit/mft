// Server only. Shared request handling for API routes.
import { parseAllowedIds, verifyInitData } from './telegramAuth.js';

export class HttpError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

// Never logs the error: it could hold request data.
export function handle(fn) {
  return async (request) => {
    try {
      return await fn(request);
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.code }, error.status);
      return json({ error: 'server_error' }, 500);
    }
  };
}

export function requireUser(request) {
  const token = process.env.BOT_TOKEN;
  const allowed = parseAllowedIds(process.env.ALLOWED_IDS);
  if (!token || allowed.size === 0) throw new HttpError(503, 'not_configured');

  const header = request.headers.get('authorization') ?? '';
  const userId = header.startsWith('tma ') ? verifyInitData(header.slice(4), token) : null;
  if (!userId) throw new HttpError(401, 'unauthorized');
  if (!allowed.has(userId)) throw new HttpError(403, 'forbidden');
  return userId;
}

// Reads JSON while enforcing a real byte limit, whatever Content-Length claims.
export async function readJson(request, maxBytes) {
  if (!(request.headers.get('content-type') ?? '').startsWith('application/json')) {
    throw new HttpError(415, 'bad_request');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request.body ?? []) {
    size += chunk.byteLength;
    if (size > maxBytes) throw new HttpError(413, 'too_large');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'bad_request');
  }
}

// Best effort only: each serverless instance has its own memory.
const hits = new Map();

export function rateLimit(key, limit, windowMs = 60_000, now = Date.now()) {
  const recent = (hits.get(key) ?? []).filter((time) => now - time < windowMs);
  if (recent.length >= limit) throw new HttpError(429, 'slow_down');
  recent.push(now);
  hits.set(key, recent);
}
