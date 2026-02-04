const express = require('express');
const { Subscription, Client, Invoice } = require('../models');
const { Op } = require('sequelize');
const notifier = require('../services/notifier');
const Safe2PayClient = require('../services/safe2pay_client');

const router = express.Router();

// Listar assinaturas
router.get('/', async (req, res) => {
  try {
    const subscriptions = await Subscription.findAll({
      include: [{ model: Client, as: 'client' }]
    });
    
    // Mapear os campos para o formato esperado pelo frontend
    const mappedSubscriptions = subscriptions.map(subscription => ({
      id: subscription.id,
      client_id: subscription.cliente_id,
      client: subscription.client ? {
        id: subscription.client.id,
        name: subscription.client.name,
        email: subscription.client.email,
        address: {
          endereco: subscription.client.endereco,
          numero: subscription.client.numero,
          bairro: subscription.client.bairro,
          cidade: subscription.client.cidade,
          estado: subscription.client.estado,
          cep: subscription.client.cep
        },
        active: subscription.client.status === 'ativo'
      } : null,
      amount: parseFloat(subscription.valor),
      billing_day: subscription.vencimento_dia,
      method: subscription.metodo_pagamento,
      type: subscription.tipo,
      send_day: subscription.envio_dia,
      first_payment_date: subscription.data_primeiro_pagamento,
      charge_name: subscription.nome_cobranca,
      discount: subscription.desconto ? parseFloat(subscription.desconto) : null,
      discount_type: subscription.desconto_tipo,
      fine: subscription.multa ? parseFloat(subscription.multa) : null,
      fine_type: subscription.multa_tipo,
      interest: subscription.juros ? parseFloat(subscription.juros) : null,
      interest_type: subscription.juros_tipo,
      active: subscription.status === 'ativo',
      status: subscription.status,
      created_at: subscription.criado_em,
      updated_at: subscription.atualizado_em
    }));
    
    return res.status(200).json({
      status: 'success',
      data: mappedSubscriptions
    });
  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Erro ao buscar assinaturas'
    });
  }
});

// Criar assinatura
router.post('/', async (req, res) => {
  try {
    // aceitar tanto `method` quanto `payment_method`
    const { client_id, amount, billing_day, send_day, charge_name, active } = req.body;
    const method = req.body.method || req.body.payment_method;
    
    if (!client_id || !amount || !billing_day || !method) {
      return res.status(400).json({
        status: 'error',
        message: 'Dados incompletos. ID do cliente, valor, dia de cobrança e método são obrigatórios'
      });
    }
    
    // Verificar se o cliente existe
    const client = await Client.findByPk(client_id);
    if (!client) {
      return res.status(404).json({
        status: 'error',
        message: 'Cliente não encontrado'
      });
    }
    
    // Calcular próximas datas
    const nextBillingDate = computeNextDate(billing_day);
    const nextSendDate = send_day ? computeNextDate(send_day) : null;
    
    const subscription = await Subscription.create({
      cliente_id: client_id,
      valor: amount,
      vencimento_dia: billing_day,
      metodo_pagamento: method,
      nome_cobranca: charge_name,
      envio_dia: send_day || null,
      status: active !== false ? 'ativo' : 'inativo'
    });
    
    return res.status(201).json({
      status: 'success',
      data: subscription
    });
  } catch (error) {
    console.error('Error creating subscription:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Erro ao criar assinatura'
    });
  }
});

// Atualizar assinatura
router.put('/:id', async (req, res) => {
  try {
    const { amount, billing_day, send_day, method, type, discount, discount_type, fine, fine_type, interest, interest_type, charge_name } = req.body;
    const subscription = await Subscription.findByPk(req.params.id);
    
    if (!subscription) {
      return res.status(404).json({
        status: 'error',
        message: 'Assinatura não encontrada'
      });
    }
    
    // Preparar dados para atualização usando os nomes corretos dos campos
    const updateData = {
      atualizado_em: new Date()
    };
    
    if (amount !== undefined) updateData.valor = amount;
    if (billing_day !== undefined) updateData.vencimento_dia = billing_day;
    if (send_day !== undefined) updateData.envio_dia = send_day;
    if (method !== undefined) updateData.metodo_pagamento = method;
    if (type !== undefined) updateData.tipo = type;
    if (discount !== undefined) updateData.desconto = discount;
    if (discount_type !== undefined) updateData.desconto_tipo = discount_type;
    if (fine !== undefined) updateData.multa = fine;
    if (fine_type !== undefined) updateData.multa_tipo = fine_type;
    if (interest !== undefined) updateData.juros = interest;
    if (interest_type !== undefined) updateData.juros_tipo = interest_type;
    if (charge_name !== undefined) updateData.nome_cobranca = charge_name;
    
    await subscription.update(updateData);
    
    // Buscar a assinatura atualizada com o cliente
    const updatedSubscription = await Subscription.findByPk(req.params.id, {
      include: [{ model: Client, as: 'client' }]
    });
    
    return res.status(200).json({
      status: 'success',
      data: updatedSubscription
    });
  } catch (error) {
    console.error('Error updating subscription:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Erro ao atualizar assinatura'
    });
  }
});

