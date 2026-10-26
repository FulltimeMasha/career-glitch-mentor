// engine/llm.mjs
// ---------------------------------------------------------------------------
// Career Glitch Mentor — Meta Model API client (Day 1).
//
// The API key lives in Muse's secure connector and is NEVER read here.
// Every call goes through the registered helper, which places a surrogate
// credential on the request and Muse swaps in the real key only for
// api.meta.ai:
//
//   echo '<json>' | python3 ~/workspace/custom-connectors/custom.meta-model-api/bin/meta_api.py respond
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
