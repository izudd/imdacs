<?php
require_once __DIR__ . '/config/cors.php';
require_once __DIR__ . '/config/database.php';

$auth = requireAuth();
$db = getDB();

try {
    $stmt = $db->query("SELECT id, name, role, supervisor_id, avatar FROM users ORDER BY role, name");
    $users = $stmt->fetchAll();
    $result = array_map(function($u) {
        return [
            'id' => $u['id'],
            'name' => $u['name'],
            'role' => $u['role'],
            'avatar' => $u['avatar'],
            'supervisorId' => $u['supervisor_id'] ?? null
        ];
    }, $users);
    echo json_encode($result);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
