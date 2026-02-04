const express = require('express');
const router = express.Router();
const path = require('path');
const QRCode = require('qrcode');
const { Invoice, Client } = require('../models');

// Servir a página estática invoice.html independentemente do frontend
router.get('/invoice.html', (req, res) => {
    // Se tiver ID na query, redirecionar para a versão SSR
    if (req.query.id) {
        return res.redirect(`/public/invoice/${req.query.id}`);
    }

    // Tenta servir do build (produção) primeiro, depois do public (dev)
    const buildPath = path.join(__dirname, '../../frontend/build/invoice.html');
    const publicPath = path.join(__dirname, '../../frontend/public/invoice.html');
    
    res.sendFile(buildPath, (err) => {
        if (err) {
            res.sendFile(publicPath);
        }
    });
});

// Rota pública para visualizar cobrança
router.get('/invoice/:id', async (req, res) => {
    console.log('🔍 Acessando rota pública /invoice/:id');
    console.log('📋 Parâmetros:', req.params);
    
    try {
        const { id } = req.params;
        console.log('🔎 Buscando cobrança ID:', id);
        
        // Buscar a cobrança com os dados do cliente
        const invoice = await Invoice.findOne({
            where: { id },
            include: [{
                model: Client,
                as: 'client',
                attributes: ['id', 'name', 'email', 'document', 'cpf_cnpj', 'phone']
            }]
        });
        
        console.log('📄 Cobrança encontrada:', invoice ? 'SIM' : 'NÃO');
        
        if (invoice) {
            console.log('🔍 Dados brutos do DB:');
            console.log(' - payment_method:', invoice.payment_method);
            console.log(' - payment_url:', invoice.payment_url);
            console.log(' - payment_code:', invoice.payment_code);
            console.log(' - payment_details type:', typeof invoice.payment_details);
        }

        if (!invoice) {
            console.log('❌ Cobrança não encontrada, renderizando erro 404');
            return res.status(404).render('public/error', {
                title: 'Cobrança não encontrada',
                message: 'A cobrança solicitada não foi encontrada.',
                code: 404,
                branding: {
                    logoUrl: process.env.PUBLIC_LOGO_URL || '/brand/logo.png',
                    faviconUrl: process.env.PUBLIC_FAVICON_URL || '/brand/favicon.png'
                }
            });
        }

        // --- Lógica de transformação de dados (mesma do endpoint JSON) ---
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
        // Tentar encontrar o código Copia e Cola
        // Safe2Pay: "Key" ou "PixKey"
        // As vezes "QrCode" é o copia e cola se não for URL
        let pixCopyPaste = responseDetail.Key || details?.PixKey || details?.Key || details?.key || details?.pix_key || invoice.payment_code || null;
        
        // Tentar encontrar a imagem do QR Code
        // Safe2Pay: "QrCode" (pode ser URL ou Base64)
        // Se invoice.payment_url for uma imagem Pix (top row do BD), usar ele
        let pixQrCodeImage = responseDetail.QrCode || details?.QrCode || null;
        
        // Fallback para usar a coluna payment_url se ela parecer uma imagem de QR Code e não tivermos encontrado ainda
        // Usar toLowerCase() para garantir comparação segura
        const isPix = invoice.payment_method && invoice.payment_method.toLowerCase() === 'pix';
        const isBoleto = invoice.payment_method && invoice.payment_method.toLowerCase() === 'boleto';

        if (!pixQrCodeImage && invoice.payment_url && isPix) {
             // Verificar se é URL de imagem ou Safe2Pay
             if (invoice.payment_url.includes('safe2pay.com.br') || invoice.payment_url.match(/\.(png|jpg|jpeg|gif)$/i)) {
                 pixQrCodeImage = invoice.payment_url;
             }
        }

        // Validação inteligente
        if (pixQrCodeImage && typeof pixQrCodeImage === 'string') {
            // Se o "QrCodeImage" na verdade for o código EMV (começa com 000201), 
            // então ele é o Copia e Cola, e não temos imagem pronta.
            if (pixQrCodeImage.startsWith('000201')) {
                if (!pixCopyPaste) pixCopyPaste = pixQrCodeImage;
                pixQrCodeImage = null; // Não é uma imagem válida para src
            }
        }

        // Se tivermos o Base64 explícito (algumas APIs retornam assim)
        if (responseDetail.Base64) {
             pixQrCodeImage = responseDetail.Base64;
        }

        // Se o payment_url for o Copia e Cola (caso raro onde salvaram errado)
        if (invoice.payment_url && invoice.payment_url.startsWith('000201') && !pixCopyPaste) {
            pixCopyPaste = invoice.payment_url;
        }

        // GERAÇÃO DE QR CODE (Fallback final)
        // Se temos o código copia e cola mas não temos a imagem, geramos agora
        if (pixCopyPaste && !pixQrCodeImage) {
            try {
                console.log('🔄 Gerando QR Code a partir do código Pix Copia e Cola...');
                pixQrCodeImage = await QRCode.toDataURL(pixCopyPaste);
                console.log('✅ QR Code gerado com sucesso!');
            } catch (err) {
                console.error('❌ Erro ao gerar QR Code:', err);
            }
        }

        const result = {
            id: invoice.id,
            title: invoice.title || 'Cobrança',
            amount: Number(invoice.amount),
            due_date: invoice.due_date,
            status: invoice.status,
            payment_method: isPix ? 'pix' : (isBoleto ? 'boleto' : invoice.payment_method),
            payment_url: invoice.payment_url || bankSlipUrl,
            payment_code: invoice.payment_code || null,
            provider_id: invoice.provider_id || null,
            created_at: invoice.createdAt,
            client: invoice.client ? {
                id: invoice.client.id,
                name: invoice.client.name,
                email: invoice.client.email,
                document: invoice.client.cpf_cnpj || invoice.client.document || null,
                phone: invoice.client.phone || null
            } : null,
            pix: isPix ? {
                qrCode: pixQrCodeImage || null,
                copyPaste: pixCopyPaste || null,
                code: invoice.payment_code || null,
                url: invoice.payment_url || bankSlipUrl || null // Adicionar URL de pagamento como fallback
            } : null,
            boleto: isBoleto ? {
                url: bankSlipUrl || null,
                code: invoice.payment_code || responseDetail.DigitableLine || null
            } : null,
            canonical_public_url: `/public/invoice/${invoice.id}`
        };
        // -------------------------------------------------------------
        
        console.log('✅ Renderizando página da cobrança com dados injetados');
        
        // Renderizar a página de cobrança passando os dados já formatados
        res.render('public/invoice', {
            title: `Cobrança - ${invoice.title || 'Pagamento'}`,
            invoice: result, // Passa o objeto formatado
            branding: {
                logoUrl: process.env.PUBLIC_LOGO_URL || '/brand/logo.png',
                faviconUrl: process.env.PUBLIC_FAVICON_URL || '/brand/favicon.png'
            }
        });
        
    } catch (error) {
        console.error('❌ Erro ao buscar cobrança:', error.message);
        console.error('📋 Stack trace:', error.stack);
        res.status(500).render('public/error', {
            title: 'Erro interno',
            message: 'Ocorreu um erro ao carregar a cobrança.',
            code: 500,
            branding: {
                logoUrl: process.env.PUBLIC_LOGO_URL || '/imgs/logo.png',
                faviconUrl: process.env.PUBLIC_FAVICON_URL || '/brand/favicon.png'
            }
        });
    }
});

