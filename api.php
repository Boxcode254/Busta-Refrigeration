<?php
// Compatible with PHP 7.1

// Bootstrap Composer autoload and environment variables (.env via vlucas/phpdotenv)
$_bustaAutoload = __DIR__ . '/vendor/autoload.php';
if (is_file($_bustaAutoload)) {
    require_once $_bustaAutoload;
}
if (class_exists('Dotenv\Dotenv')) {
    Dotenv\Dotenv::createImmutable(__DIR__)->safeLoad();
}
unset($_bustaAutoload);

// Parse the URL part to be proxied
$url = str_replace('/' . basename(__FILE__), '', $_SERVER['REQUEST_URI']);
$requestMethod = $_SERVER['REQUEST_METHOD'];
$host = $_SERVER['HTTP_HOST'];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$contentType = '';

$response = '';

const DEFAULT_DESTINATION_EMAIL = 'rpbucrur@bustarefrigeration.co.ke';
const CSRF_SESSION_KEY = 'form_csrf_token';
const MAX_UPLOAD_SIZE_BYTES = 5242880; // 5 MB

const ATTRIBUTE_CAPTCHA_TYPE = 127;
const ATTRIBUTE_CAPTCHA_TURNSTILE_SECRET = 130;

const ALLOWED_UPLOAD_MIME_BY_EXTENSION = [
    'pdf' => ['application/pdf'],
    'doc' => ['application/msword', 'application/vnd.ms-office'],
    'docx' => ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    'xls' => ['application/vnd.ms-excel', 'application/vnd.ms-office'],
    'xlsx' => ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    'csv' => ['text/csv', 'text/plain', 'application/csv', 'application/vnd.ms-excel'],
    'txt' => ['text/plain'],
    'jpg' => ['image/jpeg'],
    'jpeg' => ['image/jpeg'],
    'png' => ['image/png'],
    'webp' => ['image/webp']
];

function ensureSessionStarted(): void
{
    if (session_status() === PHP_SESSION_ACTIVE || headers_sent()) {
        return;
    }

    $isSecure = !empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off';
    $cookieParams = session_get_cookie_params();
    $cookiePath = isset($cookieParams['path']) ? (string)$cookieParams['path'] : '/';

    if (stripos($cookiePath, 'samesite') === false) {
        $cookiePath .= '; samesite=Lax';
    }

    session_set_cookie_params(
        0,
        $cookiePath,
        isset($cookieParams['domain']) ? (string)$cookieParams['domain'] : '',
        $isSecure,
        true
    );

    session_start();
}

function getCsrfToken(): ?string
{
    ensureSessionStarted();

    if (session_status() !== PHP_SESSION_ACTIVE) {
        return null;
    }

    if (empty($_SESSION[CSRF_SESSION_KEY]) || !is_string($_SESSION[CSRF_SESSION_KEY])) {
        try {
            $_SESSION[CSRF_SESSION_KEY] = bin2hex(random_bytes(32));
        } catch (Exception $e) {
            error_log('[api.php] Failed to generate CSRF token: ' . $e->getMessage());
            return null;
        }
    }

    return $_SESSION[CSRF_SESSION_KEY];
}

function validateCsrfToken(?string $submittedToken): bool
{
    ensureSessionStarted();

    if (
        session_status() !== PHP_SESSION_ACTIVE ||
        !isset($_SESSION[CSRF_SESSION_KEY]) ||
        !is_string($_SESSION[CSRF_SESSION_KEY]) ||
        !is_string($submittedToken) ||
        $submittedToken === ''
    ) {
        return false;
    }

    return hash_equals($_SESSION[CSRF_SESSION_KEY], $submittedToken);
}

function handleCsrfTokenRequest(): array
{
    $token = getCsrfToken();

    if (!$token) {
        return ['Could not initialize CSRF token', ['http_code' => 500, 'content_type' => 'text/plain; charset=utf-8']];
    }

    return [
        json_encode(['token' => $token]),
        [
            'http_code' => 200,
            'content_type' => 'application/json; charset=utf-8',
            'cache_control' => 'no-store, no-cache, must-revalidate, max-age=0',
            'pragma' => 'no-cache'
        ]
    ];
}

function sanitizeHeaderValue($value): string
{
    $value = trim((string)$value);
    return str_replace(["\r", "\n", "\0"], '', $value);
}

