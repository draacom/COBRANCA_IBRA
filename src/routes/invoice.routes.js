const express = require('express');
const { Invoice, Client, Subscription } = require('../models');
const { Op } = require('sequelize');
const notifier = require('../services/notifier');
const safe2pay = require('../services/safe2pay_client');

const router = express.Router();

// Função para criar data correta sem problemas de timezone
function createDateOnly(dateString) {
  if (!dateString) return null;
  const raw = String(dateString).trim();
  // Se já vier como YYYY-MM-DD, manter exatamente como está (DATEONLY no banco)
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  // Tentar extrair a parte da data antes do 'T'
  const only = raw.split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(only)) return only;
  // Fallback: construir a partir do Date, mas sem compensar timezone
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw; // devolve o que veio se não der pra parsear
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
// Criar cobrança avulsa (sem assinatura)
router.post('/ad_hoc', async (req, res) => {
  try {
    const { client_id, amount, due_date, payment_method, title } = req.body;

    // Validação básica
    if (!client_id || !amount || !due_date || !payment_method) {
      return res.status(400).json({
        status: 'error',
        message: 'Campos obrigatórios: client_id, amount, due_date, payment_method'
      });
    }

    // Validação do valor
    const valorNumerico = parseFloat(amount);
    if (valorNumerico <= 0) {
      return res.status(400).json({
        status: 'error',
        message: 'O valor da cobrança deve ser maior que zero'
      });
    }

    // Validação da data de vencimento
    const dataVencimentoString = createDateOnly(due_date);
    // Validar por string para evitar timezone: YYYY-MM-DD
    const hojeNow = new Date();
    const yyyy = hojeNow.getFullYear();
    const mm = String(hojeNow.getMonth() + 1).padStart(2, '0');
    const dd = String(hojeNow.getDate()).padStart(2, '0');
    const hojeYMD = `${yyyy}-${mm}-${dd}`;
    if (dataVencimentoString < hojeYMD) {
      return res.status(400).json({
        status: 'error',
        message: 'A data de vencimento não pode ser anterior à data atual'
      });
    }

    // Validação do método de pagamento
    if (!['boleto', 'pix'].includes(payment_method)) {
      return res.status(400).json({
        status: 'error',
        message: 'Método de pagamento inválido. Use "boleto" ou "pix"'
      });
    }

    // Buscar cliente
    const client = await Client.findByPk(client_id);
    if (!client) {
      return res.status(404).json({
        status: 'error',
        message: 'Cliente não encontrado'
      });
    }

    // Validar dados obrigatórios do cliente (seguindo modelo PHP)
    const camposObrigatorios = {
      email: 'E-mail',
      cep: 'CEP',
      endereco: 'Endereço',
      numero: 'Número',
      bairro: 'Bairro',
      cidade: 'Cidade',
      estado: 'Estado'
    };

    const camposFaltantes = [];
    for (const [campo, nome] of Object.entries(camposObrigatorios)) {
      if (!client[campo] || client[campo].toString().trim() === '') {
        camposFaltantes.push(nome);
      }
    }

    if (camposFaltantes.length > 0) {
      return res.status(400).json({
        status: 'error',
        message: `Cliente com dados incompletos. Campos faltantes: ${camposFaltantes.join(', ')}. Por favor, atualize o cadastro do cliente antes de gerar a cobrança.`
      });
    }

    // Checagem simples de idempotência para evitar duplicatas exatas
    const existing = await Invoice.findOne({
      where: {
        cliente_id: client_id,
        amount: valorNumerico,
        due_date: dataVencimentoString,
        payment_method,
        status: { [Op.ne]: 'canceled' }
      }
    });
    if (existing) {
      return res.status(409).json({
        status: 'error',
        message: 'Cobrança semelhante já existe para este cliente e data'
      });
    }

    // Gerar código do pedido único
    const codigoPedido = 'COB' + String(Math.floor(Math.random() * 999999)).padStart(6, '0') + new Date().toISOString().slice(0, 10).replace(/-/g, '');

    // 1) Criar invoice pendente sem assinatura (fallback cria assinatura sintética se BD exigir)
    const invoiceData = {
      subscription_id: null,
      cliente_id: client_id,
      amount: valorNumerico,
      due_date: dataVencimentoString,
      status: 'pending',
      payment_method,
      title: title || `Cobrança avulsa de ${client.name}`
    };

    let invoice;
    try {
      invoice = await Invoice.create(invoiceData);
    } catch (creationError) {
      const errMsg = creationError?.message || '';
      const isNullSubError = errMsg.includes('subscription_id') && errMsg.includes('null');
      const isMysqlNullError = creationError?.original?.code === 'ER_BAD_NULL_ERROR';
      if (isNullSubError || isMysqlNullError) {
        // Criar assinatura sintética para vincular a cobrança avulsa
        const billingDay = new Date(dataVencimentoString).getDate();
        const synthetic = await Subscription.create({
          cliente_id: client_id,
          valor: valorNumerico,
          vencimento_dia: billingDay,
          metodo_pagamento: payment_method,
          nome_cobranca: 'Cobrança Avulsa',
          status: 'inativo'
        });
        invoiceData.subscription_id = synthetic.id;
        invoice = await Invoice.create(invoiceData);
      } else {
        throw creationError;
      }
    }

    // 2) Preparar dados para Safe2Pay seguindo o formato do PHP
    const descricao = title || `Cobrança avulsa de ${client.name}`;
    
    const paymentData = {
      IsSandbox: process.env.SAFE2PAY_SANDBOX === 'true',
      Application: 'Pagamento de Serviço',
      Vendor: client.name,
      CallbackUrl: process.env.SAFE2PAY_CALLBACK_URL,
      PaymentMethod: payment_method === 'boleto' ? '1' : '6', // 1 = Boleto, 6 = PIX
      Customer: {
        Name: client.name,
        Identity: (client.cpf_cnpj || client.document || '').replace(/[^0-9]/g, ''),
        Email: client.email,
        Phone: (client.telefone || client.phone || '').replace(/[^0-9]/g, '').replace(/^55(\d{10,11})$/, '$1'),
        Address: {
          ZipCode: client.cep ? client.cep.toString().replace(/[^0-9]/g, '') : '',
          Street: client.endereco || '',
          Number: client.numero || '',
          Complement: '',
          District: client.bairro || '',
          StateInitials: client.estado || '',
          CityName: client.cidade || '',
          CountryName: 'Brasil'
        }
      },
      Products: [
        {
          Code: codigoPedido,
          Description: descricao,
          UnitPrice: valorNumerico,
          Quantity: 1
        }
      ],
      Reference: codigoPedido
    };

    // Adicionar configurações específicas para boleto
    if (payment_method === 'boleto') {
      paymentData.PaymentObject = {
        DueDate: dataVencimentoString,
        Instruction: "Não receber após o vencimento",
        // Multa 1% e juros 2% (mensal)
        PenaltyAmount: parseFloat(process.env.SAFE2PAY_BOLETO_FINE_PERCENT || '1'),
        InterestAmount: parseFloat(process.env.SAFE2PAY_BOLETO_INTEREST_MONTHLY_PERCENT || '2'),
        CancelAfterDue: false,
        IsEnablePartialPayment: false,
        DaysBeforeCancel: 0,
        Messages: ["Em caso de dúvidas, entre em contato conosco"]
      };
    }

    // 3) Emitir cobrança via Safe2Pay
    let gatewayResponse;
    try {
      const Safe2PayClient = require('../services/safe2pay_client');
      const safe2payClient = new Safe2PayClient();
      gatewayResponse = await safe2payClient.emitirCobranca(paymentData);
    } catch (error) {
      console.error('Erro ao emitir cobrança via Safe2Pay:', error);
      
      // Deletar a invoice criada se houve erro no gateway
      if (invoice) {
        await invoice.destroy();
      }
      
      return res.status(400).json({
        status: 'error',
        message: 'Erro ao processar cobrança com Safe2Pay',
        details: error?.message || error
      });
    }

    // 3) Atualizar invoice com dados do gateway
    console.log('Resposta completa da Safe2Pay:', JSON.stringify(gatewayResponse, null, 2));
    
    const responseDetail = gatewayResponse.ResponseDetail || gatewayResponse;
    
    // Verificar se a cobrança foi criada com sucesso
    if (!responseDetail || (!responseDetail.IdTransaction && !responseDetail.id)) {
      console.error('Resposta da Safe2Pay não contém ID da transação:', responseDetail);
      throw new Error('Falha ao obter ID da transação da Safe2Pay');
    }
    
    // Gerar link público para visualização da cobrança
    const baseUrl = process.env.PUBLIC_BASE_URL || process.env.BASE_URL || 'http://localhost:3000';
    const publicLink = `${baseUrl}/public/invoice/${invoice.id}`;
    
    // Extrair dados específicos do Pix se disponíveis
    const pixQrCode = responseDetail.QrCode || responseDetail.qr_code;
    const pixKey = responseDetail.Key || responseDetail.PixKey || responseDetail.pix_key || responseDetail.key;
    
    // Determinar URL de pagamento e código
    // Se for Pix, priorizar o QR Code na URL e a Key no código
    let finalPaymentUrl = responseDetail.BankSlipUrl || responseDetail.PaymentUrl || responseDetail.Url || responseDetail.payment_url;
    let finalPaymentCode = responseDetail.DigitableLine || responseDetail.payment_code;

    if (payment_method === 'pix') {
        // Se for Pix, priorizar o QR Code na URL e a Key no código
        // FIX: Priorizar SEMPRE o QR Code se disponível, mesmo que venha URL de pagamento genérica
        if (pixQrCode && !pixQrCode.startsWith('000201')) {
             finalPaymentUrl = pixQrCode; // URL da imagem do QR Code
        }
        if (!finalPaymentCode && pixKey) {
             finalPaymentCode = pixKey;
        }
    }

    await invoice.update({
      provider_id: responseDetail.IdTransaction || responseDetail.id,
      payment_url: finalPaymentUrl,
      payment_code: finalPaymentCode,
      payment_details: JSON.stringify(responseDetail),
      public_link: publicLink
    });

    // 4) Enviar notificações (email e WhatsApp)
    const notifications = [];
    try {
      const notificationResults = await notifier.sendCompleteNotification(invoice, client);
      
      if (notificationResults.email) {
        notifications.push({ 
          channel: 'email', 
          sent_at: new Date(), 
          status: notificationResults.email.success ? 'sent' : 'failed',
          error: notificationResults.email.success ? null : notificationResults.email.message
        });
      }
      
      if (notificationResults.whatsapp) {
        notifications.push({ 
          channel: 'whatsapp', 
          sent_at: new Date(), 
          status: notificationResults.whatsapp.success ? 'sent' : 'failed',
          error: notificationResults.whatsapp.success ? null : notificationResults.whatsapp.message
        });
      }
    } catch (error) {
      console.error('Falha ao enviar notificações da cobrança avulsa:', error.message);
      notifications.push({ 
        channel: 'general', 
        sent_at: new Date(), 
        status: 'failed', 
        error: error.message 
      });
    }

    // 5) Persistir histórico de notificações
    try {
      const currentNotifications = Array.isArray(invoice.notifications) ? invoice.notifications : [];
      const merged = [...currentNotifications, ...notifications];
      const emailSent = merged.some(n => n.channel === 'email' && n.status === 'sent');
      const whatsappSent = merged.some(n => n.channel === 'whatsapp' && n.status === 'sent');
      // Marcar como enviado se pelo menos um canal foi enviado com sucesso
      await invoice.update({ notifications: merged, sent: emailSent || whatsappSent });
    } catch (notifError) {
      console.warn('Não foi possível persistir notificações. Prosseguindo.', notifError?.message);
    }

    return res.status(201).json({
      status: 'success',
      message: 'Cobrança avulsa criada, emitida e notificada',
      data: { invoice, notifications, provider_response: gatewayResponse }
    });
  } catch (error) {
    console.error('Error creating ad-hoc invoice:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Erro ao criar cobrança avulsa'
    });
  }
});

