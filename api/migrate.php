<?php
/**
 * IMDACS Migration - Add estimated_value column to clients table
 * Run via: http://localhost/imdacs/api/migrate.php
 */
header('Content-Type: text/html; charset=utf-8');

$envFile = __DIR__ . '/../.env.php';
if (file_exists($envFile)) {
    $env = require $envFile;
    $host = $env['DB_HOST'] ?? 'localhost';
    $dbname = $env['DB_NAME'] ?? 'imdacs_db';
    $user = $env['DB_USER'] ?? 'root';
    $pass = $env['DB_PASS'] ?? '';
} else {
    $host = 'localhost';
    $dbname = 'imdacs_db';
    $user = 'root';
    $pass = '';
}

try {
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    echo "<h2>IMDACS Database Migration</h2>";

    // Check if column already exists
    $stmt = $pdo->query("SHOW COLUMNS FROM clients LIKE 'estimated_value'");
    if ($stmt->rowCount() === 0) {
        $pdo->exec("ALTER TABLE clients ADD COLUMN estimated_value DECIMAL(15,2) DEFAULT 0 AFTER status");
        echo "<p>✅ Column 'estimated_value' added to clients table</p>";
    } else {
        echo "<p>ℹ️ Column 'estimated_value' already exists - skipped</p>";
    }

    echo "<br><h3>🎉 Migration Complete!</h3>";

} catch (PDOException $e) {
    echo "<p style='color:red'>❌ Error: " . $e->getMessage() . "</p>";
}
