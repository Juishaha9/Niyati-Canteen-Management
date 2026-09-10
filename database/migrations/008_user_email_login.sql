USE niyati_canteen;

-- Users now sign in with a real email column instead of the username column
-- (the username value was already an email address in practice).
ALTER TABLE users ADD COLUMN email VARCHAR(150) NULL AFTER username;
UPDATE users SET email = CASE WHEN username LIKE '%@%' THEN username ELSE CONCAT(username, '@niyaticanteen.local') END WHERE email IS NULL;
ALTER TABLE users MODIFY COLUMN email VARCHAR(150) NOT NULL;
ALTER TABLE users ADD UNIQUE KEY uniq_users_email (email);
ALTER TABLE users DROP COLUMN username;

-- Managers/waiters now default to full module access (same as admin); the
-- admin revokes specific permissions from Settings > Access instead of
-- granting them one by one. Backfill existing non-admin users accordingly.
INSERT IGNORE INTO user_permissions (user_id, permission_code, granted_by)
SELECT u.id, p.code, NULL
FROM users u
JOIN roles r ON r.id = u.role_id
CROSS JOIN permissions p
WHERE r.code <> 'ADMIN';
