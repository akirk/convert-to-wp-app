import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const WP_APP_REPO = 'akirk/wp-app';

function cacheRoot() {
	const base = process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');
	return path.join(base, 'wr-app', 'wp-app');
}

async function githubJson(url) {
	const headers = { 'User-Agent': 'wr-app', Accept: 'application/vnd.github+json' };
	if (process.env.GITHUB_TOKEN) {
		headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
	}
	const response = await fetch(url, { headers });
	if (!response.ok) {
		throw new Error(`GitHub request failed (${response.status}) for ${url}`);
	}
	return response.json();
}

/**
 * Ensure a checkout of akirk/wp-app's src/ is available locally and return
 * its directory. Downloads from GitHub into ~/.cache/wr-app on first use.
 *
 * @param {object} [options]
 * @param {string} [options.ref]  Git ref. Default: main.
 * @param {boolean} [options.refresh] Re-download even if cached.
 * @param {(message: string) => void} [options.log]
 */
export async function ensureWpAppRuntime({ ref = 'main', refresh = false, log = () => {} } = {}) {
	const commit = await githubJson(`https://api.github.com/repos/${WP_APP_REPO}/commits/${encodeURIComponent(ref)}`).catch(
		(error) => {
			const cached = latestCached();
			if (cached) {
				log(`Could not reach GitHub (${error.message}); using cached WpApp runtime ${path.basename(cached)}.`);
				return null;
			}
			throw error;
		}
	);
	if (commit === null) {
		return latestCached();
	}

	const target = path.join(cacheRoot(), commit.sha);
	if (!refresh && fs.existsSync(path.join(target, 'src', 'class-wpapp.php'))) {
		return target;
	}

	log(`Downloading WpApp runtime ${WP_APP_REPO}@${commit.sha.slice(0, 7)}…`);
	const tree = await githubJson(`https://api.github.com/repos/${WP_APP_REPO}/git/trees/${commit.sha}?recursive=1`);
	const files = tree.tree.filter((node) => node.type === 'blob' && node.path.startsWith('src/'));
	if (files.length === 0) {
		throw new Error(`No src/ files found in ${WP_APP_REPO}@${commit.sha}`);
	}

	const staging = `${target}.tmp-${process.pid}`;
	fs.rmSync(staging, { recursive: true, force: true });
	await Promise.all(
		files.map(async (file) => {
			const url = `https://raw.githubusercontent.com/${WP_APP_REPO}/${commit.sha}/${file.path}`;
			const response = await fetch(url, { headers: { 'User-Agent': 'wr-app' } });
			if (!response.ok) {
				throw new Error(`Download failed (${response.status}) for ${url}`);
			}
			const destination = path.join(staging, file.path);
			fs.mkdirSync(path.dirname(destination), { recursive: true });
			fs.writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
		})
	);
	fs.rmSync(target, { recursive: true, force: true });
	fs.renameSync(staging, target);
	return target;
}

function latestCached() {
	const root = cacheRoot();
	if (!fs.existsSync(root)) {
		return null;
	}
	const candidates = fs
		.readdirSync(root)
		.map((name) => path.join(root, name))
		.filter((dir) => fs.existsSync(path.join(dir, 'src', 'class-wpapp.php')))
		.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
	return candidates[0] ?? null;
}
