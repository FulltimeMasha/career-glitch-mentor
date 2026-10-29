// Regression: the O*NET import loader must resolve its data dir from the
// module's own location, never from process.cwd(). Before the fix, the
// module-relative dirs were passed to path.join() as URL objects, join()
// threw, the catch swallowed it, and only the cwd fallback ever loaded
// the shards — started from a foreign cwd the merge silently no-opped
// (0/376 professions with onet_soc, engine degraded to stubs, no error).
// These tests run the loader in child processes with cwd OUTSIDE the
// repo so the regression cannot hide behind the test runner's cwd.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE = fileURLToPath(new URL('../api/_lib/engine/professions.mjs', import.meta.url));

function runChild(script, cwd) {
  return spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd, encoding: 'utf8', timeout: 120_000,
  });
}

test('onet loader: merge applies when the process cwd is outside the repo', () => {
  const script = `
    import { loadProfessions } from ${JSON.stringify(MODULE)};
    const profs = loadProfessions();
    const rn = profs.find((p) => p.slug === 'registered-nurse');
    console.log(JSON.stringify({
      total: profs.length,
      withSoc: profs.filter((p) => p.onet_soc).length,
      rnSoc: rn ? rn.onet_soc : null,
      rnRiasecStub: rn ? rn.riasec_stub : null,
      rnSuppliesStub: rn ? rn.supplies_stub : null,
      rnNightShifts: rn ? rn.night_shifts : null,
    }));
  `;
  const res = runChild(script, tmpdir());
  assert.equal(res.status, 0, `child failed: ${res.stderr}`);
  const out = JSON.parse(res.stdout.trim().split('\n').at(-1));
  assert.ok(out.withSoc > 300, `expected the O*NET merge to apply from a foreign cwd, got ${out.withSoc}/${out.total} professions with onet_soc`);
  assert.equal(out.rnSoc, '29-1141.00');
  assert.equal(out.rnRiasecStub, false);
  assert.equal(out.rnSuppliesStub, false);
  assert.equal(out.rnNightShifts, true);
});

test('onet loader: fails loudly when no data dir is reachable (no silent stub engine)', () => {
  // Copy the module alone into an empty dir: its module-relative data
  // dirs point at nothing, and with the child cwd also empty of data,
  // every candidate misses — the loader must throw, not return null.
  const isolated = mkdtempSync(join(tmpdir(), 'cg-onet-isolated-'));
  const copy = join(isolated, 'professions.mjs');
  copyFileSync(MODULE, copy);
  const emptyCwd = mkdtempSync(join(tmpdir(), 'cg-onet-cwd-'));
  const script = `
    import { applyOnetImport } from ${JSON.stringify(copy)};
    try {
      applyOnetImport([]);
      console.log('NO-THROW');
    } catch (e) {
      console.log('THREW: ' + e.message.slice(0, 40));
    }
  `;
  const res = runChild(script, emptyCwd);
  assert.equal(res.status, 0, `child failed: ${res.stderr}`);
  assert.ok(res.stdout.includes('THREW: readOnetImport: O*NET import not found'),
    `expected a loud readOnetImport failure, got: ${res.stdout} ${res.stderr}`);
});
