// Runs the workpaper's independent checks against the packet from the command line.
//   npm run check            -> summary table
//   npm run check -- --json  -> full findings as JSON
// Uses the same src/checks/checks.ts the app runs (bundled on the fly with esbuild).
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'wp-')), 'checks.mjs');
await build({
  stdin: {
    contents: `export { runChecks } from './src/checks/checks.ts'; export { versionAt } from './src/data/model.ts'; export { taxEffect } from './src/store/projections.ts';
      import { loadModelFromPacket } from './scripts/model-node.ts'; export { loadModelFromPacket };`,
    resolveDir: root, loader: 'ts',
  },
  bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error',
});
const mod = await import(pathToFileURL(out).href);
const packet = JSON.parse(readFileSync(join(root, 'public/packet.json'), 'utf8'));
const m = mod.loadModelFromPacket(packet);
const vi = m.versions[m.versions.length - 1];
const findings = mod.runChecks(m, vi);
if (process.argv.includes('--json')) { console.log(JSON.stringify(findings, null, 2)); process.exit(0); }
let fed = 0, ca = 0;
const rows = findings.filter((f) => f.severity !== 'pass').map((f) => {
  const e = (f.proposals || []).reduce((a, p) => { const t = mod.taxEffect(vi, p); return { fed: a.fed + t.fed, ca: a.ca + t.ca }; }, { fed: 0, ca: 0 });
  fed += e.fed; ca += e.ca;
  return { severity: f.severity, kind: f.kind, title: f.title, fed: e.fed, ca: e.ca };
});
console.table(rows);
console.log(`${findings.filter((f) => f.severity === 'pass').length} checks pass; ${rows.length} findings. Estimated effect of all proposals on ${vi.v.version}: federal ${fed}, California ${ca}.`);
