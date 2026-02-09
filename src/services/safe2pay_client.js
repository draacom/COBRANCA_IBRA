const axios = require('axios');
const settings = require('../config/settings');

class Safe2PayClient {
  constructor() {
    this.baseUrl = settings.safe2pay.apiUrl;
    this.apiKey = settings.safe2pay.apiKey;
    this.secretKey = settings.safe2pay.secretKey;
    this.isSandbox = settings.safe2pay.isSandbox;
    // Se não houver callback explícito, derive de PUBLIC_BASE_URL
    const publicBase = settings.urls.publicBase || settings.urls.base || null;
    this.callbackUrl = settings.safe2pay.callbackUrl || (publicBase ? `${publicBase.replace(/\/$/, '')}/api/webhooks/safe2pay` : null);
    this.pixMethodId = settings.safe2pay.methods.pix;
    this.boletoMethodId = settings.safe2pay.methods.boleto;
    // Defaults ajustados: multa 1% e juros 2%
    this.boletoFinePercent = settings.safe2pay.fees.boletoFine;
    this.boletoInterestMonthlyPercent = settings.safe2pay.fees.boletoInterest;
    
    if (!this.apiKey || !this.secretKey) {
      throw new Error('Safe2Pay API credentials not configured');
    }
  }

  // Utilitário: manter apenas dígitos
  onlyDigits(value) {
    if (!value) return '';
    return String(value).replace(/\D+/g, '');
  }

  // Normalizar endereço do sistema para o formato esperado pela Safe2Pay
  normalizeAddress(addr) {
    if (!addr || typeof addr !== 'object') return undefined;
    const out = {
      ZipCode: addr.cep || addr.zip || addr.ZipCode || undefined,
      Street: addr.endereco || addr.street || addr.Street || undefined,
      Number: addr.numero || addr.number || addr.Number || undefined,
      District: addr.bairro || addr.neighborhood || addr.District || undefined,
      City: addr.cidade || addr.city || addr.City || undefined,
      State: addr.estado || addr.state || addr.State || undefined
    };
    // Remove chaves undefined
    Object.keys(out).forEach(k => out[k] === undefined && delete out[k]);
    return Object.keys(out).length ? out : undefined;
  }

  getHttpClient() {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    // Safe2Pay usa chave de API em header (baseado no PHP funcionando)
    if (this.apiKey) {
      headers['x-api-key'] = this.apiKey; // Header correto conforme PHP
    }

    return axios.create({ baseURL: this.baseUrl, headers });
  }