function sanitizeEmailAddress($value): ?string
{
    $headerSafeValue = sanitizeHeaderValue($value);
    if ($headerSafeValue === '') {
        return null;
    }

    $sanitized = filter_var($headerSafeValue, FILTER_SANITIZE_EMAIL);
    if (!$sanitized || filter_var($sanitized, FILTER_VALIDATE_EMAIL) === false) {
        return null;
    }

    return $sanitized;
}

function sanitizeTextValue($value): string
{
    if (is_array($value)) {
        $value = implode(',', $value);
    }

    $value = trim((string)$value);
    return filter_var($value, FILTER_UNSAFE_RAW, FILTER_FLAG_STRIP_LOW);
}

function escapeHtml($value): string
{
    return htmlspecialchars((string)$value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function sanitizeAttachmentFileName($fileName): string
{
    $fileName = basename((string)$fileName);
    $fileName = str_replace(["\r", "\n", "\0"], '', $fileName);
    $fileName = preg_replace('/[^A-Za-z0-9._-]/', '_', $fileName);
    $fileName = trim((string)$fileName, '._');

    return $fileName !== '' ? $fileName : 'attachment.bin';
}

function sanitizeContentType($contentType): string
{
    $contentType = trim((string)$contentType);

    if (!preg_match('/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i', $contentType)) {
        return 'application/octet-stream';
    }

    return strtolower($contentType);
}

function ensurePhpMailerLoaded(): bool
{
    if (class_exists('\\PHPMailer\\PHPMailer\\PHPMailer')) {
        return true;
    }

    $autoloadPath = __DIR__ . '/vendor/autoload.php';
    if (is_file($autoloadPath)) {
        require_once $autoloadPath;
    }

    if (class_exists('\\PHPMailer\\PHPMailer\\PHPMailer')) {
        return true;
    }

    $manualIncludeBase = __DIR__ . '/PHPMailer/src/';
    $exceptionPath = $manualIncludeBase . 'Exception.php';
    $phpMailerPath = $manualIncludeBase . 'PHPMailer.php';
    $smtpPath = $manualIncludeBase . 'SMTP.php';

    if (is_file($exceptionPath) && is_file($phpMailerPath) && is_file($smtpPath)) {
        require_once $exceptionPath;
        require_once $phpMailerPath;
        require_once $smtpPath;
    }

    return class_exists('\\PHPMailer\\PHPMailer\\PHPMailer');
}

function validateUploadedAttachment(array $formFiles, string $fieldName): array
{
    $uploadError = $formFiles['error'][$fieldName] ?? UPLOAD_ERR_NO_FILE;

    if ($uploadError === UPLOAD_ERR_NO_FILE) {
        return ['ok' => false, 'error_code' => 'no_file', 'error' => ''];
    }

    if ($uploadError !== UPLOAD_ERR_OK) {
        return ['ok' => false, 'error_code' => 'upload_error', 'error' => 'File upload failed.'];
    }

    $tmpFile = $formFiles['tmp_name'][$fieldName] ?? '';
    if (!is_string($tmpFile) || $tmpFile === '' || !is_uploaded_file($tmpFile) || !file_exists($tmpFile)) {
        return ['ok' => false, 'error_code' => 'invalid_upload', 'error' => 'Invalid uploaded file.'];
    }

    $fileSize = (int)($formFiles['size'][$fieldName] ?? filesize($tmpFile));
    if ($fileSize <= 0 || $fileSize > MAX_UPLOAD_SIZE_BYTES) {
        return ['ok' => false, 'error_code' => 'size', 'error' => 'Uploaded file exceeds the 5 MB limit or is empty.'];
    }

    $safeName = sanitizeAttachmentFileName($formFiles['name'][$fieldName] ?? 'attachment.bin');
    $extension = strtolower(pathinfo($safeName, PATHINFO_EXTENSION));

    if ($extension === '' || !isset(ALLOWED_UPLOAD_MIME_BY_EXTENSION[$extension])) {
        return ['ok' => false, 'error_code' => 'extension', 'error' => 'File type is not allowed.'];
    }

    $detectedMimeType = '';
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    if ($finfo !== false) {
        $detectedMimeType = (string)finfo_file($finfo, $tmpFile);
        finfo_close($finfo);
    }

    $detectedMimeType = sanitizeContentType($detectedMimeType);
    if (!in_array($detectedMimeType, ALLOWED_UPLOAD_MIME_BY_EXTENSION[$extension], true)) {
        return ['ok' => false, 'error_code' => 'mime', 'error' => 'Uploaded file MIME type is not allowed.'];
    }

    return [
        'ok' => true,
        'error_code' => '',
        'error' => '',
        'name' => $safeName,
        'type' => $detectedMimeType,
        'tempFile' => $tmpFile,
        'size' => $fileSize
    ];
}

/**
 * Create a PHPMailer instance pre-configured for SMTP via environment variables.
 */
function createSmtpMailer(): \PHPMailer\PHPMailer\PHPMailer
{
    $mail = new \PHPMailer\PHPMailer\PHPMailer(true);
    $mail->CharSet  = 'UTF-8';
    $mail->Encoding = 'base64';
    $mail->isSMTP();
    $mail->Host       = $_ENV['MAIL_HOST'] ?? 'localhost';
    $mail->SMTPAuth   = true;
    $mail->Username   = $_ENV['MAIL_USERNAME'] ?? '';
    $mail->Password   = $_ENV['MAIL_PASSWORD'] ?? '';
    $mail->SMTPSecure = (($_ENV['MAIL_ENCRYPTION'] ?? 'tls') === 'ssl')
        ? \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS
        : \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
    $mail->Port = (int)($_ENV['MAIL_PORT'] ?? 587);
    $mail->setFrom(
        $_ENV['MAIL_FROM_ADDRESS'] ?? 'noreply@bustarefrigeration.co.ke',
        $_ENV['MAIL_FROM_NAME']    ?? 'Busta Refrigeration'
    );
    return $mail;
}

/**
 * Build a branded HTML auto-reply email for the visitor.
 */
function buildAutoReplyHtml(string $visitorName, array $formConfig): string
{
    $name = $visitorName !== '' ? escapeHtml($visitorName) : 'there';
    return <<<HTML
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Enquiry Received</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;">
        <tr>
          <td style="background:#101316;padding:28px 32px;text-align:center;">
            <h1 style="margin:0;color:#fbbe1a;font-size:22px;font-weight:700;letter-spacing:1px;">BUSTA REFRIGERATION SOLUTIONS</h1>
            <p style="margin:6px 0 0;color:#aaaaaa;font-size:13px;">Nairobi, Kenya</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 32px;">
            <h2 style="margin:0 0 16px;color:#101316;font-size:18px;">Hi {$name},</h2>
            <p style="margin:0 0 14px;color:#333333;font-size:15px;line-height:1.6;">
              Thank you for contacting <strong>Busta Refrigeration Solutions</strong>. We have received your enquiry and a member of our team will get back to you <strong>within 24 hours</strong>.
            </p>
            <p style="margin:0 0 24px;color:#333333;font-size:15px;line-height:1.6;">
              If your matter is urgent, please reach us directly:
            </p>
            <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr>
                <td style="padding:8px 16px 8px 0;color:#555555;font-size:14px;">&#128222; Phone</td>
                <td style="padding:8px 0;"><a href="tel:+254722340818" style="color:#101316;font-weight:700;text-decoration:none;">+254 722 340 818</a></td>
              </tr>
              <tr>
                <td style="padding:8px 16px 8px 0;color:#555555;font-size:14px;">&#128242; WhatsApp</td>
                <td style="padding:8px 0;"><a href="https://wa.me/254722340818" style="color:#25D366;font-weight:700;text-decoration:none;">Chat on WhatsApp</a></td>
              </tr>
              <tr>
                <td style="padding:8px 16px 8px 0;color:#555555;font-size:14px;">&#128336; Office Hours</td>
                <td style="padding:8px 0;color:#333333;font-size:14px;">Mon – Sat, 8:00 AM – 6:00 PM EAT</td>
              </tr>
            </table>
            <p style="margin:0;color:#888888;font-size:13px;">Please do not reply directly to this email — it is sent from an unmonitored address.</p>
          </td>
        </tr>
        <tr>
          <td style="background:#101316;padding:20px 32px;text-align:center;">
            <p style="margin:0;color:#aaaaaa;font-size:12px;">Busta Refrigeration Solutions &nbsp;|&nbsp; Nairobi, Kenya</p>
            <p style="margin:6px 0 0;color:#555555;font-size:11px;">You are receiving this because you submitted an enquiry on bustarefrigeration.co.ke</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
HTML;
}

function sendFormSummaryByEmail(array $formConfig, array $data, array $attachments)
{
    $formId = $formConfig['id'];

    $destinationEmail = sanitizeEmailAddress($formConfig['form']['emailTo'] ?? '');
    if (!$destinationEmail) {
        $destinationEmail = DEFAULT_DESTINATION_EMAIL;
    }

    $senderEmail = sanitizeEmailAddress($formConfig['form']['emailFrom'] ?? '');
    $replyToEmail = null;
    $subject = sanitizeHeaderValue($formConfig['form']['emailSubject'] ?? 'Form submission');
    $textHeader = sanitizeTextValue($formConfig['form']['emailText'] ?? '');
    $htmlSummary = '';

    $formData = isset($_POST['form_' . $formId]) && is_array($_POST['form_' . $formId])
        ? $_POST['form_' . $formId]
        : [];

    $formFieldsConfig = isset($formConfig['children']) && is_array($formConfig['children'])
        ? $formConfig['children']
        : [];

    foreach ($formFieldsConfig as $formFieldConfig) {
        $formItemConfig = $formFieldConfig['formItem'] ?? null;
        $formFieldName = sprintf('ed-f-%d', $formFieldConfig['id']);

        if (
            $formItemConfig &&
            ($formItemConfig['type'] ?? '') === 'email' &&
            isset($formData[$formFieldName])
        ) {
            $replyCandidate = sanitizeEmailAddress($formData[$formFieldName]);
            if ($replyCandidate) {
                $replyToEmail = $replyCandidate;
                break;
            }
        }
    }

    foreach ($data as $label => $value) {
        if (is_array($value)) {
            $value = implode(',', array_map('sanitizeTextValue', $value));
        } else {
            $value = sanitizeTextValue($value);
        }

        if (strpos((string)$label, 'ed-f') === 0) {
            $label = '';
        }

        $htmlSummary .= sprintf(
            '<strong>%s</strong><br />%s<br /><br />',
            escapeHtml(sanitizeTextValue($label)),
            nl2br(escapeHtml($value))
        );
    }

    foreach ($attachments as $label => $attachment) {
        if (strpos((string)$label, 'ed-f') === 0) {
            $label = '';
        }

        $attachmentName = sanitizeAttachmentFileName($attachment['name'] ?? 'attachment.bin');
        $htmlSummary .= sprintf(
            '<strong>%s</strong><br />%s<br /><br />',
            escapeHtml(sanitizeTextValue($label)),
            escapeHtml($attachmentName)
        );
    }

    $mailBody = sprintf(
        '<html><body>%s<br/><br/>%s</body></html>',
        nl2br(escapeHtml($textHeader)),
        $htmlSummary
    );

    if (!empty($formConfig['form']['sendCsv'])) {
        $attachments[] = [
            'type' => 'text/csv',
            'name' => 'form-data.csv',
            'data' => createCsvData($data)
        ];
    }

    // Dev-mode fallback: when MAIL_HOST is not configured, skip sending silently
    if (empty($_ENV['MAIL_HOST'])) {
        error_log('[BustaForms] MAIL_HOST not set — skipping email send in dev mode');
        return true;
    }

    if (!ensurePhpMailerLoaded()) {
        error_log('[api.php] PHPMailer is not available. Install phpmailer/phpmailer and ensure autoload is present.');
        return false;
    }

    try {
        $mailer = createSmtpMailer();
        $mailer->isHTML(true);
        $mailer->addAddress($_ENV['MAIL_TO_ADDRESS'] ?? $destinationEmail);

        if ($replyToEmail) {
            $mailer->addReplyTo($replyToEmail);
        }

        $mailer->Subject = $subject !== '' ? $subject : 'Form submission';
        $mailer->Body    = $mailBody;
        $mailer->AltBody = trim(strip_tags(str_replace(['<br/>', '<br />'], PHP_EOL, $mailBody)));

        foreach ($attachments as $attachment) {
            $fileType = sanitizeContentType($attachment['type'] ?? 'application/octet-stream');
            $fileName = sanitizeAttachmentFileName($attachment['name'] ?? 'attachment.bin');

            if (isset($attachment['data'])) {
                $mailer->addStringAttachment(
                    (string)$attachment['data'],
                    $fileName,
                    \PHPMailer\PHPMailer\PHPMailer::ENCODING_BASE64,
                    $fileType
                );
                continue;
            }

            if (isset($attachment['tempFile']) && is_readable($attachment['tempFile'])) {
                $mailer->addAttachment(
                    $attachment['tempFile'],
                    $fileName,
                    \PHPMailer\PHPMailer\PHPMailer::ENCODING_BASE64,
                    $fileType
                );
            }
        }

        $result = $mailer->send();

        // Visitor auto-reply — non-fatal: failure here must never block the main flow
        if ($result && $replyToEmail) {
            try {
                $visitorName = '';
                foreach ($data as $label => $value) {
                    if (stripos((string)$label, 'name') !== false && is_string($value) && $value !== '') {
                        $visitorName = sanitizeTextValue($value);
                        break;
                    }
                }

                $autoReply = createSmtpMailer();
                $autoReply->isHTML(true);
                $autoReply->addAddress($replyToEmail);
                $autoReply->Subject = 'We received your enquiry — Busta Refrigeration';
                $autoReply->Body    = buildAutoReplyHtml($visitorName, $formConfig);
                $autoReply->AltBody = "Hi {$visitorName},\n\nThank you for contacting Busta Refrigeration Solutions. We received your enquiry and will respond within 24 hours.\n\nPhone: +254 722 340 818\nWhatsApp: https://wa.me/254722340818\nOffice Hours: Mon - Sat, 8:00 AM - 6:00 PM EAT\n\nBusta Refrigeration Solutions | Nairobi, Kenya";
                $autoReply->send();
            } catch (\Exception $e) {
                error_log('[api.php] Auto-reply failed (non-fatal): ' . $e->getMessage());
            }
        }

        return $result;
    } catch (\Exception $e) {
        error_log('[api.php] Failed to send form email via PHPMailer: ' . $e->getMessage());
    }

    return false;
}

function createCsvData(array $data): string
{
    $headers = [];
    $values = [];
    $delimiter = ';';
    $enclosure = '"';

    foreach ($data as $label => $value) {
        $safeLabel = sanitizeTextValue($label);
        $safeValue = sanitizeTextValue(is_array($value) ? implode(',', $value) : $value);

        $headers[] = str_replace($enclosure, '\\' . $enclosure, $safeLabel);
        $values[] = str_replace($enclosure, '\\' . $enclosure, $safeValue);
    }

    return $enclosure . implode(
            $enclosure . $delimiter . $enclosure,
            $headers
        ) . $enclosure . "\n" . $enclosure . implode(
            $enclosure . $delimiter . $enclosure,
            $values
        ) . $enclosure;
}

function getFormData($formId, $formFieldsConfig): array
{
    $data = [];
    $attachments = [];

    $formData = isset($_POST['form_' . $formId]) && is_array($_POST['form_' . $formId])
        ? $_POST['form_' . $formId]
        : [];

    $formFiles = isset($_FILES['form_' . $formId]) && is_array($_FILES['form_' . $formId])
        ? $_FILES['form_' . $formId]
        : [];

    foreach ($formFieldsConfig as $formFieldConfig) {
        $formItemConfig = $formFieldConfig['formItem'] ?? null;
        $type = $formItemConfig['type'] ?? '';

        if (!$formItemConfig || in_array($type, ['captcha', 'button'], true)) {
            continue;
        }

        $formFieldName = sprintf('ed-f-%d', $formFieldConfig['id']);
        $placeholder = null;
        $label = null;
        $multiple = false;

        $attributes = isset($formItemConfig['values']) && is_array($formItemConfig['values'])
            ? $formItemConfig['values']
            : [];

        foreach ($attributes as $attributeValue) {
            if (($attributeValue['attribute'] ?? null) == 14) { // placeholder
                $placeholder = sanitizeTextValue($attributeValue['value'] ?? '');
            }
            if (($attributeValue['attribute'] ?? null) == 2) { // label
                $label = sanitizeTextValue($attributeValue['value'] ?? '');
            }
            if (($attributeValue['attribute'] ?? null) == 29) { // select-multiple
                $multiple = (bool)($attributeValue['value'] ?? false);
            }
        }

        if (!$label) {
            $label = $placeholder ?: $formFieldName;
        }

        if ($type === 'upload') {
            $validation = validateUploadedAttachment($formFiles, $formFieldName);
            if (!$validation['ok']) {
                if ($validation['error_code'] !== 'no_file') {
                    throw new RuntimeException($validation['error']);
                }
                continue;
            }

            $attachments[$label] = [
                'name' => $validation['name'],
                'type' => $validation['type'],
                'tempFile' => $validation['tempFile']
            ];
            continue;
        }

        if ($type === 'checkbox') {
            $submittedData = isset($formData[$formFieldName]) && is_array($formData[$formFieldName])
                ? array_diff($formData[$formFieldName], [''])
                : [];

            $choices = isset($formItemConfig['choices']) && is_array($formItemConfig['choices'])
                ? $formItemConfig['choices']
                : [];

            $data[$label] = [];
            foreach ($submittedData as $itemSortOrder) {
                foreach ($choices as $selectChoice) {
                    if ((string)$itemSortOrder === (string)($selectChoice['sort'] ?? '')) {
                        $data[$label][$itemSortOrder] = sanitizeTextValue($selectChoice['value'] ?? '');
                    }
                }
            }

            $data[$label] = implode(',', $data[$label]);
            continue;
        }

        if ($type === 'radio') {
            $choices = isset($formItemConfig['choices']) && is_array($formItemConfig['choices'])
                ? $formItemConfig['choices']
                : [];

            foreach ($choices as $selectChoice) {
                if (($formData[$formFieldName] ?? null) == ($selectChoice['sort'] ?? null)) {
                    $data[$label] = sanitizeTextValue($selectChoice['value'] ?? '');
                    break;
                }
            }
            continue;
        }

        if ($type === 'select') {
            $choices = isset($formItemConfig['choices']) && is_array($formItemConfig['choices'])
                ? $formItemConfig['choices']
                : [];

            if ($multiple) {
                $submittedData = isset($formData[$formFieldName]) && is_array($formData[$formFieldName])
                    ? array_diff($formData[$formFieldName], [''])
                    : [];

                $data[$label] = [];
                foreach ($submittedData as $itemSortOrder) {
                    foreach ($choices as $selectChoice) {
                        if ((string)$itemSortOrder === (string)($selectChoice['sort'] ?? '')) {
                            $data[$label][$itemSortOrder] = sanitizeTextValue($selectChoice['value'] ?? '');
                        }
                    }
                }
                $data[$label] = implode(',', $data[$label]);
            } else {
                $submittedData = $formData[$formFieldName] ?? null;
                $data[$label] = '';
                foreach ($choices as $selectChoice) {
                    if ((string)$submittedData === (string)($selectChoice['sort'] ?? '')) {
                        $data[$label] = sanitizeTextValue($selectChoice['value'] ?? '');
                        break;
                    }
                }
            }
            continue;
        }

        if (isset($formData[$formFieldName])) {
            $data[$label] = sanitizeTextValue($formData[$formFieldName]);
        }
    }

    return [$data, $attachments];
}

function handleFormSubmission()
{
    $apiHost = 'https://api.sitehub.io';
    $httpCode = 400;
    $isValid = false;
    $response = false;

    if (!validateCsrfToken(isset($_POST['csrf_token']) ? (string)$_POST['csrf_token'] : null)) {
        return ['Invalid CSRF token', ['http_code' => 403, 'content_type' => 'text/plain; charset=utf-8']];
    }

    if (isset($_POST['id'])) {
        $formId = filter_var($_POST['id'], FILTER_VALIDATE_INT);
        if (!$formId) {
            return ['Invalid form id', ['http_code' => 400, 'content_type' => 'text/plain; charset=utf-8']];
        }

        $json = curl(sprintf('%s/website/elements/%d', $apiHost, $formId));
        if (!$json) {
            return ['Could not fetch form configuration', ['http_code' => 502, 'content_type' => 'text/plain; charset=utf-8']];
        }

        $formConfig = json_decode($json, true);
        if (!is_array($formConfig) || empty($formConfig['form'])) {
            return ['Invalid form configuration', ['http_code' => 500, 'content_type' => 'text/plain; charset=utf-8']];
        }

        $sendMail = !empty($formConfig['form']['sendEmail']);
        $submittedFields = isset($_POST['form_' . $formId]) && is_array($_POST['form_' . $formId])
            ? $_POST['form_' . $formId]
            : [];

        foreach ($submittedFields as $fieldName => $fieldData) {
            $fieldId = str_replace('ed-f-', '', (string)$fieldName);
            $isTurnstileCaptcha = false;
            $turnstileCaptchaSecret = null;

            foreach (($formConfig['children'] ?? []) as $formFieldConfig) {
                if (($formFieldConfig['id'] ?? null) == $fieldId && ($formFieldConfig['type'] ?? '') == 'form-captcha') {
                    $formItemConfig = $formFieldConfig['formItem'] ?? [];
                    $attributes = isset($formItemConfig['values']) && is_array($formItemConfig['values'])
                        ? $formItemConfig['values']
                        : [];

                    foreach ($attributes as $attribute) {
                        if (($attribute['attribute'] ?? null) == ATTRIBUTE_CAPTCHA_TYPE) {
                            $isTurnstileCaptcha = ($attribute['value'] ?? '') === 'external';
                        } elseif (($attribute['attribute'] ?? null) == ATTRIBUTE_CAPTCHA_TURNSTILE_SECRET) {
                            $turnstileCaptchaSecret = $attribute['value'] ?? null;
                        }
                    }
                }
            }

            if (is_array($fieldData)) {
                if (isset($fieldData['hash']) && isset($fieldData['text'])) {
                    $clean = strtoupper(trim((string)$fieldData['text']));
                    $hashedText = hash('sha256', $clean);

                    if (!hash_equals((string)$fieldData['hash'], $hashedText)) {
                        $isValid = false;
                        $httpCode = 400;
                        $response = 'Wrong security code';
                        break;
                    }

                    $isValid = true;
                    $httpCode = 200;
                    $response = sprintf(
                        '<div class="wv-message wv-success">%s</div>',
                        $formConfig['form']['successMessage']
                    );
                }
            } elseif ($isTurnstileCaptcha) {
                $captchaResponse = (string)$fieldData;
                $data = http_build_query([
                    'secret' => $turnstileCaptchaSecret,
                    'response' => $captchaResponse
                ]);

                $ch = curl_init();
                curl_setopt($ch, CURLOPT_URL, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
                curl_setopt($ch, CURLOPT_POST, true);
                curl_setopt($ch, CURLOPT_POSTFIELDS, $data);
                curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                curl_setopt($ch, CURLOPT_TIMEOUT, 30);

                $result = curl_exec($ch);
                $httpCodeCaptcha = curl_getinfo($ch, CURLINFO_HTTP_CODE);
                curl_close($ch);

                if (!$result || $httpCodeCaptcha !== 200) {
                    $isValid = false;
                    $httpCode = 400;
                    $response = 'Could not validate captcha';
                    break;
                }

                $responseCaptcha = json_decode($result, true);
                if (empty($responseCaptcha['success'])) {
                    $isValid = false;
                    $httpCode = 400;
                    $response = 'Captcha validation failed';
                    if (!empty($responseCaptcha['error-codes']) && is_array($responseCaptcha['error-codes'])) {
                        $response .= ': ' . implode(', ', $responseCaptcha['error-codes']);
                    }
                    break;
                }

                $isValid = true;
                $httpCode = 200;
                $response = sprintf(
                    '<div class="wv-message wv-success">%s</div>',
                    $formConfig['form']['successMessage']
                );
            }
        }

        if ($isValid) {
            $formFieldsConfig = $formConfig['children'] ?? [];
            try {
                list($data, $attachments) = getFormData($formId, $formFieldsConfig);
            } catch (RuntimeException $e) {
                return [$e->getMessage(), ['http_code' => 400, 'content_type' => 'text/plain; charset=utf-8']];
            }

            if (!empty($formConfig['form']['webhookUrl'])) {
                pushWebhook($formConfig, $data, $attachments);
            }

            if (!empty($formConfig['form']['redirectTo']) && is_string($formConfig['form']['redirectTo'])) {
                $response = '<script type="text/javascript">window.setTimeout(function() { window.location.href=' . json_encode($formConfig['form']['redirectTo']) . '; }, 1000);</script>';
                $httpCode = 200;
            }

            if ($sendMail) {
                if (!sendFormSummaryByEmail($formConfig, $data, $attachments)) {
                    $response = 'Could not send e-mail';
                    $httpCode = 400;
                }
            }
        }
    }

    return [$response, ['http_code' => $httpCode]];
}

function pushWebhook($formConfig, array $data, array $attachments)
{
    $formId = $formConfig['id'];
    $formName = $formConfig['form']['name'];

    foreach ($attachments as $label => $fileData) {
        $fileBody = 'too_large';
        if (
            isset($fileData['tempFile']) &&
            is_readable($fileData['tempFile']) &&
            filesize($fileData['tempFile']) <= MAX_UPLOAD_SIZE_BYTES
        ) {
            $fileBody = base64_encode(file_get_contents($fileData['tempFile']));
        }

        $data[$label] = [
            'name' => sanitizeAttachmentFileName($fileData['name'] ?? ''),
            'type' => sanitizeContentType($fileData['type'] ?? ''),
            'body' => $fileBody
        ];
    }

    $payload = http_build_query([
        'data' => json_encode($data),
        'form_id' => $formId,
        'form_name' => $formName,
        'submitted_at' => date('r')
    ]);

    $ch = curl_init($formConfig['form']['webhookUrl']);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'POST');
    curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Length: ' . strlen($payload)]);

    curl_exec($ch);
    curl_close($ch);
}

function forwardToApi($url, $requestMethod, $postData = null)
{
    $apiHost = 'https://api.sitehub.io';
    $contentType = 'application/x-www-form-urlencoded';

    if (isset($_SERVER['CONTENT_TYPE'])) {
        $contentTypeParts = explode(';', $_SERVER['CONTENT_TYPE']);
        $contentType = trim((string)$contentTypeParts[0]);
    }

    $apiUrl = (strpos($url, '/images') === 0 ? 'https://inter-cdn.com' : $apiHost) . $url;

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $apiUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);

    if ($requestMethod == 'POST') {
        $postData = $postData ?: $_POST;
        curl_setopt($ch, CURLOPT_POST, true);

        switch ($contentType) {
            case 'application/json':
                curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json; charset=UTF-8']);
                curl_setopt($ch, CURLOPT_POSTFIELDS, file_get_contents('php://input'));
                break;
            case 'multipart/form-data':
                curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
                break;
            default:
                curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($postData));
                break;
        }
    }

    $response = curl_exec($ch);
    $headers = curl_getinfo($ch);
    curl_close($ch);

    return [$response, $headers];
}

