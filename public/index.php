<?php
declare(strict_types=1);
// Adaptive project-root resolution: this same index.php is deployed two
// ways — (a) inside a public/ subfolder with app/config/routes/storage one
// level up (local XAMPP dev, and any host where the document root is
// pointed at public/), and (b) flattened directly into the document root
// itself alongside app/config/routes/storage (Hostinger-style shared
// hosting where only one exposed folder is available). Detecting which
// shape is actually on disk — instead of hardcoding either — is what lets
// one unmodified codebase deploy correctly to both without forking this file.
$root = is_file(__DIR__.'/config/app.php') ? __DIR__ : dirname(__DIR__);
foreach([$root.'/.env', $root.'/.env.local'] as $file){if(is_file($file))foreach(file($file,FILE_IGNORE_NEW_LINES|FILE_SKIP_EMPTY_LINES) as $line){if(str_starts_with(trim($line),'#')||!str_contains($line,'='))continue;[$k,$v]=explode('=',$line,2);putenv(trim($k).'='.trim($v));}}
// Every upload (menu_save/settings_save/profile_save) writes a brand-new
// randomly-named file and never reuses an old one, so a filename that
// matches these regexes is content-immutable by construction — safe to
// cache forever. A replaced image simply gets a new filename/URL; the old
// one is just never referenced again, so there's no stale-cache case to
// invalidate.
$serveImmutableMedia=function(string $path){header('Content-Type: image/webp');header('Cache-Control: public, max-age=31536000, immutable');header('Last-Modified: '.gmdate('D, d M Y H:i:s',filemtime($path)).' GMT');readfile($path);exit;};
$media=$_GET['media']??null; if(is_string($media) && preg_match('/^menu-\d+-[a-f0-9]{10}\.webp$/',$media)){ $path=$root.'/storage/uploads/menu/'.$media; if(is_file($path))$serveImmutableMedia($path); http_response_code(404);exit; }
if(is_string($media) && preg_match('/^logo-[a-f0-9]{10}\.webp$/',$media)){ $path=$root.'/storage/uploads/business/'.$media; if(is_file($path))$serveImmutableMedia($path); http_response_code(404);exit; }
if(is_string($media) && preg_match('/^avatar-\d+-[a-f0-9]{10}\.webp$/',$media)){ $path=$root.'/storage/uploads/avatars/'.$media; if(is_file($path))$serveImmutableMedia($path); http_response_code(404);exit; }
$reqPath=trim((string)parse_url($_SERVER['REQUEST_URI']??'/',PHP_URL_PATH),'/'); if($reqPath!=='')$_GET['page']=explode('/',$reqPath)[0];
// Every startup failure — a missing/unreadable config file, a bad DB
// connection, an uncaught error anywhere in routes/web.php — must reach the
// browser as this one generic message and nothing else, never a raw file
// path, SQL error, or stack trace. A failed require() throws a catchable
// \Error since PHP 7, so wrapping the ENTIRE bootstrap (not just the DB
// connect + route dispatch, as before) is what actually closes that off:
// previously a missing config/app.php crashed before this try/catch even
// started, printing an uncaught PHP fatal error with the full server
// filesystem path straight onto the page.
$logDir=$root.'/storage/logs';
try {
    if(!is_dir($logDir))@mkdir($logDir,0775,true);
    $sessDir=$root.'/storage/sessions'; if(!is_dir($sessDir))@mkdir($sessDir,0775,true);
    $app=require $root.'/config/app.php'; date_default_timezone_set($app['timezone']);
    // Every login is persistent by default — there is no "stay signed in"
    // toggle, so this cookie lifetime always applies. A PHP session is already
    // server-side revocable (its data lives in storage/sessions, and
    // Auth::logout()'s session_destroy() deletes that file immediately,
    // invalidating the cookie regardless of its own expiry); the only two
    // things that previously undermined "persistent until logout" were (1) the
    // cookie itself had no Max-Age, so browsers treated it as a session-only
    // cookie discarded on full browser close, and (2) an 8-hour inactivity
    // timer below forced re-login even with a valid cookie. Both are fixed
    // here: gc_maxlifetime is raised so the server doesn't garbage-collect the
    // session data before this long-lived cookie would itself expire, and the
    // inactivity check is removed outright.
    $authCookieLifetime=60*60*24*365; // ~1 year — effectively "until logout"
    ini_set('session.gc_maxlifetime',(string)$authCookieLifetime);
    $isHttps=!empty($_SERVER['HTTPS'])&&$_SERVER['HTTPS']!=='off';
    session_save_path($sessDir); session_name('canteen_session'); session_set_cookie_params(['lifetime'=>$authCookieLifetime,'httponly'=>true,'samesite'=>'Lax','secure'=>$isHttps]); session_start();
    // Baseline hardening headers for every response. fullscreen=(self) is required
    // here, not just "not blocked" — the app has an explicit Fullscreen API button
    // that must keep working, so the restrictive Permissions-Policy below only
    // disables device/sensor APIs this app never uses and leaves fullscreen on.
    // expose_php can't be toggled at runtime (PHP_INI_SYSTEM-only), so the
    // X-Powered-By header PHP would otherwise add is stripped directly instead;
    // set expose_php=Off in php.ini too for full effect on shared hosting where
    // this ini_set-less approach is the only thing under the app's control.
    header_remove('X-Powered-By');
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header('Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), fullscreen=(self)');
    // HSTS only ever makes sense once a request has actually arrived over HTTPS —
    // sending it over plain HTTP (e.g. local XAMPP dev) would incorrectly promise
    // browsers a secure connection that doesn't exist yet.
    if($isHttps)header('Strict-Transport-Security: max-age=31536000');
    spl_autoload_register(function(string $class)use($root){if(str_starts_with($class,'App\\')){$path=$root.'/app/'.str_replace('\\','/',substr($class,4)).'.php';if(is_file($path))require $path;}});
    $db=App\Services\Database::connect(require $root.'/config/database.php');
    (require $root.'/routes/web.php')($db);
} catch(Throwable $e){
    http_response_code(500);
    error_log($e->__toString());
    if(is_dir($logDir)&&is_writable($logDir))@file_put_contents($logDir.'/error.log','['.date('Y-m-d H:i:s').'] '.$e->__toString()."\n",FILE_APPEND);
    echo '<h1>Unable to start Canteen Billing</h1><p>Check the database settings and server log.</p>';
}
