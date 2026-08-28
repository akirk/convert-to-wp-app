import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const templatesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'templates');

const ASSET_ATTRIBUTES = {
	src: ['audio', 'embed', 'iframe', 'img', 'script', 'source', 'track', 'video'],
	href: ['link'],
};

const TEXT_ASSET_EXTENSIONS = ['css', 'html', 'js', 'json', 'mjs', 'svg', 'txt', 'webmanifest', 'xml'];

export function slugify(value) {
	const slug = String(value).replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase().replace(/^-+|-+$/g, '');
	return slug !== '' ? slug : 'wp-app';
}

export function slugToTitle(slug) {
	return slug.replace(/[-_]+/g, ' ').replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function phpString(value) {
	return "'" + String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}

function decodeEntities(text) {
	return text.replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos|#39);/gi, (match, entity) => {
		const lower = entity.toLowerCase();
		if (lower.startsWith('#x')) {
			return String.fromCodePoint(parseInt(lower.slice(2), 16));
		}
		if (lower.startsWith('#')) {
			return String.fromCodePoint(parseInt(lower.slice(1), 10));
		}
		return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[lower] ?? match;
	});
}

function indent(content, prefix) {
	return content === '' ? '' : prefix + content.replace(/\n/g, '\n' + prefix);
}

function isFile(file) {
	try {
		return fs.statSync(file).isFile();
	} catch {
		return false;
	}
}

function isDir(dir) {
	try {
		return fs.statSync(dir).isDirectory();
	} catch {
		return false;
	}
}