// Listar cobranças
router.get('/', async (req, res) => {
  try {
    const { status, client_id, from, to, startDate, endDate } = req.query;
    const where = {};

    if (status) where.status = status;
    if (client_id) where.cliente_id = client_id;

    // Preferir startDate/endDate; fallback para from/to
    const startParam = startDate || from;
    const endParam = endDate || to;

    if (startParam && endParam) {
      // Usar string YYYY-MM-DD diretamente para DATEONLY (sem timezone)
      const startStr = String(startParam).trim();
      const endStr = String(endParam).trim();
      // Incluir ambos limites de forma inclusiva: between em strings funciona para DATEONLY
      where.due_date = {
        [Op.between]: [startStr, endStr]
      };
    }

    const invoices = await Invoice.findAll({
      where,
      include: [
        {
          model: Client,
          as: 'client',
          attributes: ['id', 'name', 'email', 'status']
        },
        {
          model: Subscription,
          as: 'subscription',
          required: false
        }
      ],
      order: [['due_date', 'DESC']]
    });

    return res.status(200).json({
      status: 'success',
      data: invoices
    });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Erro ao buscar cobranças'
    });
  }
});

// Obter cobrança por ID
router.get('/:id', async (req, res) => {
  try {
    const invoice = await Invoice.findByPk(req.params.id, {
      include: [
        { 
          model: Client, 
          as: 'client',
          attributes: ['id', 'name', 'email', 'status']
        },
        { 
          model: Subscription, 
          as: 'subscription',
          required: false
        }
      ]
    });
    
    if (!invoice) {
      return res.status(404).json({
        status: 'error',
        message: 'Cobrança não encontrada'
      });
    }
    
    return res.status(200).json({
      status: 'success',
      data: { invoice }
    });
  } catch (error) {
    console.error('Error fetching invoice:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Erro ao buscar cobrança'
    });
  }
});

