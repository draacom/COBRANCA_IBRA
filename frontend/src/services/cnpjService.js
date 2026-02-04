import api from './api';
import { removeDocumentFormatting, validateCNPJ } from '../utils/documentUtils';

// Função para consultar CNPJ na Receita Federal
export const consultarCNPJ = async (cnpj) => {
  try {
    // Remove formatação do CNPJ
    const cnpjLimpo = removeDocumentFormatting(cnpj);
    
    // Valida o CNPJ antes de fazer a consulta
    if (!validateCNPJ(cnpjLimpo)) {
      throw new Error('CNPJ inválido');
    }
    
    // Faz a consulta na API
    const response = await api.get(`/cnpj/${cnpjLimpo}`);
    
    if (response.data.status === 'success') {
      return response.data.data;
    } else {
      throw new Error(response.data.message || 'Erro ao consultar CNPJ');
    }
  } catch (error) {
    // Trata diferentes tipos de erro
    if (error.response) {
      // Erro da API
      const message = error.response.data?.message || 'Erro ao consultar CNPJ';
      throw new Error(message);
    } else if (error.request) {
      // Erro de rede
      throw new Error('Erro de conexão. Verifique sua internet e tente novamente.');
    } else {
      // Outros erros
      throw new Error(error.message || 'Erro inesperado ao consultar CNPJ');
    }
  }
};

// Função para mapear dados da consulta CNPJ para o formato do formulário
export const mapearDadosCNPJ = (dadosCNPJ) => {
  return {
    name: dadosCNPJ.nome || '',
    document: dadosCNPJ.cnpj || '',
    email: dadosCNPJ.email || '',
    phone: dadosCNPJ.telefone || '',
    address: {
      endereco: dadosCNPJ.endereco?.logradouro || '',
      numero: dadosCNPJ.endereco?.numero || '',
      bairro: dadosCNPJ.endereco?.bairro || '',
      cidade: dadosCNPJ.endereco?.cidade || '',
      estado: dadosCNPJ.endereco?.estado || '',
      cep: dadosCNPJ.endereco?.cep || ''
    }
  };
};