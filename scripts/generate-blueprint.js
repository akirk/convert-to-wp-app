#!/usr/bin/env node
import { buildBlueprint, buildPlaygroundUrl } from '../lib/blueprint-generator.js';

const booleanFlags = new Set(['help', 'playgroundUrl']);

function parseArgs(argv) {
	const args = {};
	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];
		if (!token.startsWith('--')) {
			throw new Error(`Unexpected argument: ${token}`);
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
	return `Usage:
  node scripts/generate-blueprint.js --repo https://github.com/owner/repo [options]

Options:
  --repo URL                 GitHub repository URL. Required.
  --ref REF                  Source git ref. Default: HEAD.
  --ref-type TYPE            branch, tag, commit, or omitted for HEAD.
  --built-ref REF            Optional git ref containing built static files.
  --built-ref-type TYPE      branch, tag, or commit for --built-ref.
  --built-path PATH          Optional subdirectory containing built static files.
  --slug SLUG                Plugin slug and URL path.
  --plugin-name NAME         Human plugin/app name.
  --converter-ref REF        convert-to-wp-app ref. Default: main.
  --converter-ref-type TYPE  branch, tag, or commit. Default: branch.
  --converter-repo URL       Converter repo. Default: https://github.com/akirk/convert-wp-app.
  --playground-url           Print the playground.wordpress.net URL instead of JSON.
`;
}

try {
	const args = parseArgs(process.argv.slice(2));
	if (args.help || !args.repo) {
		console.log(usage());
		process.exit(args.help ? 0 : 1);
	}
	const blueprint = buildBlueprint(args);
	if (args.playgroundUrl) {
		console.log(buildPlaygroundUrl(blueprint));
	} else {
		console.log(JSON.stringify(blueprint, null, '\t'));
	}
} catch (error) {
	console.error(error.message);
	console.error('');
	console.error(usage());
	process.exit(1);
}
