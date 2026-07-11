#!/usr/bin/env php
<?php
/**
 * Convert local checked-out static files into a self-contained WpApp plugin.
 */

require_once __DIR__ . '/playground-convert.php';

function convert_to_wp_app_cli_usage(): string {
	return <<<TEXT
Usage:
  php scripts/convert-static.php --plugin-dir /path/to/wp-content/plugins/my-app --source-build-dir /path/to/static-build --wp-app-source-dir /path/to/wp-app [options]

Options:
  --plugin-dir PATH        Target plugin directory. Required.
  --source-build-dir PATH  Directory containing index.html. Required.
  --wp-app-source-dir PATH WpApp source checkout. Required.
  --slug SLUG             Plugin slug. Defaults to plugin directory name.
  --plugin-name NAME      Human plugin name. Defaults to title-cased slug.
  --url-path PATH         WpApp route. Defaults to slug.
  --plugins-dir PATH      Parent plugins directory. Defaults to plugin-dir parent.
  --help                  Show this help.

TEXT;
}

function convert_to_wp_app_cli_args( array $argv ): array {
	$args = array();
	for ( $i = 1; $i < count( $argv ); $i++ ) {
		$token = $argv[ $i ];
		if ( substr( $token, 0, 2 ) !== '--' ) {
			throw new RuntimeException( "Unexpected argument: {$token}" );
		}
		$parts = explode( '=', substr( $token, 2 ), 2 );
		$key   = str_replace( '-', '_', $parts[0] );
		if ( $key === 'help' ) {
			$args['help'] = true;
			continue;
		}
		$value = $parts[1] ?? ( $argv[ $i + 1 ] ?? null );
		if ( $value === null || substr( $value, 0, 2 ) === '--' ) {
			throw new RuntimeException( "Missing value for {$token}" );
		}
		$args[ $key ] = $value;
		if ( ! isset( $parts[1] ) ) {
			$i++;
		}
	}
	return $args;
}

try {
	$args = convert_to_wp_app_cli_args( $argv );
	if ( ! empty( $args['help'] ) ) {
		echo convert_to_wp_app_cli_usage();
		exit( 0 );
	}

	foreach ( array( 'plugin_dir', 'source_build_dir', 'wp_app_source_dir' ) as $required ) {
		if ( empty( $args[ $required ] ) ) {
			throw new RuntimeException( "Missing required option --" . str_replace( '_', '-', $required ) );
		}
	}

	if ( empty( $args['plugins_dir'] ) ) {
		$args['plugins_dir'] = dirname( rtrim( str_replace( '\\', '/', $args['plugin_dir'] ), '/' ) );
	}

	$result = convert_to_wp_app_playground( $args );
	echo "Converted {$result['slug']}\n";
	echo "Plugin: {$result['plugin_dir']}\n";
	echo "Route: {$result['url']}\n";
} catch ( Throwable $e ) {
	fwrite( STDERR, $e->getMessage() . PHP_EOL . PHP_EOL . convert_to_wp_app_cli_usage() );
	exit( 1 );
}
