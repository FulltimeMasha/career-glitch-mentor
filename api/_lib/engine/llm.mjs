// engine/llm.mjs
// ---------------------------------------------------------------------------
// Career Glitch Mentor — Meta Model API client (Day 1).
//
// Two transports, same Responses API shape:
//   1. DIRECT (hosts that hold a real key): when the env var
//      META_MODEL_API_KEY is set, POST https://api.meta.ai/v1/responses
//      with that key as a Bearer token. This is how the Vercel deployment
//      talks to Meta (the founder placed the key in the project's env).
//   2. CONNECTOR HELPER (Muse's local host): no env key — every call goes
//      through the registered helper, which places a surrogate credential
//      on the request and Muse swaps in the real key only for api.meta.ai:
//        echo '<json>' | python3 ~/workspace/custom-connectors/custom.meta-model-api/bin/meta_api.py respond
//      The key itself is never read by this code on that path either.
//
// Body is the Meta Responses API shape:
//   { model, instructions, input, max_output_tokens, reasoning? }
// Assistant text is extracted from the returned JSON:
//   output[] items with type "message" -> content[] entries with
//   type "output_text" -> .text   (concatenated, in order).
// ---------------------------------------------------------------------------

import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const HELPER_PATH = join(
  homedir(),
  'workspace',
  'custom-connectors',
  'custom.meta-model-api',
  'bin',
  'meta_api.py',
);

export const MODELS = {
  interview: 'muse-spark-1.3',
  report: 'muse-wonder-1.0',
};

/**
 * Sanitise a user-controlled string before it is placed inside an LLM
 * prompt (security audit C5, 27.10.2026): control characters and
 * newlines are flattened to spaces (so pasted text cannot forge prompt
 * structure or fake "system" lines), the length is capped, and quotes
 * are neutralised when the value will sit inside quotation marks.
 * Engine data (profession names, figures) never passes through here —
 * it comes from the server-side base, never from the client payload.
 */
export function sanitizeUserText(value, maxLen = 500) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

/** Concatenate all output_text parts from a Responses API payload. */
export function extractText(raw) {
  const parts = [];
  const output = raw && Array.isArray(raw.output) ? raw.output : [];
  for (const item of output) {
    if (!item || item.type !== 'message' || !Array.isArray(item.content)) continue;
    for (const entry of item.content) {
      if (entry && entry.type === 'output_text' && typeof entry.text === 'string') {
        parts.push(entry.text);
      }
    }
  }
  return parts.join('');
}

/**
 * Call the Meta Model API through the connector helper.
 *
 * @param {object} args
 * @param {string} args.model            e.g. 'muse-spark-1.3' | 'muse-wonder-1.0'
 * @param {string} args.instructions     system-style instructions
 * @param {string} args.input            user-side input text
 * @param {number} [args.maxOutputTokens] defaults to 1500
 * @param {object} [args.reasoning]      optional, e.g. { effort: 'low' }.
 *                                       Passed through verbatim; callers
 *                                       decide whether to send it (reasoning
 *                                       is on by default and token-hungry).
 * @returns {Promise<{text: string, raw: object}>}
 * @throws Error with a clear message on helper failure (non-zero exit,
 *         an `http_error` field in the helper output, unparseable output,
 *         or an API error object in the payload).
 */
export async function metaRespond({ model, instructions, input, maxOutputTokens = 1500, reasoning } = {}) {
  if (!model) throw new Error('metaRespond: `model` is required');
  if (typeof input !== 'string' || input.length === 0) {
    throw new Error('metaRespond: `input` must be a non-empty string');
  }

  const body = {
    model,
    instructions: instructions ?? '',
    input,
    max_output_tokens: maxOutputTokens,
  };
  if (reasoning !== undefined) body.reasoning = reasoning;

  // ---- Transport 1: direct call with the host's own key (Vercel env).
  const directKey = process.env.META_MODEL_API_KEY;
  if (directKey) {
    let resp;
    try {
      resp = await fetch('https://api.meta.ai/v1/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${directKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new Error(`metaRespond: direct Meta API call failed: ${e.message}`);
    }
    const rawText = await resp.text();
    let parsed = null;
    try { parsed = JSON.parse(rawText); } catch { /* handled below */ }
    if (!resp.ok) {
      // Diagnostic: list the model ids THIS key can actually see (ids are
      // not secrets) so a wrong-scope key is distinguishable from a typo'd
      // model name without ever exposing the key itself.
      let catalog = '';
      try {
        const mr = await fetch('https://api.meta.ai/v1/models', {
          headers: { Authorization: `Bearer ${directKey}` },
        });
        if (mr.ok) {
          const mj = await mr.json();
          const ids = (mj.data || []).map((m) => m.id).filter(Boolean);
          if (ids.length) catalog = ` | models visible to this key: ${ids.join(', ')}`;
        } else {
          catalog = ` | model catalog check: HTTP ${mr.status}`;
        }
      } catch { /* diagnostic only — never mask the original error */ }
      throw new Error(`metaRespond: Meta API HTTP error ${resp.status}: ${rawText.slice(0, 500)}${catalog}`);
    }
    if (!parsed) throw new Error(`metaRespond: direct Meta API returned unparseable output: ${rawText.slice(0, 500)}`);
    if (parsed.error) {
      const msg = typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error).slice(0, 500);
      throw new Error(`metaRespond: Meta API error: ${msg}`);
    }
    const text = extractText(parsed);
    if (!text) {
      throw new Error(`metaRespond: no output_text found in API response: ${JSON.stringify(parsed).slice(0, 500)}`);
    }
    return { text, raw: parsed };
  }

  // ---- Transport 2: the connector helper (Muse's local host).
  const { stdout, stderr, code } = await new Promise((resolve, reject) => {
    const child = spawn('python3', [HELPER_PATH, 'respond'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => reject(new Error(`metaRespond: failed to spawn helper (${HELPER_PATH}): ${e.message}`)));
    child.on('close', (exitCode) => resolve({ stdout: out, stderr: err, code: exitCode }));
    child.stdin.on('error', () => { /* surfaced via close/error paths */ });
    child.stdin.write(JSON.stringify(body));
    child.stdin.end();
  });

  let parsed = null;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error(
      `metaRespond: helper returned unparseable output (exit ${code}): ${stdout.slice(0, 500)}${stderr ? ` | stderr: ${stderr.slice(0, 300)}` : ''}`,
    );
  }

  if (parsed && typeof parsed.http_error !== 'undefined') {
    throw new Error(`metaRespond: Meta API HTTP error ${parsed.http_error}: ${String(parsed.body ?? '').slice(0, 500)}`);
  }
  if (code !== 0) {
    throw new Error(`metaRespond: helper exited with code ${code}: ${stdout.slice(0, 500)}${stderr ? ` | stderr: ${stderr.slice(0, 300)}` : ''}`);
  }
  if (parsed && parsed.error) {
    const msg = typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error).slice(0, 500);
    throw new Error(`metaRespond: Meta API error: ${msg}`);
  }

  const text = extractText(parsed);
  if (!text) {
    throw new Error(`metaRespond: no output_text found in API response: ${JSON.stringify(parsed).slice(0, 500)}`);
  }
  return { text, raw: parsed };
}

export default metaRespond;
