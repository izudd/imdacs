<?php
function getDB(): PDO {
    // Environment detection: check for .env.php in parent of api/
    $envFile = __DIR__ . '/../../.env.php';
    if (file_exists($envFile)) {
        $env = require $envFile;
        $host = $env['DB_HOST'] ?? 'localhost';
        $dbname = $env['DB_NAME'] ?? 'imdacs_db';
        $user = $env['DB_USER'] ?? 'root';
        $pass = $env['DB_PASS'] ?? '';
    } else {
        // Local development defaults
        $host = 'localhost';
        $dbname = 'imdacs_db';
        $user = 'root';
        $pass = '';
    }

    try {
        $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4", $user, $pass);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        return $pdo;
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Database connection failed: ' . $e->getMessage()]);
        exit();
    }
}
