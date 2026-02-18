<?php
require_once __DIR__ . '/config/cors.php';
require_once __DIR__ . '/config/database.php';

$auth = requireAuth();
$method = $_SERVER['REQUEST_METHOD'];

// Only AUDITOR and MANAGER can send notifications
if (!in_array($auth['role'], ['AUDITOR', 'MANAGER'])) {
    http_response_code(403);
    echo json_encode(['error' => 'Access denied']);
    exit();
}

// Load env config
$envFile = __DIR__ . '/../.env.php';
$env = file_exists($envFile) ? require $envFile : [];

if ($method !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit();
}

$data = getJsonInput();
$assignee = $data['assignee'] ?? '';
$clientName = $data['clientName'] ?? '';
$clientIndustry = $data['clientIndustry'] ?? '';
$clientPic = $data['clientPic'] ?? '';
$clientDpp = $data['clientDpp'] ?? 0;
$clientDpPaid = $data['clientDpPaid'] ?? 0;
$clientStatus = $data['clientStatus'] ?? '';
$marketingName = $data['marketingName'] ?? '';

if (empty($assignee) || empty($clientName)) {
    http_response_code(400);
    echo json_encode(['error' => 'assignee and clientName are required']);
    exit();
}

$results = ['wa' => null, 'email' => null];

// ============ FORMAT MESSAGE ============
$dppFormatted = 'Rp ' . number_format($clientDpp, 0, ',', '.');
$dpFormatted = 'Rp ' . number_format($clientDpPaid, 0, ',', '.');

$waMessage = "📋 *IMDACS - Penugasan Klien Baru*\n\n"
    . "Halo *{$assignee}*,\n\n"
    . "Kamu telah ditugaskan untuk menangani klien berikut:\n\n"
    . "🏢 *{$clientName}*\n"
    . "📂 Industri: {$clientIndustry}\n"
    . "👤 PIC: {$clientPic}\n"
    . "📊 Status: {$clientStatus}\n"
    . "💰 DPP: {$dppFormatted}\n"
    . "💵 DP Dibayar: {$dpFormatted}\n"
    . "📌 Marketing: {$marketingName}\n\n"
    . "Silakan cek dashboard IMDACS untuk detail lengkap dan checklist audit.\n\n"
    . "Terima kasih! 🙏";

$emailSubject = "IMDACS - Penugasan Klien Baru: {$clientName}";
$emailBody = "
<html>
<body style='font-family: Inter, Arial, sans-serif; background: #f8fafc; padding: 20px;'>
<div style='max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);'>
    <div style='background: linear-gradient(135deg, #4f46e5, #6366f1); padding: 24px 32px;'>
        <h1 style='color: white; margin: 0; font-size: 20px;'>📋 Penugasan Klien Baru</h1>
        <p style='color: rgba(255,255,255,0.8); margin: 4px 0 0; font-size: 14px;'>IMDACS - Marketing System</p>
    </div>
    <div style='padding: 32px;'>
        <p style='color: #334155; font-size: 15px; margin-bottom: 20px;'>
            Halo <strong>{$assignee}</strong>,<br><br>
            Kamu telah ditugaskan untuk menangani klien berikut:
        </p>
        <div style='background: #f1f5f9; border-radius: 12px; padding: 20px; margin-bottom: 20px;'>
            <h2 style='color: #1e293b; margin: 0 0 12px; font-size: 18px;'>🏢 {$clientName}</h2>
            <table style='width: 100%; border-collapse: collapse;'>
                <tr><td style='padding: 6px 0; color: #64748b; font-size: 13px; width: 120px;'>Industri</td><td style='padding: 6px 0; color: #1e293b; font-size: 13px; font-weight: 600;'>{$clientIndustry}</td></tr>
                <tr><td style='padding: 6px 0; color: #64748b; font-size: 13px;'>PIC</td><td style='padding: 6px 0; color: #1e293b; font-size: 13px; font-weight: 600;'>{$clientPic}</td></tr>
                <tr><td style='padding: 6px 0; color: #64748b; font-size: 13px;'>Status</td><td style='padding: 6px 0; color: #1e293b; font-size: 13px; font-weight: 600;'>{$clientStatus}</td></tr>
                <tr><td style='padding: 6px 0; color: #64748b; font-size: 13px;'>DPP</td><td style='padding: 6px 0; color: #1e293b; font-size: 13px; font-weight: 600;'>{$dppFormatted}</td></tr>
                <tr><td style='padding: 6px 0; color: #64748b; font-size: 13px;'>DP Dibayar</td><td style='padding: 6px 0; color: #059669; font-size: 13px; font-weight: 600;'>{$dpFormatted}</td></tr>
                <tr><td style='padding: 6px 0; color: #64748b; font-size: 13px;'>Marketing</td><td style='padding: 6px 0; color: #1e293b; font-size: 13px; font-weight: 600;'>{$marketingName}</td></tr>
            </table>
        </div>
        <p style='color: #64748b; font-size: 13px;'>
            Silakan cek dashboard IMDACS untuk detail lengkap dan checklist audit.
        </p>
    </div>
    <div style='background: #f8fafc; padding: 16px 32px; text-align: center; border-top: 1px solid #e2e8f0;'>
        <p style='color: #94a3b8; font-size: 12px; margin: 0;'>IMDACS - Internal Marketing Daily Activity & Client Progress System</p>
    </div>