  /**
   * Emitir cobrança PIX ou boleto via Safe2Pay
   * dadosCobranca: {
   *   valor, vencimento (YYYY-MM-DD), metodo_pagamento ('pix'|'boleto'),
   *   cliente: { nome, documento, email, telefone, endereco }, referencia
   * }
   */
  async emitirCobranca(dadosCobranca) {
    console.log('=== INÍCIO emitirCobrança Safe2Pay ===');
    console.log('API Key configurada:', this.apiKey ? 'SIM' : 'NÃO');
    console.log('Base URL:', this.baseUrl);
    console.log('Sandbox mode:', this.isSandbox);
    console.log('Callback URL:', this.callbackUrl);
    console.log('Dados recebidos:', JSON.stringify(dadosCobranca, null, 2));
    
    try {
      
      // Verificar se já está no formato correto da Safe2Pay (vem da invoice.routes.js)
      if (dadosCobranca.Customer && dadosCobranca.PaymentMethod) {
        console.log('Dados já estão no formato Safe2Pay, enviando diretamente');
        const httpClient = this.getHttpClient();
        const response = await httpClient.post('/Payment', dadosCobranca);
        return response.data;
      }
      
      // Suporte para estruturas legacy: cliente (legacy) e payer (nova)
      const cliente = dadosCobranca.cliente || dadosCobranca.payer;
      const valor = dadosCobranca.valor || dadosCobranca.amount;
      const vencimento = dadosCobranca.vencimento || dadosCobranca.due_date;
      const metodoPagamento = dadosCobranca.metodo_pagamento || dadosCobranca.payment_method;
      const referencia = dadosCobranca.referencia || dadosCobranca.reference_id;
      
      console.log('Cliente extraído:', JSON.stringify(cliente, null, 2));
      
      // Construir o payload da requisição baseado no PHP funcionando
      const telefoneFormatado = (cliente.telefone || cliente.phone)?.replace(/\D/g, '') || '';
      const telefoneProcessado = telefoneFormatado.replace(/^55(\d{10,11})$/, '$1'); // Remove prefixo 55 se presente
      
      const requestBody = {
        IsSandbox: this.isSandbox,
        Application: 'Pagamento de Serviço',
        Vendor: cliente.nome || cliente.name,
        CallbackUrl: this.callbackUrl,
        PaymentMethod: metodoPagamento === 'pix' ? '6' : '1', // 1 = Boleto, 6 = PIX
        Customer: {
          Name: cliente.nome || cliente.name,
          Identity: (cliente.documento || cliente.document)?.replace(/\D/g, ''),
          Email: cliente.email,
          Phone: telefoneProcessado,
          Address: {
            ZipCode: (cliente.endereco?.cep || cliente.endereco?.zip_code || '')?.replace(/\D/g, ''),
            Street: cliente.endereco?.logradouro || cliente.endereco?.street || cliente.address || '',
            Number: cliente.endereco?.numero || cliente.endereco?.number || '',
            Complement: cliente.endereco?.complemento || cliente.endereco?.complement || '',
            District: cliente.endereco?.bairro || cliente.endereco?.district || '',
            StateInitials: cliente.endereco?.uf || cliente.endereco?.state || '',
            CityName: cliente.endereco?.cidade || cliente.endereco?.city || '',
            CountryName: 'Brasil'
          }
        },
        Products: [
          {
            Code: referencia || `COB${Date.now()}`,
            Description: dadosCobranca.descricao || dadosCobranca.description || 'Cobrança avulsa',
            UnitPrice: valor, // Valor já deve estar em centavos ou será convertido pela API
            Quantity: 1
          }
        ],
        Reference: referencia || `COB${Date.now()}`
      };

      // Adicionar PaymentObject específico para boletos (obrigatório para boletos)
      if (metodoPagamento === 'boleto') {
        requestBody.PaymentObject = {
          DueDate: vencimento,
          Instruction: 'Não receber após o vencimento',
          PenaltyAmount: Number.isFinite(this.boletoFinePercent) ? this.boletoFinePercent : 1,
          InterestAmount: Number.isFinite(this.boletoInterestMonthlyPercent) ? this.boletoInterestMonthlyPercent : 2,
          CancelAfterDue: false,
          IsEnablePartialPayment: false,
          DaysBeforeCancel: 0,
          Messages: ['Em caso de dúvidas, entre em contato conosco']
        };
      }

      console.log('Safe2Pay Request Body:', JSON.stringify(requestBody, null, 2));

      // Usar o endpoint correto baseado no PHP funcionando
      const endpoint = '/Payment';
      
      console.log(`Fazendo requisição para: ${this.baseUrl}${endpoint}`);
      
      const httpClient = this.getHttpClient();
      const response = await httpClient.post(endpoint, requestBody);

      console.log('Safe2Pay Response:', response.data);
      
      // Verificar se a resposta tem erro
      if (response.data.HasError) {
        throw new Error(`Erro retornado pela API: ${response.data.Error || 'Erro não especificado'}`);
      }
      
      return response.data;

    } catch (error) {
       console.error('Erro ao emitir cobrança Safe2Pay:', error);
       throw this._createDetailedError(error, '/Payment');
     }
   }

   _createDetailedError(error, endpoint = '') {
     const providerDetails = error?.response?.data || error?.message || error;
     const errorMessage = `Falha ao emitir cobrança com o provedor (Safe2Pay) - ${error.message}`;
     
     const detailedError = new Error(errorMessage);
     detailedError.provider = providerDetails;
     detailedError.endpoint = endpoint;
     detailedError.details = providerDetails;
     
     return detailedError;
   }

  async consultarCobranca(invoiceId) {
    const client = this.getHttpClient();
    try {
      const response = await client.get(`/v2/Payments/${invoiceId}`);
      return response.data;
    } catch (error) {
      console.error('Erro ao consultar cobrança na Safe2Pay:', error?.message);
      throw new Error(`Falha ao consultar cobrança: ${error.message}`);
    }
  }

  async cancelarCobranca(invoiceId) {
    const client = this.getHttpClient();
    try {
      const response = await client.post(`/v2/Payments/${invoiceId}/Cancel`);
      return response.data;
    } catch (error) {
      console.error('Erro ao cancelar cobrança na Safe2Pay:', error?.message);
      throw new Error(`Falha ao cancelar cobrança: ${error.message}`);
    }
  }
}

module.exports = Safe2PayClient;