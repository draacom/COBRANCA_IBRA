const express = require('express');
const { Op } = require('sequelize');
const { Client } = require('../models');

const router = express.Router();

// Listar clientes
router.get('/', async (req, res) => {
  try {
    const { name } = req.query;
    const where = {};
    
    if (name) where.name = { [Op.like]: `%${name}%` };
    
    const clients = await Client.findAll({ where });
    
    // Transformar o campo status em active (boolean)
    const clientsWithActive = clients.map(client => {
      const clientData = client.toJSON();
      clientData.active = clientData.status === 'ativo';
      return clientData;
    });
    
    return res.status(200).json({
      status: 'success',
      data: clientsWithActive
    });
  } catch (error) {
    console.error('Error fetching clients:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Erro ao buscar clientes'
    });
  }
});

// Obter cliente por ID
router.get('/:id', async (req, res) => {
  try {
    const client = await Client.findByPk(req.params.id);
    
    if (!client) {
      return res.status(404).json({
        status: 'error',
        message: 'Cliente não encontrado'
      });
    }
    
    // Transformar o campo status em active (boolean)
    const clientData = client.toJSON();
    clientData.active = clientData.status === 'ativo';
    
    return res.status(200).json({
      status: 'success',
      data: { client: clientData }
    });
  } catch (error) {
    console.error('Error fetching client:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Erro ao buscar cliente'
    });
  }
});

// Criar cliente
router.post('/', async (req, res) => {
  try {
    const { name, email, document, phone, address } = req.body;
    
    if (!name || !email) {
      return res.status(400).json({
        status: 'error',
        message: 'Dados incompletos. Nome e email são obrigatórios'
      });
    }
    
    // Verificar se já existe cliente com o mesmo email
    const existingClient = await Client.findOne({ where: { email } });
    if (existingClient) {
      return res.status(400).json({
        status: 'error',
        message: 'Já existe um cliente com este email'
      });
    }
    
    // Preparar dados do cliente incluindo campos de endereço individuais
    const clientData = {
      name,
      email
    };

    // Adicionar documento e telefone se fornecidos
    if (document) clientData.document = document;
    if (phone) clientData.phone = phone;

    // Adicionar campos de endereço se fornecidos
    if (address) {
      if (address.endereco) clientData.endereco = address.endereco;
      if (address.numero) clientData.numero = address.numero;
      if (address.bairro) clientData.bairro = address.bairro;
      if (address.cidade) clientData.cidade = address.cidade;
      if (address.estado) clientData.estado = address.estado;
      if (address.cep) clientData.cep = address.cep;
    }
    
    const client = await Client.create(clientData);
    
    return res.status(201).json({
      status: 'success',
      data: { client }
    });
  } catch (error) {
    console.error('Error creating client:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Erro ao criar cliente'
    });
  }
});

// Atualizar cliente (inclui atualização de CPF/CNPJ com validação de unicidade)
router.put('/:id', async (req, res) => {
  try {
    const { name, email, document, phone, address, active } = req.body;
    const client = await Client.findByPk(req.params.id);
    
    if (!client) {
      return res.status(404).json({
        status: 'error',
        message: 'Cliente não encontrado'
      });
    }
    
    // Preparar dados para atualização
    const updateData = {
      name: name || client.name,
      email: email || client.email,
      document: document !== undefined ? document : client.document,
      phone: phone !== undefined ? phone : client.phone,
      status: active !== undefined ? (active ? 'ativo' : 'inativo') : client.status
    };

    // Atualizar campos de endereço se fornecidos
    if (address) {
      if (address.endereco !== undefined) updateData.endereco = address.endereco;
      if (address.numero !== undefined) updateData.numero = address.numero;
      if (address.bairro !== undefined) updateData.bairro = address.bairro;
      if (address.cidade !== undefined) updateData.cidade = address.cidade;
      if (address.estado !== undefined) updateData.estado = address.estado;
      if (address.cep !== undefined) updateData.cep = address.cep;
    }
    
    await client.update(updateData);
    
    return res.status(200).json({
      status: 'success',
      data: { client }
    });
  } catch (error) {
    console.error('Error updating client:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Erro ao atualizar cliente'
    });
  }
});

// Deletar cliente (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const client = await Client.findByPk(req.params.id);
    
    if (!client) {
      return res.status(404).json({
        status: 'error',
        message: 'Cliente não encontrado'
      });
    }
    
    // Excluir permanentemente o cliente do banco de dados
    await client.destroy();
    
    return res.status(200).json({
      status: 'success',
      message: 'Cliente excluído com sucesso'
    });
  } catch (error) {
    console.error('Error deleting client:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Erro ao excluir cliente'
    });
  }
});

// Toggle status do cliente (ativar/desativar)
router.patch('/:id/toggle-status', async (req, res) => {
  try {
    const client = await Client.findByPk(req.params.id);
    
    if (!client) {
      return res.status(404).json({
        status: 'error',
        message: 'Cliente não encontrado'
      });
    }
    
    const newStatus = client.status === 'ativo' ? 'inativo' : 'ativo';
    await client.update({ status: newStatus });
    
    // Transformar o campo status em active (boolean) para retorno
    const clientData = client.toJSON();
    clientData.active = newStatus === 'ativo';
    clientData.status = newStatus;
    
    return res.status(200).json({
      status: 'success',
      message: `Cliente ${newStatus === 'ativo' ? 'ativado' : 'desativado'} com sucesso`,
      data: { client: clientData }
    });
  } catch (error) {
    console.error('Error toggling client status:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Erro ao alterar status do cliente'
    });
  }
});

module.exports = router;