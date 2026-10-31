<?php
/** Local-only router for PHP's development server; NOT for public hosting. */
$root = realpath($_SERVER['DOCUMENT_ROOT']);
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/';
$uri = rawurldecode($uri);
if ($uri === '/') {
    return false;
}
$file = realpath($root . '/' . ltrim($uri, '/'));
if ($file !== false && str_starts_with($file, $root . DIRECTORY_SEPARATOR)) {
    if (is_file($file) || (is_dir($file) && (is_file($file . '/index.php') || is_file($file . '/index.html')))) {
        return false;
    }
}
$_SERVER['SCRIPT_NAME'] = '/index.php';
$_SERVER['PHP_SELF'] = '/index.php';
require $root . '/index.php';
