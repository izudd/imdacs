<?php
require_once __DIR__ . '/config/cors.php';
require_once __DIR__ . '/config/database.php';

$auth = requireAuth();
$db = getDB();
$method = $_SERVER['REQUEST_METHOD'];

// Helper: map DB row to camelCase response
function mapClient($c) {
    return [
        'id' => $c['id'],
        'name' => $c['name'],
        'industry' => $c['industry'],
        'picName' => $c['pic_name'],
        'phone' => $c['phone'],
        'email' => $c['email'],
        'address' => $c['address'],
        'marketingId' => $c['marketing_id'],
        'status' => $c['status'],
        'estimatedValue' => (float)($c['estimated_value'] ?? 0),
        'yearWork' => $c['year_work'] ? (int)$c['year_work'] : null,
        'yearBook' => $c['year_book'] ? (int)$c['year_book'] : null,
        'serviceType' => $c['service_type'] ?? '',
        'dpp' => (float)($c['dpp'] ?? 0),
        'ppnType' => $c['ppn_type'] ?? 'EXCLUDE',
        'dpPaid' => (float)($c['dp_paid'] ?? 0),
        'dpProof' => $c['dp_proof'] ?? null,
        'notes' => $c['notes'] ?? '',
        'auditorAssignee' => $c['auditor_assignee'] ?? null,
        'lastUpdate' => $c['last_update'],
        'createdAt' => $c['created_at']
    ];
}

