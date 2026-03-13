<?php
require_once __DIR__ . '/config/cors.php';
require_once __DIR__ . '/config/database.php';

$auth = requireAuth();
$db = getDB();
$method = $_SERVER['REQUEST_METHOD'];

function mapDeleteRequest($row) {
    return [
        'id' => $row['id'],
        'clientId' => $row['client_id'],
        'clientName' => $row['client_name'],
        'requestedBy' => $row['requested_by'],
        'requesterName' => $row['requester_name'] ?? '',
        'creatorId' => $row['creator_id'],
        'creatorName' => $row['creator_name'] ?? '',
        'reason' => $row['reason'] ?? '',
        'status' => $row['status'],
        'respondedAt' => $row['responded_at'],
        'createdAt' => $row['created_at'],
    ];
}

// ============ GET — List delete requests or count pending ============
if ($method === 'GET') {

    // Quick count for badge
    if (isset($_GET['count_pending'])) {
        if ($auth['role'] === 'MANAGER') {
            $stmt = $db->prepare("SELECT COUNT(*) as count FROM delete_requests WHERE status = 'PENDING'");
            $stmt->execute();
        } else {
            $stmt = $db->prepare("SELECT COUNT(*) as count FROM delete_requests WHERE creator_id = ? AND status = 'PENDING'");
            $stmt->execute([$auth['id']]);
        }
        echo json_encode($stmt->fetch(PDO::FETCH_ASSOC));
        exit();
    }

    $statusFilter = $_GET['status'] ?? null;

    $sql = "SELECT dr.*, req.name as requester_name, cre.name as creator_name
            FROM delete_requests dr
            LEFT JOIN users req ON req.id = dr.requested_by
            LEFT JOIN users cre ON cre.id = dr.creator_id";

    $params = [];
    $where = [];

    // Role-based filtering: Marketing/Supervisor see only their clients' requests
    if ($auth['role'] !== 'MANAGER') {
        $where[] = "dr.creator_id = ?";
        $params[] = $auth['id'];
    }

    if ($statusFilter) {
        $where[] = "dr.status = ?";
        $params[] = $statusFilter;
    }

    if ($where) {
        $sql .= " WHERE " . implode(" AND ", $where);
    }
    $sql .= " ORDER BY dr.created_at DESC";

    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode(array_map('mapDeleteRequest', $rows));
    exit();
}

// ============ POST — Create delete request (Manager only) ============
if ($method === 'POST') {
    if ($auth['role'] !== 'MANAGER') {
        http_response_code(403);
        echo json_encode(['error' => 'Hanya Manager yang dapat request penghapusan']);
        exit();
    }

    $data = getJsonInput();
    $clientId = $data['clientId'] ?? null;
    $reason = $data['reason'] ?? '';

    if (!$clientId) {
        http_response_code(400);
        echo json_encode(['error' => 'clientId wajib diisi']);
        exit();
    }

    // Look up client
    $stmt = $db->prepare("SELECT id, name, marketing_id FROM clients WHERE id = ?");
    $stmt->execute([$clientId]);
    $client = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$client) {
        http_response_code(404);
        echo json_encode(['error' => 'Client tidak ditemukan']);
        exit();
    }

    // Check for existing PENDING request
    $stmt = $db->prepare("SELECT id FROM delete_requests WHERE client_id = ? AND status = 'PENDING'");
    $stmt->execute([$clientId]);
    if ($stmt->rowCount() > 0) {
        http_response_code(409);
        echo json_encode(['error' => 'Sudah ada permintaan hapus yang pending untuk client ini']);
        exit();
    }

    $id = generateUUID();
    $stmt = $db->prepare("INSERT INTO delete_requests (id, client_id, client_name, requested_by, creator_id, reason) VALUES (?, ?, ?, ?, ?, ?)");
    $stmt->execute([$id, $clientId, $client['name'], $auth['id'], $client['marketing_id'], $reason]);

    // Fetch the created request with names
    $stmt = $db->prepare("SELECT dr.*, req.name as requester_name, cre.name as creator_name
                           FROM delete_requests dr
                           LEFT JOIN users req ON req.id = dr.requested_by
                           LEFT JOIN users cre ON cre.id = dr.creator_id
                           WHERE dr.id = ?");
    $stmt->execute([$id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    echo json_encode(mapDeleteRequest($row));
    exit();
}

// ============ PUT — Respond to delete request (Creator only) ============
if ($method === 'PUT') {
    $data = getJsonInput();
    $requestId = $data['id'] ?? null;
    $action = $data['action'] ?? null;

    if (!$requestId || !in_array($action, ['approve', 'reject'])) {
        http_response_code(400);
        echo json_encode(['error' => 'id dan action (approve/reject) wajib diisi']);
        exit();
    }

    // Look up request
    $stmt = $db->prepare("SELECT * FROM delete_requests WHERE id = ?");
    $stmt->execute([$requestId]);
    $request = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$request) {
        http_response_code(404);
        echo json_encode(['error' => 'Permintaan tidak ditemukan']);
        exit();
    }

    if ($request['status'] !== 'PENDING') {
        http_response_code(400);
        echo json_encode(['error' => 'Permintaan sudah diproses sebelumnya']);
        exit();
    }

    // Authorization: only the creator can respond
    if ($auth['id'] !== $request['creator_id'] && $auth['role'] !== 'MANAGER') {
        http_response_code(403);
        echo json_encode(['error' => 'Hanya pembuat client yang dapat menyetujui/menolak']);
        exit();
    }

    if ($action === 'approve') {
        $db->beginTransaction();
        try {
            // Delete the client
            $stmt = $db->prepare("DELETE FROM clients WHERE id = ?");
            $stmt->execute([$request['client_id']]);

            // Update request status
            $stmt = $db->prepare("UPDATE delete_requests SET status = 'APPROVED', responded_at = NOW() WHERE id = ?");
            $stmt->execute([$requestId]);

            $db->commit();
        } catch (Exception $e) {
            $db->rollBack();
            http_response_code(500);
            echo json_encode(['error' => 'Gagal menghapus client: ' . $e->getMessage()]);
            exit();
        }
    } else {
        // Reject
        $stmt = $db->prepare("UPDATE delete_requests SET status = 'REJECTED', responded_at = NOW() WHERE id = ?");
        $stmt->execute([$requestId]);
    }

    // Return updated request
    $stmt = $db->prepare("SELECT dr.*, req.name as requester_name, cre.name as creator_name
                           FROM delete_requests dr
                           LEFT JOIN users req ON req.id = dr.requested_by
                           LEFT JOIN users cre ON cre.id = dr.creator_id
                           WHERE dr.id = ?");
    $stmt->execute([$requestId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    echo json_encode(mapDeleteRequest($row));
    exit();
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
