const express = require('express');
const router = express.Router();
const notifier = require('../services/notifier');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const sanitizeObject = (value) => {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sanitizeObject);
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (String(k).toLowerCase().includes('apikey')) {
      out[k] = '[redacted]';
    } else {
      out[k] = sanitizeObject(v);
    }
  }
  return out;
};

const safeStringify = (value) => {
  try {
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
  } catch (e) {
    try {
      return String(value);
    } catch (e2) {
      return 'Erro desconhecido';
    }
  }
};

const formatBulkSendError = (err) => {
  if (!err) return 'Erro desconhecido';
  if (typeof err === 'string') return err;

  const status = err.response?.status;
  const data = err.response?.data;
  const dataMsg =
    (data && typeof data === 'object' && (data.message || data.error)) ||
    (typeof data === 'string' ? data : null);
  const base = err.message || err.msg || err.error || dataMsg;

  const details =
    data && typeof data === 'object'
      ? safeStringify(sanitizeObject(data))
      : (typeof data === 'string' ? data : null);

  if (status && base && details && details !== base) return `${status} - ${base} - ${details}`;
  if (status && base) return `${status} - ${base}`;
  if (status && details) return `${status} - ${details}`;
  if (base) return base;
  if (details) return details;

  return safeStringify(sanitizeObject(err));
};

// Configuração do multer para upload de arquivos
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../../uploads/media');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 16 * 1024 * 1024 // 16MB
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif|mp4|avi|mov|mp3|wav|pdf|doc|docx|xls|xlsx|ppt|pptx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype) || 
                     file.mimetype.startsWith('image/') || 
                     file.mimetype.startsWith('video/') || 
                     file.mimetype.startsWith('audio/') ||
                     file.mimetype.includes('document') ||
                     file.mimetype.includes('spreadsheet') ||
                     file.mimetype.includes('presentation');
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Tipo de arquivo não suportado'));
    }
  }
});

router.use((req, res, next) => {
  if (req.method === 'GET') {
    res.set('Cache-Control', 'no-store');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
  next();
});

// Rota para verificar status da conexão WhatsApp (compatibilidade)
router.get('/status', async (req, res) => {
  try {
    const status = await notifier.getWhatsAppStatus();
    return res.status(200).json({
      status: 'success',
      data: status
    });
  } catch (error) {
    console.error('Error checking WhatsApp status:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Erro ao verificar status do WhatsApp'
    });
  }
});

// Rota para obter status detalhado do WhatsApp
router.get('/detailed-status', async (req, res) => {
  try {
    const detailedStatus = await notifier.getWhatsAppDetailedStatus();
    return res.status(200).json({
      status: 'success',
      data: detailedStatus
    });
  } catch (error) {
    console.error('Error getting detailed WhatsApp status:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Erro ao obter status detalhado do WhatsApp'
    });
  }
});

// Rota para obter QR code do WhatsApp
router.get('/qrcode', async (req, res) => {
  try {
    const qrCodeDataURL = await notifier.getWhatsAppQRCode();
    
    if (qrCodeDataURL) {
      return res.status(200).json({
        status: 'success',
        data: {
          qrCode: qrCodeDataURL,
          hasQR: true
        }
      });
    } else {
      return res.status(200).json({
        status: 'success',
        data: {
          qrCode: null,
          hasQR: false,
          message: 'QR code não disponível no momento'
        }
      });
    }
  } catch (error) {
    console.error('Error getting WhatsApp QR code:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Erro ao obter QR code do WhatsApp'
    });
  }
});

// Rota para forçar reconexão do WhatsApp
router.post('/reconnect', async (req, res) => {
  try {
    const result = await notifier.reconnectWhatsApp();
    
    if (result.success) {
      return res.status(200).json({
        status: 'success',
        message: result.message
      });
    } else {
      return res.status(500).json({
        status: 'error',
        message: result.message
      });
    }
  } catch (error) {
    console.error('Error reconnecting WhatsApp:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Erro ao tentar reconectar WhatsApp'
    });
  }
});

// Rota para buscar lista de clientes para seleção
router.get('/clients', async (req, res) => {
  try {
    const { Client } = require('../models');
    
    const clients = await Client.findAll({
      where: {
        status: 'ativo'
      },
      attributes: ['id', 'name', 'email', 'phone', 'document', 'cidade', 'estado'],
      order: [['name', 'ASC']]
    });

    return res.status(200).json({
      status: 'success',
      data: clients
    });
  } catch (error) {
    console.error('Error fetching clients:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Erro ao buscar clientes'
    });
  }
});

