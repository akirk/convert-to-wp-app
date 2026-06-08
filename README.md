# convert-to-wp-app

Convert an existing static frontend app into a WordPress plugin powered by [WpApp](https://github.com/akirk/wp-app).

## Usage

Run this from inside the existing app:

```bash
cd my-react-app
composer create-project akirk/convert-to-wp-app
```

Composer creates `convert-to-wp-app/`, then the wizard treats `..` as the existing app and augments it in place.

The converter accepts:

- `index.html` in the app root for plain static prototypes
- `build/index.html`
- `dist/index.html`

For React, Vite, and other bundled apps, run the frontend build first. Root `index.html` is only treated as deployable when it does not look like a bundler dev entry such as `/src/main.jsx`.

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
