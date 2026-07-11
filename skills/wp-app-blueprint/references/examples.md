# Examples

## Source Repo With Build Output

```bash
node scripts/generate-blueprint.js \
  --repo https://github.com/example/static-app \
  --ref HEAD \
  --playground-url
```

The converter checks `build/index.html`, then `dist/index.html`, then a deployable root `index.html`.

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

GitHub Pages deployments created only from Actions artifacts are not addressable by `git:directory`. The user must publish the built files to a branch/tag/path, or allow a different Blueprint resource type that can import a zip or URL.