// ============ GET: List clients ============
if ($method === 'GET') {
    try {
        if ($auth['role'] === 'MANAGER') {
            // Manager sees all clients
            $sql = "SELECT * FROM clients ORDER BY created_at DESC";
            $params = [];

            if (!empty($_GET['marketing_id'])) {
                $sql = "SELECT * FROM clients WHERE marketing_id = ? ORDER BY created_at DESC";
                $params = [$_GET['marketing_id']];
            }
        } elseif ($auth['role'] === 'AUDITOR') {
            // Auditor sees clients with status DEAL or DP paid
            $sql = "SELECT * FROM clients WHERE (status = 'DEAL' OR dp_paid > 0) ORDER BY created_at DESC";
            $params = [];
        } elseif ($auth['role'] === 'SUPERVISOR') {
            if (!empty($_GET['scope']) && $_GET['scope'] === 'team') {
                // Team scope: self + team members
                $teamStmt = $db->prepare("SELECT id FROM users WHERE supervisor_id = ? OR id = ?");
                $teamStmt->execute([$auth['id'], $auth['id']]);
                $teamIds = array_column($teamStmt->fetchAll(), 'id');
                $placeholders = implode(',', array_fill(0, count($teamIds), '?'));
                $sql = "SELECT * FROM clients WHERE marketing_id IN ($placeholders) ORDER BY created_at DESC";
                $params = $teamIds;
            } else {
                // Default: own clients only
                $sql = "SELECT * FROM clients WHERE marketing_id = ? ORDER BY created_at DESC";
                $params = [$auth['id']];
            }
        } else {
            // Marketing sees only their clients
            $sql = "SELECT * FROM clients WHERE marketing_id = ? ORDER BY created_at DESC";
            $params = [$auth['id']];
        }

        // Search filter
        if (!empty($_GET['search'])) {
            $search = '%' . $_GET['search'] . '%';
            $sql = str_replace('ORDER BY', 'AND (name LIKE ? OR pic_name LIKE ?) ORDER BY', $sql);
            $params[] = $search;
            $params[] = $search;
        }

        // Status filter
        if (!empty($_GET['status'])) {
            $sql = str_replace('ORDER BY', 'AND status = ? ORDER BY', $sql);
            $params[] = $_GET['status'];
        }

        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $clients = $stmt->fetchAll();

        // Map snake_case to camelCase
        $result = array_map('mapClient', $clients);

        echo json_encode($result);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
}

// ============ POST: Add new client ============
elseif ($method === 'POST') {
    $data = getJsonInput();

    if (empty($data['name'])) {
        http_response_code(400);
        echo json_encode(['error' => "Field 'name' is required"]);
        exit();
    }

    try {
        $id = generateUUID();
        $now = date('Y-m-d');

        $stmt = $db->prepare("
            INSERT INTO clients (id, name, industry, pic_name, phone, email, address, marketing_id, status, estimated_value, year_work, year_book, service_type, dpp, ppn_type, dp_paid, dp_proof, notes, last_update, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        ");
        $stmt->execute([
            $id,
            $data['name'],
            $data['industry'] ?? '-',
            $data['picName'] ?? '-',
            $data['phone'] ?? '',
            $data['email'] ?? '',
            $data['address'] ?? '',
            $auth['id'],
            $data['status'] ?? 'NEW',
            $data['estimatedValue'] ?? 0,
            !empty($data['yearWork']) ? (int)$data['yearWork'] : null,
            !empty($data['yearBook']) ? (int)$data['yearBook'] : null,
            $data['serviceType'] ?? '',
            $data['dpp'] ?? 0,
            $data['ppnType'] ?? 'EXCLUDE',
            $data['dpPaid'] ?? 0,
            $data['dpProof'] ?? null,
            $data['notes'] ?? '',
            $now
        ]);

        // Return the created client
        $stmt = $db->prepare("SELECT * FROM clients WHERE id = ?");
        $stmt->execute([$id]);
        $c = $stmt->fetch();

        echo json_encode(mapClient($c));

    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
}

// ============ PATCH: Bulk import clients ============
elseif ($method === 'PATCH') {
    $data = getJsonInput();

    if (empty($data['clients']) || !is_array($data['clients'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Field "clients" (array) is required']);
        exit();
    }

    $imported = [];
    $skipped = [];

    try {
        $db->beginTransaction();

        foreach ($data['clients'] as $idx => $row) {
            $name = trim($row['name'] ?? '');
            if (empty($name)) {
                $skipped[] = ['row' => $idx + 1, 'reason' => 'Nama perusahaan kosong'];
                continue;
            }

            // Check duplicate by name + marketing_id
            $checkStmt = $db->prepare("SELECT id FROM clients WHERE LOWER(name) = LOWER(?) AND marketing_id = ?");
            $checkStmt->execute([$name, $auth['id']]);
            if ($checkStmt->fetch()) {
                $skipped[] = ['row' => $idx + 1, 'name' => $name, 'reason' => 'Sudah ada di database'];
                continue;
            }

            $id = generateUUID();
            $now = date('Y-m-d');

            $stmt = $db->prepare("
                INSERT INTO clients (id, name, industry, pic_name, phone, email, address, marketing_id, status, estimated_value, year_work, year_book, service_type, dpp, ppn_type, dp_paid, dp_proof, notes, last_update, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
            ");
            $stmt->execute([
                $id,
                $name,
                trim($row['industry'] ?? '-') ?: '-',
                trim($row['picName'] ?? '-') ?: '-',
                trim($row['phone'] ?? ''),
                trim($row['email'] ?? ''),
                trim($row['address'] ?? ''),
                $auth['id'],
                trim($row['status'] ?? 'NEW') ?: 'NEW',
                floatval($row['estimatedValue'] ?? 0),
                !empty($row['yearWork']) ? (int)$row['yearWork'] : null,
                !empty($row['yearBook']) ? (int)$row['yearBook'] : null,
                trim($row['serviceType'] ?? ''),
                floatval($row['dpp'] ?? 0),
                trim($row['ppnType'] ?? 'EXCLUDE') ?: 'EXCLUDE',
                floatval($row['dpPaid'] ?? 0),
                $row['dpProof'] ?? null,
                trim($row['notes'] ?? ''),
                $now
            ]);

            // Fetch the created client
            $fetchStmt = $db->prepare("SELECT * FROM clients WHERE id = ?");
            $fetchStmt->execute([$id]);
            $c = $fetchStmt->fetch();

            $imported[] = mapClient($c);
        }

        $db->commit();

        echo json_encode([
            'imported' => $imported,
            'skipped' => $skipped,
            'totalImported' => count($imported),
            'totalSkipped' => count($skipped)
        ]);

    } catch (PDOException $e) {
        $db->rollBack();
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
}

// ============ PUT: Update client ============
elseif ($method === 'PUT') {
    $data = getJsonInput();

    if (empty($data['id'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Client ID is required']);
        exit();
    }

    try {
        $fields = [];
        $params = [];

        $mapping = [
            'name' => 'name',
            'industry' => 'industry',
            'picName' => 'pic_name',
            'phone' => 'phone',
            'email' => 'email',
            'address' => 'address',
            'status' => 'status',
            'estimatedValue' => 'estimated_value',
            'yearWork' => 'year_work',
            'yearBook' => 'year_book',
            'serviceType' => 'service_type',
            'dpp' => 'dpp',
            'ppnType' => 'ppn_type',
            'dpPaid' => 'dp_paid',
            'dpProof' => 'dp_proof',
            'notes' => 'notes',
            'auditorAssignee' => 'auditor_assignee'
        ];

        foreach ($mapping as $jsonKey => $dbKey) {
            if (isset($data[$jsonKey])) {
                $fields[] = "$dbKey = ?";
                $params[] = $data[$jsonKey];
            }
        }

        if (empty($fields)) {
            http_response_code(400);
            echo json_encode(['error' => 'No fields to update']);
            exit();
        }

        $fields[] = "last_update = ?";
        $params[] = date('Y-m-d');
        $params[] = $data['id'];

        $sql = "UPDATE clients SET " . implode(', ', $fields) . " WHERE id = ?";
        $stmt = $db->prepare($sql);
        $stmt->execute($params);

        // Return updated client
        $stmt = $db->prepare("SELECT * FROM clients WHERE id = ?");
        $stmt->execute([$data['id']]);
        $c = $stmt->fetch();

        echo json_encode(mapClient($c));

    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
}
