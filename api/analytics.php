<?php
/**
 * Analytics API - Daily & Monthly trend data for Manager dashboard
 * GET /api/analytics.php?type=daily_activities&period=month
 * GET /api/analytics.php?type=daily_activities&period=week
 * GET /api/analytics.php?type=monthly_activities
 */
require_once __DIR__ . '/config/cors.php';
require_once __DIR__ . '/config/database.php';

$auth = requireAuth();
$db = getDB();

$type = $_GET['type'] ?? 'daily_activities';
$period = $_GET['period'] ?? 'month';

try {
    // === Daily Activity Trend (per marketing, grouped by date) ===
    if ($type === 'daily_activities') {
        if ($period === 'week') {
            $startDate = date('Y-m-d', strtotime('-6 days'));
        } else {
            $startDate = date('Y-m-01'); // First day of current month
        }

        // Get all marketing users
        $stmt = $db->query("SELECT id, name FROM users WHERE role = 'MARKETING' ORDER BY name");
        $marketingUsers = $stmt->fetchAll();

        // Get activity counts grouped by date and marketing_id
        $stmt = $db->prepare("
            SELECT date, marketing_id, COUNT(*) as count
            FROM activities
            WHERE date >= ?
            GROUP BY date, marketing_id
            ORDER BY date ASC
        ");
        $stmt->execute([$startDate]);
        $rows = $stmt->fetchAll();

        // Build lookup: date -> marketing_id -> count
        $lookup = [];
        foreach ($rows as $r) {
            $lookup[$r['date']][$r['marketing_id']] = (int)$r['count'];
        }

        // Generate all dates in range
        $result = [];
        $current = new DateTime($startDate);
        $end = new DateTime(date('Y-m-d'));
        while ($current <= $end) {
            $d = $current->format('Y-m-d');
            $entry = ['date' => $d, 'label' => $current->format('d M')];
            $total = 0;
            foreach ($marketingUsers as $m) {
                $count = $lookup[$d][$m['id']] ?? 0;
                $entry[$m['id']] = $count;
                $total += $count;
            }
            $entry['total'] = $total;
            $result[] = $entry;
            $current->modify('+1 day');
        }

        $marketingMeta = array_map(function($m) {
            return ['id' => $m['id'], 'name' => $m['name'], 'shortName' => explode(' ', $m['name'])[0]];
        }, $marketingUsers);

        echo json_encode([
            'data' => $result,
            'marketing' => $marketingMeta,
            'period' => $period,
            'startDate' => $startDate,
            'endDate' => date('Y-m-d')
        ]);
    }

    // === Monthly Activity Summary (per marketing, grouped by month) ===
    elseif ($type === 'monthly_activities') {
        $stmt = $db->query("SELECT id, name FROM users WHERE role = 'MARKETING' ORDER BY name");
        $marketingUsers = $stmt->fetchAll();

        // Last 6 months
        $startDate = date('Y-m-01', strtotime('-5 months'));

        $stmt = $db->prepare("
            SELECT DATE_FORMAT(date, '%Y-%m') as month, marketing_id, COUNT(*) as count
            FROM activities
            WHERE date >= ?
            GROUP BY month, marketing_id
            ORDER BY month ASC
        ");
        $stmt->execute([$startDate]);
        $rows = $stmt->fetchAll();

        $lookup = [];
        foreach ($rows as $r) {
            $lookup[$r['month']][$r['marketing_id']] = (int)$r['count'];
        }

        // Generate all months in range
        $result = [];
        $current = new DateTime($startDate);
        $end = new DateTime(date('Y-m-01'));
        while ($current <= $end) {
            $m = $current->format('Y-m');
            $entry = ['month' => $m, 'label' => $current->format('M Y')];
            $total = 0;
            foreach ($marketingUsers as $mu) {
                $count = $lookup[$m][$mu['id']] ?? 0;
                $entry[$mu['id']] = $count;
                $total += $count;
            }
            $entry['total'] = $total;
            $result[] = $entry;
            $current->modify('+1 month');
        }

        $marketingMeta = array_map(function($m) {
            return ['id' => $m['id'], 'name' => $m['name'], 'shortName' => explode(' ', $m['name'])[0]];
        }, $marketingUsers);

        echo json_encode([
            'data' => $result,
            'marketing' => $marketingMeta
        ]);
    }

    // === Daily EOD Report compliance ===
    elseif ($type === 'eod_compliance') {
        if ($period === 'week') {
            $startDate = date('Y-m-d', strtotime('-6 days'));
        } else {
            $startDate = date('Y-m-01');
        }

        $stmt = $db->query("SELECT id, name FROM users WHERE role = 'MARKETING' ORDER BY name");
        $marketingUsers = $stmt->fetchAll();
        $totalMarketing = count($marketingUsers);

        $stmt = $db->prepare("
            SELECT date, COUNT(DISTINCT marketing_id) as submitted
            FROM eod_reports
            WHERE date >= ?
            GROUP BY date
            ORDER BY date ASC
        ");
        $stmt->execute([$startDate]);
        $rows = $stmt->fetchAll();

        $lookup = [];
        foreach ($rows as $r) {
            $lookup[$r['date']] = (int)$r['submitted'];
        }

        $result = [];
        $current = new DateTime($startDate);
        $end = new DateTime(date('Y-m-d'));
        while ($current <= $end) {
            $d = $current->format('Y-m-d');
            $submitted = $lookup[$d] ?? 0;
            $result[] = [
                'date' => $d,
                'label' => $current->format('d M'),
                'submitted' => $submitted,
                'missing' => $totalMarketing - $submitted,
                'rate' => $totalMarketing > 0 ? round(($submitted / $totalMarketing) * 100) : 0
            ];
            $current->modify('+1 day');
        }

        echo json_encode([
            'data' => $result,
            'totalMarketing' => $totalMarketing,
            'period' => $period
        ]);
    }

    else {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid type. Use: daily_activities, monthly_activities, eod_compliance']);
    }

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
