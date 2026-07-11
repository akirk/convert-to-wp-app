---
name: wp-app-blueprint
description: Use when creating WordPress Playground blueprints that convert GitHub-hosted one-page apps into self-contained WpApp plugins via git:directory checkouts and convert-to-wp-app.
---

# WpApp Blueprint

Use this skill when a user wants a `playground.wordpress.net` link or Blueprint JSON that turns a GitHub-hosted one-page app into a WordPress app plugin.

## Core Rule

Do not hand-write the blueprint unless debugging the generator. Use:

```bash
node scripts/generate-blueprint.js --repo https://github.com/owner/repo
```

For a Playground URL:

```bash
node scripts/generate-blueprint.js --repo https://github.com/owner/repo --playground-url
```

## Inputs To Infer

- `--repo`: required GitHub repository URL.
- `--ref`: source checkout ref. Default to `HEAD`.
- `--ref-type`: use `branch`, `tag`, or `commit` only when known. Leave omitted for `HEAD`.
- `--slug`: kebab-case repo name unless the user supplies a better route/plugin slug.
- `--plugin-name`: title-cased slug unless the app has a clear human name.
- `--converter-ref`: default `main`; use a commit SHA plus `--converter-ref-type commit` for reproducible links.

## Supported Source Shapes

The converter does not fetch deployed URLs at PHP runtime. App files must be available from a git checkout in Playground.

No-build PHP one-pagers work when the source repo has:

- `index.php` in the app root.
- A single root PHP file.

Static frontend apps work when one of these is true:

- Source repo has `build/index.html`.
- Source repo has `dist/index.html`.
- Source repo root has a deployable `index.html`, not a bundler dev entry such as `/src/main.tsx`.
- Built files live in another branch/tag/commit/path. Pass:

```bash
--built-ref gh-pages --built-ref-type branch
```

or:

```bash
--built-ref main --built-ref-type branch --built-path docs
```

If a React, Vite, or similar source repo has no built files in git, and GitHub Pages is deployed only from an Actions artifact, say that a pure `git:directory` blueprint cannot import it.

## Validation

After generating JSON, validate it against the Playground schema. In this repo:

```bash
node --input-type=module - <<'NODE'
import { validateBlueprintFiles } from '/home/alex/blueprints/scripts/lib/json-validation.js';
const ok = await validateBlueprintFiles(['BLUEPRINT_FILE.json']);
process.exit(ok ? 0 : 1);
NODE
```

Also lint the converter after edits:

```bash
php -l scripts/playground-convert.php
```

## Manual Local Conversion

When the user wants the same conversion outside Playground and already has local files, use:

```bash
php scripts/convert-static.php \
  --plugin-dir /path/to/wp-content/plugins/my-app \
  --source-build-dir /path/to/source-or-static-build \
  --wp-app-source-dir /path/to/wp-app
```

This is not a Blueprint generator. It does the same final file transformation on local directories.

## References

For examples and known caveats, read [references/examples.md](references/examples.md).
