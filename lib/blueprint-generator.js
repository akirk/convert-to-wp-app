export const DEFAULT_CONVERTER_REPO = 'https://github.com/akirk/convert-to-wp-app';
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
	const apps = normalizeAppsInput(input);
	if (input.apps || apps.length > 1) {
		return buildMultiAppBlueprint(input, apps);
	}
	return buildSingleAppBlueprint(input);
}

function normalizeAppsInput(input) {
	const apps = Array.isArray(input.apps) ? input.apps.filter(Boolean) : [input];
	return apps.length ? apps : [input];
}

function buildSingleAppBlueprint(input) {
	const app = prepareAppInput(input, 0);
	const steps = [
		...buildSourceSteps(app),
		...buildRuntimeSteps(input),
	];
	if (input.includeMyApps) {
		steps.push(buildMyAppsStep(input));
	}
	steps.push(buildConversionStep(app, { cleanupShared: app.useSnapshot }));

	return {
		$schema: 'https://playground.wordpress.net/blueprint-schema.json',
		meta: {
			title: `${app.pluginName} WpApp`,
			description: app.sourceUrl
				? `Convert ${app.sourceUrl} into a WordPress app plugin from static files.`
				: 'Convert a static HTML page into a WordPress app plugin.',
			author: app.pluginAuthor,
			categories: ['Apps'],
		},
		features: {
			networking: true,
		},
		login: true,
		landingPage: `/${app.slug}/`,
		steps,
	};
}

function buildMultiAppBlueprint(input, apps) {
	const preparedApps = apps.map((app, index) => prepareAppInput(app, index));
	const steps = [];
	for (const app of preparedApps) {
		steps.push(...buildSourceSteps(app));
	}
	steps.push(...buildRuntimeSteps(input));
	if (input.includeMyApps) {
		steps.push(buildMyAppsStep(input));
	}
	const shouldCleanupShared = preparedApps.some((app) => app.useSnapshot);
	preparedApps.forEach((app, index) => {
		steps.push(buildConversionStep(app, {
			cleanupShared: shouldCleanupShared && index === preparedApps.length - 1,
		}));
	});

	const firstApp = preparedApps[0];
	return {
		$schema: 'https://playground.wordpress.net/blueprint-schema.json',
		meta: {
			title: `${firstApp.pluginName} and ${preparedApps.length - 1} more WpApps`,
			description: `Convert ${preparedApps.length} apps into WordPress app plugins from static files.`,
			author: firstApp.pluginAuthor,
			categories: ['Apps'],
		},
		features: {
			networking: true,
		},
		login: true,
		landingPage: `/${firstApp.slug}/`,
		steps,
	};
}

function prepareAppInput(input, index) {
	const parsed = input.repo ? parseGitHubRepo(input.repo) : null;
	const sourceName = input.sourceName || parsed?.name || 'html-page';
	const sourceUrl = input.sourceUrl || parsed?.url || '';
	const selectedSlug = uniqueSlug(input.slug || sourceName, index);
	const selectedPluginName = String(input.pluginName || toTitle(selectedSlug)).trim() || toTitle(selectedSlug);
	const selectedPluginAuthor = String(input.pluginAuthor || parsed?.owner || '').trim();
	const selectedRef = String(input.ref || 'HEAD').trim();
	const selectedRefType = String(input.refType || '').trim();
	const builtRef = String(input.builtRef || '').trim();
	const builtRefType = String(input.builtRefType || '').trim();
	const builtPath = String(input.builtPath || '').trim().replace(/^\/+|\/+$/g, '');
	const snapshotFiles = Array.isArray(input.snapshotFiles) ? input.snapshotFiles : [];
	const useSnapshot = snapshotFiles.length > 0;
	const useBuiltCheckout = !useSnapshot && Boolean(builtRef || builtPath);
	const staticFolderName = input.staticFolderName
		? toSlug(input.staticFolderName)
		: (useSnapshot ? `__wp_app_snapshot_${selectedSlug}` : `__wp_app_static_${selectedSlug}`);
	const staticFolderPath = `/wordpress/wp-content/plugins/${staticFolderName}`;

	return {
		...input,
		parsed,
		sourceName,
		sourceUrl,
		slug: selectedSlug,
		pluginName: selectedPluginName,
		pluginAuthor: selectedPluginAuthor,
		ref: selectedRef,
		refType: selectedRefType,
		builtRef,
		builtRefType,
		builtPath,
		snapshotFiles,
		useSnapshot,
		useBuiltCheckout,
		staticFolderName,
		staticFolderPath,
	};
}

