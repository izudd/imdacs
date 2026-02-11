<?php
require_once __DIR__ . '/config/cors.php';
require_once __DIR__ . '/config/database.php';

$auth = requireAuth();
$db = getDB();
$method = $_SERVER['REQUEST_METHOD'];

function mapReport($r, $db) {
    // Fetch progress updates for this report
    $stmt = $db->prepare("SELECT * FROM client_progress_updates WHERE report_id = ?");
    $stmt->execute([$r['id']]);
    $updates = $stmt->fetchAll();

    $progressUpdates = array_map(function($u) {
        return [
            'clientId' => $u['client_id'],
            'activity' => $u['activity'],
            'prevStatus' => $u['prev_status'],
            'newStatus' => $u['new_status'],
            'result' => $u['result']
        ];
    }, $updates);

    return [
        'id' => $r['id'],
        'date' => $r['date'],
        'marketingId' => $r['marketing_id'],
        'summary' => $r['summary'],
        'progressUpdates' => $progressUpdates,
        'newLeads' => (int)$r['new_leads'],
        'followUps' => (int)$r['follow_ups'],
        'dealsToday' => (int)$r['deals_today'],
        'dealValue' => (float)$r['deal_value'],
        'constraints' => $r['constraints_notes'],
        'supportNeeded' => $r['support_needed'],
        'planTomorrow' => $r['plan_tomorrow'],
        'status' => $r['status'],
        'submittedAt' => $r['submitted_at']
    ];
}

// ============ GET: List reports ============
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

        $sql = "SELECT * FROM eod_reports";
        if (!empty($conditions)) {
            $sql .= " WHERE " . implode(' AND ', $conditions);
        }
        $sql .= " ORDER BY date DESC, submitted_at DESC";

        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $reports = $stmt->fetchAll();

        $result = array_map(function($r) use ($db) {
            return mapReport($r, $db);
        }, $reports);

        echo json_encode($result);

    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
}

// ============ POST: Submit EOD report ============
elseif ($method === 'POST') {
    $data = getJsonInput();

    if (empty($data['summary'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Summary is required']);
        exit();
    }

    try {
        $db->beginTransaction();

        $id = generateUUID();
        $date = $data['date'] ?? date('Y-m-d');

        // Check if report already exists for today
        $stmt = $db->prepare("SELECT id FROM eod_reports WHERE date = ? AND marketing_id = ?");
        $stmt->execute([$date, $auth['id']]);
        $existing = $stmt->fetch();

        if ($existing) {
            // Update existing report
            $stmt = $db->prepare("
                UPDATE eod_reports SET
                    summary = ?, new_leads = ?, follow_ups = ?, deals_today = ?,
                    deal_value = ?, constraints_notes = ?, support_needed = ?,
                    plan_tomorrow = ?, status = 'SUBMITTED', submitted_at = NOW()
                WHERE id = ?
            ");
            $stmt->execute([
                $data['summary'],
                $data['newLeads'] ?? 0,
                $data['followUps'] ?? 0,
                $data['dealsToday'] ?? 0,
                $data['dealValue'] ?? 0,
                $data['constraints'] ?? '',
                $data['supportNeeded'] ?? '',
                $data['planTomorrow'] ?? '',
                $existing['id']
            ]);
            $id = $existing['id'];

            // Delete old progress updates
            $stmt = $db->prepare("DELETE FROM client_progress_updates WHERE report_id = ?");
            $stmt->execute([$id]);
        } else {
            // Insert new report
            $stmt = $db->prepare("
                INSERT INTO eod_reports (id, date, marketing_id, summary, new_leads, follow_ups, deals_today, deal_value, constraints_notes, support_needed, plan_tomorrow, status, submitted_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SUBMITTED', NOW())
            ");
            $stmt->execute([
                $id,
                $date,
                $auth['id'],
                $data['summary'],
                $data['newLeads'] ?? 0,
                $data['followUps'] ?? 0,
                $data['dealsToday'] ?? 0,
                $data['dealValue'] ?? 0,
                $data['constraints'] ?? '',
                $data['supportNeeded'] ?? '',
                $data['planTomorrow'] ?? ''
            ]);
        }

        // Insert progress updates
        if (!empty($data['progressUpdates'])) {
            $stmt = $db->prepare("
                INSERT INTO client_progress_updates (report_id, client_id, activity, prev_status, new_status, result)
                VALUES (?, ?, ?, ?, ?, ?)
            ");

            $updateClientStmt = $db->prepare("UPDATE clients SET status = ?, last_update = CURDATE() WHERE id = ?");

            foreach ($data['progressUpdates'] as $update) {
                $stmt->execute([
                    $id,
                    $update['clientId'],
                    $update['activity'] ?? '',
                    $update['prevStatus'],
                    $update['newStatus'],
                    $update['result'] ?? ''
                ]);

                // Update client status if changed
                if ($update['prevStatus'] !== $update['newStatus']) {
                    $updateClientStmt->execute([$update['newStatus'], $update['clientId']]);
                }
            }
        }

        $db->commit();

        // Return created/updated report
        $stmt = $db->prepare("SELECT * FROM eod_reports WHERE id = ?");
        $stmt->execute([$id]);
        $r = $stmt->fetch();

        echo json_encode(mapReport($r, $db));

    } catch (PDOException $e) {
        $db->rollBack();
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
}

// ============ PUT: Update report status (Manager) ============
elseif ($method === 'PUT') {
    if ($auth['role'] !== 'MANAGER') {
        http_response_code(403);
        echo json_encode(['error' => 'Only managers can update report status']);
        exit();
    }

    $data = getJsonInput();

    if (empty($data['id']) || empty($data['status'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Report ID and status are required']);
        exit();
    }

    $validStatuses = ['APPROVED', 'REVISION'];
    if (!in_array($data['status'], $validStatuses)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid status. Must be APPROVED or REVISION']);
        exit();
    }

    try {
        $stmt = $db->prepare("UPDATE eod_reports SET status = ? WHERE id = ?");
        $stmt->execute([$data['status'], $data['id']]);

        $stmt = $db->prepare("SELECT * FROM eod_reports WHERE id = ?");
        $stmt->execute([$data['id']]);
        $r = $stmt->fetch();

        if (!$r) {
            http_response_code(404);
            echo json_encode(['error' => 'Report not found']);
            exit();
        }

        echo json_encode(mapReport($r, $db));

    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
}
