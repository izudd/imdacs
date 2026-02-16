<?php
require_once __DIR__ . '/config/cors.php';
require_once __DIR__ . '/config/database.php';

$auth = requireAuth();
$db = getDB();
$method = $_SERVER['REQUEST_METHOD'];

function mapUser($u) {
    return [
        'id' => $u['id'],
        'name' => $u['name'],
        'username' => $u['username'] ?? null,
        'role' => $u['role'],
        'avatar' => $u['avatar'],
        'supervisorId' => $u['supervisor_id'] ?? null,
        'isActive' => isset($u['is_active']) ? (bool)(int)$u['is_active'] : true,
        'clientCount' => (int)($u['client_count'] ?? 0)
    ];
}

try {
    // GET: List all users (available to all authenticated users)
    if ($method === 'GET') {
        $stmt = $db->query("
            SELECT u.id, u.name, u.username, u.role, u.supervisor_id, u.avatar, u.is_active,
                   (SELECT COUNT(*) FROM clients c WHERE c.marketing_id = u.id) as client_count
            FROM users u
            ORDER BY
                CASE u.role WHEN 'MANAGER' THEN 1 WHEN 'SUPERVISOR' THEN 2 WHEN 'MARKETING' THEN 3 END,
                u.name
        ");
        $users = $stmt->fetchAll();
        echo json_encode(array_map('mapUser', $users));
        exit();
    }

    // === MANAGER ONLY from here ===
    if ($auth['role'] !== 'MANAGER') {
        http_response_code(403);
        echo json_encode(['error' => 'Hanya Manager yang bisa mengelola user']);
        exit();
    }

    // POST: Create new user
    if ($method === 'POST') {
        $data = getJsonInput();

        $name = trim($data['name'] ?? '');
        $username = trim($data['username'] ?? '');
        $password = $data['password'] ?? '';
        $role = $data['role'] ?? 'MARKETING';
        $supervisorId = $data['supervisorId'] ?? null;

        if (empty($name) || empty($username) || empty($password)) {
            http_response_code(400);
            echo json_encode(['error' => 'Nama, username, dan password wajib diisi']);
            exit();
        }
        if (strlen($password) < 6) {
            http_response_code(400);
            echo json_encode(['error' => 'Password minimal 6 karakter']);
            exit();
        }
        if (!in_array($role, ['MARKETING', 'SUPERVISOR'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Role harus MARKETING atau SUPERVISOR']);
            exit();
        }

        // Check username unique
        $check = $db->prepare("SELECT id FROM users WHERE username = ?");
        $check->execute([$username]);
        if ($check->rowCount() > 0) {
            http_response_code(409);
            echo json_encode(['error' => 'Username sudah dipakai']);
            exit();
        }

        // Generate ID
        $stmt = $db->query("SELECT id FROM users WHERE id LIKE 'm%' ORDER BY CAST(SUBSTRING(id, 2) AS UNSIGNED) DESC LIMIT 1");
        $last = $stmt->fetch();
        $nextNum = $last ? ((int)substr($last['id'], 1)) + 1 : 1;
        $newId = 'm' . $nextNum;

        $hash = password_hash($password, PASSWORD_BCRYPT);
        $initials = implode('+', array_map(function($w) { return $w[0] ?? ''; }, explode(' ', $name)));
        $avatar = "https://ui-avatars.com/api/?name={$initials}&background=" . substr(md5($name), 0, 6) . "&color=fff&size=200";

        $stmt = $db->prepare("
            INSERT INTO users (id, username, password_hash, name, role, supervisor_id, avatar, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        ");
        $stmt->execute([$newId, $username, $hash, $name, $role, $supervisorId, $avatar]);

        // Fetch created user
        $stmt = $db->prepare("
            SELECT u.id, u.name, u.username, u.role, u.supervisor_id, u.avatar, u.is_active,
                   0 as client_count
            FROM users u WHERE u.id = ?
        ");
        $stmt->execute([$newId]);
        echo json_encode(mapUser($stmt->fetch()));
        exit();
    }

    // PUT: Update user (name, role, supervisor, toggle active, reset password)
    if ($method === 'PUT') {
        $data = getJsonInput();
        $id = $data['id'] ?? '';

        if (empty($id)) {
            http_response_code(400);
            echo json_encode(['error' => 'User ID wajib']);
            exit();
        }

        // Don't allow editing MANAGER accounts
        $check = $db->prepare("SELECT role FROM users WHERE id = ?");
        $check->execute([$id]);
        $target = $check->fetch();
        if (!$target) {
            http_response_code(404);
            echo json_encode(['error' => 'User tidak ditemukan']);
            exit();
        }
        if ($target['role'] === 'MANAGER') {
            http_response_code(403);
            echo json_encode(['error' => 'Tidak bisa mengedit akun Manager']);
            exit();
        }

        $fields = [];
        $params = [];

        if (isset($data['name']) && trim($data['name']) !== '') {
            $fields[] = 'name = ?';
            $params[] = trim($data['name']);
            // Update avatar too
            $initials = implode('+', array_map(function($w) { return $w[0] ?? ''; }, explode(' ', trim($data['name']))));
            $fields[] = 'avatar = ?';
            $params[] = "https://ui-avatars.com/api/?name={$initials}&background=" . substr(md5(trim($data['name'])), 0, 6) . "&color=fff&size=200";
        }
        if (isset($data['role']) && in_array($data['role'], ['MARKETING', 'SUPERVISOR'])) {
            $fields[] = 'role = ?';
            $params[] = $data['role'];
        }
        if (array_key_exists('supervisorId', $data)) {
            $fields[] = 'supervisor_id = ?';
            $params[] = $data['supervisorId'];
        }
        if (isset($data['isActive'])) {
            $fields[] = 'is_active = ?';
            $params[] = $data['isActive'] ? 1 : 0;
        }
        if (isset($data['password']) && !empty($data['password'])) {
            if (strlen($data['password']) < 6) {
                http_response_code(400);
                echo json_encode(['error' => 'Password minimal 6 karakter']);
                exit();
            }
            $fields[] = 'password_hash = ?';
            $params[] = password_hash($data['password'], PASSWORD_BCRYPT);
        }

        if (empty($fields)) {
            http_response_code(400);
            echo json_encode(['error' => 'Tidak ada data yang diubah']);
            exit();
        }

        $params[] = $id;
        $sql = "UPDATE users SET " . implode(', ', $fields) . " WHERE id = ?";
        $stmt = $db->prepare($sql);
        $stmt->execute($params);

        // Fetch updated user
        $stmt = $db->prepare("
            SELECT u.id, u.name, u.username, u.role, u.supervisor_id, u.avatar, u.is_active,
                   (SELECT COUNT(*) FROM clients c WHERE c.marketing_id = u.id) as client_count
            FROM users u WHERE u.id = ?
        ");
        $stmt->execute([$id]);
        echo json_encode(mapUser($stmt->fetch()));
        exit();
    }

    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
