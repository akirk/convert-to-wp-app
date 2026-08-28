#!/usr/bin/env node
// Backwards-compatible alias: `node scripts/generate-blueprint.js --repo URL` → `wr-app URL`.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const argv = process.argv.slice(2);
const repoIndex = argv.findIndex((arg) => arg === '--repo' || arg.startsWith('--repo='));
let target;
if (repoIndex !== -1) {
	target = argv[repoIndex].includes('=') ? argv[repoIndex].split(/=(.*)/s)[1] : argv[repoIndex + 1];
	argv.splice(repoIndex, argv[repoIndex].includes('=') ? 1 : 2);
}
const bin = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'wr-app.js');
const result = spawnSync(process.execPath, [bin, ...(target ? [target] : []), ...argv], { stdio: 'inherit' });
process.exit(result.status ?? 1);
