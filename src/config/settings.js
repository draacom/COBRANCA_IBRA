// Arquivo de configuração centralizado
// Este arquivo substitui a dependência direta do .env e process.env espalhada pelo código
// facilitando o deploy em ambientes como Discloud

const settings = {
  // Ambiente
  env: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 3001,

  // Banco de Dados
  database: {
    dialect: 'mysql',
    host: process.env.DB_HOST || process.env.DEST_HOST || '193.203.175.83',
    port: process.env.DB_PORT || process.env.DEST_PORT || 3306,
    username: process.env.DB_USER || process.env.DEST_USER || 'u328618725_cobranca',
    password: process.env.DB_PASS || process.env.DEST_PASS || '1mJ/GPk^7',
    name: process.env.DB_NAME || process.env.DEST_NAME || 'u328618725_cobranca',
    testName: process.env.DB_NAME_TEST || 'cobranca_test'
  },

  // JWT (Autenticação)
  jwt: {
    secret: process.env.JWT_SECRET || 'changeme-super-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '1d'
  },

  // Redis (Filas)
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379'
  },

  // WhatsApp Web.js (Legado/Direct)
  whatsapp: {
    sessionPath: process.env.WHATSAPP_SESSION_PATH || './.wwebjs_auth',
    clientId: process.env.WHATSAPP_CLIENT_ID || 'sistema-cobranca',
    enabled: process.env.WHATSAPP_ENABLED !== 'false', // Default true
    webEnabled: process.env.WHATSAPP_WEB_ENABLED === 'true', // Default false
    provider: process.env.WHATSAPP_PROVIDER || 'evolution',
    
    // Evolution API
    evolution: {
      url: process.env.WHATSAPP_API_URL || 'http://localhost:8081',
      apiKey: process.env.WHATSAPP_API_KEY || '30fc8d3c-b9e5-483e-b0da-a0b6ec082f39',
      instanceName: process.env.WHATSAPP_INSTANCE_NAME || 'default'
    }
  },

  // Safe2Pay (Pagamentos)
  safe2pay: {
    apiUrl: process.env.SAFE2PAY_API_URL || 'https://payment.safe2pay.com.br/v2',
    apiKey: process.env.SAFE2PAY_API_KEY || 'CC1054148965464BB72CB3409560EAFA',
    secretKey: process.env.SAFE2PAY_SECRET_KEY || 'A7DA86A8DBB04D48BBEFAD0D1EBE4EED1758F4B2DD2C4A38BD08D8FF6ED11930',
    isSandbox: process.env.SAFE2PAY_SANDBOX === 'true', // Default false
    callbackUrl: process.env.SAFE2PAY_CALLBACK_URL || 'https://cobranca.ibrainformatica.com.br/api/webhooks/safe2pay',
    methods: {
      boleto: parseInt(process.env.SAFE2PAY_BOLETO_METHOD_ID || '1', 10),
      pix: parseInt(process.env.SAFE2PAY_PIX_METHOD_ID || '6', 10)
    },
    fees: {
      boletoFine: parseFloat(process.env.SAFE2PAY_BOLETO_FINE_PERCENT || '2.00'),
      boletoInterest: parseFloat(process.env.SAFE2PAY_BOLETO_INTEREST_MONTHLY_PERCENT || '1.00')
    }
  },

  // Email
  email: {
    host: process.env.EMAIL_HOST || 'smtp.hostinger.com',
    port: Number(process.env.EMAIL_PORT || 587),
    user: process.env.EMAIL_USER || 'cobranca@ibrainformatica.com.br',
    pass: process.env.EMAIL_PASS || 'V@wRgF?9t',
    from: process.env.EMAIL_FROM || 'cobranca@ibrainformatica.com.br',
    dkim: {
      domain: process.env.EMAIL_DKIM_DOMAIN,
      selector: process.env.EMAIL_DKIM_SELECTOR,
      privateKey: process.env.EMAIL_DKIM_PRIVATE_KEY
    }
  },

  // URLs do Sistema
  urls: {
    base: process.env.BASE_URL || 'https://cobranca.ibrainformatica.com.br',
    publicBase: process.env.PUBLIC_BASE_URL || 'https://cobranca.ibrainformatica.com.br'
  }
};

module.exports = settings;
