<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

session_start();

if (!isset($_SESSION['user_id'])) {
    echo json_encode(['authenticated' => false]);
    exit();
}

try {
    $db = getDB();
    $stmt = $db->prepare("SELECT id, name, role, avatar FROM users WHERE id = ?");
    $stmt->execute([$_SESSION['user_id']]);
    $user = $stmt->fetch();

    if (!$user) {
        session_destroy();
        echo json_encode(['authenticated' => false]);
        exit();
    }

    echo json_encode([
        'authenticated' => true,
        'user' => $user
    ]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Server error']);
}
