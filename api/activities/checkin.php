<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

$auth = requireAuth();
$db = getDB();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit();
}

// Validate required fields
$latitude = $_POST['latitude'] ?? '';
$longitude = $_POST['longitude'] ?? '';
$clientId = $_POST['client_id'] ?? null;
$description = $_POST['description'] ?? 'Check-in lapangan';

if (empty($latitude) || empty($longitude)) {
    http_response_code(400);
    echo json_encode(['error' => 'Latitude and longitude are required']);
    exit();
}

// Handle photo upload
$proofUrl = null;
if (isset($_FILES['photo']) && $_FILES['photo']['error'] === UPLOAD_ERR_OK) {
    $file = $_FILES['photo'];

    // Validate file type
    $allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mimeType = finfo_file($finfo, $file['tmp_name']);
    finfo_close($finfo);

    if (!in_array($mimeType, $allowedTypes)) {
        http_response_code(400);
        echo json_encode(['error' => 'Only JPEG and PNG images are allowed']);
        exit();
    }

    // Validate file size (max 5MB)
    if ($file['size'] > 5 * 1024 * 1024) {
        http_response_code(400);
        echo json_encode(['error' => 'File size must be under 5MB']);
        exit();
    }

    // Generate unique filename
    $ext = $mimeType === 'image/png' ? 'png' : 'jpg';
    $filename = $auth['id'] . '_' . time() . '_' . uniqid() . '.' . $ext;
    $uploadDir = __DIR__ . '/../../uploads/checkins/';

    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0777, true);
    }

    if (move_uploaded_file($file['tmp_name'], $uploadDir . $filename)) {
        $proofUrl = '/uploads/checkins/' . $filename;
    } else {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to save uploaded file']);
        exit();
    }
}

try {
    $id = generateUUID();
    $location = "$latitude, $longitude";
    $now = date('H:i');

    $stmt = $db->prepare("
        INSERT INTO activities (id, date, marketing_id, type, client_id, description, start_time, end_time, location, proof_url, status)
        VALUES (?, CURDATE(), ?, 'VISIT', ?, ?, ?, ?, ?, ?, 'DONE')
    ");
    $stmt->execute([
        $id,
        $auth['id'],
        $clientId ?: null,
        $description,
        $now,
        $now,
        $location,
        $proofUrl,
    ]);

    // Return created activity
    $stmt = $db->prepare("SELECT * FROM activities WHERE id = ?");
    $stmt->execute([$id]);
    $a = $stmt->fetch();

    echo json_encode([
        'id' => $a['id'],
        'date' => $a['date'],
        'marketingId' => $a['marketing_id'],
        'type' => $a['type'],
        'clientId' => $a['client_id'],
        'description' => $a['description'],
        'startTime' => substr($a['start_time'], 0, 5),
        'endTime' => substr($a['end_time'], 0, 5),
        'location' => $a['location'],
        'proofUrl' => $a['proof_url'],
        'status' => $a['status']
    ]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
