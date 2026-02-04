const express = require('express');
const bcrypt = require('bcrypt');
const { Op } = require('sequelize');
const { User } = require('../models');

const router = express.Router();

// Helpers
const sanitizeUser = (user) => {
  if (!user) return null;
  const { id, nome, email, role, status, createdAt, updatedAt } = user;
  return { 
    id, 
    name: nome, 
    email, 
    role, 
    active: status === 'ativo', 
    createdAt, 
    updatedAt 
  };
};

// Listar usuários (admin)
router.get('/', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ status: 'error', message: 'Acesso negado' });
    }

    const { search, active } = req.query;
    const where = {};
    if (search) {
      where[Op.or] = [
        { nome: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } }
      ];
    }
    if (active !== undefined) where.status = active === 'true' ? 'ativo' : 'inativo';

    const users = await User.findAll({ where });
    return res.status(200).json({ status: 'success', data: users.map(sanitizeUser) });
  } catch (error) {
    console.error('Error fetching users:', error);
    return res.status(500).json({ status: 'error', message: 'Erro ao buscar usuários' });
  }
});

// Criar usuário (admin)
router.post('/', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ status: 'error', message: 'Acesso negado' });
    }
    const { name, email, password, role = 'user', active = true } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ status: 'error', message: 'Nome, email e senha são obrigatórios' });
    }
    const existing = await User.findOne({ where: { email } });
    if (existing) {
      return res.status(409).json({ status: 'error', message: 'Email já está em uso' });
    }
    const user = await User.create({ 
      nome: name, 
      email, 
      senha: password, 
      role,
      status: active ? 'ativo' : 'inativo'
    });
    return res.status(201).json({ status: 'success', data: { user: sanitizeUser(user) } });
  } catch (error) {
    console.error('Error creating user:', error);
    return res.status(500).json({ status: 'error', message: 'Erro ao criar usuário' });
  }
});

// Perfil do usuário logado (posicionado antes de rotas dinâmicas)
router.get('/me/profile', async (req, res) => {
  try {
    return res.status(200).json({ status: 'success', data: { user: sanitizeUser(req.user) } });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: 'Erro ao obter perfil' });
  }
});

router.put('/me/profile', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'Usuário não encontrado' });
    }
    if (email && email !== user.email) {
      const existing = await User.findOne({ where: { email } });
      if (existing) {
        return res.status(409).json({ status: 'error', message: 'Email já está em uso' });
      }
    }
    const updateData = {
      nome: name ?? user.nome,
      email: email ?? user.email
    };
    
    if (password) {
      updateData.senha = password;
    }
    
    await user.update(updateData);
    return res.status(200).json({ status: 'success', data: { user: sanitizeUser(user) } });
  } catch (error) {
    console.error('Error updating profile:', error);
    return res.status(500).json({ status: 'error', message: 'Erro ao atualizar perfil' });
  }
});

// Obter usuário por ID (admin)
router.get('/:id', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ status: 'error', message: 'Acesso negado' });
    }
    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'Usuário não encontrado' });
    }
    return res.status(200).json({ status: 'success', data: { user: sanitizeUser(user) } });
  } catch (error) {
    console.error('Error fetching user:', error);
    return res.status(500).json({ status: 'error', message: 'Erro ao buscar usuário' });
  }
});

// Atualizar usuário (admin)
router.put('/:id', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ status: 'error', message: 'Acesso negado' });
    }
    const { name, email, password, role, active } = req.body;
    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'Usuário não encontrado' });
    }
    if (email && email !== user.email) {
      const existing = await User.findOne({ where: { email } });
      if (existing) {
        return res.status(409).json({ status: 'error', message: 'Email já está em uso' });
      }
    }
    // Preparar dados para atualização
    const updateData = {
      nome: name ?? user.nome,
      email: email ?? user.email,
      role: role ?? user.role,
      status: active !== undefined ? (active ? 'ativo' : 'inativo') : user.status
    };
    
    // Se senha foi fornecida, adicionar ao updateData (o hook do modelo fará o hash)
    if (password) {
      updateData.senha = password;
    }
    
    await user.update(updateData);
    return res.status(200).json({ status: 'success', data: { user: sanitizeUser(user) } });
  } catch (error) {
    console.error('Error updating user:', error);
    return res.status(500).json({ status: 'error', message: 'Erro ao atualizar usuário' });
  }
});

// Excluir usuário permanentemente
router.delete('/:id', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ status: 'error', message: 'Acesso negado' });
    }
    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'Usuário não encontrado' });
    }
    await user.destroy();
    return res.status(200).json({ status: 'success', message: 'Usuário excluído com sucesso' });
  } catch (error) {
    console.error('Error deleting user:', error);
    return res.status(500).json({ status: 'error', message: 'Erro ao excluir usuário' });
  }
});

// Ativar usuário (admin)
router.patch('/:id/activate', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ status: 'error', message: 'Acesso negado' });
    }
    
    const { id } = req.params;
    const user = await User.findByPk(id);
    
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'Usuário não encontrado' });
    }
    
    await user.update({ status: 'ativo' });
    return res.status(200).json({ status: 'success', message: 'Usuário ativado com sucesso' });
  } catch (error) {
    console.error('Error activating user:', error);
    return res.status(500).json({ status: 'error', message: 'Erro ao ativar usuário' });
  }
});

// Desativar usuário (admin)
router.patch('/:id/deactivate', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ status: 'error', message: 'Acesso negado' });
    }
    
    const { id } = req.params;
    const user = await User.findByPk(id);
    
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'Usuário não encontrado' });
    }
    
    await user.update({ status: 'inativo' });
    return res.status(200).json({ status: 'success', message: 'Usuário desativado com sucesso' });
  } catch (error) {
    console.error('Error deactivating user:', error);
    return res.status(500).json({ status: 'error', message: 'Erro ao desativar usuário' });
  }
});

// (rotas /me/profile já definidas acima; removida duplicação)

module.exports = router;