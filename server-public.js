require('dotenv').config();
const express = require('express');
const path = require('path');
const { Sequelize } = require('sequelize');
const config = require('./src/config/database.js')[process.env.NODE_ENV || 'development'];

console.log('🔧 Iniciando servidor público...');

const app = express();
const PORT = 3000; // Porta para o servidor público

// Configurar EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src', 'views'));

// Middlewares básicos
app.use(express.json());
app.use('/imgs', express.static(path.join(__dirname, 'imgs')));

// Criar conexão Sequelize
const sequelize = new Sequelize(
  config.database,
  config.username,
  config.password,
  config
);

async function startPublicServer() {
  try {
    console.log('🔄 Testando conexão com o banco...');
    await sequelize.authenticate();
    console.log('✅ Conexão com o banco estabelecida!');
    
    // Carregar modelos
    const { Invoice, Client } = require('./src/models');
    
    // Carregar apenas as rotas públicas
    const publicRoutes = require('./src/routes/public.routes');
    app.use('/public', publicRoutes);
    console.log('✅ Rotas públicas carregadas!');
    
    // Rota raiz
    app.get('/', (req, res) => {
      res.json({ 
        message: 'Servidor público funcionando!', 
        routes: ['/public/invoice/:id']
      });
    });
    
    app.listen(PORT, () => {
      console.log(`✅ Servidor público rodando na porta ${PORT}`);
      console.log(`🔗 Teste: http://localhost:${PORT}/public/invoice/10`);
    });
    
  } catch (error) {
    console.error('❌ Erro ao iniciar servidor público:', error.message);
    
    // Fallback sem banco de dados
    console.log('🔄 Iniciando servidor público em modo fallback...');
    
    // Rota pública com dados mockados
    app.get('/public/invoice/:id', (req, res) => {
      const mockInvoice = {
        id: req.params.id,
        valor: 150.00,
        vencimento: '2024-02-15',
        status: 'pendente',
        descricao: 'Cobrança de demonstração'
      };
      
      const mockClient = {
        nome: 'Cliente Demonstração',
        email: 'cliente@exemplo.com',
        telefone: '(11) 99999-9999'
      };
      
      res.render('public/invoice', { 
        invoice: mockInvoice, 
        client: mockClient 
      });
    });
    
    app.get('/', (req, res) => {
      res.json({ 
        message: 'Servidor público funcionando em modo fallback!', 
        routes: ['/public/invoice/:id']
      });
    });
    
    app.listen(PORT, () => {
      console.log(`✅ Servidor público rodando na porta ${PORT} (modo fallback)`);
      console.log(`🔗 Teste: http://localhost:${PORT}/public/invoice/10`);
    });
  }
}

startPublicServer();