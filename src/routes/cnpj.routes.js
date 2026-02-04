const express = require('express');
const axios = require('axios');

const router = express.Router();

// Função para validar CNPJ
function validarCNPJ(cnpj) {
  cnpj = cnpj.replace(/[^\d]+/g, '');
  
  if (cnpj.length !== 14) return false;
  
  // Elimina CNPJs inválidos conhecidos
  if (/^(\d)\1{13}$/.test(cnpj)) return false;
  
  // Valida DVs
  let tamanho = cnpj.length - 2;
  let numeros = cnpj.substring(0, tamanho);
  let digitos = cnpj.substring(tamanho);
  let soma = 0;
  let pos = tamanho - 7;
  
  for (let i = tamanho; i >= 1; i--) {
    soma += numeros.charAt(tamanho - i) * pos--;
    if (pos < 2) pos = 9;
  }
  
  let resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;
  if (resultado != digitos.charAt(0)) return false;
  
  tamanho = tamanho + 1;
  numeros = cnpj.substring(0, tamanho);
  soma = 0;
  pos = tamanho - 7;
  
  for (let i = tamanho; i >= 1; i--) {
    soma += numeros.charAt(tamanho - i) * pos--;
    if (pos < 2) pos = 9;
  }
  
  resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;
  if (resultado != digitos.charAt(1)) return false;
  
  return true;
}

// Função para formatar CNPJ
function formatarCNPJ(cnpj) {
  cnpj = cnpj.replace(/[^\d]/g, '');
  return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

// GET /api/cnpj/:cnpj - Consultar CNPJ na Receita Federal
router.get('/:cnpj', async (req, res) => {
  try {
    const cnpj = req.params.cnpj.replace(/[^\d]/g, '');
    
    // Validar CNPJ
    if (!validarCNPJ(cnpj)) {
      return res.status(400).json({
        status: 'error',
        message: 'CNPJ inválido'
      });
    }
    
    // Consultar na API da ReceitaWS
    const url = `https://www.receitaws.com.br/v1/cnpj/${cnpj}`;
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    });
    
    const data = response.data;
    
    // Verificar se houve erro na consulta
    if (data.status === 'ERROR') {
      return res.status(404).json({
        status: 'error',
        message: data.message || 'CNPJ não encontrado'
      });
    }
    
    // Formatar e retornar os dados
    const dadosFormatados = {
      cnpj: formatarCNPJ(cnpj),
      nome: data.nome || '',
      fantasia: data.fantasia || '',
      email: data.email || '',
      telefone: data.telefone || '',
      endereco: {
        logradouro: data.logradouro || '',
        numero: data.numero || '',
        complemento: data.complemento || '',
        bairro: data.bairro || '',
        cidade: data.municipio || '',
        estado: data.uf || '',
        cep: data.cep ? data.cep.replace(/[^\d]/g, '') : ''
      },
      situacao: data.situacao || '',
      atividade_principal: data.atividade_principal ? data.atividade_principal[0]?.text : ''
    };
    
    return res.status(200).json({
      status: 'success',
      data: dadosFormatados
    });
    
  } catch (error) {
    console.error('Erro ao consultar CNPJ:', error);
    
    if (error.code === 'ECONNABORTED') {
      return res.status(408).json({
        status: 'error',
        message: 'Timeout na consulta do CNPJ. Tente novamente.'
      });
    }
    
    return res.status(500).json({
      status: 'error',
      message: 'Erro interno do servidor ao consultar CNPJ'
    });
  }
});

module.exports = router;