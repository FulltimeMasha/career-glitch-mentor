// State pay (BLS OEWS May 2024) — deterministic lookup, no estimation.
// The extract (api/_lib/data/state-pay.json) is built by
// scripts/build_state_pay.mjs from the official BLS state file and covers
// NC and FL only. A state we have no extract for, or an occupation BLS did
// not release a row for, returns null — the UI then shows the national
// median alone, with no substitute figure and no marker.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA = JSON.parse(readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'state-pay.json'), 'utf8'));

export const STATE_PAY_SOURCE = DATA.source;

const STATE_NAMES = {
  NC: ['nc', 'north carolina'],
  FL: ['fl', 'florida'],
};

// 'NC' / 'North Carolina' / 'nc.' -> 'NC'; anything else -> null.
export function normalizeState(input) {
  if (input == null) return null;
  const s = String(input).trim().toLowerCase().replace(/[.\s]+$/, '');
  if (!s) return null;
  for (const [code, names] of Object.entries(STATE_NAMES)) {
    if (s === code.toLowerCase() || names.includes(s)) return code;
  }
  return null;
}

export function stateName(code) {
  return code === 'NC' ? 'North Carolina' : code === 'FL' ? 'Florida' : null;
}

// onet_soc is O*NET format ('29-1141.00'); OEWS keys are plain SOC ('29-1141').
export function socKey(onetSoc) {
  if (!onetSoc) return null;
  return String(onetSoc).replace(/\.\d+$/, '');
}

// -> { state, name, median_k, p25_k?, p75_k?, p90_k?, top_coded?, basis? } | null
export function statePayFor(onetSoc, stateInput) {
  const code = normalizeState(stateInput);
  if (!code) return null;
  const soc = socKey(onetSoc);
  if (!soc) return null;
  const row = DATA.states?.[code]?.[soc];
  if (!row || typeof row.median_k !== 'number') return null;
  return { state: code, name: stateName(code), ...row };
}
