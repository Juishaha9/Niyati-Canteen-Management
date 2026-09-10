<?php
return [
    'name' => 'Niyati Canteen',
    'url' => getenv('APP_URL') ?: 'http://localhost:8080',
    'timezone' => getenv('APP_TIMEZONE') ?: 'Asia/Kolkata',
    'session_timeout' => (int) (getenv('SESSION_TIMEOUT') ?: 28800),
];