export function isDeployableIndex(indexHtml) {
	let html;
	try {
		html = fs.readFileSync(indexHtml, 'utf8');
	} catch {
		return false;
	}
	if (html.includes('%PUBLIC_URL%')) {
		return false;
	}
	return !/\b(?:src|href)=(['"])\/?src\//i.test(html);
}

export function findPhpOnepagerEntry(directory) {
	if (isFile(path.join(directory, 'index.php'))) {
		return 'index.php';
	}
	let entries;
	try {
		entries = fs.readdirSync(directory);
	} catch {
		return null;
	}
	const phpFiles = entries.filter((entry) => entry.endsWith('.php') && isFile(path.join(directory, entry)));
	return phpFiles.length === 1 ? phpFiles[0] : null;
}

/**
 * Locate the deployable one-pager inside an app directory.
 *
 * Mirrors the PHP converter: an explicit source dir wins, then build/ and
 * dist/, then the app root as static HTML, then the app root as a PHP
 * one-pager.
 */
export function resolveSource(appDir, { sourceDir = '', allowPhpSource = true } = {}) {
	const candidates = [];
	if (sourceDir !== '') {
		candidates.push(path.resolve(appDir, sourceDir));
	}
	for (const candidate of [path.join(appDir, 'build'), path.join(appDir, 'dist')]) {
		if (isFile(path.join(candidate, 'index.html'))) {
			return { type: 'static-html', dir: candidate };
		}
	}
	candidates.push(appDir);

	for (const candidate of candidates) {
		if (isFile(path.join(candidate, 'index.html')) && isDeployableIndex(path.join(candidate, 'index.html'))) {
			return { type: 'static-html', dir: candidate };
		}
	}

	if (allowPhpSource) {
		for (const candidate of candidates) {
			const entry = findPhpOnepagerEntry(candidate);
			if (entry !== null) {
				return { type: 'php-onepager', dir: candidate, entry };
			}
		}
	}

	throw new Error(
		'Could not find a deployable index.html or index.php in the app root, build/, dist/, or the configured source directory. ' +
		'Run the frontend build first, or pass --source-dir.'
	);
}

export function extractTagContents(html, tag) {
	const match = html.match(new RegExp(`<${tag}\\b[^>]*>(.*?)<\\/${tag}>`, 'is'));
	return match ? match[1].trim() : '';
}

export function localAssetPath(url, sourcePublicPath = '') {
	url = url.trim();
	if (url === '' || url[0] === '#' || url[0] === '?') {
		return null;
	}
	if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url)) {
		return null;
	}
	if (url.startsWith('%PUBLIC_URL%/')) {
		url = url.slice('%PUBLIC_URL%/'.length);
	}
	url = url.replace(/[?#].*$/s, '').replace(/^\.\//, '').replace(/^\/+/, '');
	sourcePublicPath = sourcePublicPath.replace(/^\/+|\/+$/g, '');
	if (sourcePublicPath !== '' && (url + '/').startsWith(sourcePublicPath + '/')) {
		url = url.slice(sourcePublicPath.length).replace(/^\/+/, '');
	}
	return url !== '' && !url.includes('..') ? url : null;
}

function isAssetAttribute(tagName, attribute) {
	return (ASSET_ATTRIBUTES[attribute] ?? []).includes(tagName);
}

export function rewriteAssetUrls(html, sourcePublicPath = '') {
	return html.replace(/<([a-z][a-z0-9:-]*)\b[^>]*>/gi, (tag, rawTagName) => {
		const tagName = rawTagName.toLowerCase();
		return tag.replace(/\b(src|href)=(['"])([^'"]+)\2/gi, (attr, name, quote, value) => {
			if (!isAssetAttribute(tagName, name.toLowerCase())) {
				return attr;
			}
			const assetPath = localAssetPath(decodeEntities(value), sourcePublicPath);
			if (assetPath === null) {
				return attr;
			}
			return `${name}=${quote}<?php echo esc_url( $asset_url( ${phpString(assetPath)} ) ); ?>${quote}`;
		});
	});
}

export function createTemplate(html, slug, sourcePublicPath = '') {
	let head = rewriteAssetUrls(extractTagContents(html, 'head'), sourcePublicPath);
	const body = rewriteAssetUrls(extractTagContents(html, 'body'), sourcePublicPath);

	let titleTag = '<title><?php echo wp_app_title(); ?></title>';
	const titleMatch = head.match(/<title\b[^>]*>(.*?)<\/title>/is);
	if (titleMatch) {
		const title = decodeEntities(titleMatch[1].replace(/<[^>]*>/g, '')).trim();
		if (title !== '') {
			titleTag = `<title><?php echo wp_app_title( ${phpString(title)} ); ?></title>`;
		}
	}
	let replaced = false;
	head = head.replace(/<title\b[^>]*>.*?<\/title>/is, () => {
		replaced = true;
		return titleTag;
	});
	if (!replaced) {
		head = titleTag + '\n' + head.replace(/^\s+/, '');
	}

	return `<?php
$asset_url = static function( string $path ): string {
    return plugins_url( 'app/' . ltrim( $path, '/' ), dirname( __DIR__ ) . '/' . ${phpString(slug + '.php')} );
};
?>
<!DOCTYPE html>
<html <?php wp_app_language_attributes(); ?>>
<head>
${indent(head.trim(), '    ')}
    <?php wp_app_head(); ?>
</head>
<body>
    <?php wp_app_body_open(); ?>
${indent(body.trim(), '    ')}
    <?php wp_app_body_close(); ?>
</body>
</html>`;
}

export function createPhpOnepagerTemplate(entry, slug, urlPath) {
	const template = fs.readFileSync(path.join(templatesDir, 'php-onepager.php'), 'utf8');
	return template
		.replace("'__SLUG__.php'", phpString(slug + '.php'))
		.replace("'__ENTRY__'", phpString(entry))
		.replace("'__ROUTE__'", phpString(urlPath.replace(/^\/+|\/+$/g, '')));
}

export function pluginPhp(slug, pluginName, urlPath, pluginAuthor = '') {
	const header = (value) => value.replace(/[\r\n]/g, ' ');
	const authorHeader = pluginAuthor !== '' ? ` * Author: ${header(pluginAuthor)}\n` : '';
	return `<?php
/**
 * Plugin Name: ${header(pluginName)}
 * Description: A checked-out static one-pager converted into a WordPress app powered by WpApp.
 * Version: 1.0.0
${authorHeader} * Text Domain: ${slug}
 * Requires PHP: 7.4
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

require_once __DIR__ . '/vendor/autoload.php';

add_action( 'plugins_loaded', function() {
    $app = new \\WpApp\\WpApp( __DIR__ . '/templates', ${phpString(urlPath)}, array(
        'app_name' => ${phpString(pluginName)},
        'my_apps'  => true,
    ) );
    $app->init();
} );

register_activation_hook( __FILE__, function() {
    flush_rewrite_rules();
} );

register_deactivation_hook( __FILE__, function() {
    flush_rewrite_rules();
} );
`;
}

export function autoloadPhp() {
	return `<?php
$wp_app_dir = __DIR__ . '/akirk/wp-app';
$files = array(
    'src/class-registry.php',
    'src/class-settings.php',
    'src/class-router.php',
    'src/class-masterbar.php',
    'src/class-wpapp.php',
    'src/class-client-encrypted-fields.php',
    'src/BaseStorage.php',
    'src/abstract-baseapp.php',
    'src/functions.php',
);
foreach ( $files as $file ) {
    $path = $wp_app_dir . '/' . $file;
    if ( file_exists( $path ) ) {
        require_once $path;
    }
}
return true;
`;
}

function shouldRewriteTextAssetFile(file) {
	const extension = path.extname(file.replace(/\.map$/i, '')).slice(1).toLowerCase();
	return TEXT_ASSET_EXTENSIONS.includes(extension);
}

export function rewritePublicPathInContent(content, sourcePublicPath, assetBaseUrl) {
	sourcePublicPath = sourcePublicPath.replace(/^\/+|\/+$/g, '');
	if (sourcePublicPath === '') {
		return content;
	}
	const quotedPath = sourcePublicPath.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
	const base = assetBaseUrl.replace(/\/+$/, '') + '/';
	return content.replace(new RegExp(`(?<![A-Za-z0-9._~%+\\/-])\\/${quotedPath}\\/([^'"\`\\s<>)]+)`, 'g'), (match, rest) => {
		let decoded;
		try {
			decoded = decodeURIComponent(rest);
		} catch {
			decoded = rest;
		}
		if (decoded === '' || decoded.includes('..')) {
			return match;
		}
		return base + rest.replace(/^\/+/, '');
	});
}

function rewriteTextAssetFiles(directory, rewrite) {
	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		const file = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			rewriteTextAssetFiles(file, rewrite);
			continue;
		}
		if (!entry.isFile() || !shouldRewriteTextAssetFile(file)) {
			continue;
		}
		const content = fs.readFileSync(file, 'utf8');
		const rewritten = rewrite(content);
		if (rewritten !== content) {
			fs.writeFileSync(file, rewritten);
		}
	}
}

function copyDirectory(source, destination, skip = []) {
	fs.mkdirSync(destination, { recursive: true });
	const resolvedDestination = path.resolve(destination);
	for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
		if (skip.includes(entry.name)) {
			continue;
		}
		const sourcePath = path.join(source, entry.name);
		const destinationPath = path.join(destination, entry.name);
		const resolvedSource = path.resolve(sourcePath);
		if (resolvedSource === resolvedDestination || resolvedDestination.startsWith(resolvedSource + path.sep)) {
			continue;
		}
		if (entry.isDirectory()) {
			copyDirectory(sourcePath, destinationPath, skip);
		} else if (entry.isFile() || entry.isSymbolicLink()) {
			fs.copyFileSync(sourcePath, destinationPath);
		}
	}
}

