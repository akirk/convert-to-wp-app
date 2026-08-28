<?php
$asset_url = static function( string $path ): string {
    return plugins_url( 'app/' . ltrim( $path, '/' ), dirname( __DIR__ ) . '/' . '__SLUG__.php' );
};
$onepager_rewrite_assets = static function( string $html ) use ( $asset_url ): string {
    return preg_replace_callback(
        '/<([a-z][a-z0-9:-]*)\b[^>]*>/i',
        static function( array $matches ) use ( $asset_url ): string {
            $tag_name = strtolower( $matches[1] );
            return preg_replace_callback(
                '/\b(src|href)=([\'"])([^\'"]+)\2/i',
                static function( array $attr_matches ) use ( $tag_name, $asset_url ): string {
                    $attribute = strtolower( $attr_matches[1] );
                    $asset_attributes = array(
                        'src'  => array( 'audio', 'embed', 'iframe', 'img', 'script', 'source', 'track', 'video' ),
                        'href' => array( 'link' ),
                    );
                    if ( ! in_array( $tag_name, $asset_attributes[ $attribute ] ?? array(), true ) ) {
                        return $attr_matches[0];
                    }
                    $path = trim( html_entity_decode( $attr_matches[3], ENT_QUOTES ) );
                    if ( $path === '' || $path[0] === '#' || $path[0] === '?' || preg_match( '/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i', $path ) ) {
                        return $attr_matches[0];
                    }
                    $path = preg_replace( '/[?#].*$/', '', $path );
                    $path = preg_replace( '#^\./#', '', $path );
                    $path = ltrim( $path, '/' );
                    if ( $path === '' || strpos( $path, '..' ) !== false ) {
                        return $attr_matches[0];
                    }
                    return $attr_matches[1] . '=' . $attr_matches[2] . esc_url( $asset_url( $path ) ) . $attr_matches[2];
                },
                $matches[0]
            );
        },
        $html
    );
};
$onepager_rewrite_route_links = static function( string $html ): string {
    $host = $_SERVER['HTTP_HOST'] ?? parse_url( home_url(), PHP_URL_HOST );
    $route_url = home_url( '/' . trim( '__ROUTE__', '/' ) . '/' );
    return preg_replace_callback(
        '/\b(href|action)=([\'"])([^\'"]*)\2/i',
        static function( array $matches ) use ( $host, $route_url ): string {
            $url = html_entity_decode( $matches[3], ENT_QUOTES );
            if ( $url === '/' || strpos( $url, '/?' ) === 0 ) {
                $rewritten = rtrim( $route_url, '/' ) . '/' . ltrim( $url, '/' );
                return $matches[1] . '=' . $matches[2] . esc_url( $rewritten ) . $matches[2];
            }
            $parts = parse_url( $url );
            if ( isset( $parts['host'] ) && strcasecmp( $parts['host'], (string) $host ) === 0 ) {
                $path = $parts['path'] ?? '/';
                if ( isset( $parts['query'] ) ) {
                    $path .= '?' . $parts['query'];
                }
                if ( $path === '/' || strpos( $path, '/?' ) === 0 ) {
                    $rewritten = rtrim( $route_url, '/' ) . '/' . ltrim( $path, '/' );
                    return $matches[1] . '=' . $matches[2] . esc_url( $rewritten ) . $matches[2];
                }
            }
            return $matches[0];
        },
        $html
    );
};
$onepager_extract_tag = static function( string $html, string $tag ): string {
    if ( preg_match( '/<' . preg_quote( $tag, '/' ) . '\b[^>]*>(.*?)<\/' . preg_quote( $tag, '/' ) . '>/is', $html, $matches ) ) {
        return trim( $matches[1] );
    }
    return '';
};
$entry = __DIR__ . '/../app/' . '__ENTRY__';
$previous_cwd = getcwd();
chdir( dirname( $entry ) );
ob_start();
try {
    include $entry;
} finally {
    if ( $previous_cwd !== false ) {
        chdir( $previous_cwd );
    }
}
$html = ob_get_clean();
$html = $onepager_rewrite_route_links( $onepager_rewrite_assets( $html ) );
$head = $onepager_extract_tag( $html, 'head' );
$body = $onepager_extract_tag( $html, 'body' );
$head = preg_replace( '/<title\b[^>]*>.*?<\/title>/is', '<title>' . wp_app_title() . '</title>', $head, 1, $count );
if ( $count === 0 ) {
    $head = '<title>' . wp_app_title() . '</title>' . "\n" . ltrim( $head );
}
?>
<!DOCTYPE html>
<html <?php wp_app_language_attributes(); ?>>
<head>
    <?php echo $head; ?>
    <?php wp_app_head(); ?>
</head>
<body>
    <?php wp_app_body_open(); ?>
    <?php echo $body; ?>
    <?php wp_app_body_close(); ?>
</body>
</html>