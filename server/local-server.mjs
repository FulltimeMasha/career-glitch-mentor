// server/local-server.mjs
// ---------------------------------------------------------------------------
// Local host for the Mentor API — runs in Muse's environment, the one
// place the Meta Model API key is reachable (via the secure-connector
// helper that engine/llm.mjs spawns). This is the LIVE host for Spark
// interview turns and Wonder reports; the Vercel copy of the same core
// runs the deterministic engine and reports llm.status honestly.
//
//   node server/local-server.mjs        (PORT env, default 8377)
//
// Routes:
//   POST /api/mentor   {action, ...}  -> server/mentor-core.mjs
//   GET  /api/mentor?action=health
//   GET  /mentor | /   -> web/mentor.html (the exact page build)
//   GET  /healthz
//
// Supabase persistence config: if ~/workspace/solobid-app/.env.local
// exists, NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are read
// from it into CG_SUPABASE_URL / CG_SUPABASE_KEY (process env wins).
// Values are never printed.
// ---------------------------------------------------------------------------

import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

// --- env bootstrap (values never logged) -----------------------------------
(function loadSupabaseEnv() {
  if (process.env.CG_SUPABASE_URL && process.env.CG_SUPABASE_KEY) return;
  const envPath = join(homedir(), 'workspace', 'solobid-app', '.env.local');
  if (!existsSync(envPath)) return;
  const found = {};
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) found[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  if (found.NEXT_PUBLIC_SUPABASE_URL && found.SUPABASE_SERVICE_ROLE_KEY) {
    process.env.CG_SUPABASE_URL = process.env.CG_SUPABASE_URL || found.NEXT_PUBLIC_SUPABASE_URL;
    process.env.CG_SUPABASE_KEY = process.env.CG_SUPABASE_KEY || found.SUPABASE_SERVICE_ROLE_KEY;
    console.log('[mentor-api] supabase persistence configured (key source: solobid-app/.env.local, value not shown)');
  }
})();

const { handleMentorRequest } = await import('./mentor-core.mjs');
const PAGE = readFileSync(join(ROOT, 'web', 'mentor.html'), 'utf8');

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/healthz') return sendJson(res, 200, { ok: true });
    if (url.pathname === '/api/mentor') {
      if (req.method === 'GET') {
        const out = await handleMentorRequest({ action: url.searchParams.get('action') || 'health' });
        return sendJson(res, out.status, out.json);
      }
      if (req.method === 'POST') {
        let raw = '';
        for await (const chunk of req) raw += chunk;
        let body;
        try { body = JSON.parse(raw || '{}'); } catch { return sendJson(res, 400, { ok: false, error: 'invalid JSON body' }); }
        const out = await handleMentorRequest(body);
        return sendJson(res, out.status, out.json);
      }
      return sendJson(res, 405, { ok: false, error: 'method not allowed' });
    }
    if (url.pathname === '/' || url.pathname === '/mentor' || url.pathname === '/mentor.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(PAGE);
    }
    return sendJson(res, 404, { ok: false, error: 'not found' });
  } catch (e) {
    return sendJson(res, 500, { ok: false, error: e.message });
  }
});

const PORT = Number(process.env.PORT || 8377);
server.listen(PORT, () => {
  console.log(`[mentor-api] listening on http://127.0.0.1:${PORT}  (page: /mentor, api: POST /api/mentor)`);
});