function uniqueSlug(value, index) {
	const slug = toSlug(value);
	return index > 0 && slug === 'wp-app' ? `${slug}-${index + 1}` : slug;
}

function buildSourceSteps(app) {
	const steps = [];
	if (!app.useSnapshot) {
		if (!app.parsed) {
			throw new Error('Use a repository URL, or provide snapshot files for a single HTML page.');
		}
		const sourceReference = {
			resource: 'git:directory',
			url: app.parsed.url,
			ref: app.ref,
		};
		if (app.refType) {
			sourceReference.refType = app.refType;
		}
		steps.push({
			step: 'installPlugin',
			pluginData: sourceReference,
			options: {
				activate: false,
				targetFolderName: app.slug,
			},
		});
	}

	if (app.useBuiltCheckout) {
		if (!app.parsed) {
			throw new Error('Built checkouts require a GitHub repository URL.');
		}
		const builtReference = {
			resource: 'git:directory',
			url: app.parsed.url,
			ref: app.builtRef || app.ref,
		};
		if (app.builtRefType) {
			builtReference.refType = app.builtRefType;
		}
		if (app.builtPath) {
			builtReference.path = app.builtPath;
		}
		steps.push({
			step: 'installPlugin',
			pluginData: builtReference,
			options: {
				activate: false,
				targetFolderName: app.staticFolderName,
			},
		});
	}

	if (app.useSnapshot) {
		for (const directory of snapshotDirectories(app.staticFolderPath, app.snapshotFiles)) {
			steps.push({
				step: 'mkdir',
				path: directory,
			});
		}
		for (const file of app.snapshotFiles) {
			const relativePath = normalizeSnapshotPath(file.path);
			steps.push({
				step: 'writeFile',
				path: `${app.staticFolderPath}/${relativePath}`,
				data: {
					resource: 'url',
					url: file.url,
				},
			});
		}
	}
	return steps;
}

function buildRuntimeSteps(input) {
	const converterRef = String(input.converterRef || 'main').trim();
	const converterRefType = String(input.converterRefType || 'branch').trim();
	return [
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
	];
}

function buildMyAppsStep(input) {
	return {
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
	};
}

function buildConversionStep(app, options = {}) {
	const cleanupDirs = app.useSnapshot ? [app.staticFolderPath] : [];
	if (options.cleanupShared) {
		cleanupDirs.push(
			'/wordpress/wp-content/plugins/__wp_app_runtime',
			'/wordpress/wp-content/plugins/__convert_to_wp_app',
		);
	}
	return {
		step: 'runPHP',
		code: buildRunPhp({
			slug: app.slug,
			plugin_dir: `/wordpress/wp-content/plugins/${app.slug}`,
			plugin_name: app.pluginName,
			plugin_author: app.pluginAuthor,
			url_path: app.slug,
			source_build_dir: app.useBuiltCheckout || app.useSnapshot ? app.staticFolderPath : '',
			source_public_path: app.sourcePublicPath || '',
			wp_app_source_dir: '/wordpress/wp-content/plugins/__wp_app_runtime',
			allow_php_source: app.allowPhpSource === false ? '0' : '1',
			cleanup_dirs: cleanupDirs,
		}),
		progress: {
			caption: `Convert ${app.pluginName} to WpApp`,
		},
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
	const params = new URLSearchParams({
		'blueprint-url': `data:application/json;base64,${base64EncodeUtf8(JSON.stringify(blueprint))}`,
		storage: 'temp',
	});
	return `${PLAYGROUND_URL}?${params.toString()}`;
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
