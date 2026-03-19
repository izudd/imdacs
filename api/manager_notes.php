<?php
require_once __DIR__ . '/config/cors.php';
require_once __DIR__ . '/config/database.php';

$user = requireAuth();
$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        // Marketing: get notes for me
        if (isset($_GET['for_me'])) {
            $stmt = $pdo->prepare("
                SELECT mn.*, u.name AS manager_name
                FROM manager_notes mn
                JOIN users u ON u.id = mn.manager_id
                WHERE mn.marketing_id = ?
                ORDER BY mn.created_at DESC
                LIMIT 20
            ");
            $stmt->execute([$user['id']]);
            echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
            break;
        }

        // Manager: get notes sent (optionally filtered by marketing_id)
        if ($user['role'] !== 'MANAGER') {
            http_response_code(403);
            echo json_encode(['error' => 'Forbidden']);
            break;
        }

        $marketingId = $_GET['marketing_id'] ?? null;
        if ($marketingId) {
            $stmt = $pdo->prepare("
                SELECT mn.*, u.name AS marketing_name
                FROM manager_notes mn
                JOIN users u ON u.id = mn.marketing_id
                WHERE mn.manager_id = ? AND mn.marketing_id = ?
                ORDER BY mn.created_at DESC
                LIMIT 20
            ");
            $stmt->execute([$user['id'], $marketingId]);
        } else {
            $stmt = $pdo->prepare("
                SELECT mn.*, u.name AS marketing_name
                FROM manager_notes mn
                JOIN users u ON u.id = mn.marketing_id
                WHERE mn.manager_id = ?
                ORDER BY mn.created_at DESC
                LIMIT 50
            ");
            $stmt->execute([$user['id']]);
        }
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
        break;

    case 'POST':
        // Manager sends a note
        if ($user['role'] !== 'MANAGER') {
            http_response_code(403);
            echo json_encode(['error' => 'Forbidden']);
            break;
        }

        $data = getJsonInput();
        $marketingId = $data['marketingId'] ?? '';
        $tone = $data['tone'] ?? 'good';
        $message = trim($data['message'] ?? '');

        if (!$marketingId || !$message) {
            http_response_code(400);
            echo json_encode(['error' => 'marketingId dan message wajib diisi']);
            break;
        }

        if (!in_array($tone, ['good', 'warning', 'urgent'])) {
            $tone = 'good';
        }

        $stmt = $pdo->prepare("INSERT INTO manager_notes (manager_id, marketing_id, tone, message) VALUES (?, ?, ?, ?)");
        $stmt->execute([$user['id'], $marketingId, $tone, $message]);

        $noteId = $pdo->lastInsertId();
        $stmt = $pdo->prepare("SELECT mn.*, u.name AS marketing_name FROM manager_notes mn JOIN users u ON u.id = mn.marketing_id WHERE mn.id = ?");
        $stmt->execute([$noteId]);
        echo json_encode($stmt->fetch(PDO::FETCH_ASSOC));
        break;

    case 'PUT':
        // Marketing marks note as read
        $data = getJsonInput();
        $noteId = $data['id'] ?? null;

        if (!$noteId) {
            http_response_code(400);
            echo json_encode(['error' => 'id wajib diisi']);
            break;
        }

        $stmt = $pdo->prepare("UPDATE manager_notes SET is_read = 1, read_at = NOW() WHERE id = ? AND marketing_id = ?");
        $stmt->execute([$noteId, $user['id']]);

        echo json_encode(['success' => true]);
        break;

    case 'DELETE':
        // Manager deletes a note
        if ($user['role'] !== 'MANAGER') {
            http_response_code(403);
            echo json_encode(['error' => 'Forbidden']);
            break;
        }

        $noteId = $_GET['id'] ?? null;
        if (!$noteId) {
            http_response_code(400);
            echo json_encode(['error' => 'id wajib diisi']);
            break;
        }

        $stmt = $pdo->prepare("DELETE FROM manager_notes WHERE id = ? AND manager_id = ?");
        $stmt->execute([$noteId, $user['id']]);

        echo json_encode(['success' => true]);
        break;

    default:
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
}
