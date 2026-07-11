# Examples

## Source Repo With Build Output

```bash
node scripts/generate-blueprint.js \
  --repo https://github.com/example/static-app \
  --ref HEAD \
  --playground-url
```

The converter checks `build/index.html`, then `dist/index.html`, then a deployable root `index.html`.

## PHP One-Pager Source Repo

```bash
node scripts/generate-blueprint.js \
  --repo https://github.com/jonathanbossenger/times-table-tester/ \
  --ref HEAD \
  --playground-url
```

The converter checks out the unmodified repo, detects root `index.php`, copies the repo into the generated plugin, and renders the PHP one-pager through the WpApp route.

## Built Files On `gh-pages`

```bash
node scripts/generate-blueprint.js \
  --repo https://github.com/example/static-app \
  --built-ref gh-pages \
  --built-ref-type branch \
  --playground-url
```

The blueprint checks out source into `{slug}` and built files into `__wp_app_static`.

## Built Files In A Subdirectory

```bash
node scripts/generate-blueprint.js \
  --repo https://github.com/example/static-app \
  --built-ref main \
  --built-ref-type branch \
  --built-path docs \
  --playground-url
```

## Known Caveat

GitHub Pages deployments created only from Actions artifacts are not addressable by `git:directory`. For example, `https://github.com/ashfame/sojourn` is a Vite/React source repo with no checked-in `dist/` on `main`; it needs a branch/tag/path with built files, or a different Blueprint resource type that can import a zip or URL.