// Rota para envio de mensagens em massa via WhatsApp
router.post('/send-bulk', upload.single('media'), async (req, res) => {
  try {
    console.log('📥 Dados recebidos:', {
      body: req.body,
      file: req.file ? { originalname: req.file.originalname, size: req.file.size } : null
    });

    let { clientIds, message } = req.body;
    const mediaFile = req.file;

    console.log('🔍 Processando dados:', { clientIds, message, hasMediaFile: !!mediaFile });

    // Parse clientIds se vier como string
    if (typeof clientIds === 'string') {
      try {
        clientIds = JSON.parse(clientIds);
        console.log('✅ ClientIds parseado:', clientIds);
      } catch (e) {
        console.log('❌ Erro ao parsear clientIds:', e.message);
        return res.status(400).json({
          status: 'error',
          message: 'Formato inválido para lista de clientes'
        });
      }
    }

    if (!clientIds || !Array.isArray(clientIds) || clientIds.length === 0) {
      console.log('❌ Validação clientIds falhou:', { clientIds, isArray: Array.isArray(clientIds), length: clientIds?.length });
      return res.status(400).json({
        status: 'error',
        message: 'Lista de clientes é obrigatória'
      });
    }

    if (!message && !mediaFile) {
      console.log('❌ Validação mensagem/mídia falhou:', { message, hasMediaFile: !!mediaFile });
      return res.status(400).json({
        status: 'error',
        message: 'Mensagem ou arquivo de mídia é obrigatório'
      });
    }

    console.log('✅ Validações passaram, continuando...');

    // Se não há mensagem, usar string vazia
    if (!message) {
      message = '';
    }

    const { Client } = require('../models');
    
    // Buscar dados dos clientes selecionados
    const clients = await Client.findAll({
      where: {
        id: clientIds,
        status: 'ativo'
      },
      attributes: ['id', 'name', 'email', 'phone', 'document', 'endereco', 'numero', 'bairro', 'cidade', 'estado', 'cep']
    });

    if (clients.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Nenhum cliente válido encontrado'
      });
    }

    const results = [];
    
    for (const client of clients) {
      try {
        // Substituir variáveis na mensagem
        let personalizedMessage = message
          .replace(/{nome}/g, client.name || '')
          .replace(/{email}/g, client.email || '')
          .replace(/{telefone}/g, client.phone || '')
          .replace(/{documento}/g, client.document || '')
          .replace(/{endereco}/g, client.endereco || '')
          .replace(/{numero}/g, client.numero || '')
          .replace(/{bairro}/g, client.bairro || '')
          .replace(/{cidade}/g, client.cidade || '')
          .replace(/{estado}/g, client.estado || '')
          .replace(/{cep}/g, client.cep || '');

        // Verificar se o cliente tem telefone
        if (!client.phone) {
          results.push({
            clientId: client.id,
            clientName: client.name,
            status: 'error',
            message: 'Cliente não possui telefone cadastrado'
          });
          continue;
        }

        // Enviar mensagem via WhatsApp
        const result = await notifier.sendBulkWhatsAppMessage(client.phone, personalizedMessage, mediaFile);
        const failureReason = result?.reason || (result?.error ? formatBulkSendError(result.error) : null);
        
        results.push({
          clientId: client.id,
          clientName: client.name,
          status: result.success ? 'success' : 'error',
          message: result.success
            ? (mediaFile ? 'Mídia enviada com sucesso' : 'Mensagem enviada com sucesso')
            : (failureReason ? `Falha ao enviar mensagem: ${failureReason}` : 'Falha ao enviar mensagem'),
          messageId: result.messageId
        });

        // Pequeno delay entre envios para evitar spam
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`Error sending message to client ${client.id}:`, error);
        const errMsg = formatBulkSendError(error);
        results.push({
          clientId: client.id,
          clientName: client.name,
          status: 'error',
          message: `Erro ao enviar mensagem: ${errMsg}`
        });
      }
    }

    const successCount = results.filter(r => r.status === 'success').length;
    const errorCount = results.filter(r => r.status === 'error').length;

    // Limpar arquivo de mídia após o envio
    if (mediaFile && fs.existsSync(mediaFile.path)) {
      try {
        fs.unlinkSync(mediaFile.path);
      } catch (error) {
        console.error('Erro ao deletar arquivo de mídia:', error);
      }
    }

    return res.status(200).json({
      status: 'success',
      data: {
        summary: {
          total: results.length,
          success: successCount,
          errors: errorCount
        },
        results: results
      }
    });

  } catch (error) {
    console.error('Error sending bulk WhatsApp messages:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Erro interno do servidor'
    });
  }
});

module.exports = router;
