const nodemailer = require('nodemailer');
const axios = require('axios');
const { Client, LocalAuth } = require('whatsapp-web.js');
// const qrcode = require('qrcode-terminal'); // Desativado para não poluir o console
const fs = require('fs');
const path = require('path');
const settings = require('../config/settings');

function payment_link_fromDetails(details) {
  if (!details) return null;
  try {
    const d = typeof details === 'string' ? JSON.parse(details) : details;
    return (
      d.BankSlipUrl ||
      d.Url ||
      d.payment_url ||
      d.url ||
      (d.boleto && (d.boleto.pdf_url || d.boleto.url)) ||
      (d.pix && (d.pix.payment_url || d.pix.url)) ||
      null
    );
  } catch (_) {
    return null;
  }
}

class Notifier {
  constructor() {
    console.log('🚀 Inicializando Notifier...');
    // Configurar cliente de email com DKIM opcional
    const baseTransport = {
      host: settings.email.host,
      port: settings.email.port,
      secure: String(settings.email.port) === '465',
      auth: {
        user: settings.email.user,
        pass: settings.email.pass
      }
    };

    const dkimDomain = settings.email.dkim.domain || settings.email.from?.split('@')[1];
    const dkimSelector = settings.email.dkim.selector;
    const dkimKey = (settings.email.dkim.privateKey || '').replace(/\\n/g, '\n');

    this.emailTransporter = nodemailer.createTransport({
      ...baseTransport,
      ...(dkimDomain && dkimSelector && dkimKey
        ? {
            dkim: {
              domainName: dkimDomain,
              keySelector: dkimSelector,
              privateKey: dkimKey,
            }
          }
        : {})
    });

    // Inicializar cliente WhatsApp Web (pode ser desativado via variável de ambiente)
    this.whatsappClient = null;
    this.whatsappReady = false;
    this.whatsappQR = null;
    this.whatsappStatus = 'initializing';
    this.whatsappInfo = null;
    this.currentSessionId = 'sistema-cobranca-v2'; // ID da sessão atual

    const whatsappWebEnabled = settings.whatsapp.webEnabled;
    const whatsappProvider = settings.whatsapp.provider;

    if (whatsappWebEnabled && whatsappProvider !== 'evolution') {
      console.log('📱 Iniciando WhatsApp Web.js...');
      this.initWhatsApp();
    } else {
      console.log(`📱 WhatsApp Web.js desativado. Usando provedor: ${whatsappProvider}`);
      this.whatsappStatus = 'disabled';
      
      // Se for Evolution, tentar verificar status inicial com retries
      if (whatsappProvider === 'evolution') {
        const checkLoop = async () => {
            const status = await this.checkEvolutionStatus();
            console.log('📊 Status inicial Evolution:', status ? (status.instance?.state || 'OK') : 'Sem resposta');
            
            // Se não conseguiu conectar ou não está pronto, tentar novamente em breve
            if (!status || (status.instance?.state !== 'open' && status.instance?.state !== 'connecting')) {
                setTimeout(checkLoop, 10000); // Tentar a cada 10s até conectar
            }
        };
        checkLoop().catch(e => console.error('Erro no loop de verificação Evolution:', e));
      }
    }
  }

  // Helper para verificar status da Evolution API
  async checkEvolutionStatus() {
    const apiUrl = settings.whatsapp.evolution.url;
    const apiKey = settings.whatsapp.evolution.apiKey;
    const instanceName = settings.whatsapp.evolution.instanceName;

    if (!apiUrl || !apiKey) return null;

    try {
      // Verificar estado da conexão
      const response = await axios.get(`${apiUrl}/instance/connectionState/${instanceName}`, {
        headers: { 'apikey': apiKey }
      });

      const data = response.data;
      console.log('📊 Resposta Bruta checkEvolutionStatus:', JSON.stringify(data)); // DEBUG

      const state = data?.instance?.state || data?.state;
      
      // Mapear estados da Evolution para estados internos
      if (state === 'open') {
        this.whatsappStatus = 'ready';
        this.whatsappReady = true;
      } else if (state === 'connecting') {
        this.whatsappStatus = 'initializing';
        this.whatsappReady = false;
      } else if (state === 'close') {
        this.whatsappStatus = 'disconnected';
        this.whatsappReady = false;
      }
      
      return data;
    } catch (error) {
      if (error.response && error.response.status === 404) {
        // Instância não existe
        this.whatsappStatus = 'disconnected';
        this.whatsappReady = false;
        console.log('⚠️ Instância Evolution não encontrada (404)');
      } else if (error.code === 'ECONNREFUSED') {
        console.log('⏳ Evolution API ainda não disponível (ECONNREFUSED). Aguardando...');
        this.whatsappStatus = 'initializing';
        this.whatsappReady = false;
      } else {
        console.error('❌ Erro detalhado ao verificar status Evolution:', {
            message: error.message,
            code: error.code,
            response: error.response?.data
        });
      }
    }
    return null;
  }

  // Método auxiliar para matar processos do Chrome/Chromium órfãos no Windows
  async killChromeProcesses() {
    if (process.platform === 'win32') {
      try {
        const { exec } = require('child_process');
        const util = require('util');
        const execAsync = util.promisify(exec);
        
        // Tenta matar processos chrome.exe e chromium que possam estar travando a pasta
        // /F = força o encerramento, /IM = nome da imagem
        console.log('🧹 Tentando encerrar processos Chrome órfãos...');
        await execAsync('taskkill /F /IM chrome.exe /T').catch(() => {}); // Ignora erro se não houver processo
        await execAsync('taskkill /F /IM chromium.exe /T').catch(() => {});
      } catch (e) {
        // Ignora erros gerais
      }
    }
  }