function curl($url)
{
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    $return = curl_exec($ch);
    curl_close($ch);
    return $return;
}

if ($requestMethod == 'GET' && strpos($url, '/form_container/csrf') !== false) {
    list($response, $headers) = handleCsrfTokenRequest();
} elseif ($requestMethod == 'POST' && strpos($url, '/form_container/submit') !== false) {
    list($response, $headers) = handleFormSubmission();
} else {
    list($response, $headers) = forwardToApi($url, $requestMethod);

    $contentType = $headers['content_type'] ? $headers['content_type'] : 'text/plain';
    header('Content-Type: ' . $contentType);

    $cdnHosts = [
        'https://inter-cdn.com',
        'https://cdn1.site-media.eu',
        'https://cdn2.site-media.eu',
        'https://cdn3.site-media.eu',
        'https://cdn4.site-media.eu',
        'https://cdn5.site-media.eu',
        'https://cdn6.site-media.eu',
        'https://cdn7.site-media.eu',
        'https:\/\/inter-cdn.com',
        'https:\/\/cdn1.site-media.eu',
        'https:\/\/cdn2.site-media.eu',
        'https:\/\/cdn3.site-media.eu',
        'https:\/\/cdn4.site-media.eu',
        'https:\/\/cdn5.site-media.eu',
        'https:\/\/cdn6.site-media.eu',
        'https:\/\/cdn7.site-media.eu'
    ];
    $response = str_replace($cdnHosts, '/api.php', $response);
}

if (isset($headers['content_type'])) {
    header('Content-Type: ' . $headers['content_type']);
}
if (isset($headers['cache_control'])) {
    header('Cache-Control: ' . $headers['cache_control']);
}
if (isset($headers['pragma'])) {
    header('Pragma: ' . $headers['pragma']);
}

if (isset($headers['http_code'])) {
    http_response_code($headers['http_code']);
}

echo $response;