#!/usr/bin/env node
import path from 'node:path';
import { buildBlueprint, buildPlaygroundUrl } from '../lib/blueprint-generator.js';
import { wrapApp } from '../lib/wrap.js';
import { ensureWpAppRuntime } from '../lib/wp-app-runtime.js';

const booleanFlags = new Set(['help', 'playgroundUrl', 'json', 'refreshRuntime', 'noPhp']);

function parseArgs(argv) {
	const args = { _: [] };
	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];
		if (token === '-h') {
			args.help = true;
			continue;
		}
		if (!token.startsWith('--')) {
			args._.push(token);
			continue;
		}
		const [rawKey, inlineValue] = token.slice(2).split(/=(.*)/s, 2);
		const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
		if (booleanFlags.has(key)) {
			args[key] = inlineValue === undefined ? true : inlineValue !== 'false';
			continue;
		}
		const value = inlineValue === undefined ? argv[index + 1] : inlineValue;
		if (value === undefined || value.startsWith('--')) {
			throw new Error(`Missing value for --${rawKey}`);
		}
		args[key] = value;
		if (inlineValue === undefined) {
			index += 1;
		}
	}
	return args;
}

function usage() {
	return `wr-app — wrap a one-page app as a WordPress plugin powered by WpApp.

Usage:
  wr-app <slug> [options]          Wrap the current directory into a plugin.
  wr-app <github-url> [options]    Generate a WordPress Playground blueprint
                                   for a GitHub repository or Pages site.

Local options (wr-app <slug>):
  --out DIR                 Output plugin directory. Default: ./wr-app/<slug>
  --source-dir DIR          Directory containing index.html or index.php.
                            Default: build/, dist/, or the current directory.
  --plugin-name NAME        Human plugin/app name. Default: title-cased slug.
  --url-path PATH           WpApp route. Default: slug.
  --author NAME             Plugin author header.
  --public-path PATH        Public URL prefix to strip from asset URLs.
  --wp-app-dir DIR          Local akirk/wp-app checkout. Default: downloaded
                            from GitHub and cached in ~/.cache/wr-app.
  --wp-app-ref REF          akirk/wp-app ref to download. Default: main.
  --refresh-runtime         Re-download the WpApp runtime.
  --no-php                  Do not treat index.php as a PHP one-pager.
  --json                    Print the result as JSON.

Blueprint options (wr-app <github-url>):
  --ref REF                 Source git ref. Default: HEAD.
  --ref-type TYPE           branch, tag, commit, or omitted for HEAD.
  --built-ref REF           Git ref containing built static files.
  --built-ref-type TYPE     branch, tag, or commit for --built-ref.
  --built-path PATH         Subdirectory containing built static files.
  --slug SLUG               Plugin slug and URL path. Default: repo name.
  --plugin-name NAME        Human plugin/app name.
  --converter-ref REF       wr-app ref. Default: main.
  --converter-ref-type TYPE branch, tag, or commit. Default: branch.
  --converter-repo URL      Converter repo. Default: https://github.com/akirk/wr-app.
  --playground-url          Print the playground.wordpress.net URL instead of JSON.
`;
}

function isUrl(value) {
	return /^(?:https?:)?\/\//i.test(value) || /^github\.com\//i.test(value) || /^[\w.-]+\.github\.io\//i.test(value);
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const target = args._[0];
	if (args.help || !target) {
		console.log(usage());
		process.exit(args.help ? 0 : 1);
	}
	if (args._.length > 1) {
		throw new Error(`Unexpected argument: ${args._[1]}`);
	}

	if (isUrl(target)) {
		const repo = /^https?:\/\//i.test(target) ? target : `https://${target}`;
		const blueprint = buildBlueprint({ ...args, repo });
		console.log(args.playgroundUrl ? buildPlaygroundUrl(blueprint) : JSON.stringify(blueprint, null, '\t'));
		return;
	}

	const log = (message) => console.error(message);
	const wpAppDir = args.wpAppDir
		? path.resolve(args.wpAppDir)
		: await ensureWpAppRuntime({ ref: args.wpAppRef ?? 'main', refresh: args.refreshRuntime === true, log });

	const result = wrapApp({
		appDir: process.cwd(),
		slug: target,
		pluginDir: args.out,
		sourceDir: args.sourceDir ?? '',
		pluginName: args.pluginName,
		urlPath: args.urlPath,
		pluginAuthor: args.author,
		sourcePublicPath: args.publicPath,
		allowPhpSource: args.noPhp !== true,
		wpAppDir,
	});

	if (args.json) {
		console.log(JSON.stringify(result, null, '\t'));
		return;
	}
	const relative = path.relative(process.cwd(), result.pluginDir) || '.';
	console.log(`Wrapped ${result.slug} (${result.source.type} from ${path.relative(process.cwd(), result.source.dir) || '.'})`);
	console.log(`Plugin: ${relative}/`);
	console.log(`Route:  ${result.url}`);
	console.log('');
	console.log(`Copy ${relative}/ into wp-content/plugins/ and activate "${result.pluginName}".`);
}

main().catch((error) => {
	console.error(error.message);
	console.error('');
	console.error('Run wr-app --help for usage.');
	process.exit(1);
});
