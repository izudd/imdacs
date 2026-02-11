<?php
require_once __DIR__ . '/config/cors.php';
require_once __DIR__ . '/config/database.php';

$auth = requireAuth();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit();
}

if (!isset($_FILES['photo']) || $_FILES['photo']['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode(['error' => 'No file uploaded or upload error']);
    exit();
}

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
$uploadDir = __DIR__ . '/../uploads/proofs/';

if (!is_dir($uploadDir)) {
    mkdir($uploadDir, 0777, true);
}

if (move_uploaded_file($file['tmp_name'], $uploadDir . $filename)) {
    echo json_encode(['url' => '/uploads/proofs/' . $filename]);
} else {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to save file']);
}
