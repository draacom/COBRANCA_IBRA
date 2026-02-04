const express = require('express');
const { Invoice, Client } = require('../models');
const safe2payClient = require('../services/safe2pay_client');

const protectedRouter = express.Router();
const webhookRouter = express.Router();

// Rota interna para emitir cobrança via Safe2Pay
protectedRouter.post('/emit', async (req, res) => {
  try {
    const { invoice_id } = req.body;

    if (!invoice_id) {
      return res.status(400).json({
        status: 'error',
        message: 'ID da cobrança é obrigatório'
      });
    }

    const invoice = await Invoice.findByPk(invoice_id, {
      include: [{ model: Client, as: 'client' }]
    });

    if (!invoice) {
      return res.status(404).json({
        status: 'error',
        message: 'Cobrança não encontrada'
      });
    }

    // Emite cobrança via Safe2Pay
    const result = await safe2payClient.emitirCobranca({
      amount: invoice.amount,
      due_date: invoice.due_date,
      payment_method: invoice.payment_method,
      payer: {
        name: invoice.client.name,
        email: invoice.client.email,
        address: invoice.client.address
      },
      reference_id: invoice.id.toString()
    });

    await invoice.update({
      provider_id: result.id,
      payment_url: result.payment_url,
      payment_code: result.payment_code,
      payment_details: result.payment_details || null
    });

    return res.status(200).json({
      status: 'success',
      data: { invoice, provider_response: result }
    });
  } catch (error) {
    console.error('Erro ao emitir cobrança via Safe2Pay:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Erro ao emitir cobrança via Safe2Pay'
    });
  }
});

// Webhook para receber notificações da Safe2Pay
webhookRouter.post('/', async (req, res) => {
  const startTime = new Date();
  const webhookId = `webhook_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    const payload = req.body || {};
    // Compatibilidade: alguns gateways enviam diretamente os campos no root
    const data = payload.data || payload.Data || payload.transaction || payload.Transaction || payload;

    console.log(`[${webhookId}] 🔔 Webhook Safe2Pay recebido:`, JSON.stringify(payload, null, 2));

    // Validação mínima conforme PHP legado: requer IdTransaction e Status
    const statusCode = Number(data?.Status ?? payload?.Status);
    const providerId = String(data?.IdTransaction ?? payload?.IdTransaction ?? data?.TransactionId ?? data?.Id ?? payload?.Id ?? '');
    const paymentMethod = data?.PaymentMethod ?? payload?.PaymentMethod;
    const amount = data?.Amount ?? payload?.Amount;

    console.log(`[${webhookId}] 📊 Dados extraídos:`, {
      providerId,
      statusCode,
      paymentMethod,
      amount,
      hasPaymentDate: !!(data?.PaymentDate || payload?.PaymentDate)
    });

    if (!providerId || Number.isNaN(statusCode)) {
      console.error(`[${webhookId}] ❌ Payload inválido - providerId: ${providerId}, statusCode: ${statusCode}`);
      return res.status(400).json({ 
        status: 'error', 
        message: 'Payload inválido - IdTransaction e Status são obrigatórios',
        webhookId 
      });
    }

    // Mapeamento de status (inspirado no PHP), adaptado ao enum do sistema
    // Sistema atual: pending | paid | overdue | canceled
    const mapToSystemStatus = code => {
      const statusMap = {
        1: { status: 'pending', description: 'Pendente' },
        2: { status: 'pending', description: 'Processando' },
        3: { status: 'pending', description: 'Autorizado' },
        4: { status: 'paid', description: 'Disponível/Pago' },
        5: { status: 'pending', description: 'Em disputa' },
        6: { status: 'canceled', description: 'Devolvido' },
        7: { status: 'paid', description: 'Baixado' },
        8: { status: 'canceled', description: 'Recusado' },
        11: { status: 'canceled', description: 'Cancelado' },
        12: { status: 'canceled', description: 'Estornado' },
        13: { status: 'overdue', description: 'Vencido' },
        15: { status: 'pending', description: 'Em análise' }
      };
      
      return statusMap[Number(code)] || { status: 'pending', description: 'Status desconhecido' };
    };

    const statusInfo = mapToSystemStatus(statusCode);
    const newStatus = statusInfo.status;
    const paidAt = data?.PaymentDate || payload?.PaymentDate || null;

    console.log(`[${webhookId}] 🔄 Mapeamento de status: ${statusCode} (${statusInfo.description}) => ${newStatus}`);

    const invoice = await Invoice.findOne({ where: { provider_id: providerId } });
    if (!invoice) {
      console.error(`[${webhookId}] ❌ Cobrança não encontrada para provider_id: ${providerId}`);
      return res.status(404).json({ 
        status: 'error', 
        message: 'Cobrança não encontrada',
        providerId,
        webhookId 
      });
    }

    console.log(`[${webhookId}] 📋 Cobrança encontrada:`, {
      invoiceId: invoice.id,
      currentStatus: invoice.status,
      newStatus,
      title: invoice.title,
      amount: invoice.amount
    });

    // Preparar atualizações
    const updates = { status: newStatus };
    if (newStatus === 'paid' && !invoice.paid_date) {
      updates.paid_date = paidAt ? new Date(paidAt) : new Date();
      console.log(`[${webhookId}] 💰 Marcando como pago em: ${updates.paid_date}`);
    }

    // Atualizar notificações para incluir este webhook
    const notifications = Array.isArray(invoice.notifications) ? invoice.notifications : [];
    notifications.push({
      type: 'webhook_safe2pay',
      timestamp: startTime.toISOString(),
      webhookId,
      statusCode,
      statusDescription: statusInfo.description,
      newStatus,
      paymentMethod,
      amount,
      paidAt
    });
    updates.notifications = notifications;

    await invoice.update(updates);
    
    const processingTime = new Date() - startTime;
    console.log(`[${webhookId}] ✅ Webhook processado com sucesso em ${processingTime}ms:`, {
      invoiceId: invoice.id,
      oldStatus: invoice.status,
      newStatus,
      paidDate: updates.paid_date
    });

    return res.status(200).json({ 
      status: 'success', 
      message: 'Webhook processado com sucesso',
      webhookId,
      invoiceId: invoice.id,
      statusUpdated: newStatus,
      processingTimeMs: processingTime
    });
  } catch (error) {
    const processingTime = new Date() - startTime;
    console.error(`[${webhookId}] ❌ Erro ao processar webhook Safe2Pay (${processingTime}ms):`, {
      error: error.message,
      stack: error.stack,
      payload: req.body
    });
    
    // Retornar 200 para evitar reenvios desnecessários da Safe2Pay
    return res.status(200).json({ 
      status: 'error', 
      message: 'Erro interno no processamento do webhook',
      webhookId,
      error: error.message,
      processingTimeMs: processingTime
    });
  }
});

module.exports = {
  protected: protectedRouter,
  webhooks: webhookRouter
};