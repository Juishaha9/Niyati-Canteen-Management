<?php
declare(strict_types=1);
$root=dirname(__DIR__); foreach([$root.'/.env', $root.'/.env.local'] as $file){if(is_file($file))foreach(file($file,FILE_IGNORE_NEW_LINES|FILE_SKIP_EMPTY_LINES) as $line){if(str_starts_with(trim($line),'#')||!str_contains($line,'='))continue;[$k,$v]=explode('=',$line,2);putenv(trim($k).'='.trim($v));}}
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
$app=require $root.'/config/app.php'; date_default_timezone_set($app['timezone']); session_save_path($root.'/storage/sessions'); session_name('canteen_session'); session_set_cookie_params(['httponly'=>true,'samesite'=>'Lax','secure'=>(!empty($_SERVER['HTTPS'])&&$_SERVER['HTTPS']!=='off')]); session_start(); if(isset($_SESSION['last_activity'])&&time()-$_SESSION['last_activity']>$app['session_timeout']){$_SESSION=[];session_destroy();session_start();} $_SESSION['last_activity']=time();
spl_autoload_register(function(string $class)use($root){if(str_starts_with($class,'App\\')){$path=$root.'/app/'.str_replace('\\','/',substr($class,4)).'.php';if(is_file($path))require $path;}});
try {$db=App\Services\Database::connect(require $root.'/config/database.php'); (require $root.'/routes/web.php')($db);}catch(Throwable $e){http_response_code(500);error_log($e->__toString());echo '<h1>Unable to start Canteen Billing</h1><p>Check the database settings and server log.</p>';}
