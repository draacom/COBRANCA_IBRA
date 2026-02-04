<?php
$envPath = __DIR__ . '/.env';
if (is_file($envPath)) {
    $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#') {
            continue;
        }
        $parts = explode('=', $line, 2);
        if (count($parts) !== 2) {
            continue;
        }
        $name = trim($parts[0]);
        $value = trim($parts[1]);
        if ($value !== '' && ($value[0] === '"' || $value[0] === "'")) {
            $value = trim($value, "\"'");
        }
        putenv($name . '=' . $value);
        $_ENV[$name] = $value;
        $_SERVER[$name] = $value;
    }
}
$error = null;
$invoiceData = null;
$id = isset($_GET['id']) ? (int)$_GET['id'] : null;
if (!$id) {
    $error = 'ID da fatura não informado.';
} else {
    $dbHost = getenv('DB_HOST') ?: getenv('DEST_HOST');
    $dbUser = getenv('DB_USER') ?: getenv('DEST_USER');
    $dbPass = getenv('DB_PASS') ?: getenv('DEST_PASS');
    $dbName = getenv('DB_NAME') ?: getenv('DEST_NAME');
    $dbPort = getenv('DB_PORT') ?: getenv('DEST_PORT') ?: '3306';
    if (!$dbHost || !$dbUser || !$dbName) {
        $error = 'Configuração de banco de dados ausente.';
    } else {
        try {
            $dsn = 'mysql:host=' . $dbHost . ';dbname=' . $dbName . ';port=' . $dbPort . ';charset=utf8mb4';
            $pdo = new PDO($dsn, $dbUser, $dbPass, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
            ]);
            $stmt = $pdo->prepare(
                'SELECT i.id, i.amount, i.due_date, i.paid_date, i.status, i.payment_method, i.payment_url, i.payment_code, i.payment_details, i.provider_id, i.title, i.createdAt AS created_at, c.id AS client_id, c.nome AS client_name, c.cpf_cnpj AS client_document, c.email AS client_email, c.phone AS client_phone FROM invoices i LEFT JOIN Clients c ON c.id = i.cliente_id WHERE i.id = :id LIMIT 1'
            );
            $stmt->execute([':id' => $id]);
            $row = $stmt->fetch();
            if (!$row) {
                $error = 'Fatura não encontrada.';
            } else {
                $details = null;
                if (!empty($row['payment_details'])) {
                    $decoded = json_decode($row['payment_details'], true);
                    if (json_last_error() === JSON_ERROR_NONE) {
                        $details = $decoded;
                    }
                }
                $responseDetail = [];
                if (is_array($details)) {
                    if (isset($details['ResponseDetail']) && is_array($details['ResponseDetail'])) {
                        $responseDetail = $details['ResponseDetail'];
                    } else {
                        $responseDetail = $details;
                    }
                }
                $bankSlipUrl = null;
                if (isset($responseDetail['BankSlipUrl']) && $responseDetail['BankSlipUrl']) {
                    $bankSlipUrl = $responseDetail['BankSlipUrl'];
                } elseif (isset($responseDetail['PaymentUrl']) && $responseDetail['PaymentUrl']) {
                    $bankSlipUrl = $responseDetail['PaymentUrl'];
                } elseif (isset($responseDetail['Url']) && $responseDetail['Url']) {
                    $bankSlipUrl = $responseDetail['Url'];
                } elseif (!empty($row['payment_url'])) {
                    $bankSlipUrl = $row['payment_url'];
                }
                $paymentMethodRaw = $row['payment_method'] ?? null;
                $isPix = $paymentMethodRaw && strtolower($paymentMethodRaw) === 'pix';
                $isBoleto = $paymentMethodRaw && strtolower($paymentMethodRaw) === 'boleto';
                $pixCopyPaste = null;
                if (isset($responseDetail['Key']) && $responseDetail['Key']) {
                    $pixCopyPaste = $responseDetail['Key'];
                } elseif (is_array($details)) {
                    if (isset($details['PixKey']) && $details['PixKey']) {
                        $pixCopyPaste = $details['PixKey'];
                    } elseif (isset($details['Key']) && $details['Key']) {
                        $pixCopyPaste = $details['Key'];
                    } elseif (isset($details['key']) && $details['key']) {
                        $pixCopyPaste = $details['key'];
                    } elseif (isset($details['pix_key']) && $details['pix_key']) {
                        $pixCopyPaste = $details['pix_key'];
                    }
                }
                if (!$pixCopyPaste && !empty($row['payment_code'])) {
                    $pixCopyPaste = $row['payment_code'];
                }
                $pixQrCodeImage = null;
                if (isset($responseDetail['QrCode']) && $responseDetail['QrCode']) {
                    $pixQrCodeImage = $responseDetail['QrCode'];
                } elseif (is_array($details) && isset($details['QrCode']) && $details['QrCode']) {
                    $pixQrCodeImage = $details['QrCode'];
                }
                if ($isPix && !$pixQrCodeImage && !empty($row['payment_url'])) {
                    $url = $row['payment_url'];
                    if (strpos($url, 'safe2pay.com.br') !== false || preg_match('/\.(png|jpg|jpeg|gif)$/i', $url)) {
                        $pixQrCodeImage = $url;
                    }
                }
                if (is_string($pixQrCodeImage) && strpos($pixQrCodeImage, '000201') === 0) {
                    if (!$pixCopyPaste) {
                        $pixCopyPaste = $pixQrCodeImage;
                    }
                    $pixQrCodeImage = null;
                }
                if (isset($responseDetail['Base64']) && $responseDetail['Base64']) {
                    $pixQrCodeImage = $responseDetail['Base64'];
                }
                if (!empty($row['payment_url']) && strpos($row['payment_url'], '000201') === 0 && !$pixCopyPaste) {
                    $pixCopyPaste = $row['payment_url'];
                }
                $paymentMethodFinal = $paymentMethodRaw;
                if ($isPix) {
                    $paymentMethodFinal = 'pix';
                } elseif ($isBoleto) {
                    $paymentMethodFinal = 'boleto';
                }
                $client = null;
                if (!empty($row['client_id'])) {
                    $client = [
                        'id' => (int)$row['client_id'],
                        'name' => $row['client_name'],
                        'email' => $row['client_email'],
                        'document' => $row['client_document'],
                        'phone' => $row['client_phone']
                    ];
                }
                $pix = null;
                if ($isPix) {
                    $pix = [
                        'qrCode' => $pixQrCodeImage ?: null,
                        'copyPaste' => $pixCopyPaste ?: null,
                        'code' => $row['payment_code'] ?: null,
                        'url' => ($row['payment_url'] ?: $bankSlipUrl) ?: null
                    ];
                }
                $boleto = null;
                if ($isBoleto) {
                    $boletoCode = null;
                    if (!empty($row['payment_code'])) {
                        $boletoCode = $row['payment_code'];
                    } elseif (isset($responseDetail['DigitableLine']) && $responseDetail['DigitableLine']) {
                        $boletoCode = $responseDetail['DigitableLine'];
                    }
                    $boleto = [
                        'url' => $bankSlipUrl ?: null,
                        'code' => $boletoCode
                    ];
                }
                $invoiceData = [
                    'id' => (int)$row['id'],
                    'title' => $row['title'] ?: 'Cobrança',
                    'amount' => (float)$row['amount'],
                    'due_date' => $row['due_date'],
                    'status' => $row['status'],
                    'payment_method' => $paymentMethodFinal,
                    'payment_url' => $row['payment_url'] ?: $bankSlipUrl,
                    'payment_code' => $row['payment_code'] ?: null,
                    'provider_id' => $row['provider_id'] ?: null,
                    'created_at' => $row['created_at'],
                    'client' => $client,
                    'pix' => $pix,
                    'boleto' => $boleto
                ];
            }
        } catch (Throwable $e) {
            $error = 'Erro ao carregar fatura.';
        }
    }
}
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Fatura - IBRA Informática</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary-color: #0ea5e9;
      --primary-dark: #0284c7;
      --success-color: #10b981;
      --warning-color: #f59e0b;
      --danger-color: #ef4444;
      --gray-50: #f9fafb;
      --gray-100: #f3f4f6;
      --gray-200: #e5e7eb;
      --gray-500: #6b7280;
      --gray-700: #374151;
      --gray-900: #111827;
    }
    body {
      margin: 0;
      font-family: 'Inter', sans-serif;
      background-color: var(--gray-50);
      color: var(--gray-900);
      line-height: 1.5;
    }
    .container {
      max-width: 600px;
      margin: 40px auto;
      padding: 0 20px;
    }
    .card {
      background: white;
      border-radius: 16px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }
    .card-header {
      background: white;
      padding: 32px 32px 24px;
      text-align: center;
      border-bottom: 1px solid var(--gray-100);
    }
    .brand-row {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    .brand-logo {
      height: 40px;
      object-fit: contain;
    }
    .invoice-title {
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--gray-700);
      margin: 0;
    }
    .invoice-amount {
      font-size: 2.5rem;
      font-weight: 700;
      color: var(--gray-900);
      margin: 8px 0;
      letter-spacing: -0.02em;
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 0.875rem;
      font-weight: 500;
    }
    .status-pending { background-color: #fff7ed; color: #c2410c; }
    .status-paid { background-color: #ecfdf5; color: #047857; }
    .status-overdue { background-color: #fef2f2; color: #b91c1c; }
    .status-canceled { background-color: #f3f4f6; color: #4b5563; text-decoration: line-through; }
    .card-body {
      padding: 32px;
    }
    .info-group {
      margin-bottom: 24px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 12px;
      font-size: 0.95rem;
    }
    .info-label {
      color: var(--gray-500);
    }
    .info-value {
      font-weight: 500;
      color: var(--gray-900);
      text-align: right;
    }
    .divider {
      height: 1px;
      background-color: var(--gray-200);
      margin: 24px 0;
    }
    .payment-section {
      text-align: center;
    }
    .payment-header {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      justify-content: center;
      margin-bottom: 16px;
      font-weight: 600;
      color: var(--gray-700);
    }
    .qr-container {
      display: flex;
      justify-content: center;
      margin: 16px 0;
    }
    .qr-code {
      width: 220px;
      height: 220px;
      border-radius: 12px;
      border: 1px solid var(--gray-200);
      object-fit: contain;
    }
    .pix-copy-container {
      display: flex;
      margin-top: 12px;
      gap: 8px;
      align-items: center;
    }
    .pix-input {
      flex: 1;
      padding: 8px 10px;
      border-radius: 8px;
      border: 1px solid var(--gray-200);
      font-size: 0.875rem;
      color: var(--gray-700);
      background-color: var(--gray-50);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .btn-copy {
      padding: 8px 12px;
      border-radius: 8px;
      border: none;
      background-color: var(--primary-color);
      color: white;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .btn-copy:hover {
      background-color: var(--primary-dark);
    }
    .btn-copy.copied {
      background-color: var(--success-color);
    }
    .btn-boleto {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      padding: 12px 16px;
      margin-top: 12px;
      border-radius: 9999px;
      border: none;
      background-color: var(--primary-color);
      color: white;
      font-size: 0.95rem;
      font-weight: 500;
      cursor: pointer;
      text-decoration: none;
    }
    .btn-boleto:hover {
      background-color: var(--primary-dark);
    }
    .footer {
      margin-top: 24px;
      text-align: center;
      font-size: 0.875rem;
      color: var(--gray-500);
    }
    .center {
      text-align: center;
    }
    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 40px 0;
      color: var(--gray-500);
      gap: 12px;
    }
    .spinner {
      width: 20px;
      height: 20px;
      border-radius: 9999px;
      border: 2px solid var(--gray-200);
      border-top-color: var(--primary-color);
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
    .hidden {
      display: none;
    }
    .error-msg {
      color: var(--danger-color);
      font-size: 0.9rem;
      margin-top: 12px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="card" id="invoiceCard" style="display: none;">
      <div class="card-header">
        <div class="brand-row">
          <img src="/img/ibrain.png" alt="IBRA INFORMATICA" class="brand-logo" onerror="this.style.display='none'">
          <img src="/img/ibraponto.png" alt="IBRA PONTO" class="brand-logo" onerror="this.style.display='none'">
          <img src="/img/ibrasoft.png" alt="IBRA SOFT" class="brand-logo" onerror="this.style.display='none'">
        </div>
        <h1 class="invoice-title" id="invoiceTitle">Fatura de Serviços</h1>
        <p class="invoice-amount" id="invoiceAmount">R$ 0,00</p>
        <span class="status-badge status-pending" id="statusBadge">Pendente</span>
      </div>
      <div class="card-body">
        <div class="info-group">
          <div class="info-row">
            <span class="info-label">Cliente</span>
            <span class="info-value" id="clientName">-</span>
          </div>
          <div class="info-row">
            <span class="info-label">Documento</span>
            <span class="info-value" id="clientDoc">-</span>
          </div>
        </div>
        <div class="divider"></div>
        <div class="info-group">
          <div class="info-row">
            <span class="info-label">Vencimento</span>
            <span class="info-value" id="dueDate">-</span>
          </div>
          <div class="info-row">
            <span class="info-label">Fatura #</span>
            <span class="info-value" id="invoiceId">-</span>
          </div>
        </div>
        <div class="divider"></div>
        <div id="paymentSection" class="payment-section"></div>
      </div>
    </div>
    <div id="loading" class="loading">
      <div class="spinner"></div>
      <span>Carregando fatura...</span>
    </div>
    <div id="errorContainer" class="error-msg hidden"></div>
    <div class="footer">
      <p>&copy; <span id="year"></span> IBRA Informática. Pagamento processado via Safe2Pay.</p>
    </div>
  </div>
<?php if ($invoiceData): ?>
  <script id="server-data" type="application/json">
<?=json_encode($invoiceData, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)?>
  </script>
<?php endif; ?>
<?php if ($error): ?>
  <script>
    window.INVOICE_ERROR = <?=json_encode($error, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)?>;
  </script>
<?php endif; ?>
  <script>
    const $ = (id) => document.getElementById(id);
    const formatMoney = (val) => Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const formatDate = (dateStr) => {
        if(!dateStr) return '-';
        const date = new Date(dateStr);
        return date.toLocaleDateString('pt-BR');
    };
    (function() {
      $('year').textContent = new Date().getFullYear();
      if (window.INVOICE_ERROR) {
        showError(window.INVOICE_ERROR);
        return;
      }
      let serverData = null;
      try {
          const dataScript = document.getElementById('server-data');
          if (dataScript) {
             serverData = JSON.parse(dataScript.textContent);
          }
      } catch (e) {}
      if (serverData) {
          renderInvoice(serverData);
      } else {
          showError('Não foi possível carregar a fatura.');
      }
    })();
    function showError(msg) {
      $('loading').classList.add('hidden');
      $('errorContainer').textContent = msg;
      $('errorContainer').classList.remove('hidden');
    }
    function renderInvoice(data) {
      $('loading').classList.add('hidden');
      $('invoiceCard').style.display = 'block';
      const amountVal = data.amount !== undefined && data.amount !== null ? data.amount : 0;
      $('invoiceAmount').textContent = formatMoney(amountVal);
      $('clientName').textContent = data.client?.name || 'Cliente Consumidor';
      $('clientDoc').textContent = data.client?.document || '-';
      $('dueDate').textContent = formatDate(data.due_date);
      $('invoiceId').textContent = data.id;
      $('invoiceTitle').textContent = data.title || 'Fatura de Serviços';
      const statusMap = {
        'paid': { text: 'Paga', class: 'status-paid' },
        'pending': { text: 'Pendente', class: 'status-pending' },
        'overdue': { text: 'Vencida', class: 'status-overdue' },
        'canceled': { text: 'Cancelada', class: 'status-canceled' }
      };
      const st = statusMap[data.status] || { text: data.status, class: 'status-pending' };
      const badge = $('statusBadge');
      badge.textContent = st.text;
      badge.className = `status-badge ${st.class}`;
      const container = $('paymentSection');
      container.innerHTML = '';
      if (data.status === 'paid') {
        container.innerHTML = '<div style="color: var(--success-color); font-weight: 600;"><svg style="width: 48px; height: 48px; margin-bottom: 8px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg><p>Fatura paga com sucesso!</p></div>';
        return;
      }
      if (data.status === 'canceled') {
        container.innerHTML = '<p style="color: var(--gray-500)">Esta fatura foi cancelada.</p>';
        return;
      }
      if (data.payment_method === 'boleto') {
        const boletoUrl = data.boleto?.url || data.payment_url;
        const boletoCode = data.boleto?.code || data.payment_code;
        if (boletoUrl) {
          let boletoHtml = '<div class="payment-header"><svg style="width: 24px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg> Boleto Bancário</div><a href="' + boletoUrl + '" target="_blank" class="btn-boleto">Visualizar Boleto</a><p class="text-sm mt-4" style="color: var(--gray-500)">Clique para abrir o PDF do boleto</p>';
          if (boletoCode) {
            boletoHtml += '<div class="pix-copy-container" style="margin-top:16px;"><input type="text" class="pix-input" value="' + String(boletoCode).replace(/"/g, '&quot;') + '" readonly id="boletoCode"><button class="btn-copy" onclick="copyGeneric(\'boletoCode\', this)">Copiar código de barras</button></div>';
          }
          container.innerHTML = boletoHtml;
        } else {
          container.innerHTML = '<p class="error-msg">Link do boleto indisponível.</p>';
        }
      } else if (data.payment_method === 'pix' && data.pix) {
        const qrCode = data.pix.qrCode;
        const key = data.pix.copyPaste || data.pix.code || data.payment_code;
        let imgSrc = '';
        if (qrCode) {
             imgSrc = (typeof qrCode === 'string' && (qrCode.startsWith('http') || qrCode.startsWith('data:'))) ? qrCode : 'data:image/png;base64,' + qrCode;
        }
        let html = '<div class="payment-header"><svg style="width: 24px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"></path></svg> Pagamento via Pix</div>';
        if (imgSrc) {
          html += '<div class="qr-container"><img src="' + imgSrc + '" alt="QR Code Pix" class="qr-code"></div><p class="text-sm" style="color: var(--gray-500); margin-bottom: 16px;">Abra o app do seu banco e escaneie o código.</p>';
        }
        if (key) {
          const safeKey = String(key).replace(/"/g, '&quot;');
          html += '<div class="pix-copy-container"><input type="text" class="pix-input" value="' + safeKey + '" readonly id="pixKey"><button class="btn-copy" onclick="copyGeneric(\'pixKey\', this)">Copiar</button></div>';
        }
        container.innerHTML = html;
      }
    }
    function copyGeneric(inputId, btnElement) {
        const input = document.getElementById(inputId);
        if (!input) return;
        input.select();
        input.setSelectionRange(0, 99999);
        navigator.clipboard.writeText(input.value).then(() => {
            const btn = btnElement;
            const original = btn.textContent;
            btn.textContent = 'Copiado!';
            btn.classList.add('copied');
            setTimeout(() => {
                btn.textContent = original;
                btn.classList.remove('copied');
            }, 2000);
        }).catch(() => {});
    }
  </script>
</body>
</html>

