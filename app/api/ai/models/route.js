// Public: sends no user data to Ollama.
import { handle, json } from '../../../../lib/server/http.js';
import { listModels } from '../../../../lib/server/ollama.js';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => json({ models: await listModels() }));
