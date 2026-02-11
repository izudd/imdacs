<?php
require_once __DIR__ . '/config/cors.php';
require_once __DIR__ . '/config/database.php';

$auth = requireAuth();
$db = getDB();
$method = $_SERVER['REQUEST_METHOD'];

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
        $result = array_map(function($c) {
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
                'lastUpdate' => $c['last_update'],
                'createdAt' => $c['created_at']
            ];
        }, $clients);

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
            INSERT INTO clients (id, name, industry, pic_name, phone, email, address, marketing_id, status, estimated_value, last_update, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
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
            $now
        ]);

        // Return the created client
        $stmt = $db->prepare("SELECT * FROM clients WHERE id = ?");
        $stmt->execute([$id]);
        $c = $stmt->fetch();

        echo json_encode([
            'id' => $c['id'],
            'name' => $c['name'],
            'industry' => $c['industry'],
            'picName' => $c['pic_name'],
            'phone' => $c['phone'],
            'email' => $c['email'],
            'address' => $c['address'],
            'marketingId' => $c['marketing_id'],
            'status' => $c['status'],
            'lastUpdate' => $c['last_update'],
            'createdAt' => $c['created_at']
        ]);

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
                INSERT INTO clients (id, name, industry, pic_name, phone, email, address, marketing_id, status, estimated_value, last_update, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
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
                $now
            ]);

            // Fetch the created client
            $fetchStmt = $db->prepare("SELECT * FROM clients WHERE id = ?");
            $fetchStmt->execute([$id]);
            $c = $fetchStmt->fetch();

            $imported[] = [
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
                'lastUpdate' => $c['last_update'],
                'createdAt' => $c['created_at']
            ];
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
            'estimatedValue' => 'estimated_value'
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

        echo json_encode([
            'id' => $c['id'],
            'name' => $c['name'],
            'industry' => $c['industry'],
            'picName' => $c['pic_name'],
            'phone' => $c['phone'],
            'email' => $c['email'],
            'address' => $c['address'],
            'marketingId' => $c['marketing_id'],
            'status' => $c['status'],
            'lastUpdate' => $c['last_update'],
            'createdAt' => $c['created_at']
        ]);

    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
}
