// api/_lib/leads.mjs — server-side lead storage for the Matchmaker gate.
// ---------------------------------------------------------------------------
// Founder TZ (28.10.2026): before the interview, the visitor leaves a name
// and an email (marked free); after the verdict, the recommendation the
// SERVER computed and the person's one-tap reaction are attached to the
// same lead row. Nothing else is stored — no interview answers, ever.
//
// Storage: Supabase project stwzrcahhieqbabvljue, table public.cg_leads,
// written ONLY from this module with the service-role key, which lives in
// the server env (CG_SUPABASE_URL + CG_SUPABASE_KEY) and never ships to a
// client. The table has RLS enabled and NO policies for anon/authenticated,
// so the public anon key can neither read nor write it — the same posture
// as the locked-down mentor_sessions table (audit C3). mentor_sessions is
// NOT touched by this module and its lockdown is NOT weakened.
//
// Without the env vars the store is simply unconfigured: mentor-core
// answers the lead actions with a clean 503 and the page offers
// "continue without saving" — the interview itself never depends on this.
// ---------------------------------------------------------------------------

export const LEAD_REACTIONS = ['love', 'meh', 'nope'];

export function leadStoreConfig(env = process.env) {
  const url = typeof env.CG_SUPABASE_URL === 'string' ? env.CG_SUPABASE_URL.replace(/\/+$/, '') : '';
  const key = typeof env.CG_SUPABASE_KEY === 'string' ? env.CG_SUPABASE_KEY : '';
  if (!url || !key) return null;
  return { url, key };
}

async function sb(cfg, path, { method, body, prefer } = {}) {
  const r = await fetch(`${cfg.url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`lead store ${method} ${path} -> ${r.status}: ${t.slice(0, 200)}`);
  }
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}

// Insert a lead row; returns the new row's id. Throws on any store error —
// the caller turns that into the clean client-facing shape (audit V14).
export async function insertLead(cfg, row) {
  const out = await sb(cfg, 'cg_leads', { method: 'POST', body: row, prefer: 'return=representation' });
  const rec = Array.isArray(out) ? out[0] : out;
  if (!rec || typeof rec.id !== 'string') throw new Error('lead store insert returned no id');
  return rec.id;
}

// Patch a lead row by id; returns false when no such row exists.
export async function updateLead(cfg, id, patch) {
  const out = await sb(cfg, `cg_leads?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: patch,
    prefer: 'return=representation',
  });
  return Array.isArray(out) && out.length > 0;
}
