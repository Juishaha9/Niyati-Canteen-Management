<?php
namespace App\Auth;
use PDO;

final class Auth {
    public static function attempt(PDO $db, string $email, string $password): bool {
        $stmt = $db->prepare('SELECT u.*, r.code AS role FROM users u JOIN roles r ON r.id=u.role_id WHERE u.email=? AND u.active=1 LIMIT 1');
        $stmt->execute([$email]); $user = $stmt->fetch();
        if (!$user || !password_verify($password, $user['password_hash'])) return false;
        session_regenerate_id(true); $_SESSION['user'] = ['id'=>(int)$user['id'],'name'=>$user['display_name'],'email'=>$user['email'],'role'=>$user['role'],'mobile'=>$user['mobile'],'avatar'=>$user['avatar_path']]; $_SESSION['last_activity'] = time();
        $db->prepare('UPDATE users SET last_login_at=NOW() WHERE id=?')->execute([$user['id']]); return true;
    }
    public static function user(): ?array { return $_SESSION['user'] ?? null; }
    public static function updateSessionUser(array $fields): void { if (self::check()) $_SESSION['user'] = array_merge($_SESSION['user'], $fields); }
    public static function check(): bool { return self::user() !== null; }
    public static function can(string ...$roles): bool { return self::check() && in_array(self::user()['role'], $roles, true); }
    public static function permissions(PDO $db): array { if (!self::check()) return []; if (self::can('ADMIN')) return array_column($db->query('SELECT code FROM permissions')->fetchAll(), 'code'); $stmt=$db->prepare('SELECT permission_code FROM user_permissions WHERE user_id=?'); $stmt->execute([self::user()['id']]); return array_column($stmt->fetchAll(), 'permission_code'); }
    public static function allowed(PDO $db, string $permission): bool { if (self::can('ADMIN')) return true; return in_array($permission, self::permissions($db), true); }
    public static function logout(): void { $_SESSION=[]; if (ini_get('session.use_cookies')) { $p=session_get_cookie_params(); setcookie(session_name(), '', time()-42000, $p['path'],$p['domain'],$p['secure'],$p['httponly']); } session_destroy(); }
    // resetPassword() (email-only public password reset) was removed — an
    // internal system must never let an unauthenticated visitor overwrite a
    // password from just an email address. Authenticated self-service
    // password change (action=change_password in routes/web.php, requires
    // the current password) and the admin-only user_reset_password action
    // are unrelated and unaffected.
}
