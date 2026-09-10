<?php
namespace App\Helpers;
final class Csrf {
    public static function token(): string { return $_SESSION['_csrf'] ??= bin2hex(random_bytes(32)); }
    public static function verify(?string $value): void { if (!is_string($value) || !hash_equals(self::token(), $value)) { http_response_code(419); exit('Invalid or expired form token. Please reload the page.'); } }
}
