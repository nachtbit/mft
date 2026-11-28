// Lets the app confirm that sign-in works, without calling the AI.
import { handle, json, rateLimit, requireUser } from '../../../lib/server/http.js';

export const POST = handle(async (request) => {
  rateLimit(`session:${requireUser(request)}`, 30);
  return json({ ok: true });
});
