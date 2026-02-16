<?php
/**
 * IMDACS Database Seed Script
 * Run this once via browser: http://localhost/imdacs---internal-marketing-daily-activity-&-client-progress-system/api/seed.php
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
    // Connect without database first (on shared hosting, DB must already exist)
    $pdo = new PDO("mysql:host=$host;charset=utf8mb4", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    echo "<h2>IMDACS Database Setup</h2>";

    // Create database
    $pdo->exec("CREATE DATABASE IF NOT EXISTS `$dbname` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    $pdo->exec("USE `$dbname`");
    echo "<p>✅ Database 'imdacs_db' created/verified</p>";

    // Drop existing tables (in correct order for FK constraints)
    $pdo->exec("SET FOREIGN_KEY_CHECKS = 0");
    $pdo->exec("DROP TABLE IF EXISTS client_progress_updates");
    $pdo->exec("DROP TABLE IF EXISTS eod_reports");
    $pdo->exec("DROP TABLE IF EXISTS activities");
    $pdo->exec("DROP TABLE IF EXISTS clients");
    $pdo->exec("DROP TABLE IF EXISTS users");
    $pdo->exec("SET FOREIGN_KEY_CHECKS = 1");
    echo "<p>✅ Old tables dropped</p>";

    // Create users table
    $pdo->exec("
        CREATE TABLE users (
            id VARCHAR(10) PRIMARY KEY,
            username VARCHAR(50) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            name VARCHAR(100) NOT NULL,
            role ENUM('MARKETING','MANAGER','SUPERVISOR') NOT NULL,
            supervisor_id VARCHAR(10) DEFAULT NULL,
            avatar VARCHAR(255) DEFAULT NULL,
            is_active TINYINT(1) DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ");
    echo "<p>✅ Table 'users' created</p>";

    // Create clients table
    $pdo->exec("
        CREATE TABLE clients (
            id VARCHAR(36) PRIMARY KEY,
            name VARCHAR(200) NOT NULL,
            industry VARCHAR(100) NOT NULL DEFAULT '',
            pic_name VARCHAR(100) NOT NULL DEFAULT '',
            phone VARCHAR(30) DEFAULT '',
            email VARCHAR(100) DEFAULT '',
            address TEXT,
            marketing_id VARCHAR(10) NOT NULL,
            status ENUM('NEW','FOLLOW_UP','VISIT','PRESENTASI','PENAWARAN','NEGOSIASI','DEAL','LOST','MAINTENANCE') DEFAULT 'NEW',
            estimated_value DECIMAL(15,2) DEFAULT 0,
            year_work SMALLINT DEFAULT NULL,
            year_book SMALLINT DEFAULT NULL,
            service_type VARCHAR(200) DEFAULT '',
            dpp DECIMAL(15,2) DEFAULT 0,
            ppn_type ENUM('INCLUDE','EXCLUDE') DEFAULT 'EXCLUDE',
            dp_paid DECIMAL(15,2) DEFAULT 0,
            notes TEXT DEFAULT '',
            last_update DATE DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (marketing_id) REFERENCES users(id)
        )
    ");
    echo "<p>✅ Table 'clients' created</p>";

    // Create activities table
    $pdo->exec("
        CREATE TABLE activities (
            id VARCHAR(36) PRIMARY KEY,
            date DATE NOT NULL,
            marketing_id VARCHAR(10) NOT NULL,
            type ENUM('CHAT_DM','CALL','VISIT','MEETING','POSTING') NOT NULL,
            client_id VARCHAR(36) DEFAULT NULL,
            description TEXT NOT NULL,
            start_time TIME NOT NULL,
            end_time TIME NOT NULL,
            location VARCHAR(255) DEFAULT NULL,
            proof_url VARCHAR(255) DEFAULT NULL,
            status ENUM('DONE','PENDING','CANCEL') DEFAULT 'DONE',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (marketing_id) REFERENCES users(id),
            FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
        )
    ");
    echo "<p>✅ Table 'activities' created</p>";

    // Create eod_reports table
    $pdo->exec("
        CREATE TABLE eod_reports (
            id VARCHAR(36) PRIMARY KEY,
            date DATE NOT NULL,
            marketing_id VARCHAR(10) NOT NULL,
            summary TEXT DEFAULT '',
            new_leads INT DEFAULT 0,
            follow_ups INT DEFAULT 0,
            deals_today INT DEFAULT 0,
            deal_value DECIMAL(15,2) DEFAULT 0,
            constraints_notes TEXT DEFAULT '',
            support_needed TEXT DEFAULT '',
            plan_tomorrow TEXT DEFAULT '',
            status ENUM('DRAFT','SUBMITTED','APPROVED','REVISION') DEFAULT 'SUBMITTED',
            submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (marketing_id) REFERENCES users(id),
            UNIQUE KEY unique_daily_report (date, marketing_id)
        )
    ");
    echo "<p>✅ Table 'eod_reports' created</p>";

    // Create client_progress_updates table
    $pdo->exec("
        CREATE TABLE client_progress_updates (
            id INT AUTO_INCREMENT PRIMARY KEY,
            report_id VARCHAR(36) NOT NULL,
            client_id VARCHAR(36) NOT NULL,
            activity TEXT DEFAULT '',
            prev_status ENUM('NEW','FOLLOW_UP','VISIT','PRESENTASI','PENAWARAN','NEGOSIASI','DEAL','LOST','MAINTENANCE') NOT NULL,
            new_status ENUM('NEW','FOLLOW_UP','VISIT','PRESENTASI','PENAWARAN','NEGOSIASI','DEAL','LOST','MAINTENANCE') NOT NULL,
            result TEXT DEFAULT '',
            FOREIGN KEY (report_id) REFERENCES eod_reports(id) ON DELETE CASCADE,
            FOREIGN KEY (client_id) REFERENCES clients(id)
        )
    ");
    echo "<p>✅ Table 'client_progress_updates' created</p>";

    // Seed users
    $passwordHash = password_hash('password123', PASSWORD_BCRYPT);

    $stmt = $pdo->prepare("INSERT INTO users (id, username, password_hash, name, role, avatar) VALUES (?, ?, ?, ?, ?, ?)");
    $stmt->execute(['m1', 'delfa', $passwordHash, 'Delfa Henrizal', 'SUPERVISOR', 'https://ui-avatars.com/api/?name=Delfa+Henrizal&background=6366f1&color=fff&size=200']);
    $stmt->execute(['m2', 'abraham', $passwordHash, 'Abraham Tito', 'MARKETING', 'https://ui-avatars.com/api/?name=Abraham+Tito&background=8b5cf6&color=fff&size=200']);
    $stmt->execute(['m3', 'zachariyas', $passwordHash, 'Zhachariyas', 'MARKETING', 'https://ui-avatars.com/api/?name=Zhachariyas&background=ec4899&color=fff&size=200']);
    $stmt->execute(['mgr1', 'budiandru', $passwordHash, 'Prof. Dr. Budiandru, S.H., Ak., CA., CPA., CFI.', 'MANAGER', 'https://ui-avatars.com/api/?name=Budiandru&background=1e293b&color=fff&size=200']);
    echo "<p>✅ 4 users seeded - password: <b>password123</b></p>";

    // Assign team members to supervisor
    $pdo->exec("UPDATE users SET supervisor_id = 'm1' WHERE id IN ('m2', 'm3')");
    echo "<p>✅ Abraham & Ryas assigned to Delfa's team (SPV)</p>";

    // No sample clients - ready for real data
    echo "<p>✅ Database ready (no dummy data)</p>";

    echo "<br><h3>🎉 Setup Complete!</h3>";
    echo "<p>You can now use the IMDACS application.</p>";
    echo "<p><strong>Login credentials:</strong></p>";
    echo "<ul>";
    echo "<li>delfa / password123 (Supervisor)</li>";
    echo "<li>abraham / password123 (Marketing)</li>";
    echo "<li>zachariyas / password123 (Marketing)</li>";
    echo "<li>budiandru / password123 (Manager)</li>";
    echo "</ul>";

} catch (PDOException $e) {
    echo "<p style='color:red'>❌ Error: " . $e->getMessage() . "</p>";
}
