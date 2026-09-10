<?php
namespace App\Services;
use PDO;

final class Database {
    public static function connect(array $config): PDO {
        $dsn = "mysql:host={$config['host']};port={$config['port']};dbname={$config['database']};charset=utf8mb4";
        return new PDO($dsn, $config['username'], $config['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false]);
    }
}
