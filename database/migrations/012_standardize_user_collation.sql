USE niyati_canteen;

-- Standardizes the users table to the collation the project's schema always
-- intended (see the CREATE DATABASE line at the top of database/schema.sql:
-- "COLLATE utf8mb4_unicode_ci"). On at least one production install this
-- table ended up on utf8mb4_general_ci instead — likely because the hosting
-- panel created the database up front (with its own default collation)
-- before schema.sql's CREATE TABLE ever ran, so the table silently inherited
-- whatever the host's ambient default was rather than the project's declared
-- one. That mismatch between the table's actual collation and what the app's
-- DB connection was assuming caused login (Auth::attempt in app/Auth/Auth.php)
-- to fail with "Illegal mix of collations ... for operation '<>'".
--
-- CONVERT TO CHARACTER SET only changes the charset/collation metadata of
-- string columns (email, display_name, mobile, avatar_path, password_hash);
-- it does not touch column values, ids, numeric/timestamp columns, or any
-- row data. Safe to run on a table that's already on utf8mb4_unicode_ci
-- (a no-op) and on one that's on utf8mb4_general_ci (converts in place).
ALTER TABLE users CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
