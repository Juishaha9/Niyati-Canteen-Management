<?php
namespace App\Services;
use PDO;

final class Database {
    public static function connect(array $config): PDO {
        $dsn = "mysql:host={$config['host']};port={$config['port']};dbname={$config['database']};charset=utf8mb4";
        // charset=utf8mb4 above only fixes the character set; the
        // *collation* the connection ends up with is whatever this MySQL/
        // MariaDB server's own ambient default for utf8mb4 happens to be —
        // which is not guaranteed to match the schema's declared collation
        // (utf8mb4_unicode_ci; see database/schema.sql and
        // database/migrations/012_standardize_user_collation.sql) and did
        // not, on at least one production host, causing string comparisons
        // to fail with "Illegal mix of collations" (MySQL error 1267).
        // MYSQL_ATTR_INIT_COMMAND runs once right after connecting and pins
        // the connection to the same collation the schema uses, regardless
        // of any given host's server-level default.
        return new PDO($dsn, $config['username'], $config['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false, PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci"]);
    }
}
