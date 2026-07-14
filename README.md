# convert-to-wp-app

Convert an existing one-page app into a WordPress plugin powered by [WpApp](https://github.com/akirk/wp-app).

## GitHub Pages Blueprint Generator

This repository can be published as a static GitHub Pages site. Open the page,
enter a GitHub Pages URL or a single HTML page URL, and it will generate a `playground.wordpress.net`
link.

For the generated blueprints to check out the converter from the same public
location as the Pages site, publish this code to
`https://github.com/akirk/convert-to-wp-app` and enable GitHub Pages there. The
resulting site URL is `https://akirk.github.io/convert-to-wp-app/`.

The generated Playground blueprint:

1. Checks out the source repository with `git:directory` into
   `wp-content/plugins/{slug}`.
2. Optionally checks out a built static branch, tag, commit, or subdirectory
   with `git:directory` into `wp-content/plugins/__wp_app_static`.
3. Checks out `akirk/wp-app` into `wp-content/plugins/__wp_app_runtime`.
4. Checks out this converter repository into
   `wp-content/plugins/__convert_to_wp_app`.
5. Runs `scripts/playground-convert.php` from that checkout with `runPHP`.
6. Imports local checked-out app files into the plugin.
7. Writes a self-contained WpApp plugin bootstrap and Composer-lite autoloader.
8. Activates the converted plugin and lands on `/{slug}/`.

The converter does not fetch deployed URLs at runtime. The one-pager must exist
in a checked-out git directory: either as a source repo PHP one-pager
(`index.php`, or a single root PHP file), in the source repo's `build/`,
`dist/`, or deployable root `index.html`, or in the optional built checkout.
If GitHub Pages is deployed only from a private Actions artifact and not from a
branch, tag, commit, or repository path, Playground cannot import that artifact
with a pure `git:directory` blueprint.

Example inputs:

- `https://github.com/jonathanbossenger/times-table-tester/`
- `https://github.com/ashfame/sojourn`

The source repository stays unmodified. The conversion happens inside the
temporary WordPress Playground filesystem.

### CLI

The static page and LLM workflows use the same generator:

```bash
node scripts/generate-blueprint.js \
  --repo https://github.com/owner/repo \
  --playground-url
```

For built files on a Pages branch:

```bash
node scripts/generate-blueprint.js \
  --repo https://github.com/owner/repo \
  --built-ref gh-pages \
  --built-ref-type branch \
  --playground-url
```

The reusable LLM guidance lives in `skills/wp-app-blueprint/`.

### Manual Conversion

You can run the same conversion outside a Blueprint when you already have a
local plugin checkout, a source/build directory, and a local `akirk/wp-app`
checkout:

```bash
php scripts/convert-static.php \
  --plugin-dir /path/to/wp-content/plugins/my-app \
  --source-build-dir /path/to/source-or-static-build \
  --wp-app-source-dir /path/to/wp-app \
  --slug my-app \
  --plugin-name "My App"
```

This writes the WpApp bootstrap, `templates/index.php`, copied app files,
and the Composer-lite WpApp runtime into the target plugin directory. It does
not clone repositories, run frontend builds, or require WordPress to be loaded.

## Usage

Run this from inside the existing app:

```bash
cd my-react-app
composer create-project akirk/convert-to-wp-app
```

Composer creates `convert-to-wp-app/`, then the wizard treats `..` as the existing app and augments it in place.

The converter accepts:

- `index.php` in the app root, or a single root PHP file, for PHP one-pagers
- `index.html` in the app root for plain static prototypes
- `build/index.html`
- `dist/index.html`

For React, Vite, and other bundled apps, run the frontend build first or point
the generator at a git-visible built ref/path. Root `index.html` is only treated
as deployable when it does not look like a bundler dev entry such as
`/src/main.jsx`.

The converter preserves frontend source files and adds:

- A WordPress plugin bootstrap file
- `templates/index.php`
- Imported frontend assets in `app/`
- Composer metadata for WpApp

## Environment Variables

```bash
WP_APP_TARGET_DIR=/path/to/existing-app
WP_APP_PLUGIN_NAME="My App"
WP_APP_NAMESPACE="MyApp"
WP_APP_URL_PATH="my-app"
WP_APP_SOURCE_BUILD_DIR=/path/to/existing-app/build
WP_APP_FRONTEND_ASSET_DIR=app
composer create-project akirk/convert-to-wp-app
```

`WP_APP_TARGET_DIR` defaults to the parent directory of the temporary converter project.

## Cleanup

The converter does not delete its own project directory. After a successful conversion, remove it yourself:

```bash
rm -rf convert-to-wp-app
```