// Reenviar cobrança por email/whatsapp
router.post('/:id/send', async (req, res) => {
  try {
    const { channels } = req.body; // ['email', 'whatsapp']
    const invoice = await Invoice.findByPk(req.params.id, {
      include: [{ model: Client, as: 'client' }]
    });
    
    if (!invoice) {
      return res.status(404).json({
        status: 'error',
        message: 'Cobrança não encontrada'
      });
    }
    
    if (!channels || channels.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Especifique pelo menos um canal de envio (email ou whatsapp)'
      });
    }
    
    const notifications = [];
    
    // Determinar quais canais enviar
    const sendEmail = channels.includes('email') && invoice.client.email;
    const sendWhatsApp = channels.includes('whatsapp') && invoice.client.phone;
    
    try {
      const notificationResults = await notifier.sendCompleteNotification(
        invoice, 
        invoice.client, 
        { sendEmail, sendWhatsApp }
      );
      
      if (notificationResults.email) {
        notifications.push({
          channel: 'email',
          sent_at: new Date(),
          status: notificationResults.email.success ? 'sent' : 'failed',
          error: notificationResults.email.success ? null : notificationResults.email.message
        });
      }
      
      if (notificationResults.whatsapp) {
        notifications.push({
          channel: 'whatsapp',
          sent_at: new Date(),
          status: notificationResults.whatsapp.success ? 'sent' : 'failed',
          error: notificationResults.whatsapp.success ? null : notificationResults.whatsapp.message
        });
      }
    } catch (error) {
      console.error('Erro ao reenviar notificações:', error);
      notifications.push({
        channel: 'general',
        sent_at: new Date(),
        status: 'failed',
        error: error.message
      });
    }
    
    // Atualizar registro de notificações e status de "enviado"
    const currentNotifications = Array.isArray(invoice.notifications) ? invoice.notifications : [];
    const merged = [...currentNotifications, ...notifications];
    const emailSent = merged.some(n => n.channel === 'email' && n.status === 'sent');
    const whatsappSent = merged.some(n => n.channel === 'whatsapp' && n.status === 'sent');
    // Marcar como enviado se pelo menos um canal foi enviado com sucesso
    await invoice.update({ notifications: merged, sent: emailSent || whatsappSent });
    
    return res.status(200).json({
      status: 'success',
      message: 'Cobrança reenviada com sucesso',
      data: { notifications }
    });
  } catch (error) {
    console.error('Error sending invoice:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Erro ao reenviar cobrança'
    });
  }
});

