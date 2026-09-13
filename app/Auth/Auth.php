<?php
namespace App\Auth;
use PDO;

final class Auth {
    // $identifier may be an email, a mobile number, or a full display name —
    // matched with one prepared statement (no string interpolation). The
    // mobile branch is compared against a digits-only normalization of the
    // input (matching how Validator::mobile already stores it), and
    // email/name rely on the users table's case-insensitive collation
    // rather than an explicit LOWER()/normalize step. LIMIT 2 + requiring
    // exactly one row is what keeps a duplicate display_name from ever
    // authenticating the wrong account: if the identifier matches more
    // than one active user (only possible via the name branch, since email
    // is DB-unique and mobile duplicates are rejected at save time), the
    // attempt is refused exactly like a not-found identifier — same
    // generic failure either way, so it never reveals which identifier
    // exists.
    public static function attempt(PDO $db, string $identifier, string $password): bool {
        $identifier = trim($identifier);
        if ($identifier === '') return false;
        $mobileDigits = preg_replace('/\D+/', '', $identifier) ?? '';
        // Whether to try matching on mobile at all is decided here in PHP,
        // not with a "(?<>'' AND u.mobile=?)" comparison inside the SQL —
        // that used to guard against a non-phone-shaped identifier (e.g. an
        // email) spuriously matching a row via the mobile branch. On a
        // production DB where the users table's actual stored collation
        // (utf8mb4_unicode_ci, matching this project's schema — see
        // database/migrations/012_standardize_user_collation.sql) differed
        // from whatever the DB connection defaulted to on that host,
        // comparing two connection-collation strings to each other with
        // '<>' triggered MySQL error 1267 ("Illegal mix of collations...for
        // operation '<>'"), a class of bug that only surfaces once the two
        // happen to disagree — which they never did locally. Branching in
        // PHP removes that comparison from the SQL entirely; the matching
        // behavior (mobile is only ever tried when the identifier actually
        // contains digits) is unchanged.
        if ($mobileDigits !== '') {
            $stmt = $db->prepare('SELECT u.*, r.code AS role FROM users u JOIN roles r ON r.id=u.role_id WHERE u.active=1 AND (u.email=? OR u.display_name=? OR u.mobile=?) LIMIT 2');
            $stmt->execute([$identifier, $identifier, $mobileDigits]);
        } else {
            $stmt = $db->prepare('SELECT u.*, r.code AS role FROM users u JOIN roles r ON r.id=u.role_id WHERE u.active=1 AND (u.email=? OR u.display_name=?) LIMIT 2');
            $stmt->execute([$identifier, $identifier]);
        }
        $rows = $stmt->fetchAll();
        if (count($rows) !== 1) return false;
        $user = $rows[0];
        if (!password_verify($password, $user['password_hash'])) return false;
        session_regenerate_id(true); $_SESSION['user'] = ['id'=>(int)$user['id'],'name'=>$user['display_name'],'email'=>$user['email'],'role'=>$user['role'],'mobile'=>$user['mobile'],'avatar'=>$user['avatar_path']];
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