  async initWhatsApp() {
    // Evitar inicialização do Puppeteer se o provedor for Evolution
    if (settings.whatsapp.provider === 'evolution') {
      return;
    }

    try {
      if (this.whatsappClient) {
        console.log('⚠️ Cliente anterior detectado em initWhatsApp, destruindo...');
        try { await this.whatsappClient.destroy(); } catch (e) { console.error('Erro ao destruir cliente anterior:', e.message); }
        this.whatsappClient = null;
        // Pequeno delay para garantir liberação de recursos do SO
        await new Promise(r => setTimeout(r, 2000));
      }

      // Verificar se existe trava na sessão e tentar limpar
      const authPath = path.resolve(process.cwd(), '.wwebjs_auth');
      if (fs.existsSync(authPath)) {
        try {
          // Tentar acesso de escrita para verificar se está bloqueado
          fs.accessSync(authPath, fs.constants.W_OK);
        } catch (e) {
           console.warn('⚠️ Pasta de sessão parece estar bloqueada ou sem permissão:', e.message);
           // Se estiver bloqueada, tentar matar processos do Chrome antes de continuar
           // await this.killChromeProcesses();
        }
      }

      // Configurar estratégia de autenticação com tratamento de erro customizado
      // Alterado clientId para forçar nova sessão e evitar conflito com arquivos travados da sessão anterior
      console.log(`📂 Usando ID de sessão: ${this.currentSessionId}`);
      const authStrategy = new LocalAuth({ clientId: this.currentSessionId });
      
      // Monkey-patch no método logout para evitar crash por EBUSY
      const originalLogout = authStrategy.logout.bind(authStrategy);
      authStrategy.logout = async () => {
        try {
          await originalLogout();
        } catch (err) {
          if (err.message && err.message.includes('EBUSY')) {
            console.warn('⚠️ Ignorando erro EBUSY no logout do LocalAuth (arquivo travado):', err.message);
            return;
          }
          throw err;
        }
      };

      console.log('🔧 Configurando cliente WhatsApp Web.js...');
      this.whatsappStatus = 'initializing';
      this.whatsappClient = new Client({
        authStrategy: authStrategy,
        // restartOnAuthFail: true, // Desativado para evitar conflito com reconexão manual
        puppeteer: {
          headless: true,
          ignoreHTTPSErrors: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
          ],
          executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
        }
      });

      this.whatsappClient.on('error', (err) => {
        console.error('❌ Erro interno do WhatsApp Client:', err);
      });

      this.whatsappClient.on('qr', (qr) => {
        console.log('📱 QR CODE RECEBIDO (Acesse o frontend para escanear)');
        // qrcode.generate(qr, { small: true });
        this.whatsappQR = qr;
        this.whatsappStatus = 'qr_code';
      });

      this.whatsappClient.on('ready', async () => {
        this.whatsappReady = true;
        this.whatsappQR = null;
        this.whatsappStatus = 'ready';
        console.log('✅ Cliente WhatsApp está pronto e conectado!');
        
        // Obter informações do WhatsApp conectado
        try {
          this.whatsappInfo = await this.whatsappClient.info;
          console.log('📱 WhatsApp conectado:', this.whatsappInfo.pushname);
        } catch (error) {
          console.log('⚠️ Não foi possível obter informações do WhatsApp:', error.message);
        }
      });

      this.whatsappClient.on('authenticated', () => {
        console.log('🔐 WhatsApp autenticado com sucesso!');
        this.whatsappStatus = 'authenticated';
      });
      this.whatsappClient.on('auth_failure', (msg) => {
        console.error('❌ Falha na autenticação do WhatsApp:', msg);
        this.whatsappStatus = 'auth_failure';
        this.whatsappQR = null;
      });

      this.whatsappClient.on('disconnected', async (reason) => {
        this.whatsappReady = false;
        this.whatsappQR = null;
        this.whatsappStatus = 'disconnected';
        this.whatsappInfo = null;
        console.log('❌ Cliente WhatsApp desconectado. Motivo:', reason);

        if (reason === 'LOGOUT') {
          console.log('🧹 Sessão foi deslogada pelo WhatsApp (mantendo mesmo ID de sessão). Será necessário escanear o QR novamente uma vez, mas depois a sessão será reutilizada.');
        }

        console.log('🔄 Tentando reconectar em 5 segundos usando o mesmo ID de sessão...');
        setTimeout(() => this.reconnectWhatsApp(), 5000);
      });

      console.log('🚀 Inicializando cliente WhatsApp...');
      await this.whatsappClient.initialize();
    } catch (error) {
      if (error && typeof error.message === 'string' && error.message.includes('Protocol error (Runtime.callFunctionOn): Target closed')) {
        console.warn('⚠️ WhatsApp: alvo fechado durante inicialização (não crítico). Tentando novamente em 15 segundos.');
        this.whatsappStatus = 'error';
        this.whatsappQR = null;
        setTimeout(() => this.initWhatsApp(), 15000);
        return;
      }

      console.error('❌ Erro ao inicializar WhatsApp:', error);
      
      // Tratamento específico para EBUSY (pasta bloqueada)
      if (error.message && error.message.includes('EBUSY')) {
          console.error('⚠️ Erro de arquivo bloqueado (EBUSY). Tentando limpar sessão e reiniciar...');
          try {
             // Tentar destruir cliente
             if (this.whatsappClient) {
                 try { await this.whatsappClient.destroy(); } catch (_) {}
                 this.whatsappClient = null;
             }
             // Delay maior
             await new Promise(r => setTimeout(r, 5000));
          } catch (cleanupError) {
              console.error('Erro na limpeza de emergência:', cleanupError);
          }
      }

      this.whatsappStatus = 'error';
      this.whatsappQR = null;
      console.log('🔄 Tentando novamente em 10 segundos...');
      setTimeout(() => this.initWhatsApp(), 10000);
    }
  }

  // Helper para deletar instância na Evolution API
  async deleteEvolutionInstance(instanceName, apiKey, apiUrl) {
    try {
        console.log(`🧹 Deletando instância Evolution: ${instanceName}`);
        await axios.delete(`${apiUrl}/instance/delete/${instanceName}`, {
            headers: { 'apikey': apiKey }
        });
        console.log('🗑️ Instância deletada com sucesso.');
        await new Promise(r => setTimeout(r, 2000)); // Delay para garantir limpeza
        return true;
    } catch (delErr) {
        console.error('⚠️ Erro ao deletar instância (pode não existir):', delErr.message);
        if (delErr.response) console.error('Dados do erro delete:', delErr.response.data);
        return false;
    }
  }

  // Helper para criar instância na Evolution API
  async createEvolutionInstance(instanceName, apiKey, apiUrl) {
    try {
      console.log(`🔨 Criando instância Evolution: ${instanceName}`);
      const createResponse = await axios.post(`${apiUrl}/instance/create`, {
        instanceName: instanceName,
        qrcode: false,
        integration: 'WHATSAPP-BAILEYS',
        rejectCall: false,
        groupsIgnore: true,
        alwaysOnline: true,
        readMessages: true,
        readStatus: false
      }, {
        headers: { 'apikey': apiKey }
      });
      console.log('✅ Instância criada com sucesso:', createResponse.data);
      return true;
    } catch (createError) {
      if (createError.response && createError.response.status === 403) {
        console.log('⚠️ Instância já existe (403), ignorando erro de criação...');
        return true;
      }
      console.error('❌ Falha ao criar instância:', createError.message);
      if (createError.response) console.error('Dados do erro criação:', createError.response.data);
      return false;
    }
  }

  // Método para obter QR code como string base64
  async getWhatsAppQRCode() {
    const provider = settings.whatsapp.provider;

    if (provider === 'evolution') {
      const apiUrl = settings.whatsapp.evolution.url;
      const apiKey = settings.whatsapp.evolution.apiKey;
      const instanceName = settings.whatsapp.evolution.instanceName;

      if (!apiUrl || !apiKey) {
        console.error('❌ Configuração da Evolution API incompleta para QR Code');
        return null;
      }

      // 1. Verificar status da instância antes de pedir QR
      let state = null;
      let statusData = null;
      try {
        statusData = await this.checkEvolutionStatus();
        state = statusData?.instance?.state || statusData?.state;
        console.log(`📊 Estado atual da instância para QR: ${state || 'Não detectado'}`);
      } catch (e) {
        console.error('Erro ao verificar status pré-QR:', e.message);
      }

      // 2. Se não existe ou erro, tenta criar
      if (!state) {
        console.log('⚠️ Instância não detectada ou com estado inválido. Tentando recuperar...');
        
        // Se a API retornou que a instância existe (tem nome) mas não tem state, ela pode estar corrompida.
        // Vamos tentar deletar para recriar limpo.
        if (statusData?.instance?.instanceName) {
            console.log('🧹 Instância Zumbi detectada (sem estado). Deletando para recriar...');
            await this.deleteEvolutionInstance(instanceName, apiKey, apiUrl);
        }

        const created = await this.createEvolutionInstance(instanceName, apiKey, apiUrl);
        if (!created) return null;
        // Pequeno delay para a instância inicializar
        await new Promise(r => setTimeout(r, 3000));
        return null; // Força novo polling
      } else if (state === 'open') {
        console.log('✅ Instância já está conectada (open). QR Code desnecessário.');
        return null;
      }

      // 3. Tentar obter QR Code (connect)
      try {
        console.log(`🔍 Buscando QR Code na Evolution API: ${apiUrl}/instance/connect/${instanceName}`);
        const response = await axios.get(`${apiUrl}/instance/connect/${instanceName}`, {
          headers: { 'apikey': apiKey }
        });

        const data = response.data;
        
        // Verificar se a API retornou erro lógico (200 OK mas com body de erro)
        // Isso acontece quando a instância está corrompida: { error: true, message: "[object Object]" }
        if (data && data.error) {
            console.error('❌ Evolution API retornou erro lógico:', JSON.stringify(data, null, 2));
            
            const msg = JSON.stringify(data.message);
            // Se o erro for genérico ou "object Object", é sinal de corrupção ou falha interna do driver
            if (msg.includes('object Object') || data.message === '[object Object]') {
                console.log('🔥 Erro crítico na instância (corrompida?). Iniciando protocolo de auto-cura...');
                await this.deleteEvolutionInstance(instanceName, apiKey, apiUrl);
                await this.createEvolutionInstance(instanceName, apiKey, apiUrl);
                return null; // Frontend fará retry e pegará a nova instância limpa
            }

            // Se o erro for "Instance already connected", podemos considerar como conectado
            if (msg.includes('already connected') || msg.includes('connected')) {
                 console.log('⚠️ Instância já conectada (detectado via erro).');
                 return null;
            }
            return null;
        }

        console.log('📦 Resposta Evolution QR:', JSON.stringify(data).substring(0, 200) + '...');

        // Evolution pode retornar base64 diretamente ou dentro de um objeto
        let base64 = data?.base64 || data?.qrcode?.base64;
        
        if (base64 && !base64.startsWith('data:')) {
          base64 = `data:image/png;base64,${base64}`;
        }
        
        if (base64) console.log('✅ QR Code obtido com sucesso!');
        else console.log('⚠️ QR Code não encontrado na resposta.');

        return base64 || null;
      } catch (error) {
        console.error(`❌ Erro ao obter QR code da Evolution API (${apiUrl}):`, error.message);
        if (error.response) {
            console.error('Dados do erro:', error.response.data);
            
            // Se erro 404, tenta criar (fallback)
            if (error.response.status === 404) {
                 console.log('⚠️ Erro 404 no connect. Tentando criar instância...');
                 await this.createEvolutionInstance(instanceName, apiKey, apiUrl);
                 return null; // Frontend fará retry
            }
        }
        return null;
      }
    }

    if (this.whatsappQR) {
      try {
        const qrCodeDataURL = await require('qrcode').toDataURL(this.whatsappQR);
        return qrCodeDataURL;
      } catch (error) {
        console.error('❌ Erro ao gerar QR code:', error);
        return null;
      }
    }
    return null;
  }

  // Método para obter status detalhado do WhatsApp
  async getWhatsAppDetailedStatus() {
    const provider = settings.whatsapp.provider;

    if (provider === 'evolution') {
      await this.checkEvolutionStatus();
    }

    return {
      status: this.whatsappStatus,
      ready: this.whatsappReady,
      hasQR: provider === 'evolution' ? !this.whatsappReady : !!this.whatsappQR,
      info: this.whatsappInfo,
      statusMessage: this.getStatusMessage()
    };
  }

  // Método para obter mensagem de status em português
  getStatusMessage() {
    switch (this.whatsappStatus) {
      case 'initializing':
        return 'Inicializando WhatsApp...';
      case 'qr_code':
        return 'Aguardando leitura do QR Code';
      case 'authenticated':
        return 'WhatsApp autenticado com sucesso';
      case 'ready':
        return 'WhatsApp conectado e pronto para uso';
      case 'disconnected':
        return 'WhatsApp desconectado';
      case 'auth_failure':
        return 'Falha na autenticação do WhatsApp';
      case 'error':
        return 'Erro na inicialização do WhatsApp';
      default:
        return 'Status desconhecido';
    }
  }

  // Método para forçar reconexão do WhatsApp
  async reconnectWhatsApp() {
    const provider = settings.whatsapp.provider;

    if (provider === 'evolution') {
      const apiUrl = settings.whatsapp.evolution.url;
      const apiKey = settings.whatsapp.evolution.apiKey;
      const instanceName = settings.whatsapp.evolution.instanceName;

      if (!apiUrl || !apiKey) {
        return { success: false, message: 'API Evolution não configurada' };
      }

      try {
        console.log('🔄 Reiniciando instância Evolution:', instanceName);
        const response = await axios.post(`${apiUrl}/instance/restart/${instanceName}`, {}, {
          headers: { 'apikey': apiKey }
        });

        return { success: true, message: 'Instância Evolution reiniciada com sucesso' };
      } catch (error) {
        console.error('❌ Erro ao reiniciar Evolution:', error.message);
        if (error.response) {
            console.error('Dados do erro:', error.response.data);
            
            // Se a instância não existir (404), tentar criar
            if (error.response.status === 404) {
                console.log('⚠️ Instância não encontrada, tentando criar...');
                
                // Usar o mesmo helper robusto de criação
                const created = await this.createEvolutionInstance(instanceName, apiKey, apiUrl);
                
                if (created) {
                    return { success: true, message: 'Instância criada com sucesso. Aguarde o QR Code.' };
                } else {
                    return { success: false, message: 'Falha ao criar instância Evolution' };
                }
            }
        }
        return { success: false, message: 'Falha ao reiniciar instância Evolution: ' + (error.response?.data?.message || error.message) };
      }
    }

    try {
      if (this.whatsappClient) {
        try {
          // Remover listeners para evitar erros de "Session closed" em eventos pendentes
          this.whatsappClient.removeAllListeners();
          await this.whatsappClient.destroy();
        } catch (e) {
          console.error('⚠️ Erro ao destruir cliente na reconexão (ignorado):', e.message);
        }
      }
      this.whatsappClient = null;
      this.whatsappReady = false;
      this.whatsappQR = null;
      this.whatsappStatus = 'initializing';
      this.whatsappInfo = null;
      
      // Delay para garantir que processos antigos tenham tempo de encerrar
      await new Promise(r => setTimeout(r, 3000));

      console.log('🔄 Forçando reconexão do WhatsApp...');
      await this.initWhatsApp();
      return { success: true, message: 'Reconexão iniciada' };
    } catch (error) {
      console.error('❌ Erro ao forçar reconexão:', error);
      return { success: false, message: 'Erro ao iniciar reconexão' };
    }
  }

  async sendInvoiceEmail(invoice, client) {
    const { payment_url, payment_code, amount, due_date, payment_method, payment_details, title, public_link } = invoice;
    
    // Se o cliente não foi passado, buscar do banco de dados
    const recipient = client || invoice.client;
    
    const recipientEmail = String(recipient?.email || '').trim();
    if (!recipient || !recipientEmail) {
      throw new Error('Email do cliente não disponível');
    }

    // Exibir data sem timezone: se vier YYYY-MM-DD, formatar dd/mm/aaaa
    const toPtDate = (s) => {
      const str = String(s || '').trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        const [y, m, d] = str.split('-');
        return `${d}/${m}/${y}`;
      }
      const d = new Date(str);
      return isNaN(d.getTime()) ? str : d.toLocaleDateString('pt-BR');
    };
    const dueDate = toPtDate(due_date);
    const formattedAmount = amount.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });

    const descricao = title || `Cobrança de ${recipient.name}`;
    
    const linkCobranca = invoice.id
      ? `https://cobranca.ibrainformatica.com.br/invoice.php?id=${invoice.id}`
      : (payment_link_fromDetails(payment_details) || payment_url);

    const displayFrom = String(settings.email.from || settings.email.user || '').trim() || 'cobranca@ibrainformatica.com.br';
    const mailOptions = {
      from: `Financeiro IBRA Soft <${displayFrom}>`,
      to: recipientEmail,
      subject: 'Sistema de cobrança IBRA',
      envelope: {
        from: String(process.env.EMAIL_BOUNCE || displayFrom).trim() || displayFrom,
        to: recipientEmail
      },
      html: `
<html>
<head>
  <meta charset='UTF-8'>
</head>
<body style='font-family: Arial, sans-serif; background-color: #f7f7f7; padding: 20px;'>
  <table width='100%' cellspacing='0' cellpadding='0' style='max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 0 10px rgba(0,0,0,0.05);'>
    <tr>
      <td style='text-align: center; padding: 20px 0; background-color: #edb4b4;'>
        <img src='https://ibrainformatica.com.br/cobranca/includes/logo.png' alt='Logotipo' style='max-width: 180px;'>
      </td>
    </tr>
    <tr>
      <td style='padding: 30px;'>
        <p style='font-size: 18px;'>Olá <strong>${recipient.name}</strong>,</p>
        <p style='font-size: 16px; color: #333;'>Segue o link para você acessar sua cobrança <strong>${descricao}</strong>.</p>

        <p style='text-align: center; margin: 30px 0;'>
          <a href='${linkCobranca}' target='_blank' style='background-color: #8B0000; color: white; text-decoration: none; padding: 12px 24px; border-radius: 5px; font-size: 16px;'>Acessar cobrança</a>
        </p>
        
        <p style='font-size: 16px;'>
          <strong>Valor:</strong> ${formattedAmount}<br>
          <strong>Vencimento:</strong> ${dueDate}
        </p>
        
        <p style='margin-top: 30px; font-size: 15px;'>Se o botão não funcionar você pode copiar e colar o link abaixo:</p><br>
        <blockquote style='margin: 20px 0; padding: 15px; background-color: #f1f1f1; border-left: 5px solid #B22222; font-style: normal; color: #333;'>
          <a href='${linkCobranca}' target='_blank' style='color: #007bff; word-break: break-all;'>${linkCobranca}</a>
        </blockquote>

        <p style='margin-top: 30px; font-size: 15px;'>Qualquer dúvida, estamos à disposição.</p>

        <hr style='margin: 40px 0; border: none; border-top: 1px solid #ddd;'>

        <p style='font-size: 14px; color: #555;'>
          <strong>Equipe Financeira</strong><br>
          IBRA Soft - IBRA Informática<br>
          contato@ibrainformatica.com.br<br>
          (81) 97333-5160
        </p>
        <p style='font-size: 14px; color: #666; text-align: center;'>
          <strong>Siga-nos no Instagram:</strong><br>
          <a href='https://instagram.com/ibra.informatica' target='_blank' style='text-decoration: none; color: #007bff;'>
            <img src='https://cdn-icons-png.flaticon.com/24/174/174855.png' alt='Instagram' style='vertical-align: middle;'> IBRA Informática
          </a> &nbsp;&nbsp;|&nbsp;&nbsp;
          <a href='https://instagram.com/ibra.soft' target='_blank' style='text-decoration: none; color: #007bff;'>
            <img src='https://cdn-icons-png.flaticon.com/24/174/174855.png' alt='Instagram' style='vertical-align: middle;'> IBRA Soft
          </a>
        </p>
        <p style='font-size: 14px; color: #666; text-align: center; margin-top: 10px;'>
          <strong>Já conhece nosso atendimento?</strong><br>
          Avalie nossa empresa no Google:<br>
          <a href='https://g.page/r/CVZoaAY5HliKEA0/review' target='_blank' style='text-decoration: none; color: #007bff;'>
            <img src='https://cdn-icons-png.flaticon.com/24/733/733609.png' alt='Google' style='vertical-align: middle;'> Avaliar IBRA Informática no Google
          </a>
        </p>
      </td>
    </tr>
    <tr>
      <td style='background-color: #f1f1f1; text-align: center; padding: 15px; font-size: 12px; color: #888;'>
        Este é um e-mail automático. Por favor, não responda diretamente.
      </td>
    </tr>
  </table>
</body>
</html>
      `
    };

    try {
      const info = await this.emailTransporter.sendMail(mailOptions);
      console.log('Email enviado:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('Erro ao enviar email:', error);
      throw new Error(`Falha ao enviar email: ${error.message}`);
    }
  }

  async sendInvoiceWhatsApp(invoice, client) {
    console.log('📱 sendInvoiceWhatsApp chamado!', { invoiceId: invoice.id, clientId: client?.id });
    const { payment_url, payment_code, amount, due_date, payment_method, payment_details, public_link, title } = invoice;
    
    // Se o cliente não foi passado, buscar do banco de dados
    const recipient = client || invoice.client;
    
    if (!recipient || !recipient.phone) {
      console.log('❌ Telefone do cliente não disponível:', { recipient: recipient?.name, phone: recipient?.phone });
      throw new Error('Telefone do cliente não disponível');
    }

    // Verificar se o cliente WhatsApp está pronto
    console.log('🔍 Verificando status do WhatsApp:', { whatsappReady: this.whatsappReady, hasClient: !!this.whatsappClient });
    if (!this.whatsappReady || !this.whatsappClient) {
      console.log('❌ Cliente WhatsApp não está pronto');
      throw new Error('Cliente WhatsApp não está pronto. Escaneie o QR code para autenticar.');
    }

    // Formatar telefone para padrão internacional (remover caracteres não numéricos)
    const phone = recipient.phone.replace(/\D/g, '');
    const formattedPhone = `55${phone.replace(/^55/, '')}@c.us`;
    
    const toPtDate = (s) => {
      const str = String(s || '').trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        const [y, m, d] = str.split('-');
        return `${d}/${m}/${y}`;
      }
      const d = new Date(str);
      return isNaN(d.getTime()) ? str : d.toLocaleDateString('pt-BR');
    };
    const dueDate = toPtDate(due_date);
    const formattedAmount = amount.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });

    const linkCobranca = invoice.id
      ? `https://cobranca.ibrainformatica.com.br/invoice.php?id=${invoice.id}`
      : (payment_link_fromDetails(payment_details) || payment_url);
    const safeLink = linkCobranca ? `${linkCobranca}` : '';

    // Template pré-configurado (mesmo do sendWhatsAppMessage)
    const descricao = title || `Cobrança de ${recipient.name}`;
    const message = `Olá *${recipient.name.toUpperCase()}*,

Segue o link da cobrança referente a *"${descricao}"*

🔗 *Acesse o link:*
${safeLink}

💰 *Valor:* ${formattedAmount}
📅 *Vencimento:* ${dueDate}

⚠️ Havendo qualquer erro no link acima, pode ser utilizado a chave pix abaixo para pagamento manual:
*CNPJ:* 59.747.856/0001-78

Qualquer dúvida, estamos à disposição.

*Setor Financeiro*
*IBRA Informática / IBRA Soft*`;

    try {
      // Verificar se o número existe no WhatsApp
      const isRegistered = await this.whatsappClient.isRegisteredUser(formattedPhone);
      
      if (!isRegistered) {
        throw new Error(`O número ${recipient.phone} não está registrado no WhatsApp.`);
      }
      
      // Enviar mensagem
      const result = await this.whatsappClient.sendMessage(formattedPhone, message, { linkPreview: true });
      console.log('WhatsApp enviado:', result.id._serialized);
      return { success: true, messageId: result.id._serialized };
    } catch (error) {
      console.error('Erro ao enviar WhatsApp:', error);
      throw new Error(`Falha ao enviar WhatsApp: ${error.message}`);
    }
  }

  // Método para verificar status da conexão WhatsApp
  async getWhatsAppStatus() {
    const status = {
      enabled: process.env.WHATSAPP_ENABLED === 'true',
      provider: process.env.WHATSAPP_PROVIDER || 'unknown',
      status: 'unknown'
    };

    if (status.provider === 'evolution') {
      await this.checkEvolutionStatus();
    }

    status.ready = this.whatsappReady;
    status.status = this.whatsappReady ? 'connected' : 'disconnected';

    return status;
  }

  // Método específico para envio em massa
  async sendBulkWhatsAppMessage(phone, message, mediaFile = null) {
    const provider = settings.whatsapp.provider || 'whatsapp-web';

    if (provider === 'evolution') {
      if (mediaFile) {
        return this.sendWhatsAppMediaViaEvolution(phone, message, mediaFile, {
          apiUrl: settings.whatsapp.evolution?.url,
          apiKey: settings.whatsapp.evolution?.apiKey,
          instanceName: settings.whatsapp.evolution?.instanceName
        });
      }
      return this.sendWhatsAppViaAPI(phone, message, {
        provider: 'evolution',
        apiUrl: settings.whatsapp.evolution?.url,
        apiKey: settings.whatsapp.evolution?.apiKey,
        instanceName: settings.whatsapp.evolution?.instanceName
      });
    }

    if (!this.whatsappReady || !this.whatsappClient) {
      throw new Error('WhatsApp não está conectado');
    }

    try {
      // Formatar número de telefone
      const formattedPhone = phone.replace(/\D/g, '');
      const chatId = `${formattedPhone}@c.us`;

      if (mediaFile) {
        // Importar MessageMedia do whatsapp-web.js
        const { MessageMedia } = require('whatsapp-web.js');
        
        // Criar objeto de mídia a partir do arquivo
        const media = MessageMedia.fromFilePath(mediaFile.path);
        
        // Enviar mídia com legenda
        const sentMessage = await this.whatsappClient.sendMessage(chatId, media, { 
          caption: message || undefined 
        });
        return { success: true, messageId: sentMessage.id._serialized };
      } else {
        // Enviar apenas texto
        const sentMessage = await this.whatsappClient.sendMessage(chatId, message);
        return { success: true, messageId: sentMessage.id._serialized };
      }
    } catch (error) {
      console.error('Erro ao enviar mensagem WhatsApp:', error);
      throw error;
    }
  }

  async sendWhatsAppMessage(invoice, client) {
    const { payment_url, amount, due_date, title, public_link } = invoice;
    
    // Se o cliente não foi passado, buscar do banco de dados
    const recipient = client || invoice.client;
    
    if (!recipient || !recipient.phone) {
      throw new Error('Telefone do cliente não disponível');
    }

    const toPtDate = (s) => {
      const str = String(s || '').trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        const [y, m, d] = str.split('-');
        return `${d}/${m}/${y}`;
      }
      const d = new Date(str);
      return isNaN(d.getTime()) ? str : d.toLocaleDateString('pt-BR');
    };
    const dueDate = toPtDate(due_date);
    const formattedAmount = amount.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });

    const descricao = title || `Cobrança de ${recipient.name}`;
    
    const linkCobranca = invoice.id
      ? `https://cobranca.ibrainformatica.com.br/invoice.php?id=${invoice.id}`
      : payment_url;
    const safeLink = linkCobranca ? `<${linkCobranca}>` : null;

    // Template baseado na imagem fornecida
    const message = `Olá *${recipient.name.toUpperCase()}*,

Segue o link da cobrança referente a *"${descricao}"*

🔗 *Acesse o link:*
${safeLink || ''}

💰 *Valor:* ${formattedAmount}
📅 *Vencimento:* ${dueDate}

⚠️ Havendo qualquer erro no link acima, pode ser utilizado a chave pix abaixo para pagamento manual:
*CNPJ:* 59.747.856/0001-78

Qualquer dúvida, estamos à disposição.

*Setor Financeiro*
*IBRA Informática / IBRA Soft*`;

    if (settings.whatsapp.enabled) {
      try {
        const result = await this.sendWhatsAppViaAPI(recipient.phone, message, {
          provider: settings.whatsapp.provider || 'evolution',
          apiUrl: settings.whatsapp.evolution?.url,
          apiKey: settings.whatsapp.evolution?.apiKey,
          instanceName: settings.whatsapp.evolution?.instanceName
        });
        
        console.log('WhatsApp enviado com sucesso:', result);
        return result;
      } catch (error) {
        console.error('Erro ao enviar WhatsApp:', error);
        throw error;
      }
    } else {
      console.log('WhatsApp preparado para envio manual:', { phone: recipient.phone, message });
      return {
        success: false,
        phone: recipient.phone,
        message: message,
        formatted: true,
        manual: true
      };
    }
   }

   async sendCompleteNotification(invoice, client, options = {}) {
    console.log('🔔 sendCompleteNotification chamado!', { 
      invoiceId: invoice.id, 
      clientId: client?.id, 
      options 
    });
    const { sendEmail = true, sendWhatsApp = true } = options;
    const results = {};

    if (sendEmail) {
      console.log('📧 Enviando email...');
      try {
        const emailResult = await this.sendInvoiceEmail(invoice, client);
        results.email = { success: true, message: 'Email enviado com sucesso', data: emailResult };
      } catch (error) {
        results.email = { success: false, message: error?.message || 'Falha ao enviar email' };
      }
    }

    if (sendWhatsApp) {
      console.log('📱 Enviando WhatsApp...');
      try {
        if (settings.whatsapp.enabled) {
          const whatsappData = await this.sendWhatsAppMessage(invoice, client);
          const ok = whatsappData?.success === true;
          results.whatsapp = { success: ok, message: ok ? 'WhatsApp enviado via API' : 'Falha ao enviar WhatsApp via API', data: whatsappData };
        } else {
          try {
            const whatsappDirect = await this.sendInvoiceWhatsApp(invoice, client);
            results.whatsapp = { success: true, message: 'WhatsApp enviado via WhatsApp Web', data: whatsappDirect };
          } catch (werr) {
            console.warn('⚠️ Falha no envio via WhatsApp Web, preparando mensagem manual:', werr?.message);
            const whatsappPrepared = await this.sendWhatsAppMessage(invoice, client);
            results.whatsapp = {
              success: whatsappPrepared?.success === true,
              message: 'Mensagem WhatsApp preparada para envio manual',
              data: whatsappPrepared
            };
          }
        }
      } catch (error) {
        results.whatsapp = { success: false, message: error?.message || 'Falha ao enviar WhatsApp' };
      }
    }

    console.log('✅ Notificações processadas:', results);
    return results;
  }

  // Método para integração com APIs externas de WhatsApp
  async sendWhatsAppViaAPI(phone, message, apiConfig = {}) {
    const { provider = 'evolution', apiUrl, apiKey } = apiConfig;
    
    // Formatar telefone removendo caracteres especiais
    let cleanPhone = phone.replace(/\D/g, '');
    
    // Adicionar código do país brasileiro se não estiver presente
    if (cleanPhone.length >= 10 && cleanPhone.length <= 11) {
      // Número brasileiro sem código do país
      if (!cleanPhone.startsWith('55')) {
        cleanPhone = '55' + cleanPhone;
      }
    }
    
    // Validar se o telefone tem formato válido (mínimo 12 dígitos com código do país)
    if (cleanPhone.length < 12) {
      throw new Error(`Telefone inválido: ${phone} (formatado: ${cleanPhone})`);
    }
    
    try {
      if (provider === 'whatsapp-web') {
        // Usar WhatsApp Web.js diretamente
        console.log(`Tentando enviar WhatsApp via WhatsApp Web.js para ${cleanPhone}`);
        
        // Verificar se o cliente WhatsApp está pronto
        if (!this.whatsappReady || !this.whatsappClient) {
          throw new Error('Cliente WhatsApp não está pronto. Escaneie o QR code para autenticar.');
        }
        
        // Formatar telefone para WhatsApp Web.js
        const formattedPhone = `${cleanPhone}@c.us`;
        
        // Verificar se o número existe no WhatsApp
        const isRegistered = await this.whatsappClient.isRegisteredUser(formattedPhone);
        
        if (!isRegistered) {
          throw new Error(`O número ${phone} não está registrado no WhatsApp.`);
        }
        
        // Enviar mensagem
        const result = await this.whatsappClient.sendMessage(formattedPhone, message);
        console.log(`✅ WhatsApp enviado com sucesso via Web.js para ${cleanPhone}:`, result.id._serialized);
        
        return { 
          success: true, 
          provider: 'whatsapp-web', 
          phone: cleanPhone,
          messageId: result.id._serialized,
          message: message
        };
      } else if (provider === 'evolution' && apiUrl && apiKey) {
        console.log(`Tentando enviar WhatsApp via Evolution API para ${cleanPhone}`);
        console.log(`URL da API: ${apiUrl}`);
        const instance = apiConfig.instanceName || process.env.WHATSAPP_INSTANCE_NAME || 'default';
        console.log(`Instance: ${instance}`);
        
        try {
          let existence = null;
          try {
            const check = await axios.post(`${apiUrl}/chat/whatsappNumbers/${instance}`, {
              numbers: [cleanPhone]
            }, {
              headers: {
                'Content-Type': 'application/json',
                'apikey': apiKey
              }
            });

            const row = Array.isArray(check.data) ? check.data[0] : null;
            existence = row;

            if (row && row.exists === false) {
              return {
                success: false,
                provider: 'evolution',
                phone: cleanPhone,
                error: `O número ${cleanPhone} não está registrado no WhatsApp.`,
                response: check.data
              };
            }
          } catch (e) {
            const data = e.response?.data;
            console.log('⚠️ Não foi possível validar existência do número na Evolution:', data?.message || e.message);
          }

          const response = await axios.post(`${apiUrl}/message/sendText/${instance}`, {
            number: cleanPhone,
            text: message
          }, {
            headers: {
              'Content-Type': 'application/json',
              'apikey': apiKey
            }
          });

          const responseData = response.data;
          
          const messageId = responseData?.key?.id || null;
          const remoteJid = responseData?.key?.remoteJid || null;

          if (!messageId) {
            console.log(`⚠️ Evolution aceitou a requisição, mas não retornou messageId.`, responseData);
            return {
              success: false,
              provider: 'evolution',
              phone: cleanPhone,
              error: 'Evolution não retornou key.id (não foi possível confirmar envio)',
              response: responseData
            };
          }

          console.log(`✅ WhatsApp enviado com sucesso para ${cleanPhone}:`, { messageId, remoteJid });
          return { 
            success: true, 
            provider: 'evolution', 
            phone: cleanPhone, 
            messageId,
            remoteJid,
            existence,
            response: responseData
          };
        } catch (error) {
          const responseData = error.response?.data || {};
          const status = error.response?.status;
          const msg = responseData?.message ? JSON.stringify(responseData.message) : (responseData?.error || error.message);
          console.error(`❌ Erro na Evolution API: ${status} - ${msg}`);
          throw new Error(`Erro na Evolution API: ${status} - ${msg}`);
        }
      } else if (provider === 'twilio' && apiUrl && apiKey) {
        // Implementação para Twilio (exemplo)
        console.log('Twilio não implementado ainda. Usando modo manual.');
        return { success: false, provider: 'manual', phone: cleanPhone, message, reason: 'Twilio não implementado' };
      } else {
        // Modo manual ou configuração incompleta
        console.log('⚠️ WhatsApp configurado para envio manual ou configuração incompleta:', { 
          phone: cleanPhone, 
          provider,
          hasApiUrl: !!apiUrl,
          hasApiKey: !!apiKey
        });
        return { 
          success: false, 
          provider: 'manual', 
          phone: cleanPhone, 
          message,
          reason: 'Configuração incompleta ou modo manual'
        };
      }
    } catch (error) {
      console.error('❌ Erro ao enviar WhatsApp via API:', error.message);
      
      // Verificar se é erro de conexão
      if (error.message.includes('fetch') || error.message.includes('ECONNREFUSED') || error.message.includes('Failed to fetch')) {
        console.log('🔄 API Evolution não disponível, configurando para envio manual');
        return {
          success: false,
          provider: 'manual_fallback',
          phone: cleanPhone,
          message,
          reason: 'API Evolution não disponível - configurado para envio manual'
        };
      }
      
      // Em caso de outros erros, retornar informações para envio manual
      return {
        success: false,
        error: error.message,
        provider: 'manual_fallback',
        phone: cleanPhone,
        message
      };
    }
  }

  async sendWhatsAppMediaViaEvolution(phone, caption, mediaFile, apiConfig = {}) {
    const { apiUrl, apiKey } = apiConfig;
    const instance = apiConfig.instanceName || process.env.WHATSAPP_INSTANCE_NAME || 'default';
    if (!apiUrl || !apiKey) {
      return {
        success: false,
        provider: 'evolution',
        phone,
        reason: 'Configuração incompleta da Evolution API'
      };
    }

    let cleanPhone = String(phone || '').replace(/\D/g, '');
    if (cleanPhone.length >= 10 && cleanPhone.length <= 11) {
      if (!cleanPhone.startsWith('55')) {
        cleanPhone = '55' + cleanPhone;
      }
    }
    if (cleanPhone.length < 12) {
      return {
        success: false,
        provider: 'evolution',
        phone: cleanPhone,
        reason: `Telefone inválido: ${phone} (formatado: ${cleanPhone})`
      };
    }

    const mime = mediaFile?.mimetype || 'application/octet-stream';
    const isImage = mime.startsWith('image/');
    const isVideo = mime.startsWith('video/');
    const isAudio = mime.startsWith('audio/');
    const mediatype = isImage ? 'image' : isVideo ? 'video' : isAudio ? 'audio' : 'document';
    const fileName = mediaFile?.originalname || mediaFile?.filename || `arquivo${path.extname(mediaFile?.path || '')}`;

    let base64;
    try {
      base64 = fs.readFileSync(mediaFile.path).toString('base64');
    } catch (e) {
      return {
        success: false,
        provider: 'evolution',
        phone: cleanPhone,
        reason: `Não foi possível ler o arquivo de mídia: ${e?.message || 'erro'}`
      };
    }

    try {
      let existence = null;
      try {
        const check = await axios.post(`${apiUrl}/chat/whatsappNumbers/${instance}`, {
          numbers: [cleanPhone]
        }, {
          headers: {
            'Content-Type': 'application/json',
            'apikey': apiKey
          }
        });

        const row = Array.isArray(check.data) ? check.data[0] : null;
        existence = row;

        if (row && row.exists === false) {
          return {
            success: false,
            provider: 'evolution',
            phone: cleanPhone,
            reason: `O número ${cleanPhone} não está registrado no WhatsApp.`,
            response: check.data
          };
        }
      } catch (e) {
        const data = e.response?.data;
        console.log('⚠️ Não foi possível validar existência do número na Evolution:', data?.message || e.message);
      }

      const payload = {
        number: cleanPhone,
        mediatype,
        mimetype: mime,
        caption: caption || '',
        ...(mediatype === 'document' ? { fileName } : {}),
        media: base64
      };

      const response = await axios.post(`${apiUrl}/message/sendMedia/${instance}`, payload, {
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey
        }
      });

      const responseData = response.data;
      const messageId = responseData?.key?.id || null;
      const remoteJid = responseData?.key?.remoteJid || null;

      if (!messageId) {
        return {
          success: false,
          provider: 'evolution',
          phone: cleanPhone,
          reason: 'Evolution não retornou key.id (não foi possível confirmar envio da mídia)',
          response: responseData
        };
      }

      return {
        success: true,
        provider: 'evolution',
        phone: cleanPhone,
        messageId,
        remoteJid,
        existence,
        response: responseData
      };
    } catch (error) {
      const responseData = error.response?.data || {};
      const status = error.response?.status;
      const msg = responseData?.message ? JSON.stringify(responseData.message) : (responseData?.error || error.message);
      throw new Error(`Erro na Evolution API (mídia): ${status} - ${msg}`);
    }
  }

  // Função para enviar mensagem de confirmação de pagamento
  async sendPaymentConfirmationMessage(invoice, client) {
    console.log('💰 Enviando mensagem de confirmação de pagamento...');
    
    if (!settings.whatsapp.enabled) {
      console.log('WhatsApp não está habilitado');
      return {
        success: false,
        message: 'WhatsApp não está habilitado',
        manual: true
      };
    }

    if (!client.phone) {
      console.log('Cliente não possui telefone cadastrado');
      return {
        success: false,
        message: 'Cliente não possui telefone cadastrado'
      };
    }

    // Template da mensagem de confirmação de pagamento
    const message = `🎉 *PAGAMENTO CONFIRMADO!* 🎉

Olá *${client.name.toUpperCase()}*,

✅ Recebemos o pagamento da sua cobrança!

📋 *Detalhes do Pagamento:*
💰 *Valor:* R$ ${parseFloat(invoice.valor).toFixed(2).replace('.', ',')}
📅 *Data do Pagamento:* ${new Date().toLocaleDateString('pt-BR')}
🔢 *Referência:* ${invoice.title || invoice.description || 'Cobrança'}

🙏 *Obrigado pela preferência!*

Seu pagamento foi processado com sucesso e já está registrado em nosso sistema.

📞 *Dúvidas?* Entre em contato:
*IBRA Informática / IBRA Soft*
⚠️ *CNPJ:* 59.747.856/0001-78`;

    try {
      const result = await this.sendWhatsAppViaAPI(client.phone, message);
      console.log('✅ Mensagem de confirmação de pagamento enviada com sucesso');
      return result;
    } catch (error) {
      console.error('❌ Erro ao enviar mensagem de confirmação de pagamento:', error);
      return {
        success: false,
        error: error.message,
        phone: client.phone,
        message: message,
        manual: true
      };
    }
  }
}

module.exports = new Notifier();