// Deletar cobrança do banco de dados
router.delete('/:id', async (req, res) => {
  try {
    const invoice = await Invoice.findByPk(req.params.id);
    if (!invoice) {
      return res.status(404).json({ status: 'error', message: 'Cobrança não encontrada' });
    }
    await invoice.destroy();
    return res.status(200).json({ status: 'success', message: 'Cobrança deletada com sucesso' });
  } catch (error) {
    console.error('Error deleting invoice:', error);
    return res.status(500).json({ status: 'error', message: 'Erro ao deletar cobrança' });
  }
});

// Marcar cobrança como paga manualmente
router.post('/:id/manual_mark_paid', async (req, res) => {
  try {
    const { paid_date, notes } = req.body;
    const invoice = await Invoice.findByPk(req.params.id);
    
    if (!invoice) {
      return res.status(404).json({
        status: 'error',
        message: 'Cobrança não encontrada'
      });
    }
    
    if (invoice.status === 'paid') {
      return res.status(400).json({
        status: 'error',
        message: 'Esta cobrança já está marcada como paga'
      });
    }
    
    await invoice.update({
      status: 'paid',
      paid_date: paid_date || new Date(),
      notes: notes
    });
    
    return res.status(200).json({
      status: 'success',
      message: 'Cobrança marcada como paga com sucesso',
      data: { invoice }
    });
  } catch (error) {
    console.error('Error marking invoice as paid:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Erro ao marcar cobrança como paga'
    });
  }
});

