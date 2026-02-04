const invoice = {
    id: 117,
    payment_method: 'pix',
    payment_url: 'https://images.safe2pay.com.br/pix/3493cc4dfd3b473', // shortened for test
    payment_code: '00020101021226850014br.gov.bcb.pix2563qrcodepix.bb', // shortened
    payment_details: JSON.stringify({
        ResponseDetail: {
            // simulating what might be there or missing
        }
    })
};

// Logic from public.routes.js
let details = null;
try {
    if (invoice.payment_details) {
        details = typeof invoice.payment_details === 'string'
            ? JSON.parse(invoice.payment_details)
            : invoice.payment_details;
    }
} catch (e) {
    details = null;
}

const responseDetail = details && (details.ResponseDetail || details) || {};

// --- BOLETO ---
const bankSlipUrl = responseDetail.BankSlipUrl || responseDetail.PaymentUrl || responseDetail.Url || invoice.payment_url || null;

// --- PIX ---
let pixCopyPaste = responseDetail.Key || details?.PixKey || details?.Key || details?.key || details?.pix_key || invoice.payment_code || null;

let pixQrCodeImage = responseDetail.QrCode || details?.QrCode || null;

// Fallback logic
if (!pixQrCodeImage && invoice.payment_url && invoice.payment_method === 'pix') {
     if (invoice.payment_url.includes('safe2pay.com.br') || invoice.payment_url.match(/\.(png|jpg|jpeg|gif)$/i)) {
         pixQrCodeImage = invoice.payment_url;
     }
}

// Validation logic
if (pixQrCodeImage && typeof pixQrCodeImage === 'string') {
    if (pixQrCodeImage.startsWith('000201')) {
        if (!pixCopyPaste) pixCopyPaste = pixQrCodeImage;
        pixQrCodeImage = null;
    }
}

const result = {
    pix: invoice.payment_method === 'pix' ? {
        qrCode: pixQrCodeImage || null,
        copyPaste: pixCopyPaste || null,
        code: invoice.payment_code || null,
        url: invoice.payment_url || bankSlipUrl || null
    } : null
};

console.log('Result:', JSON.stringify(result, null, 2));