// Rota para verificar status da cobrança (AJAX)
router.get('/invoice/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        
        const invoice = await Invoice.findOne({
            where: { id },
            attributes: ['id', 'status', 'paid_date']
        });
        
        if (!invoice) {
            return res.status(404).json({
                error: true,
                message: 'Cobrança não encontrada'
            });
        }
        
        res.json({
            success: true,
            status: invoice.status,
            paid_date: invoice.paid_date
        });
        
    } catch (error) {
        console.error('Erro ao verificar status:', error);
        res.status(500).json({
            error: true,
            message: 'Erro ao verificar status da cobrança'
        });
    }
});

// Endpoint JSON público para consumo por páginas estáticas
router.get('/invoice/:id/json', async (req, res) => {
    try {
        const { id } = req.params;

        const invoice = await Invoice.findOne({
            where: { id },
            include: [{
                model: Client,
                as: 'client',
                attributes: ['id', 'name', 'email', 'document', 'cpf_cnpj', 'phone']
            }]
        });

        if (!invoice) {
            return res.status(404).json({
                error: true,
                message: 'Cobrança não encontrada'
            });
        }

        // Parse de detalhes de pagamento (Safe2Pay)
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
        // Tentar encontrar o código Copia e Cola
        let pixCopyPaste = responseDetail.Key || details?.PixKey || details?.Key || details?.key || details?.pix_key || invoice.payment_code || null;
        
        // Tentar encontrar a imagem do QR Code
        let pixQrCodeImage = responseDetail.QrCode || details?.QrCode || null;

        // Fallback para usar a coluna payment_url se ela parecer uma imagem de QR Code e não tivermos encontrado ainda
        // Usar toLowerCase() para garantir comparação segura
        const isPix = invoice.payment_method && invoice.payment_method.toLowerCase() === 'pix';
        const isBoleto = invoice.payment_method && invoice.payment_method.toLowerCase() === 'boleto';

        if (!pixQrCodeImage && invoice.payment_url && isPix) {
             // Verificar se é URL de imagem ou Safe2Pay
             if (invoice.payment_url.includes('safe2pay.com.br') || invoice.payment_url.match(/\.(png|jpg|jpeg|gif)$/i)) {
                 pixQrCodeImage = invoice.payment_url;
             }
        }

        // Validação inteligente
        if (pixQrCodeImage && typeof pixQrCodeImage === 'string') {
            if (pixQrCodeImage.startsWith('000201')) {
                if (!pixCopyPaste) pixCopyPaste = pixQrCodeImage;
                pixQrCodeImage = null;
            }
        }
        if (responseDetail.Base64) {
             pixQrCodeImage = responseDetail.Base64;
        }

        // Se o payment_url for o Copia e Cola (caso raro onde salvaram errado)
        if (invoice.payment_url && invoice.payment_url.startsWith('000201') && !pixCopyPaste) {
            pixCopyPaste = invoice.payment_url;
        }

        // GERAÇÃO DE QR CODE (Fallback final)
        // Se temos o código copia e cola mas não temos a imagem, geramos agora
        if (pixCopyPaste && !pixQrCodeImage) {
            try {
                // Não logar no endpoint JSON para evitar poluição, ou logar apenas em erro
                pixQrCodeImage = await QRCode.toDataURL(pixCopyPaste);
            } catch (err) {
                console.error('❌ Erro ao gerar QR Code (JSON endpoint):', err);
            }
        }

        const result = {
            id: invoice.id,
            title: invoice.title || 'Cobrança',
            amount: Number(invoice.amount),
            due_date: invoice.due_date,
            status: invoice.status,
            payment_method: invoice.payment_method,
            payment_url: invoice.payment_url || bankSlipUrl,
            payment_code: invoice.payment_code || null,
            provider_id: invoice.provider_id || null,
            created_at: invoice.createdAt,
            client: invoice.client ? {
                id: invoice.client.id,
                name: invoice.client.name,
                email: invoice.client.email,
                document: invoice.client.cpf_cnpj || invoice.client.document || null,
                phone: invoice.client.phone || null
            } : null,
            pix: isPix ? {
                qrCode: pixQrCodeImage || null,
                copyPaste: pixCopyPaste || null,
                code: invoice.payment_code || null,
                url: invoice.payment_url || bankSlipUrl || null
            } : null,
            boleto: isBoleto ? {
                url: bankSlipUrl || null,
                code: invoice.payment_code || responseDetail.DigitableLine || null
            } : null,
            canonical_public_url: `/public/invoice/${invoice.id}`
        };

        return res.json({ success: true, data: result });
    } catch (error) {
        console.error('Erro no JSON público da cobrança:', error);
        return res.status(500).json({ error: true, message: 'Erro interno' });
    }
});

module.exports = router;