// Alias para compatibilidade com o frontend: /:id/mark-paid
router.post('/:id/mark-paid', async (req, res) => {
  try {
    const { paid_date, notes, send_confirmation = true } = req.body;
    const invoice = await Invoice.findByPk(req.params.id, {
      include: [{ model: Client, as: 'client' }]
    });

    if (!invoice) {
      return res.status(404).json({
        status: 'error',
        message: 'Cobrança não encontrada'
      });
    }

    if (invoice.status === 'paid') {
      return res.status(400).json({
        status: 'error',
        message: 'Esta cobrança já está marcada como paga'
      });
    }

    // Atualizar status da cobrança
    await invoice.update({
      status: 'paid',
      paid_date: paid_date || new Date(),
      notes: notes
    });

    let paymentConfirmation = null;

    // Enviar mensagem de confirmação de pagamento se solicitado
    if (send_confirmation && invoice.client) {
      try {
        console.log('🎉 Enviando mensagem de confirmação de pagamento...');
        paymentConfirmation = await notifier.sendPaymentConfirmationMessage(invoice, invoice.client);
        
        // Registrar a notificação de confirmação
        const currentNotifications = Array.isArray(invoice.notifications) ? invoice.notifications : [];
        const confirmationNotification = {
          channel: 'whatsapp_payment_confirmation',
          sent_at: new Date(),
          status: paymentConfirmation.success ? 'sent' : 'failed',
          error: paymentConfirmation.success ? null : paymentConfirmation.error || paymentConfirmation.message
        };
        
        await invoice.update({ 
          notifications: [...currentNotifications, confirmationNotification] 
        });
        
      } catch (confirmationError) {
        console.error('Erro ao enviar confirmação de pagamento:', confirmationError);
        paymentConfirmation = {
          success: false,
          error: confirmationError.message
        };
      }
    }

    return res.status(200).json({
      status: 'success',
      message: 'Cobrança marcada como paga com sucesso',
      data: { 
        invoice,
        payment_confirmation: paymentConfirmation
      }
    });
  } catch (error) {
    console.error('Error marking invoice as paid:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Erro ao marcar cobrança como paga'
    });
  }
});

// Rota para editar invoice
router.put('/:id', async (req, res) => {
  try {
    const { amount, due_date, title } = req.body;
    const invoice = await Invoice.findByPk(req.params.id);

    if (!invoice) {
      return res.status(404).json({
        status: 'error',
        message: 'Cobrança não encontrada'
      });
    }

    // Não permitir edição de cobranças já pagas
    if (invoice.status === 'paid') {
      return res.status(400).json({
        status: 'error',
        message: 'Não é possível editar uma cobrança já paga'
      });
    }

    // Validação do valor se fornecido
    if (amount !== undefined) {
      const valorNumerico = parseFloat(amount);
      if (valorNumerico <= 0) {
        return res.status(400).json({
          status: 'error',
          message: 'O valor da cobrança deve ser maior que zero'
        });
      }
    }

    // Validação da data de vencimento se fornecida
    let dataVencimentoString;
    if (due_date !== undefined) {
      dataVencimentoString = createDateOnly(due_date);
      const dataVencimento = new Date(dataVencimentoString);
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      if (dataVencimento < hoje) {
        return res.status(400).json({
          status: 'error',
          message: 'A data de vencimento não pode ser anterior à data atual'
        });
      }
    }

    // Preparar dados para atualização
    const updateData = {};
    if (amount !== undefined) updateData.amount = parseFloat(amount);
    if (due_date !== undefined) updateData.due_date = dataVencimentoString;
    if (title !== undefined) updateData.title = title;

    await invoice.update(updateData);

    // Buscar invoice atualizada com relacionamentos
    const updatedInvoice = await Invoice.findByPk(req.params.id, {
      include: [
        { 
          model: Client, 
          as: 'client',
          attributes: ['id', 'name', 'email', 'status']
        },
        { 
          model: Subscription, 
          as: 'subscription',
          required: false
        }
      ]
    });

    return res.status(200).json({
      status: 'success',
      message: 'Cobrança atualizada com sucesso',
      data: { invoice: updatedInvoice }
    });
  } catch (error) {
    console.error('Error updating invoice:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Erro ao atualizar cobrança'
    });
  }
});

// Rota para excluir invoice
router.delete('/:id', async (req, res) => {
  try {
    const invoice = await Invoice.findByPk(req.params.id);

    if (!invoice) {
      return res.status(404).json({
        status: 'error',
        message: 'Cobrança não encontrada'
      });
    }

    await invoice.destroy();

    return res.status(200).json({
      status: 'success',
      message: 'Cobrança excluída com sucesso'
    });
  } catch (error) {
    console.error('Error deleting invoice:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Erro ao excluir cobrança'
    });
  }
});

module.exports = router;