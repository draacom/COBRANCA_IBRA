const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const { sequelize } = require('./models');
const notifier = require('./services/notifier');
const settings = require('./config/settings');

// Global error handlers para evitar crash por erros não tratados (ex: Puppeteer/WhatsApp)
process.on('uncaughtException', (err) => {
  console.error('❌ CRITICAL ERROR (Uncaught Exception):', err);
  // Não sair do processo para manter o servidor HTTP online
  // process.exit(1); 
});

process.on('unhandledRejection', (reason, promise) => {
  if (reason && typeof reason.message === 'string' && reason.message.includes('Protocol error (Runtime.callFunctionOn): Session closed')) {
    console.warn('⚠️ Ignorando erro de protocolo de sessão fechada (non-critical):', reason.message);
    return;
  }
  console.error('❌ CRITICAL ERROR (Unhandled Rejection):', reason);
});

const app = express();
const PORT = settings.port;

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middlewares
app.use(helmet({
  contentSecurityPolicy: false // Permitir inline styles para as páginas públicas
}));
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Servir arquivos estáticos da pasta imgs
app.use('/imgs', express.static(path.join(__dirname, '..', 'imgs')));
// Servir assets de marca (logo, favicon) da pasta do frontend
app.use('/brand', express.static(path.join(__dirname, '..', 'frontend', 'public', 'brand')));
// Favicon direto
app.use('/favicon.ico', express.static(path.join(__dirname, '..', 'frontend', 'public', 'brand', 'favicon.png')));
// Manifest PWA
app.use('/manifest.json', express.static(path.join(__dirname, '..', 'frontend', 'public', 'manifest.json')));

// Rota principal
app.get('/', (req, res) => {
  res.json({ 
    message: 'Sistema de Cobrança API', 
    status: 'online',
    endpoints: '/api'
  });
});

// Alias público: permitir acesso direto via /invoice/:id
// Redireciona para a rota pública dinâmica (SSR)
app.get('/invoice/:id', (req, res) => {
  const { id } = req.params;
  return res.redirect(`/public/invoice/${id}`);
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.statusCode || 500).json({
    status: 'error',
    message: err.message || 'Internal Server Error'
  });
});

// Start server
async function startServer() {
  try {
    console.log('🔄 Testando conexão com o banco de dados...');
    
    // Testar conexão com banco de dados
    await sequelize.authenticate();
    console.log('✅ Conexão com banco de dados estabelecida com sucesso!');
    
    // Sincronizar modelos apenas em desenvolvimento
    if (settings.env === 'development') {
      await sequelize.sync({ alter: false });
      console.log('🔄 Modelos sincronizados com sucesso!');
    }
    
    console.log('🔄 Carregando rotas...');
    
    // Disponibilizar notifier globalmente
    app.locals.notifier = notifier;
    
    // Carregar rotas API
    const apiRoutes = require('./routes');
    app.use('/api', apiRoutes);
    console.log('✅ Rotas API carregadas com sucesso!');
    
    // Carregar rotas públicas
    const publicRoutes = require('./routes/public.routes');
    app.use('/public', publicRoutes);
    console.log('✅ Rotas públicas carregadas com sucesso!');

    // Servir Frontend (SPA)
    // Em produção/Discloud, o backend serve os arquivos estáticos do frontend
    const frontendBuildPath = path.join(__dirname, '..', 'frontend', 'build');
    app.use(express.static(frontendBuildPath));
    
    // Qualquer rota não tratada pela API ou arquivos estáticos cai no index.html (React Router)
    app.get('*', (req, res) => {
      res.sendFile(path.join(frontendBuildPath, 'index.html'));
    });
    console.log('✅ Frontend servido em /*');
    
    // Iniciar servidor
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${PORT} and host 0.0.0.0`);
    });
    
  } catch (error) {
    console.error('❌ Erro ao iniciar servidor:', error);
    process.exit(1);
  }
}

startServer();
