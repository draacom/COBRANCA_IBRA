const express = require('express');
const jwt = require('jsonwebtoken');
const { User } = require('../models');

const router = express.Router();

// Informações sobre registro (GET)
router.get('/register', (req, res) => {
  return res.json({
    status: 'info',
    message: 'Use POST method to register a new user',
    method: 'POST',
    endpoint: '/api/auth/register',
    required_fields: {
      name: 'string',
      email: 'string',
      password: 'string',
      role: 'string (optional: admin|user, default: user)'
    },
    example: {
      name: 'João Silva',
      email: 'joao@email.com',
      password: 'minhasenha123',
      role: 'user'
    }
  });
});

// Registro (POST)
router.post('/register', async (req, res) => {
  try {
    const { nome, email, senha } = req.body;
    
    if (!nome || !email || !senha) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Nome, email e senha são obrigatórios' 
      });
    }
    
    // Verificar se o usuário já existe
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ 
        status: 'error', 
        message: 'Email já está em uso' 
      });
    }
    
    // Criar novo usuário
    const user = await User.create({
      nome,
      email,
      senha,
      status: 'ativo'
    });
    
    const token = jwt.sign(
      { id: user.id, email: user.email, status: user.status, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );
    
    return res.status(201).json({
      status: 'success',
      data: {
        user: {
          id: user.id,
          name: user.nome,
          email: user.email,
          status: user.status,
          role: user.role
        },
        token
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({ 
      status: 'error', 
      message: 'Erro ao criar usuário' 
    });
  }
});

// Informações sobre login (GET)
router.get('/login', (req, res) => {
  return res.json({
    status: 'info',
    message: 'Use POST method to login',
    method: 'POST',
    endpoint: '/api/auth/login',
    required_fields: {
      email: 'string',
      password: 'string'
    },
    example: {
      email: 'joao@email.com',
      password: 'minhasenha123'
    }
  });
});

// Login (POST)
router.post('/login', async (req, res) => {
  try {
    const { email, senha } = req.body;
    
    if (!email || !senha) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Email e senha são obrigatórios' 
      });
    }
    
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(401).json({ 
        status: 'error', 
        message: 'Email não encontrado' 
      });
    }
    if (user.status !== 'ativo') {
      return res.status(401).json({ 
        status: 'error', 
        message: 'Usuário inativo' 
      });
    }
    
    const isPasswordValid = await user.checkPassword(senha);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        status: 'error', 
        message: 'Senha incorreta' 
      });
    }
    
    const token = jwt.sign(
      { id: user.id, email: user.email, status: user.status, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );
    
    return res.status(200).json({
      status: 'success',
      data: {
        user: {
          id: user.id,
          name: user.nome,
          email: user.email,
          status: user.status,
          role: user.role
        },
        token
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ 
      status: 'error', 
      message: 'Erro ao realizar login' 
    });
  }
});

// Refresh token
router.post('/refresh', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Token é obrigatório' 
      });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findByPk(decoded.id);
    
    if (!user || user.status !== 'ativo') {
      return res.status(401).json({ 
        status: 'error', 
        message: 'Usuário inválido ou inativo' 
      });
    }
    
    const newToken = jwt.sign(
      { id: user.id, email: user.email, status: user.status, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );
    
    return res.status(200).json({
      status: 'success',
      data: { token: newToken }
    });
  } catch (error) {
    return res.status(401).json({ 
      status: 'error', 
      message: 'Token inválido ou expirado' 
    });
  }
});

module.exports = router;