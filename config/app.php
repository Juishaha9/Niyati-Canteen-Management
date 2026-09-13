<?php
return [
    'name' => 'Niyati Canteen',
    'url' => getenv('APP_URL') ?: 'http://localhost:8080',
    'timezone' => getenv('APP_TIMEZONE') ?: 'Asia/Kolkata',
    // No inactivity-based session_timeout: every login is persistent by
    // design until the user explicitly logs out (see public/index.php).
];
