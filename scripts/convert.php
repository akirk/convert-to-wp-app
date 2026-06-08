<?php
/**
 * Post-create-project conversion wizard.
 *
 * This script runs inside the temporary converter project. By default it
 * augments the parent directory, so this works:
 *
 *   cd existing-react-app
 *   composer create-project akirk/convert-to-wp-app .wp-app-converter
 */

use Akirk\CreateWpApp\ExistingAppAugmenter;
use Akirk\CreateWpApp\Scaffolder;

$composer_autoload = __DIR__ . '/../vendor/autoload.php';
$create_wp_app_src = __DIR__ . '/../../create-wp-app/src';

if ( file_exists( $composer_autoload ) ) {
    require_once $composer_autoload;
} elseif ( file_exists( $create_wp_app_src . '/ExistingAppAugmenter.php' ) && file_exists( $create_wp_app_src . '/Scaffolder.php' ) ) {
    require_once $create_wp_app_src . '/Scaffolder.php';
    require_once $create_wp_app_src . '/ExistingAppAugmenter.php';
} else {
    fwrite(
        STDERR,
        "Could not load akirk/create-wp-app.\n" .
        "Run composer install in this converter project, or install with dependencies enabled.\n"
    );
    exit( 1 );
}

$is_interactive = getenv( 'COMPOSER_NO_INTERACTION' ) !== '1'
    && stream_isatty( STDIN );

function convert_to_wp_app_get_value( string $env_key, string $question, ?string $default, bool $interactive ): string {
    $env_value = $env_key !== '' ? getenv( $env_key ) : false;
    if ( $env_value !== false && $env_value !== '' ) {
        return $env_value;
    }

    if ( ! $interactive ) {
        return $default ?? '';
    }

    $default_text = $default !== null && $default !== '' ? " [$default]" : '';
    echo "$question$default_text: ";
    $answer = trim( fgets( STDIN ) );

    return $answer !== '' ? $answer : ( $default ?? '' );
}

function convert_to_wp_app_has_build( string $target_dir ): bool {
    foreach ( [ 'build', 'dist' ] as $directory ) {
        if ( is_file( $target_dir . DIRECTORY_SEPARATOR . $directory . DIRECTORY_SEPARATOR . 'index.html' ) ) {
            return true;
        }
    }

    $root_index = $target_dir . DIRECTORY_SEPARATOR . 'index.html';
    if ( is_file( $root_index ) && convert_to_wp_app_is_deployable_root_index( $root_index ) ) {
        return true;
    }

    $source_build_dir = getenv( 'WP_APP_SOURCE_BUILD_DIR' );
    return $source_build_dir !== false && $source_build_dir !== '' && is_file( $source_build_dir . DIRECTORY_SEPARATOR . 'index.html' );
}

function convert_to_wp_app_is_deployable_root_index( string $index_html ): bool {
    $html = file_get_contents( $index_html );
    if ( $html === false ) {
        return false;
    }

    if ( strpos( $html, '%PUBLIC_URL%' ) !== false ) {
        return false;
    }

    return ! preg_match( '#\b(?:src|href)=([\'"])/?src/#i', $html );
}

$default_target_dir = dirname( getcwd() );
$target_dir = convert_to_wp_app_get_value(
    'WP_APP_TARGET_DIR',
    'Existing app directory to convert',
    $default_target_dir,
    $is_interactive
);
$target_dir = rtrim( $target_dir, DIRECTORY_SEPARATOR );
if ( $target_dir === '' ) {
    $target_dir = DIRECTORY_SEPARATOR;
}

if ( ! is_dir( $target_dir ) ) {
    fwrite( STDERR, "Target app directory does not exist: $target_dir\n" );
    exit( 1 );
}

$package_json_path = $target_dir . DIRECTORY_SEPARATOR . 'package.json';
$package_json = is_file( $package_json_path ) ? json_decode( file_get_contents( $package_json_path ), true ) : [];
$package_name = is_array( $package_json ) && ! empty( $package_json['name'] ) ? $package_json['name'] : basename( $target_dir );
$slug = strtolower( preg_replace( '/[^a-zA-Z0-9]+/', '-', $package_name ) );
$slug = trim( $slug, '-' );
$slug = $slug !== '' ? $slug : 'wp-app';

echo "\n";
echo "Converting existing app to WpApp\n";
echo str_repeat( '-', 40 ) . "\n";
echo "Target: $target_dir\n";
echo "\n";

if ( ! convert_to_wp_app_has_build( $target_dir ) ) {
    fwrite(
        STDERR,
        "Could not find a deployable static frontend in $target_dir/index.html, $target_dir/build, or $target_dir/dist.\n" .
        "Use a plain root index.html, run the frontend build first, or set WP_APP_SOURCE_BUILD_DIR to a directory containing index.html.\n"
    );
    exit( 1 );
}

$plugin_name = convert_to_wp_app_get_value( 'WP_APP_PLUGIN_NAME', 'Plugin name', Scaffolder::slug_to_title( $slug ), $is_interactive );
$namespace = convert_to_wp_app_get_value( 'WP_APP_NAMESPACE', 'Namespace', Scaffolder::to_namespace( $plugin_name ), $is_interactive );
$url_path = convert_to_wp_app_get_value( 'WP_APP_URL_PATH', 'URL path', $slug, $is_interactive );
$wp_app_source_dir = getenv( 'WP_APP_SOURCE_DIR' );
if ( $wp_app_source_dir === false || $wp_app_source_dir === '' ) {
    $candidate_wp_app_source_dir = __DIR__ . '/../vendor/akirk/wp-app';
    $wp_app_source_dir = is_dir( $candidate_wp_app_source_dir ) ? $candidate_wp_app_source_dir : null;
}

try {
    $result = ExistingAppAugmenter::augment( [
        'target_dir' => $target_dir,
        'slug' => $slug,
        'plugin_name' => $plugin_name,
        'namespace' => $namespace,
        'url_path' => $url_path,
        'dependency_mode' => $wp_app_source_dir !== null ? 'copy' : 'composer',
        'autoload_mode' => $wp_app_source_dir !== null ? 'polyfill' : 'composer',
        'wp_app_source_dir' => $wp_app_source_dir,
    ] );
} catch ( RuntimeException $e ) {
    fwrite( STDERR, $e->getMessage() . PHP_EOL );
    exit( 1 );
}

foreach ( $result['messages'] as $message ) {
    echo "$message\n";
}

echo "\n";
echo "Done. Activate {$result['config']['plugin_name']} in WordPress and visit /{$result['config']['url_path']}/.\n";
echo "The temporary converter project can be removed when you are done.\n";
echo "\n";