// Ativar assinatura
router.post('/:id/activate', async (req, res) => {
  try {
    const subscription = await Subscription.findByPk(req.params.id);
    
    if (!subscription) {
      return res.status(404).json({
        status: 'error',
        message: 'Assinatura não encontrada'
      });
    }
    
    await subscription.update({
      status: 'ativo',
      atualizado_em: new Date()
    });
    
    return res.status(200).json({
      status: 'success',
      message: 'Assinatura ativada com sucesso'
    });
  } catch (error) {
    console.error('Error activating subscription:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Erro ao ativar assinatura'
    });
  }
});

// Cancelar assinatura
router.post('/:id/cancel', async (req, res) => {
  try {
    const subscription = await Subscription.findByPk(req.params.id);
    
    if (!subscription) {
      return res.status(404).json({
        status: 'error',
        message: 'Assinatura não encontrada'
      });
    }
    
    await subscription.update({
      status: 'cancelado',
      atualizado_em: new Date()
    });
    
    return res.status(200).json({
      status: 'success',
      message: 'Assinatura cancelada com sucesso'
    });
  } catch (error) {
    console.error('Error canceling subscription:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Erro ao cancelar assinatura'
    });
  }
});

// Excluir assinatura
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar se a assinatura existe
    const subscription = await Subscription.findByPk(id, {
      include: [{ model: Client, as: 'client' }]
    });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'Assinatura não encontrada'
      });
    }

    // Verificar se há faturas associadas
    const { Invoice } = require('../models');
    const invoiceCount = await Invoice.count({
      where: { subscription_id: id }
    });

    if (invoiceCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Não é possível excluir a assinatura. Existem ${invoiceCount} fatura(s) associada(s). Cancele a assinatura ao invés de excluí-la.`,
        invoiceCount
      });
    }

    // Excluir a assinatura
    await subscription.destroy();

    res.json({
      success: true,
      message: `Assinatura de ${subscription.client?.nome || 'Cliente'} excluída com sucesso`,
      data: {
        id: subscription.id,
        client_name: subscription.client?.nome,
        amount: parseFloat(subscription.valor),
        type: subscription.tipo
      }
    });

  } catch (error) {
    console.error('Erro ao excluir assinatura:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: error.message
    });
  }
});

// Gerar cobranças do dia
router.post('/generate-daily-charges', async (req, res) => {
  try {
    const { Invoice } = require('../models');
    // Calcular dia atual considerando timezone America/Sao_Paulo para evitar desvios em servidores UTC
    const saoPauloNowStr = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const [datePart] = saoPauloNowStr.split(' ');
    const [dayStr, monthStr, yearStr] = datePart.split('/');
    const currentDay = parseInt(dayStr, 10);
    const currentMonth = parseInt(monthStr, 10) - 1;
    const currentYear = parseInt(yearStr, 10);
    
    console.log(`Iniciando geração de cobranças (America/Sao_Paulo) dia=${currentDay} mês=${currentMonth + 1} ano=${currentYear}`);
    
    // Buscar assinaturas ativas que devem gerar cobrança hoje
    // Regra: se envio_dia estiver definido, usar envio_dia.
    // Caso envio_dia esteja nulo, considerar vencimento_dia como fallback para o envio.
    const { Op } = require('sequelize');
    const subscriptions = await Subscription.findAll({
      where: {
        status: 'ativo',
        [Op.or]: [
          { envio_dia: currentDay },
          { envio_dia: { [Op.is]: null }, vencimento_dia: currentDay }
        ]
      },
      include: [{ 
        model: Client, 
        as: 'client',
        where: {
          status: 'ativo'
        }
      }]
    });
    
    console.log(`Encontradas ${subscriptions.length} assinaturas para processar`);
    if (subscriptions.length > 0) {
      console.log('IDs e dias das assinaturas selecionadas:', subscriptions.map(s => ({ id: s.id, envio_dia: s.envio_dia, vencimento_dia: s.vencimento_dia })));
    }
    
    if (subscriptions.length === 0) {
      return res.json({
        success: true,
        message: 'Nenhuma assinatura encontrada para gerar cobranças hoje',
        generated: 0,
        details: []
      });
    }
    
    const results = [];
    let successCount = 0;
    let errorCount = 0;
    
    for (const subscription of subscriptions) {
      try {
        // Calcular data de vencimento baseada no vencimento_dia, fixando timezone lógico
        const billingDay = subscription.vencimento_dia;
        // Se o dia de vencimento já passou este mês (estritamente >), usar próximo mês
        let dueDate = new Date(currentYear, currentMonth, billingDay);
        if (currentDay > billingDay) {
          dueDate = new Date(currentYear, currentMonth + 1, billingDay);
        }
        console.log(`Calculado dueDate para sub ${subscription.id}: ${dueDate.toISOString()} (billingDay=${billingDay}, currentDay=${currentDay})`);
        
        // Verificar se já existe cobrança para este mês/ano
        const existingInvoice = await Invoice.findOne({
          where: {
            subscription_id: subscription.id,
            due_date: {
              [Op.between]: [
                new Date(dueDate.getFullYear(), dueDate.getMonth(), 1),
                new Date(dueDate.getFullYear(), dueDate.getMonth() + 1, 0)
              ]
            }
          }
        });
        
        if (existingInvoice) {
          results.push({
            subscription_id: subscription.id,
            client_name: subscription.client.name,
            status: 'skipped',
            message: 'Cobrança já existe para este mês',
            due_date: dueDate.toISOString().split('T')[0]
          });
          continue;
        }
        
        // Gerar descrição da cobrança
        const monthNames = [
          'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
          'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
        ];
        const monthName = monthNames[dueDate.getMonth()];
        const year = dueDate.getFullYear();
        
        const title = subscription.nome_cobranca || 
          `${subscription.tipo.charAt(0).toUpperCase() + subscription.tipo.slice(1)} - ${monthName}/${year}`;
        
        // Criar a cobrança
        const invoice = await Invoice.create({
          subscription_id: subscription.id,
          cliente_id: subscription.cliente_id,
          amount: subscription.valor,
          due_date: dueDate,
          payment_method: subscription.metodo_pagamento,
          title: title,
          status: 'pending'
        });
        
        // Integrar com Safe2Pay para gerar link de pagamento
        let safe2payResponse = null;
        try {
          console.log(`💳 Criando cobrança no Safe2Pay para invoice ${invoice.id}`);
          
          // Preparar dados para Safe2Pay seguindo o formato da cobrança avulsa
          const paymentData = {
            IsSandbox: process.env.SAFE2PAY_SANDBOX === 'true',
            Application: 'Pagamento de Serviço',
            Vendor: subscription.client.name,
            CallbackUrl: process.env.SAFE2PAY_CALLBACK_URL,
            PaymentMethod: subscription.metodo_pagamento === 'pix' ? '6' : '1', // 1 = Boleto, 6 = PIX
            Customer: {
              Name: subscription.client.name,
              Identity: (subscription.client.document || subscription.client.cpf_cnpj || '').replace(/\D/g, ''),
              Email: subscription.client.email,
              Phone: (subscription.client.phone || subscription.client.telefone || '').replace(/\D/g, '').replace(/^55(\d{10,11})$/, '$1'),
              Address: {
                ZipCode: (subscription.client.zip_code || subscription.client.cep || '').replace(/\D/g, ''),
                Street: subscription.client.address || subscription.client.endereco || '',
                Number: subscription.client.number || subscription.client.numero || '',
                Complement: subscription.client.complement || subscription.client.complemento || '',
                District: subscription.client.district || subscription.client.bairro || '',
                StateInitials: subscription.client.state || subscription.client.uf || '',
                CityName: subscription.client.city || subscription.client.cidade || '',
                CountryName: 'Brasil'
              }
            },
            Products: [{
              Code: `SUB-${subscription.id}-${invoice.id}`,
              Description: title,
              UnitPrice: parseFloat(subscription.valor),
              Quantity: 1
            }],
            Reference: invoice.id.toString()
          };
          
          // Adicionar configurações específicas para boletos seguindo o formato utilizado nas cobranças avulsas
          if (subscription.metodo_pagamento === 'boleto') {
            // Normalizar dueDate para meio-dia e evitar offset de timezone ao converter para ISO
            const normalizedDue = new Date(dueDate.getTime());
            normalizedDue.setHours(12, 0, 0, 0);
            const dueDateStr = normalizedDue.toISOString().split('T')[0]; // YYYY-MM-DD

            paymentData.PaymentObject = {
              DueDate: dueDateStr,
              Instruction: 'Não receber após o vencimento',
              // Multa 1% e juros 2% (mensal)
              PenaltyAmount: parseFloat(process.env.SAFE2PAY_BOLETO_FINE_PERCENT || '1'),
              InterestAmount: parseFloat(process.env.SAFE2PAY_BOLETO_INTEREST_MONTHLY_PERCENT || '2'),
              CancelAfterDue: false,
              IsEnablePartialPayment: false,
              DaysBeforeCancel: 0,
              Messages: ['Em caso de dúvidas, entre em contato conosco']
            };
          }
          
          const safe2payClient = new Safe2PayClient();
          safe2payResponse = await safe2payClient.emitirCobranca(paymentData);
          
          console.log(`✅ Cobrança criada no Safe2Pay:`, safe2payResponse);
          
          // Atualizar invoice com dados do Safe2Pay
          console.log(`🔍 RESPOSTA COMPLETA DO SAFE2PAY:`, JSON.stringify(safe2payResponse, null, 2));
          
          const responseDetail = safe2payResponse.ResponseDetail || safe2payResponse;
          console.log(`🔍 RESPONSE DETAIL:`, JSON.stringify(responseDetail, null, 2));
          
          // Verificar todos os campos possíveis para payment_url
          console.log(`🔍 CAMPOS DISPONÍVEIS:`, Object.keys(responseDetail));
          console.log(`🔍 BankSlipUrl:`, responseDetail.BankSlipUrl);
          console.log(`🔍 QrCode:`, responseDetail.QrCode);
          console.log(`🔍 Url:`, responseDetail.Url);
          console.log(`🔍 payment_url:`, responseDetail.payment_url);
          console.log(`🔍 PaymentUrl:`, responseDetail.PaymentUrl);
          console.log(`🔍 Link:`, responseDetail.Link);
          
          // Lógica condicional baseada no tipo de pagamento
          // Para boleto: BankSlipUrl (usar link direto do Safe2Pay)
          // Para PIX: QrCode (usar link público do sistema)
          
          let finalPaymentUrl;
          let finalPublicLink;
          
          if (responseDetail.BankSlipUrl) {
            // É BOLETO - usar link direto do Safe2Pay
            finalPaymentUrl = responseDetail.BankSlipUrl;
            finalPublicLink = responseDetail.BankSlipUrl; // Link direto para boleto
            console.log(`💳 BOLETO detectado - usando link direto do Safe2Pay: ${finalPublicLink}`);
          } else if (responseDetail.QrCode) {
            // É PIX - usar link público do sistema
            finalPaymentUrl = responseDetail.QrCode;
            const baseUrl = process.env.PUBLIC_BASE_URL || process.env.BASE_URL || 'http://localhost:3000';
            finalPublicLink = `${baseUrl}/public/invoice/${invoice.id}`; // Link público para PIX
            console.log(`📱 PIX detectado - usando link público do sistema: ${finalPublicLink}`);
          } else {
            // Fallback para outros tipos
            finalPaymentUrl = responseDetail.Url || responseDetail.payment_url;
            const baseUrl = process.env.PUBLIC_BASE_URL || process.env.BASE_URL || 'http://localhost:3000';
            finalPublicLink = `${baseUrl}/public/invoice/${invoice.id}`;
            console.log(`🔄 Tipo desconhecido - usando link público do sistema: ${finalPublicLink}`);
          }
          
          const updateData = {
            provider_id: responseDetail.IdTransaction || responseDetail.id,
            payment_url: finalPaymentUrl,
            payment_code: responseDetail.DigitableLine || responseDetail.payment_code,
            payment_details: safe2payResponse,
            public_link: finalPublicLink
          };
          
          console.log(`🔍 DADOS PARA ATUALIZAR INVOICE:`, JSON.stringify(updateData, null, 2));
          
          await invoice.update(updateData);
          console.log(`✅ Invoice ${invoice.id} atualizada com dados do Safe2Pay`);
          
        } catch (safe2payError) {
          console.error(`❌ Erro ao criar cobrança no Safe2Pay para invoice ${invoice.id}:`, safe2payError);
          // Não interrompe o processo, mas registra o erro
          safe2payResponse = { error: safe2payError.message };
        }
        
        // Enviar notificações automáticas (email e WhatsApp)
        let notificationResults = {};
        try {
          console.log(`📤 Enviando notificações para cobrança ${invoice.id} - Cliente: ${subscription.client.name}`);
          
          // Recarregar invoice com dados atualizados do Safe2Pay
          await invoice.reload();
          
          notificationResults = await notifier.sendCompleteNotification(invoice, subscription.client, {
            sendEmail: true,
            sendWhatsApp: true
          });
          console.log(`✅ Notificações enviadas para cobrança ${invoice.id}:`, notificationResults);

          // Ajustar status de envio (sent) quando pelo menos um canal foi enviado com sucesso
          try {
            const emailOk = !!(notificationResults.email && notificationResults.email.success === true);
            const whatsappOk = !!(notificationResults.whatsapp && notificationResults.whatsapp.success === true);
            const wasSent = emailOk || whatsappOk;
            await invoice.update({ sent: wasSent });
            console.log(`📬 Status de envio atualizado para ${wasSent ? 'Enviado' : 'Não Enviado'} na invoice ${invoice.id}`);
          } catch (updateErr) {
            console.warn(`⚠️ Não foi possível atualizar o status de envio da invoice ${invoice.id}:`, updateErr?.message);
          }
        } catch (notificationError) {
          console.error(`❌ Erro ao enviar notificações para cobrança ${invoice.id}:`, notificationError);
          notificationResults = {
            email: { success: false, message: notificationError.message },
            whatsapp: { success: false, message: notificationError.message }
          };
        }
        
        results.push({
          subscription_id: subscription.id,
          client_name: subscription.client.name,
          status: 'success',
          message: 'Cobrança gerada com sucesso',
          invoice_id: invoice.id,
          amount: parseFloat(subscription.valor),
          due_date: dueDate.toISOString().split('T')[0],
          title: title,
          safe2pay: safe2payResponse ? (safe2payResponse.error ? { error: safe2payResponse.error } : { success: true, provider_id: invoice.provider_id }) : null,
          notifications: notificationResults
        });
        
        successCount++;
        
      } catch (error) {
        console.error(`Erro ao gerar cobrança para assinatura ${subscription.id}:`, error);
        results.push({
          subscription_id: subscription.id,
          client_name: subscription.client?.name || 'Cliente não encontrado',
          status: 'error',
          message: error.message,
          due_date: null
        });
        errorCount++;
      }
    }
    
    // Contar notificações enviadas
    const notificationStats = results.reduce((stats, result) => {
      if (result.notifications) {
        if (result.notifications.email?.success) stats.emailsSent++;
        if (result.notifications.whatsapp?.success) stats.whatsappSent++;
      }
      return stats;
    }, { emailsSent: 0, whatsappSent: 0 });
    
    // Calcular estatísticas do Safe2Pay
    const safe2payStats = results.reduce((stats, result) => {
      if (result.safe2pay) {
        if (result.safe2pay.success) stats.created++;
        if (result.safe2pay.error) stats.failed++;
      }
      return stats;
    }, { created: 0, failed: 0 });
    
    const message = `Processamento concluído: ${successCount} cobranças geradas, ${errorCount} erros. Safe2Pay: ${safe2payStats.created} criadas. Notificações: ${notificationStats.emailsSent} emails e ${notificationStats.whatsappSent} WhatsApp enviados.`;
    
    res.json({
      success: true,
      message: message,
      generated: successCount,
      errors: errorCount,
      total_processed: subscriptions.length,
      safe2pay_stats: safe2payStats,
      notifications_sent: notificationStats,
      details: results
    });
    
  } catch (error) {
    console.error('Erro ao gerar cobranças do dia:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: error.message
    });
  }
});

// Função auxiliar para calcular próxima data de cobrança
function computeNextDate(dayOfMonth) {
  const today = new Date();
  const currentDay = today.getDate();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  // Se o dia já passou no mês atual (incluindo hoje), usar próximo mês
  if (currentDay >= dayOfMonth) {
    return new Date(currentYear, currentMonth + 1, dayOfMonth);
  }
  // Caso contrário, usar este mês
  return new Date(currentYear, currentMonth, dayOfMonth);
}

module.exports = router;