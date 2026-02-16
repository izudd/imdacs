<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

session_start();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit();
}

$data = getJsonInput();
$username = $data['username'] ?? '';
$password = $data['password'] ?? '';

if (empty($username) || empty($password)) {
    http_response_code(400);
    echo json_encode(['error' => 'Username dan password harus diisi']);
    exit();
}

try {
    $db = getDB();
    $stmt = $db->prepare("SELECT id, username, password_hash, name, role, supervisor_id, avatar FROM users WHERE username = ?");
    $stmt->execute([$username]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, $user['password_hash'])) {
        http_response_code(401);
        echo json_encode(['error' => 'Username atau password salah']);
        exit();
    }

    // Check if user is active
    if (isset($user['is_active']) && !(int)$user['is_active']) {
        http_response_code(403);
        echo json_encode(['error' => 'Akun Anda sudah dinonaktifkan. Hubungi Manager.']);
        exit();
    }

    // Set session
    $_SESSION['user_id'] = $user['id'];
    $_SESSION['role'] = $user['role'];

    // Return user data (without password)
    echo json_encode([
        'id' => $user['id'],
        'name' => $user['name'],
        'role' => $user['role'],
        'avatar' => $user['avatar'],
        'supervisorId' => $user['supervisor_id'] ?? null
    ]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
}
