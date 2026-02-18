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

    // Migration 1: estimated_value column
    $stmt = $pdo->query("SHOW COLUMNS FROM clients LIKE 'estimated_value'");
    if ($stmt->rowCount() === 0) {
        $pdo->exec("ALTER TABLE clients ADD COLUMN estimated_value DECIMAL(15,2) DEFAULT 0 AFTER status");
        echo "<p>✅ Column 'estimated_value' added to clients table</p>";
    } else {
        echo "<p>ℹ️ Column 'estimated_value' already exists - skipped</p>";
    }

    // Migration 2: Add SUPERVISOR to users role ENUM
    $stmt = $pdo->query("SHOW COLUMNS FROM users LIKE 'role'");
    $roleCol = $stmt->fetch();
    if ($roleCol && strpos($roleCol['Type'], 'SUPERVISOR') === false) {
        $pdo->exec("ALTER TABLE users MODIFY COLUMN role ENUM('MARKETING','MANAGER','SUPERVISOR') NOT NULL");
        echo "<p>✅ SUPERVISOR role added to users ENUM</p>";
    } else {
        echo "<p>ℹ️ SUPERVISOR role already exists in ENUM - skipped</p>";
    }

    // Migration 3: Add supervisor_id column to users
    $stmt = $pdo->query("SHOW COLUMNS FROM users LIKE 'supervisor_id'");
    if ($stmt->rowCount() === 0) {
        $pdo->exec("ALTER TABLE users ADD COLUMN supervisor_id VARCHAR(10) DEFAULT NULL AFTER role");
        echo "<p>✅ Column 'supervisor_id' added to users table</p>";
    } else {
        echo "<p>ℹ️ Column 'supervisor_id' already exists - skipped</p>";
    }

    // Migration 4: Set Delfa as SUPERVISOR, assign team
    $stmt = $pdo->prepare("SELECT role FROM users WHERE id = 'm1'");
    $stmt->execute();
    $delfa = $stmt->fetch();
    if ($delfa && $delfa['role'] !== 'SUPERVISOR') {
        $pdo->exec("UPDATE users SET role = 'SUPERVISOR' WHERE id = 'm1'");
        echo "<p>✅ Delfa (m1) updated to SUPERVISOR</p>";
    } else {
        echo "<p>ℹ️ Delfa already SUPERVISOR - skipped</p>";
    }

    // Set team members
    $pdo->exec("UPDATE users SET supervisor_id = 'm1' WHERE id IN ('m2', 'm3')");
    echo "<p>✅ Abraham (m2) & Ryas (m3) assigned to Delfa's team</p>";

    // Migration 5: Add project tracking fields to clients
    $stmt = $pdo->query("SHOW COLUMNS FROM clients LIKE 'dpp'");
    if ($stmt->rowCount() === 0) {
        $pdo->exec("ALTER TABLE clients
            ADD COLUMN year_work SMALLINT DEFAULT NULL,
            ADD COLUMN year_book SMALLINT DEFAULT NULL,
            ADD COLUMN service_type VARCHAR(200) DEFAULT '',
            ADD COLUMN dpp DECIMAL(15,2) DEFAULT 0,
            ADD COLUMN ppn_type ENUM('INCLUDE','EXCLUDE') DEFAULT 'EXCLUDE',
            ADD COLUMN dp_paid DECIMAL(15,2) DEFAULT 0
        ");
        echo "<p>✅ Project tracking columns added (year_work, year_book, service_type, dpp, ppn_type, dp_paid)</p>";
    } else {
        echo "<p>ℹ️ Project tracking columns already exist - skipped</p>";
    }

    // Migration 6: Add dp_proof column to clients (photo bukti DP)
    $stmt = $pdo->query("SHOW COLUMNS FROM clients LIKE 'dp_proof'");
    if ($stmt->rowCount() === 0) {
        $pdo->exec("ALTER TABLE clients ADD COLUMN dp_proof VARCHAR(500) DEFAULT NULL AFTER dp_paid");
        echo "<p>✅ Column 'dp_proof' added to clients table (bukti DP foto)</p>";
    } else {
        echo "<p>ℹ️ Column 'dp_proof' already exists - skipped</p>";
    }

    // Migration 7: Add notes column to clients
    $stmt = $pdo->query("SHOW COLUMNS FROM clients LIKE 'notes'");
    if ($stmt->rowCount() === 0) {
        $pdo->exec("ALTER TABLE clients ADD COLUMN notes TEXT DEFAULT '' AFTER dp_proof");
        echo "<p>✅ Column 'notes' added to clients table</p>";
    } else {
        echo "<p>ℹ️ Column 'notes' already exists - skipped</p>";
    }

    // Migration 8: Add is_active column to users
    $stmt = $pdo->query("SHOW COLUMNS FROM users LIKE 'is_active'");
    if ($stmt->rowCount() === 0) {
        $pdo->exec("ALTER TABLE users ADD COLUMN is_active TINYINT(1) DEFAULT 1 AFTER avatar");
        echo "<p>✅ Column 'is_active' added to users table</p>";
    } else {
        echo "<p>ℹ️ Column 'is_active' already exists - skipped</p>";
    }

    // Migration 9: Add AUDITOR to users role ENUM
    $stmt = $pdo->query("SHOW COLUMNS FROM users LIKE 'role'");
    $roleCol = $stmt->fetch();
    if ($roleCol && strpos($roleCol['Type'], 'AUDITOR') === false) {
        $pdo->exec("ALTER TABLE users MODIFY COLUMN role ENUM('MARKETING','MANAGER','SUPERVISOR','AUDITOR') NOT NULL");
        echo "<p>✅ AUDITOR role added to users ENUM</p>";
    } else {
        echo "<p>ℹ️ AUDITOR role already exists in ENUM - skipped</p>";
    }

    // Migration 10: Add auditor_assignee column to clients
    $stmt = $pdo->query("SHOW COLUMNS FROM clients LIKE 'auditor_assignee'");
    if ($stmt->rowCount() === 0) {
        $pdo->exec("ALTER TABLE clients ADD COLUMN auditor_assignee VARCHAR(50) DEFAULT NULL AFTER notes");
        echo "<p>✅ Column 'auditor_assignee' added to clients table</p>";
    } else {
        echo "<p>ℹ️ Column 'auditor_assignee' already exists - skipped</p>";
    }

    // Migration 11: Create audit_checklist table
    $stmt = $pdo->query("SHOW TABLES LIKE 'audit_checklist'");
    if ($stmt->rowCount() === 0) {
        $pdo->exec("
            CREATE TABLE audit_checklist (
                id INT AUTO_INCREMENT PRIMARY KEY,
                client_id VARCHAR(36) NOT NULL,
                item_key VARCHAR(50) NOT NULL,
                is_checked TINYINT(1) DEFAULT 0,
                checked_at TIMESTAMP NULL DEFAULT NULL,
                checked_by VARCHAR(10) NULL DEFAULT NULL,
                FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
                UNIQUE KEY unique_client_item (client_id, item_key)
            )
        ");
        echo "<p>✅ Table 'audit_checklist' created</p>";
    } else {
        echo "<p>ℹ️ Table 'audit_checklist' already exists - skipped</p>";
    }

    echo "<br><h3>🎉 Migration Complete!</h3>";

} catch (PDOException $e) {
    echo "<p style='color:red'>❌ Error: " . $e->getMessage() . "</p>";
}