/**
 * Wrap a local one-page app directory as a self-contained WpApp plugin.
 *
 * @param {object} options
 * @param {string} options.appDir       Directory containing the app (usually cwd).
 * @param {string} options.pluginDir    Output plugin directory.
 * @param {string} options.wpAppDir     Checkout of akirk/wp-app (or its src/).
 * @param {string} options.slug         Plugin slug.
 * @param {string} [options.pluginName] Human name. Default: title-cased slug.
 * @param {string} [options.urlPath]    WpApp route. Default: slug.
 * @param {string} [options.pluginAuthor]
 * @param {string} [options.sourceDir]  Directory with index.html relative to appDir.
 * @param {string} [options.sourcePublicPath] Public URL prefix to strip from asset URLs.
 * @param {boolean} [options.allowPhpSource]
 */
export function wrapApp(options) {
	const appDir = path.resolve(options.appDir ?? process.cwd());
	const slug = slugify(options.slug);
	const pluginDir = path.resolve(options.pluginDir ?? path.join(appDir, 'wr-app', slug));
	const pluginName = (options.pluginName ?? '').trim() || slugToTitle(slug);
	const urlPath = (options.urlPath ?? '').trim().replace(/^\/+|\/+$/g, '') || slug;
	const pluginAuthor = (options.pluginAuthor ?? '').trim();
	const sourcePublicPath = (options.sourcePublicPath ?? '').trim();
	const wpAppDir = path.resolve(options.wpAppDir);
	const wpAppSrc = isDir(path.join(wpAppDir, 'src')) ? path.join(wpAppDir, 'src') : wpAppDir;

	if (!isFile(path.join(wpAppSrc, 'class-wpapp.php'))) {
		throw new Error(`WpApp source directory does not contain class-wpapp.php: ${wpAppDir}`);
	}

	const source = resolveSource(appDir, {
		sourceDir: options.sourceDir ?? '',
		allowPhpSource: options.allowPhpSource !== false,
	});

	fs.mkdirSync(pluginDir, { recursive: true });

	const assetDir = path.join(pluginDir, 'app');
	fs.rmSync(assetDir, { recursive: true, force: true });
	copyDirectory(source.dir, assetDir, ['.git', 'node_modules', 'vendor']);

	if (sourcePublicPath !== '') {
		const assetBaseUrl = `/wp-content/plugins/${encodeURIComponent(slug)}/app/`;
		rewriteTextAssetFiles(assetDir, (content) => rewritePublicPathInContent(content, sourcePublicPath, assetBaseUrl));
	}

	let template;
	if (source.type === 'php-onepager') {
		template = createPhpOnepagerTemplate(source.entry, slug, urlPath);
	} else {
		template = createTemplate(fs.readFileSync(path.join(source.dir, 'index.html'), 'utf8'), slug, sourcePublicPath);
	}
	fs.mkdirSync(path.join(pluginDir, 'templates'), { recursive: true });
	fs.writeFileSync(path.join(pluginDir, 'templates', 'index.php'), template);

	const runtimeDir = path.join(pluginDir, 'vendor', 'akirk', 'wp-app');
	fs.rmSync(runtimeDir, { recursive: true, force: true });
	copyDirectory(wpAppSrc, path.join(runtimeDir, 'src'));
	fs.writeFileSync(path.join(pluginDir, 'vendor', 'autoload.php'), autoloadPhp());
	fs.writeFileSync(path.join(pluginDir, `${slug}.php`), pluginPhp(slug, pluginName, urlPath, pluginAuthor));

	return {
		slug,
		pluginDir,
		pluginName,
		urlPath,
		url: `/${urlPath}/`,
		source,
	};
}
