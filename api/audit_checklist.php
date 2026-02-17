<?php
require_once __DIR__ . '/config/cors.php';
require_once __DIR__ . '/config/database.php';

$auth = requireAuth();
$db = getDB();
$method = $_SERVER['REQUEST_METHOD'];

// Only AUDITOR and MANAGER can access
if (!in_array($auth['role'], ['AUDITOR', 'MANAGER'])) {
    http_response_code(403);
    echo json_encode(['error' => 'Access denied']);
    exit();
}

// Predefined checklist items
$CHECKLIST_ITEMS = [
    'DOKUMEN_LENGKAP' => 'Kelengkapan Dokumen',
    'VERIFIKASI_DP' => 'Verifikasi DP / Pembayaran',
    'INPUT_PEMBUKUAN' => 'Input ke Pembukuan',
    'SURAT_PENUGASAN' => 'Surat Penugasan Diterbitkan',
    'PROSES_PENGERJAAN' => 'Proses Pengerjaan Dimulai',
    'REVIEW_HASIL' => 'Review Hasil Pekerjaan',
    'SELESAI' => 'Selesai / Delivered'
];

try {
    // GET: Retrieve checklist for a client
    if ($method === 'GET') {
        $clientId = $_GET['client_id'] ?? '';
        if (empty($clientId)) {
            http_response_code(400);
            echo json_encode(['error' => 'client_id is required']);
            exit();
        }

        // Check if checklist rows exist for this client
        $stmt = $db->prepare("SELECT COUNT(*) as cnt FROM audit_checklist WHERE client_id = ?");
        $stmt->execute([$clientId]);
        $count = (int)$stmt->fetch()['cnt'];

        if ($count === 0) {
            // Initialize checklist items for this client
            $insertStmt = $db->prepare("INSERT INTO audit_checklist (client_id, item_key) VALUES (?, ?)");
            foreach ($CHECKLIST_ITEMS as $key => $label) {
                $insertStmt->execute([$clientId, $key]);
            }
        }

        // Fetch all items
        $stmt = $db->prepare("SELECT * FROM audit_checklist WHERE client_id = ? ORDER BY id ASC");
        $stmt->execute([$clientId]);
        $items = $stmt->fetchAll();

        $result = array_map(function($item) use ($CHECKLIST_ITEMS) {
            return [
                'id' => (int)$item['id'],
                'clientId' => $item['client_id'],
                'itemKey' => $item['item_key'],
                'label' => $CHECKLIST_ITEMS[$item['item_key']] ?? $item['item_key'],
                'isChecked' => (bool)(int)$item['is_checked'],
                'checkedAt' => $item['checked_at'],
                'checkedBy' => $item['checked_by']
            ];
        }, $items);

        echo json_encode($result);
    }

    // PUT: Toggle a checklist item
    elseif ($method === 'PUT') {
        $data = getJsonInput();
        $id = $data['id'] ?? 0;
        $isChecked = $data['isChecked'] ?? false;

        if (empty($id)) {
            http_response_code(400);
            echo json_encode(['error' => 'Checklist item id is required']);
            exit();
        }

        $stmt = $db->prepare("UPDATE audit_checklist SET is_checked = ?, checked_at = ?, checked_by = ? WHERE id = ?");
        $stmt->execute([
            $isChecked ? 1 : 0,
            $isChecked ? date('Y-m-d H:i:s') : null,
            $isChecked ? $auth['id'] : null,
            $id
        ]);

        echo json_encode(['success' => true]);
    }

    else {
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
    }

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
