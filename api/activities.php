<?php
require_once __DIR__ . '/config/cors.php';
require_once __DIR__ . '/config/database.php';

$auth = requireAuth();
$db = getDB();
$method = $_SERVER['REQUEST_METHOD'];

function mapActivity($a) {
    return [
        'id' => $a['id'],
        'date' => $a['date'],
        'marketingId' => $a['marketing_id'],
        'type' => $a['type'],
        'clientId' => $a['client_id'],
        'description' => $a['description'],
        'startTime' => substr($a['start_time'], 0, 5), // HH:MM
        'endTime' => substr($a['end_time'], 0, 5),
        'location' => $a['location'],
        'proofUrl' => $a['proof_url'],
        'status' => $a['status']
    ];
}

// ============ GET: List activities ============
if ($method === 'GET') {
    try {
        $params = [];
        $conditions = [];

        if ($auth['role'] === 'MARKETING') {
            $conditions[] = "marketing_id = ?";
            $params[] = $auth['id'];
        } elseif (!empty($_GET['marketing_id'])) {
            $conditions[] = "marketing_id = ?";
            $params[] = $_GET['marketing_id'];
        }

        if (!empty($_GET['date'])) {
            $conditions[] = "date = ?";
            $params[] = $_GET['date'];
        }

        $sql = "SELECT * FROM activities";
        if (!empty($conditions)) {
            $sql .= " WHERE " . implode(' AND ', $conditions);
        }
        $sql .= " ORDER BY date DESC, start_time DESC";

        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $activities = $stmt->fetchAll();

        echo json_encode(array_map('mapActivity', $activities));

    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
}

// ============ POST: Add activity ============
elseif ($method === 'POST') {
    $data = getJsonInput();

    $required = ['type', 'description', 'startTime', 'endTime'];
    foreach ($required as $field) {
        if (empty($data[$field])) {
            http_response_code(400);
            echo json_encode(['error' => "Field '$field' is required"]);
            exit();
        }
    }

    try {
        $id = generateUUID();
        $date = $data['date'] ?? date('Y-m-d');

        $stmt = $db->prepare("
            INSERT INTO activities (id, date, marketing_id, type, client_id, description, start_time, end_time, location, proof_url, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            $id,
            $date,
            $auth['id'],
            $data['type'],
            $data['clientId'] ?? null,
            $data['description'],
            $data['startTime'],
            $data['endTime'],
            $data['location'] ?? null,
            $data['proofUrl'] ?? null,
            $data['status'] ?? 'DONE'
        ]);

        // Return created activity
        $stmt = $db->prepare("SELECT * FROM activities WHERE id = ?");
        $stmt->execute([$id]);
        $a = $stmt->fetch();

        echo json_encode(mapActivity($a));

    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
}
