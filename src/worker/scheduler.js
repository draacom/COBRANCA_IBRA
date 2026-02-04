require('dotenv').config();
const { Queue } = require('bullmq');
const IORedis = require('ioredis');
const db = require('../models');
const { Op } = require('sequelize');

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379');
const billingQueue = new Queue('billing', { connection });

async function scheduleDaily() {
  try {
    console.log('Iniciando agendamento de cobranças...');
    const today = new Date();
    const day = today.getDate();
    
    // Buscar assinaturas ativas com dia de cobrança igual ao dia atual
    const subscriptions = await db.Subscription.findAll({
      where: {
        active: true,
        billing_day: day
      },
      include: [{ model: db.Client, as: 'client' }]
    });
    
    console.log(`Encontradas ${subscriptions.length} assinaturas para cobrar hoje`);
    
    for (const subscription of subscriptions) {
      // Verificar se já existe cobrança para este mês
      const existingInvoice = await db.Invoice.findOne({
        where: {
          subscription_id: subscription.id,
          due_date: {
            [Op.between]: [
              new Date(today.getFullYear(), today.getMonth(), 1),
              new Date(today.getFullYear(), today.getMonth() + 1, 0)
            ]
          }
        }
      });
      
      if (existingInvoice) {
        console.log(`Cobrança já existe para a assinatura ${subscription.id} neste mês. Ignorando.`);
        continue;
      }
      
      // Calcular data de vencimento (geralmente o mesmo dia ou alguns dias depois)
      const dueDate = computeDueDate(subscription.billing_day);
      
      // Enfileirar tarefa para criar cobrança
      await billingQueue.add('create-invoice', {
        subscriptionId: subscription.id,
        clientId: subscription.client_id,
        amount: subscription.amount,
        dueDate: dueDate,
        paymentMethod: subscription.method
      }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 60000 }
      });
      
      console.log(`Cobrança enfileirada para assinatura ${subscription.id}`);
    }
    
    console.log(`Total de ${subscriptions.length} cobranças enfileiradas`);
    
    // Atualizar next_billing_date das assinaturas processadas
    for (const subscription of subscriptions) {
      const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, subscription.billing_day);
      await subscription.update({ next_billing_date: nextMonth });
    }
    
    console.log('Agendamento de cobranças concluído com sucesso');
  } catch (error) {
    console.error('Erro ao agendar cobranças:', error);
  } finally {
    // Fechar conexão com Redis
    await connection.quit();
    process.exit(0);
  }
}

function computeDueDate(billingDay) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  
  // Data de vencimento: mesmo dia ou alguns dias depois (configurável)
  const gracePeriod = 5; // dias adicionais para pagamento
  const dueDate = new Date(year, month, billingDay + gracePeriod);
  
  // Se o dia de vencimento cair no próximo mês, ajustar para o último dia do mês atual
  if (dueDate.getMonth() !== month) {
    return new Date(year, month + 1, 0); // último dia do mês atual
  }
  
  return dueDate;
}

// Executar o agendador
scheduleDaily().catch(console.error);