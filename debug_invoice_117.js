
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const { Sequelize, DataTypes } = require('sequelize');
const config = require('./src/config/database.js');

// Ajuste para usar o config correto dependendo do ambiente
const dbConfig = config.development || config;

const sequelize = new Sequelize(dbConfig.database, dbConfig.username, dbConfig.password, {
  host: dbConfig.host,
  dialect: dbConfig.dialect,
  logging: false
});

const InvoiceModel = require('./src/models/Invoice.js');
const Invoice = InvoiceModel(sequelize, DataTypes);

async function checkInvoice() {
    try {
        const invoice = await Invoice.findOne({
            where: { id: 117 }
        });

        if (!invoice) {
            console.log('Fatura 117 não encontrada.');
            return;
        }

        console.log('--- DADOS BRUTOS DO BANCO ---');
        console.log('ID:', invoice.id);
        console.log('Payment Method:', invoice.payment_method);
        console.log('Payment URL:', invoice.payment_url);
        console.log('Payment Code:', invoice.payment_code);
        // console.log('Payment Details (raw):', invoice.payment_details); // Comentado para não poluir, mas útil se precisar

        // Simulação da lógica da rota public.routes.js
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
        
        let pixCopyPaste = responseDetail.Key || details?.PixKey || details?.Key || details?.key || details?.pix_key || invoice.payment_code || null;
        let pixQrCodeImage = responseDetail.QrCode || details?.QrCode || null;

        const isPix = invoice.payment_method && invoice.payment_method.toLowerCase() === 'pix';

        if (!pixQrCodeImage && invoice.payment_url && isPix) {
             if (invoice.payment_url.includes('safe2pay.com.br') || invoice.payment_url.match(/\.(png|jpg|jpeg|gif)$/i)) {
                 pixQrCodeImage = invoice.payment_url;
             }
        }

        if (pixQrCodeImage && typeof pixQrCodeImage === 'string') {
            if (pixQrCodeImage.startsWith('000201')) {
                if (!pixCopyPaste) pixCopyPaste = pixQrCodeImage;
                pixQrCodeImage = null;
            }
        }

        if (invoice.payment_url && invoice.payment_url.startsWith('000201') && !pixCopyPaste) {
            pixCopyPaste = invoice.payment_url;
        }

        console.log('\n--- LÓGICA DA ROTA ---');
        console.log('isPix:', isPix);
        console.log('pixQrCodeImage:', pixQrCodeImage);
        console.log('pixCopyPaste:', pixCopyPaste);
        console.log('invoice.payment_code (direto):', invoice.payment_code);

        const resultPix = isPix ? {
            qrCode: pixQrCodeImage || null,
            copyPaste: pixCopyPaste || null,
            code: invoice.payment_code || null,
            url: invoice.payment_url || null
        } : null;

        console.log('\n--- RESULTADO FINAL JSON ---');
        console.log(JSON.stringify(resultPix, null, 2));

    } catch (error) {
        console.error('Erro:', error);
    } finally {
        await sequelize.close();
    }
}

checkInvoice();
