<?php
return [
    'host' => getenv('DB_HOST') ?: '127.0.0.1',
    'port' => getenv('DB_PORT') ?: '3306',
    'database' => getenv('DB_DATABASE') ?: 'niyati_canteen',
    'username' => getenv('DB_USERNAME') ?: 'root',
    'password' => getenv('DB_PASSWORD') ?: '',
];
