// api/mentor.js — Vercel entry for the Career Glitch Mentor API.
// The real handler is server/mentor-core.mjs; scripts/sync_api_bundle.mjs
// copies it (plus engine/) into the site tree at api/_lib/ for deployment.
// This file exists in the repo as the canonical source of the entry shim.
//
// Host note: the deterministic engine runs fully here. Meta Model API
// calls are attempted through the connector helper, which exists only in
// Muse's environment — on Vercel they return llm.status 'unavailable'
// with the real error. No key is stored on this host, ever.
module.exports = async (req, res) => {
  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    if (!body || typeof body !== 'object') body = {};
    if (req.method === 'GET') body = { action: (req.query && req.query.action) || 'health' };
    const { handleMentorRequest } = await import('./_lib/mentor-core.mjs');
    const out = await handleMentorRequest(body);
    res.status(out.status).json(out.json);
  } catch (e) {
    res.status(500).json({ ok: false, error: `mentor api boot failure: ${e.message}` });
  }
};