</div>
</body>
</html>";

// ============ SEND WHATSAPP VIA FONNTE ============
$fonntToken = $env['FONNTE_TOKEN'] ?? '';
$waNumbers = [
    'Weni' => $env['WA_WENI'] ?? '',
    'Latifah' => $env['WA_LATIFAH'] ?? '',
    'Nando' => $env['WA_NANDO'] ?? '',
];

$targetWa = $waNumbers[$assignee] ?? '';

if (!empty($fonntToken) && !empty($targetWa)) {
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => 'https://api.fonnte.com/send',
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => [
            'Authorization: ' . $fonntToken,
        ],
        CURLOPT_POSTFIELDS => [
            'target' => $targetWa,
            'message' => $waMessage,
            'countryCode' => '62',
        ],
    ]);
    $waResponse = curl_exec($ch);
    $waHttpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $results['wa'] = [
        'sent' => $waHttpCode === 200,
        'target' => $targetWa,
        'response' => json_decode($waResponse, true),
    ];
} else {
    $results['wa'] = [
        'sent' => false,
        'reason' => empty($fonntToken) ? 'FONNTE_TOKEN not configured' : 'No WA number for ' . $assignee,
    ];
}

// ============ SEND EMAIL VIA SMTP ============
$smtpHost = $env['SMTP_HOST'] ?? '';
$smtpPort = (int)($env['SMTP_PORT'] ?? 465);
$smtpUser = $env['SMTP_USER'] ?? '';
$smtpPass = $env['SMTP_PASS'] ?? '';
$smtpFromName = $env['SMTP_FROM_NAME'] ?? 'IMDACS System';

$emailAddresses = [
    'Weni' => $env['EMAIL_WENI'] ?? '',
    'Latifah' => $env['EMAIL_LATIFAH'] ?? '',
    'Nando' => $env['EMAIL_NANDO'] ?? '',
];

$targetEmail = $emailAddresses[$assignee] ?? '';

if (!empty($smtpHost) && !empty($smtpUser) && !empty($smtpPass) && !empty($targetEmail)) {
    // Use PHP's built-in mail with SMTP socket for Hostinger
    // Hostinger supports mail() function directly
    $headers = "MIME-Version: 1.0\r\n";
    $headers .= "Content-type: text/html; charset=UTF-8\r\n";
    $headers .= "From: {$smtpFromName} <{$smtpUser}>\r\n";
    $headers .= "Reply-To: {$smtpUser}\r\n";
    $headers .= "X-Mailer: IMDACS/1.0\r\n";

    $emailSent = @mail($targetEmail, $emailSubject, $emailBody, $headers);

    $results['email'] = [
        'sent' => $emailSent,
        'target' => $targetEmail,
    ];
} else {
    $results['email'] = [
        'sent' => false,
        'reason' => empty($smtpHost) ? 'SMTP not configured' : (empty($targetEmail) ? 'No email for ' . $assignee : 'SMTP credentials missing'),
    ];
}

echo json_encode([
    'success' => true,
    'notifications' => $results,
]);
