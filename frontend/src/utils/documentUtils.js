// Função para remover formatação de documento
export const removeDocumentFormatting = (document) => {
  if (!document || typeof document !== 'string') {
    return '';
  }
  return document.replace(/[^\d]/g, '');
};

// Função para validar CPF
export const validateCPF = (cpf) => {
  cpf = removeDocumentFormatting(cpf);
  
  if (cpf.length !== 11) return false;
  
  // Elimina CPFs inválidos conhecidos
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  
  // Valida 1º dígito
  let add = 0;
  for (let i = 0; i < 9; i++) {
    add += parseInt(cpf.charAt(i)) * (10 - i);
  }
  let rev = 11 - (add % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(cpf.charAt(9))) return false;
  
  // Valida 2º dígito
  add = 0;
  for (let i = 0; i < 10; i++) {
    add += parseInt(cpf.charAt(i)) * (11 - i);
  }
  rev = 11 - (add % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(cpf.charAt(10))) return false;
  
  return true;
};

// Função para validar CNPJ
export const validateCNPJ = (cnpj) => {
  cnpj = removeDocumentFormatting(cnpj);
  
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
};

// Função para validar CPF ou CNPJ
export const validateDocument = (document) => {
  const cleanDocument = removeDocumentFormatting(document);
  
  if (cleanDocument.length === 11) {
    return validateCPF(cleanDocument);
  } else if (cleanDocument.length === 14) {
    return validateCNPJ(cleanDocument);
  }
  
  return false;
};

// Função para formatar CPF
export const formatCPF = (cpf) => {
  cpf = removeDocumentFormatting(cpf);
  return cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
};

// Função para formatar CNPJ
export const formatCNPJ = (cnpj) => {
  cnpj = removeDocumentFormatting(cnpj);
  return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
};

// Função para formatar CPF ou CNPJ automaticamente
export const formatDocument = (document) => {
  const cleanDocument = removeDocumentFormatting(document);
  
  if (cleanDocument.length === 11) {
    return formatCPF(cleanDocument);
  } else if (cleanDocument.length === 14) {
    return formatCNPJ(cleanDocument);
  }
  
  return document;
};

// Função para aplicar máscara durante a digitação
export const applyDocumentMask = (value) => {
  const cleanValue = removeDocumentFormatting(value);
  
  if (cleanValue.length <= 11) {
    // Máscara de CPF
    return cleanValue
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})/, '$1-$2')
      .replace(/(-\d{2})\d+?$/, '$1');
  } else {
    // Máscara de CNPJ
    return cleanValue
      .replace(/(\d{2})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1/$2')
      .replace(/(\d{4})(\d{1,2})/, '$1-$2')
      .replace(/(-\d{2})\d+?$/, '$1');
  }
};

// Função para determinar se é CPF ou CNPJ
export const getDocumentType = (document) => {
  const cleanDocument = removeDocumentFormatting(document);
  
  if (cleanDocument.length === 11) {
    return 'CPF';
  } else if (cleanDocument.length === 14) {
    return 'CNPJ';
  }
  
  return 'UNKNOWN';
};