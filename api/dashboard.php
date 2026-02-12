<?php
require_once __DIR__ . '/config/cors.php';
require_once __DIR__ . '/config/database.php';

$auth = requireAuth();
$db = getDB();

try {
    $today = date('Y-m-d');
    $firstDayOfMonth = date('Y-m-01');

    if ($auth['role'] === 'MARKETING' || $auth['role'] === 'SUPERVISOR') {
        // Total clients
        $stmt = $db->prepare("SELECT COUNT(*) as total FROM clients WHERE marketing_id = ?");
        $stmt->execute([$auth['id']]);
        $totalClients = (int)$stmt->fetch()['total'];

        // Today activities
        $stmt = $db->prepare("SELECT COUNT(*) as total FROM activities WHERE marketing_id = ? AND date = ?");
        $stmt->execute([$auth['id'], $today]);
        $todayActivities = (int)$stmt->fetch()['total'];

        // Deals this month
        $stmt = $db->prepare("SELECT COUNT(*) as total FROM clients WHERE marketing_id = ? AND status = 'DEAL' AND last_update >= ?");
        $stmt->execute([$auth['id'], $firstDayOfMonth]);
        $dealsThisMonth = (int)$stmt->fetch()['total'];

        // EOD report status
        $stmt = $db->prepare("SELECT status FROM eod_reports WHERE marketing_id = ? AND date = ?");
        $stmt->execute([$auth['id'], $today]);
        $eodReport = $stmt->fetch();
        $eodStatus = $eodReport ? $eodReport['status'] : 'MISSING';

    } else {
        // Manager: aggregate stats
        $stmt = $db->query("SELECT COUNT(*) as total FROM clients");
        $totalClients = (int)$stmt->fetch()['total'];

        $stmt = $db->prepare("SELECT COUNT(*) as total FROM activities WHERE date = ?");
        $stmt->execute([$today]);
        $todayActivities = (int)$stmt->fetch()['total'];

        $stmt = $db->prepare("SELECT COUNT(*) as total FROM clients WHERE status = 'DEAL' AND last_update >= ?");
        $stmt->execute([$firstDayOfMonth]);
        $dealsThisMonth = (int)$stmt->fetch()['total'];

        // Check how many marketing users submitted EOD today
        $stmt = $db->prepare("
            SELECT
                (SELECT COUNT(*) FROM users WHERE role IN ('MARKETING','SUPERVISOR')) as total_marketing,
                (SELECT COUNT(*) FROM eod_reports WHERE date = ?) as submitted_today
        ");
        $stmt->execute([$today]);
        $reportStats = $stmt->fetch();
        $eodStatus = $reportStats['submitted_today'] . '/' . $reportStats['total_marketing'] . ' submitted';

        // Deal value this month
        $stmt = $db->prepare("SELECT COALESCE(SUM(deal_value), 0) as total FROM eod_reports WHERE date >= ?");
        $stmt->execute([$firstDayOfMonth]);
        $dealValueThisMonth = (float)$stmt->fetch()['total'];
    }

    echo json_encode([
        'totalClients' => $totalClients,
        'todayActivities' => $todayActivities,
        'dealsThisMonth' => $dealsThisMonth,
        'eodStatus' => $eodStatus,
        'dealValueThisMonth' => $dealValueThisMonth ?? 0
    ]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
