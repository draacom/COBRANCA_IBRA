require('dotenv').config();
const { Worker } = require('bullmq');
const IORedis = require('ioredis');
const db = require('../models');
const safe2payClient = require('../services/safe2pay_client');
const notifier = require('../services/notifier');
const settings = require('../config/settings');

const connection = new IORedis(settings.redis.url);

const worker = new Worker('billing', async job => {
  console.log(`Processando job: ${job.name}, ID: ${job.id}`);
  
  if (job.name === 'create-invoice') {
    const { subscriptionId, clientId, amount, dueDate, paymentMethod } = job.data;
    
    try {
      // 1) Verificar se invoice já existe (idempotência)
      const existing = await db.Invoice.findOne({
        where: {
          subscription_id: subscriptionId,
          due_date: new Date(dueDate)
        }
      });
      
      if (existing) {
        console.log(`Invoice já existe, ignorando. ID: ${existing.id}`);
        return { status: 'skipped', reason: 'invoice_exists' };
      }
      
      // 2) Buscar cliente e assinatura
      const client = await db.Client.findByPk(clientId);
      const subscription = await db.Subscription.findByPk(subscriptionId);
      if (!client) {
        throw new Error(`Cliente não encontrado. ID: ${clientId}`);
      }
      if (!subscription) {
        throw new Error(`Assinatura não encontrada. ID: ${subscriptionId}`);
      }
      
      // 3) Criar invoice no banco de dados com status pending
      const invoice = await db.Invoice.create({
        subscription_id: subscriptionId,
        client_id: clientId,
        amount,
        due_date: new Date(dueDate),
        status: 'pending',
        payment_method: paymentMethod,
        title: subscription.charge_name || `Cobrança de ${client.name}`
      });
      
      console.log(`Invoice criada com sucesso. ID: ${invoice.id}`);
      
      // 4) Validar dados do cliente antes de enviar para Safe2Pay
      console.log('Validando dados do cliente para cobrança automática...');
      
      // Validar campos obrigatórios do cliente
      const camposFaltantes = [];
      if (!client.email) camposFaltantes.push('Email');
      if (!client.document) camposFaltantes.push('Documento');
      if (!client.phone) camposFaltantes.push('Telefone');
      
      // Validar endereço se for um objeto
      if (client.address && typeof client.address === 'object') {
        if (!client.address.endereco) camposFaltantes.push('Rua');
        if (!client.address.numero) camposFaltantes.push('Número');
        if (!client.address.bairro) camposFaltantes.push('Bairro');
        if (!client.address.cidade) camposFaltantes.push('Cidade');
        if (!client.address.estado) camposFaltantes.push('Estado');
        if (!client.address.cep) camposFaltantes.push('CEP');
      } else {
        camposFaltantes.push('Endereço completo');
      }
      
      if (camposFaltantes.length > 0) {
        throw new Error(`Cliente com dados incompletos. Campos faltantes: ${camposFaltantes.join(', ')}`);
      }
      
      // 5) Preparar dados para Safe2Pay seguindo o formato correto
      const descricao = subscription.charge_name || `Cobrança automática de ${client.name}`;
      const codigoPedido = `AUTO${invoice.id}${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}`;
      
      const gatewayPayload = {
        IsSandbox: process.env.SAFE2PAY_SANDBOX === 'true',
        Application: 'Pagamento de Serviço',
        Vendor: client.name,
        CallbackUrl: process.env.SAFE2PAY_CALLBACK_URL,
        PaymentMethod: paymentMethod === 'boleto' ? '1' : '6', // 1 = Boleto, 6 = PIX
        Customer: {
          Name: client.name,
          Identity: client.document.replace(/[^0-9]/g, ''),
          Email: client.email,
          Phone: client.phone.replace(/[^0-9]/g, '').replace(/^55(\d{10,11})$/, '$1'),
          Address: {
            ZipCode: client.address.cep ? client.address.cep.toString().replace(/[^0-9]/g, '') : '',
            Street: client.address.endereco || '',
            Number: client.address.numero || '',
            Complement: client.address.complement || '',
            District: client.address.bairro || '',
            StateInitials: client.address.estado || '',
            CityName: client.address.cidade || '',
            CountryName: 'Brasil'
          }
        },
        Products: [
          {
            Code: codigoPedido,
            Description: descricao,
            UnitPrice: amount,
            Quantity: 1
          }
        ],
        Reference: codigoPedido
      };

      // Adicionar configurações específicas para boleto
      if (paymentMethod === 'boleto') {
        gatewayPayload.PaymentObject = {
          DueDate: new Date(dueDate).toISOString().split('T')[0],
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
      
      const gatewayResponse = await safe2payClient.emitirCobranca(gatewayPayload);
      
      // 5) Atualizar invoice com dados do provedor
      await invoice.update({
        provider_id: gatewayResponse.id,
        payment_url: gatewayResponse.payment_url,
        payment_code: gatewayResponse.payment_code,
        payment_details: gatewayResponse.payment_details || null
      });
      
      console.log(`Invoice atualizada com dados do provedor. ID: ${invoice.id}`);
      
      // 6) Enviar notificações
      const notifications = [];
      
      try {
        const notificationResults = await notifier.sendCompleteNotification(invoice, client);
        
        if (notificationResults.email) {
          notifications.push({
            channel: 'email',
            sent_at: new Date(),
            status: notificationResults.email.success ? 'sent' : 'error',
            error: notificationResults.email.success ? null : notificationResults.email.message
          });
          console.log(`Email ${notificationResults.email.success ? 'enviado' : 'falhou'} para cliente ${client.id}`);
        }
        
        if (notificationResults.whatsapp) {
          notifications.push({
            channel: 'whatsapp',
            sent_at: new Date(),
            status: notificationResults.whatsapp.success ? 'sent' : 'error',
            error: notificationResults.whatsapp.success ? null : notificationResults.whatsapp.message
          });
          console.log(`WhatsApp ${notificationResults.whatsapp.success ? 'enviado' : 'falhou'} para cliente ${client.id}`);
        }
      } catch (notificationError) {
        console.error(`Erro ao enviar notificações para cliente ${client.id}:`, notificationError.message);
        notifications.push({
          channel: 'general',
          sent_at: new Date(),
          status: 'error',
          error: notificationError.message
        });
      }
      
      // 7) Atualizar invoice com registro de notificações
      const emailSent = notifications.some(n => n.channel === 'email' && n.status === 'sent');
      const whatsappSent = notifications.some(n => n.channel === 'whatsapp' && n.status === 'sent');
      // Marcar como enviado se pelo menos um canal foi enviado com sucesso
      await invoice.update({ notifications, sent: emailSent || whatsappSent });
      
      return { status: 'success', invoice_id: invoice.id };
    } catch (error) {
      console.error(`Erro ao processar cobrança: ${error.message}`);
      throw error; // Permite que o BullMQ tente novamente conforme configuração
    }
  }
}, { 
  connection,
  concurrency: 5
});

worker.on('completed', job => {
  console.log(`Job ${job.id} concluído com sucesso`);
});

worker.on('failed', (job, error) => {
  console.error(`Job ${job.id} falhou: ${error.message}`);
});

console.log('Worker iniciado e aguardando jobs...');

// Tratamento de encerramento
process.on('SIGTERM', async () => {
  console.log('Worker recebeu SIGTERM, encerrando...');
  await worker.close();
  await connection.quit();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Worker recebeu SIGINT, encerrando...');
  await worker.close();
  await connection.quit();
  process.exit(0);
});