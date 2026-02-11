<?php
require_once __DIR__ . '/config/cors.php';
require_once __DIR__ . '/config/database.php';

$auth = requireAuth();
$db = getDB();

try {
    $stmt = $db->query("SELECT id, name, role, avatar FROM users ORDER BY role, name");
    $users = $stmt->fetchAll();
    echo json_encode($users);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
