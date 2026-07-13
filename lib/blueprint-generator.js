export const DEFAULT_CONVERTER_REPO = 'https://github.com/akirk/convert-wp-app';
export const DEFAULT_WP_APP_REPO = 'https://github.com/akirk/wp-app';
export const PLAYGROUND_URL = 'https://playground.wordpress.net/';

export function parseGitHubRepo(value) {
	const normalized = String(value || '').trim().replace(/\.git$/, '').replace(/\/+$/, '');
	const match = normalized.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)$/i);
	if (!match) {
		throw new Error('Use a repository URL like https://github.com/owner/repo.');
	}
	return {
		owner: match[1],
		name: match[2],
		url: `https://github.com/${match[1]}/${match[2]}`,
	};
}

export function parseGitHubPagesUrl(value) {
	const normalized = String(value || '').trim();
	const match = normalized.match(/^https:\/\/([a-z0-9-]+)\.github\.io\/([^/?#]+)\/?/i);
	if (!match) {
		throw new Error('Use a GitHub Pages URL like https://owner.github.io/repo/.');
	}
	return {
		owner: match[1],
		name: match[2],
		url: `https://github.com/${match[1]}/${match[2]}`,
		pagesUrl: `https://${match[1]}.github.io/${match[2]}/`,
		basePath: `/${match[2]}/`,
	};
}

export function toSlug(value) {
	return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'wp-app';
}

export function toTitle(value) {
	return toSlug(value).split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

export function buildBlueprint(input) {
	const parsed = parseGitHubRepo(input.repo);
	const selectedSlug = toSlug(input.slug || parsed.name);
	const selectedPluginName = String(input.pluginName || toTitle(selectedSlug)).trim() || toTitle(selectedSlug);
	const selectedRef = String(input.ref || 'HEAD').trim();
	const selectedRefType = String(input.refType || '').trim();
	const converterRef = String(input.converterRef || 'main').trim();
	const converterRefType = String(input.converterRefType || 'branch').trim();
	const builtRef = String(input.builtRef || '').trim();
	const builtRefType = String(input.builtRefType || '').trim();
	const builtPath = String(input.builtPath || '').trim().replace(/^\/+|\/+$/g, '');
	const snapshotFiles = Array.isArray(input.snapshotFiles) ? input.snapshotFiles : [];
	const useSnapshot = snapshotFiles.length > 0;
	const useBuiltCheckout = !useSnapshot && Boolean(builtRef || builtPath);
	const staticFolderName = input.staticFolderName ? toSlug(input.staticFolderName) : (useSnapshot ? '__wp_app_snapshot' : '__wp_app_static');
	const staticFolderPath = `/wordpress/wp-content/plugins/${staticFolderName}`;

	const sourceReference = {
		resource: 'git:directory',
		url: parsed.url,
		ref: selectedRef,
	};
	if (selectedRefType) {
		sourceReference.refType = selectedRefType;
	}

	const steps = [];

	if (!useSnapshot) {
		steps.push({
			step: 'installPlugin',
			pluginData: sourceReference,
			options: {
				activate: false,
				targetFolderName: selectedSlug,
			},
		});
	}

	if (useBuiltCheckout) {
		const builtReference = {
			resource: 'git:directory',
			url: parsed.url,
			ref: builtRef || selectedRef,
		};
		if (builtRefType) {
			builtReference.refType = builtRefType;
		}
		if (builtPath) {
			builtReference.path = builtPath;
		}
		steps.push({
			step: 'installPlugin',
			pluginData: builtReference,
			options: {
				activate: false,
				targetFolderName: staticFolderName,
			},
		});
	}

	if (useSnapshot) {
		for (const directory of snapshotDirectories(staticFolderPath, snapshotFiles)) {
			steps.push({
				step: 'mkdir',
				path: directory,
			});
		}
		for (const file of snapshotFiles) {
			const relativePath = normalizeSnapshotPath(file.path);
			steps.push({
				step: 'writeFile',
				path: `${staticFolderPath}/${relativePath}`,
				data: {
					resource: 'url',
					url: file.url,
				},
			});
		}
	}

	steps.push(
		{
			step: 'installPlugin',
			pluginData: {
				resource: 'git:directory',
				url: input.wpAppRepo || DEFAULT_WP_APP_REPO,
				ref: input.wpAppRef || 'main',
				refType: input.wpAppRefType || 'branch',
				path: 'src',
			},
			options: {
				activate: false,
				targetFolderName: '__wp_app_runtime',
			},
		},
		{
			step: 'installPlugin',
			pluginData: {
				resource: 'git:directory',
				url: input.converterRepo || DEFAULT_CONVERTER_REPO,
				ref: converterRef,
				refType: converterRefType,
				path: 'scripts',
			},
			options: {
				activate: false,
				targetFolderName: '__convert_to_wp_app',
			},
		},
	);

	if (input.includeMyApps) {
		steps.push({
			step: 'installPlugin',
			pluginData: {
				resource: 'git:directory',
				url: input.myAppsRepo || 'https://github.com/akirk/my-apps',
				ref: input.myAppsRef || 'main',
				refType: input.myAppsRefType || 'branch',
			},
			options: {
				targetFolderName: 'my-apps',
			},
		});
	}

	steps.push(
		{
			step: 'runPHP',
			code: buildRunPhp({
				slug: selectedSlug,
				plugin_dir: `/wordpress/wp-content/plugins/${selectedSlug}`,
				plugin_name: selectedPluginName,
				plugin_author: parsed.owner,
				url_path: selectedSlug,
				source_build_dir: useBuiltCheckout || useSnapshot ? staticFolderPath : '',
				source_public_path: input.sourcePublicPath || '',
				wp_app_source_dir: '/wordpress/wp-content/plugins/__wp_app_runtime',
				allow_php_source: input.allowPhpSource === false ? '0' : '1',
				cleanup_dirs: useSnapshot ? [
					staticFolderPath,
					'/wordpress/wp-content/plugins/__wp_app_runtime',
					'/wordpress/wp-content/plugins/__convert_to_wp_app',
				] : [],
			}),
			progress: {
				caption: `Convert ${selectedPluginName} to WpApp`,
			},
		}
	);

	return {
		$schema: 'https://playground.wordpress.net/blueprint-schema.json',
		meta: {
			title: `${selectedPluginName} WpApp`,
			description: `Convert ${parsed.url} into a WordPress app plugin from checked-out static files.`,
			author: parsed.owner,
			categories: ['Apps'],
		},
		features: {
			networking: true,
		},
		login: true,
		landingPage: `/${selectedSlug}/`,
		steps,
	};
}

export function normalizeSnapshotPath(value) {
	const path = String(value || '').replace(/\\/g, '/').replace(/^\/+/, '');
	if (!path || path.includes('..') || path.startsWith('.')) {
		throw new Error(`Invalid snapshot path: ${value}`);
	}
	return path;
}

export function snapshotDirectories(rootPath, files) {
	const directories = new Set([rootPath]);
	for (const file of files) {
		const path = normalizeSnapshotPath(file.path);
		const parts = path.split('/');
		parts.pop();
		let current = rootPath;
		for (const part of parts) {
			current += `/${part}`;
			directories.add(current);
		}
	}
	return [...directories].sort((a, b) => a.localeCompare(b));
}

export function buildPlaygroundUrl(blueprint) {
	return `${PLAYGROUND_URL}?blueprint-url=${encodeURIComponent(`data:application/json;base64,${base64EncodeUtf8(JSON.stringify(blueprint))}`)}`;
}

export function buildRunPhp(config) {
	return `<?php
require_once '/wordpress/wp-load.php';
require_once ABSPATH . 'wp-admin/includes/plugin.php';
$GLOBALS['convert_to_wp_app_playground_config'] = ${phpArray(config)};
require '/wordpress/wp-content/plugins/__convert_to_wp_app/playground-convert.php';`;
}

export function phpArray(value) {
	const entries = Object.entries(value).map(([key, item]) => {
		return `    ${JSON.stringify(key)} => ${phpValue(item)}`;
	});
	return `array(\n${entries.join(',\n')}\n)`;
}

export function phpValue(value) {
	if (Array.isArray(value)) {
		return `array(${value.map((item) => phpValue(item)).join(', ')})`;
	}
	return JSON.stringify(String(value));
}

export function base64EncodeUtf8(value) {
	if (typeof Buffer !== 'undefined') {
		return Buffer.from(value, 'utf8').toString('base64');
	}
	const bytes = new TextEncoder().encode(value);
	let binary = '';
	bytes.forEach((byte) => {
		binary += String.fromCharCode(byte);
	});
	return btoa(binary);
}
