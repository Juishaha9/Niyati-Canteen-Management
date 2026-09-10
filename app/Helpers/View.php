<?php
namespace App\Helpers;
final class View {
    public static function esc(?string $value): string { return htmlspecialchars((string)$value, ENT_QUOTES, 'UTF-8'); }
    public static function flash(string $key, ?string $value=null): ?string { if ($value !== null) { $_SESSION['_flash'][$key]=$value; return null; } $v=$_SESSION['_flash'][$key]??null; unset($_SESSION['_flash'][$key]); return $v; }
    public static function redirect(string $url): never { header('Location: '.$url, true, 303); exit; }
}
