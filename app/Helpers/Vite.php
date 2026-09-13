<?php
namespace App\Helpers;
final class Vite {
    public static function hotUrl(): ?string { $hot=dirname(__DIR__,2).'/public/hot'; if(!is_file($hot))return null; $url=trim((string)file_get_contents($hot)); return $url!==''?$url:null; }
    // Cache-busting: /assets/app.js and app.css never change name between
    // builds, so browsers can keep serving a stale cached copy indefinitely
    // after a rebuild. Appending the file's own mtime as a query string
    // forces a fresh fetch whenever the built file actually changes, with
    // no effect when running against the Vite dev server (hot reload
    // already handles that case).
    private static function assetVersion(string $file): string { $path=dirname(__DIR__,2).'/public/assets/'.$file; return is_file($path)?(string)filemtime($path):(string)time(); }
    public static function styles(): string { $hot=self::hotUrl(); return $hot?'':'<link rel="stylesheet" href="/assets/app.css?v='.self::assetVersion('app.css').'">'; }
    public static function scripts(): string {
        $hot=self::hotUrl();
        if(!$hot) return '<script type="module" src="/assets/app.js?v='.self::assetVersion('app.js').'"></script>';
        return '<script type="module">import RefreshRuntime from "'.$hot.'/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>(type)=>type;window.__vite_plugin_react_preamble_installed__=true;</script>'
            .'<script type="module" src="'.$hot.'/@vite/client"></script>'
            .'<script type="module" src="'.$hot.'/resources/js/main.tsx"></script>';
    }
    public static function css(string $path): string { $hot=self::hotUrl(); return $hot?'<link rel="stylesheet" href="'.$hot.'/'.$path.'">':'<link rel="stylesheet" href="/assets/app.css?v='.self::assetVersion('app.css').'">'; }
}
