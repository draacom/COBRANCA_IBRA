import React, { useState, useEffect } from 'react';
import api from '../services/api';
import SuccessModal from '../components/SuccessModal';
import ConfirmModal from '../components/ConfirmModal';
import useIsMobile from '../utils/useIsMobile';

const Subscriptions = () => {
  const [subscriptions, setSubscriptions] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [successOpen, setSuccessOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [generatingCharges, setGeneratingCharges] = useState(false);
  const isMobile = useIsMobile();
  
  // Estados para confirmações
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({
    title: '',
    message: '',
    type: 'warning',
    onConfirm: null
  });
  
  // Estados para ordenação
  const [sortField, setSortField] = useState('');
  const [sortDirection, setSortDirection] = useState('asc');
  
  const [formData, setFormData] = useState({
    client_id: '',
    amount: '',
    billing_day: '',
    send_day: '',
    method: 'boleto',
    charge_name: ''
  });

  // Estados para filtros
  const [filters, setFilters] = useState({
    name: '',
    amount: '',
    method: ''
  });

  useEffect(() => {
    fetchData();
    fetchClients();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await api.get('/subscriptions');
      // Garantir que sempre seja um array
      const data = response.data;
      if (Array.isArray(data)) {
        setSubscriptions(data);
      } else if (data && Array.isArray(data.data)) {
        setSubscriptions(data.data);
      } else {
        console.warn('Resposta da API não contém um array válido:', data);
        setSubscriptions([]);
      }
    } catch (error) {
      console.error('Erro ao buscar assinaturas', error);
      setSubscriptions([]); // Garantir que seja um array vazio em caso de erro
    } finally {
      setLoading(false);
    }
  };

  const fetchClients = async () => {
    try {
      const response = await api.get('/clients');
      // Garantir que sempre seja um array
      const data = response.data;
      if (Array.isArray(data)) {
        setClients(data);
      } else if (data && Array.isArray(data.data)) {
        setClients(data.data);
      } else {
        console.warn('Resposta da API de clientes não contém um array válido:', data);
        setClients([]);
      }
    } catch (error) {
      console.error('Erro ao buscar clientes', error);
      setClients([]); // Garantir que seja um array vazio em caso de erro
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR');
  };

  // Função para ordenação
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Função para renderizar ícone de ordenação
  const renderSortIcon = (field) => {
    if (sortField !== field) {
      return (
        <svg className="w-4 h-4 ml-1 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      );
    }
    
    return sortDirection === 'asc' ? (
      <svg className="w-4 h-4 ml-1 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-4 h-4 ml-1 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    );
  };

  // Filtrar e ordenar assinaturas
  const filteredAndSortedSubscriptions = (Array.isArray(subscriptions) ? subscriptions : [])
    .filter(subscription => {
      const clientName = subscription.client?.name?.toLowerCase() || '';
      const amount = subscription.amount?.toString() || '';
      const method = subscription.method || '';
      
      return (
        clientName.includes(filters.name.toLowerCase()) &&
        amount.includes(filters.amount) &&
        (filters.method === '' || method === filters.method)
      );
    })
    .sort((a, b) => {
      if (!sortField) return 0;
      
      let aValue, bValue;
      
      switch (sortField) {
        case 'client':
          aValue = a.client?.name || '';
          bValue = b.client?.name || '';
          break;
        case 'amount':
          aValue = parseFloat(a.amount) || 0;
          bValue = parseFloat(b.amount) || 0;
          break;
        case 'billing_day':
          aValue = parseInt(a.billing_day) || 0;
          bValue = parseInt(b.billing_day) || 0;
          break;
        case 'next_billing_date':
          aValue = new Date(a.next_billing_date || 0);
          bValue = new Date(b.next_billing_date || 0);
          break;
        case 'send_day':
          aValue = parseInt(a.send_day) || 0;
          bValue = parseInt(b.send_day) || 0;
          break;
        case 'next_send_date':
          aValue = new Date(a.next_send_date || 0);
          bValue = new Date(b.next_send_date || 0);
          break;
        case 'method':
          aValue = a.method || '';
          bValue = b.method || '';
          break;
        case 'status':
          aValue = a.active ? 1 : 0;
          bValue = b.active ? 1 : 0;
          break;
        default:
          return 0;
      }
      
      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters({ ...filters, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    try {
      const data = {
        client_id: formData.client_id,
        amount: parseFloat(formData.amount),
        billing_day: parseInt(formData.billing_day, 10),
        send_day: formData.send_day ? parseInt(formData.send_day, 10) : undefined,
        method: formData.method,
        charge_name: formData.charge_name || undefined
      };
      
      if (editingId) {
        await api.put(`/subscriptions/${editingId}`, data);
        setSuccessMessage('Assinatura editada com sucesso!');
      } else {
        await api.post('/subscriptions', data);
        setSuccessMessage('Assinatura criada com sucesso!');
      }
      setSuccessOpen(true);
      
      setShowForm(false);
      setFormData({
        client_id: '',
        amount: '',
        billing_day: '',
        send_day: '',
        method: 'boleto',
        charge_name: ''
      });
      setEditingId(null);
      fetchData();
    } catch (error) {
      console.error('Erro ao salvar assinatura', error);
      setError(error.response?.data?.message || 'Erro ao salvar assinatura. Verifique os dados e tente novamente.');
    }
  };

  const handleEdit = (subscription) => {
    setFormData({
      client_id: subscription.client_id,
      amount: subscription.amount.toString(),
      billing_day: subscription.billing_day.toString(),
      send_day: subscription.send_day ? subscription.send_day.toString() : '',
      method: subscription.method,
      charge_name: subscription.charge_name || ''
    });
    setEditingId(subscription.id);
    setShowForm(true);
  };

  const handleActivate = (id) => {
    setConfirmConfig({
      title: 'Reativar Assinatura',
      message: 'Tem certeza que deseja reativar esta assinatura?',
      type: 'info',
      onConfirm: () => confirmActivate(id)
    });
    setConfirmOpen(true);
  };

  const confirmActivate = async (id) => {
    try {
      await api.post(`/subscriptions/${id}/activate`);
      setSuccessMessage('Assinatura reativada com sucesso!');
      setSuccessOpen(true);
      fetchData();
    } catch (error) {
      console.error('Erro ao reativar assinatura', error);
      setError('Não foi possível reativar a assinatura. Tente novamente.');
    } finally {
      setConfirmOpen(false);
    }
  };

  const handleCancel = (id) => {
    setConfirmConfig({
      title: 'Cancelar Assinatura',
      message: 'Tem certeza que deseja cancelar esta assinatura? Esta ação pode ser revertida posteriormente.',
      type: 'warning',
      onConfirm: () => confirmCancel(id)
    });
    setConfirmOpen(true);
  };

  const confirmCancel = async (id) => {
    try {
      await api.post(`/subscriptions/${id}/cancel`);
      setSuccessMessage('Assinatura cancelada com sucesso!');
      setSuccessOpen(true);
      fetchData();
    } catch (error) {
      console.error('Erro ao cancelar assinatura', error);
      setError('Não foi possível cancelar a assinatura. Tente novamente.');
    } finally {
      setConfirmOpen(false);
    }
  };

  const handleDelete = (id, clientName) => {
    setConfirmConfig({
      title: 'Excluir Assinatura',
      message: `Tem certeza que deseja EXCLUIR permanentemente a assinatura de ${clientName}?\n\nEsta ação não pode ser desfeita!`,
      type: 'danger',
      confirmText: 'Excluir',
      onConfirm: () => confirmDelete(id)
    });
    setConfirmOpen(true);
  };

  const confirmDelete = async (id) => {
    try {
      const response = await api.delete(`/subscriptions/${id}`);
      setSuccessMessage(response.data.message || 'Assinatura excluída com sucesso!');
      setSuccessOpen(true);
      fetchData();
    } catch (error) {
      console.error('Erro ao excluir assinatura', error);
      const errorMessage = error.response?.data?.message || 'Não foi possível excluir a assinatura. Tente novamente.';
      setError(errorMessage);
    } finally {
      setConfirmOpen(false);
    }
  };

  const handleGenerateDailyCharges = () => {
    const today = new Date();
    const currentDay = today.getDate();
    
    setConfirmConfig({
      title: 'Gerar Cobranças do Dia',
      message: `Tem certeza que deseja gerar todas as cobranças do dia ${currentDay}?\n\nEsta ação irá processar todas as assinaturas ativas que têm o dia de envio configurado para hoje.`,
      type: 'info',
      confirmText: 'Gerar Cobranças',
      onConfirm: () => confirmGenerateDailyCharges()
    });
    setConfirmOpen(true);
  };

  const confirmGenerateDailyCharges = async () => {
    try {
      setGeneratingCharges(true);
      setConfirmOpen(false);
      
      const response = await api.post('/subscriptions/generate-daily-charges');
      
      if (response.data.success) {
        const { generated, errors, total_processed, details } = response.data;
        
        let message = `Processamento concluído!\n\n`;
        message += `• Total processado: ${total_processed} assinatura(s)\n`;
        message += `• Cobranças geradas: ${generated}\n`;
        if (errors > 0) {
          message += `• Erros: ${errors}\n`;
        }
        
        // Mostrar detalhes das cobranças geradas
        const successfulCharges = details.filter(d => d.status === 'success');
        if (successfulCharges.length > 0) {
          message += `\nCobranças geradas:\n`;
          successfulCharges.forEach(charge => {
            message += `• ${charge.client_name} - ${charge.title} - R$ ${charge.amount.toFixed(2)}\n`;
          });
        }
        
        const skippedCharges = details.filter(d => d.status === 'skipped');
        if (skippedCharges.length > 0) {
          message += `\nCobranças ignoradas (já existem):\n`;
          skippedCharges.forEach(charge => {
            message += `• ${charge.client_name}\n`;
          });
        }
        
        setSuccessMessage(message);
        setSuccessOpen(true);
        
        // Recarregar dados se necessário
        if (generated > 0) {
          fetchData();
        }
      } else {
        setError(response.data.message || 'Erro ao gerar cobranças');
      }
    } catch (error) {
      console.error('Erro ao gerar cobranças do dia:', error);
      setError(error.response?.data?.message || 'Erro ao gerar cobranças do dia. Tente novamente.');
    } finally {
      setGeneratingCharges(false);
    }
  };

  return (
    <div className="w-full px-2 sm:px-4 lg:px-6">
      <SuccessModal open={successOpen} message={successMessage} onClose={() => setSuccessOpen(false)} />
      <ConfirmModal 
        open={confirmOpen} 
        title={confirmConfig.title}
        message={confirmConfig.message}
        type={confirmConfig.type}
        confirmText={confirmConfig.confirmText || 'Confirmar'}
        onConfirm={confirmConfig.onConfirm}
        onCancel={() => setConfirmOpen(false)}
      />
      
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Assinaturas</h1>
        <div className="flex gap-3">
          <button
            onClick={handleGenerateDailyCharges}
            disabled={generatingCharges}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {generatingCharges ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Gerando...
              </>
            ) : (
              <>
                🔄 Gerar Cobranças do Dia
              </>
            )}
          </button>
          <button
            onClick={() => {
              setFormData({
                client_id: '',
                amount: '',
                billing_day: '',
                send_day: '',
                method: 'boleto',
                charge_name: ''
              });
              setEditingId(null);
              setShowForm(!showForm);
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {showForm ? 'Cancelar' : 'Nova Assinatura'}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-lg font-medium mb-4">
            {editingId ? 'Editar Assinatura' : 'Nova Assinatura'}
          </h2>
          
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
              <p className="text-red-700">{error}</p>
            </div>
          )}
          
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label htmlFor="charge_name" className="block text-sm font-medium text-gray-700">
                  Nome da cobrança
                </label>
                <input
                  type="text"
                  name="charge_name"
                  id="charge_name"
                  placeholder="Ex.: Assinatura Premium"
                  value={formData.charge_name}
                  onChange={handleInputChange}
                  className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label htmlFor="client_id" className="block text-sm font-medium text-gray-700">
                  Cliente
                </label>
                <select
                  id="client_id"
                  name="client_id"
                  required
                  value={formData.client_id}
                  onChange={handleInputChange}
                  className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                >
                  <option value="">Selecione um cliente</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name && client.name.trim() !== '' ? client.name : client.email}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label htmlFor="amount" className="block text-sm font-medium text-gray-700">
                  Valor (R$)
                </label>
                <input
                  type="number"
                  name="amount"
                  id="amount"
                  required
                  min="0.01"
                  step="0.01"
                  value={formData.amount}
                  onChange={handleInputChange}
                  className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                />
              </div>
              
              <div>
                <label htmlFor="billing_day" className="block text-sm font-medium text-gray-700">
                  Dia de cobrança
                </label>
                <input
                  type="number"
                  name="billing_day"
                  id="billing_day"
                  required
                  min="1"
                  max="28"
                  value={formData.billing_day}
                  onChange={handleInputChange}
                  className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                />
              </div>
              
              <div>
                <label htmlFor="method" className="block text-sm font-medium text-gray-700">
                  Método de pagamento
                </label>
                <select
                  id="method"
                  name="method"
                  required
                  value={formData.method}
                  onChange={handleInputChange}
                  className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                >
                  <option value="boleto">Boleto</option>
                  <option value="pix">PIX</option>
                </select>
              </div>

              <div>
                <label htmlFor="send_day" className="block text-sm font-medium text-gray-700">
                  Dia de envio da cobrança
                </label>
                <input
                  type="number"
                  name="send_day"
                  id="send_day"
                  min="1"
                  max="28"
                  value={formData.send_day}
                  onChange={handleInputChange}
                  className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                />
              </div>
            </div>
            
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="mr-3 px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Salvar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h3 className="text-lg font-medium mb-4">Filtros</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="filter-name" className="block text-sm font-medium text-gray-700">
              Nome do Cliente
            </label>
            <input
              type="text"
              id="filter-name"
              name="name"
              placeholder="Filtrar por nome..."
              value={filters.name}
              onChange={handleFilterChange}
              className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
            />
          </div>
          <div>
            <label htmlFor="filter-amount" className="block text-sm font-medium text-gray-700">
              Valor
            </label>
            <input
              type="text"
              id="filter-amount"
              name="amount"
              placeholder="Filtrar por valor..."
              value={filters.amount}
              onChange={handleFilterChange}
              className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
            />
          </div>
          <div>
            <label htmlFor="filter-method" className="block text-sm font-medium text-gray-700">
              Forma de Pagamento
            </label>
            <select
              id="filter-method"
              name="method"
              value={filters.method}
              onChange={handleFilterChange}
              className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
            >
              <option value="">Todas</option>
              <option value="boleto">Boleto</option>
              <option value="pix">PIX</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tabela com largura aumentada e ordenação */}
      <div className="bg-white shadow rounded-lg">
        {loading ? (
          <div className="p-4 text-center">Carregando...</div>
        ) : filteredAndSortedSubscriptions.length === 0 ? (
          <div className="p-4 text-center text-gray-500">Nenhuma assinatura encontrada</div>
        ) : (
          <div className="w-full">
            {isMobile ? (
              <div className="divide-y divide-gray-200">
                {filteredAndSortedSubscriptions.map((subscription) => (
                  <div key={subscription.id} className="p-4 bg-white">
                    <div className="flex justify-between">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          {subscription.client?.name && subscription.client.name.trim() !== '' ? subscription.client.name : subscription.client?.email || 'Cliente não encontrado'}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">Método: {subscription.method === 'boleto' ? 'Boleto' : 'PIX'}</div>
                        <div className="mt-1 text-xs text-gray-500">Dia de cobrança: {subscription.billing_day}</div>
                        <div className="mt-1 text-xs text-gray-500">Próxima cobrança: {formatDate(subscription.next_billing_date)}</div>
                        <div className="mt-1 text-xs text-gray-500">Dia de envio: {subscription.send_day || '-'}</div>
                        <div className="mt-1 text-xs text-gray-500">Próximo envio: {formatDate(subscription.next_send_date)}</div>
                        <span className={`mt-2 inline-flex text-xs leading-5 font-semibold rounded-full ${subscription.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {subscription.active ? 'Ativa' : 'Cancelada'}
                        </span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-gray-700">{formatCurrency(subscription.amount)}</div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-end space-x-2">
                      <button
                        onClick={() => handleEdit(subscription)}
                        className="px-2 py-1 text-xs font-medium text-blue-600 bg-blue-100 rounded"
                        title="Editar assinatura"
                      >
                        Editar
                      </button>
                      {subscription.active ? (
                        <button
                          onClick={() => handleCancel(subscription.id)}
                          className="px-2 py-1 text-xs font-medium text-yellow-700 bg-yellow-100 rounded"
                          title="Cancelar assinatura"
                        >
                          Cancelar
                        </button>
                      ) : (
                        <button
                          onClick={() => handleActivate(subscription.id)}
                          className="px-2 py-1 text-xs font-medium text-green-700 bg-green-100 rounded"
                          title="Reativar assinatura"
                        >
                          Reativar
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(subscription.id, subscription.client?.name && subscription.client.name.trim() !== '' ? subscription.client.name : subscription.client?.email || 'Cliente')}
                        className="px-2 py-1 text-xs font-medium text-red-700 bg-red-100 rounded"
                        title="Excluir permanentemente"
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
            <table className="w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th 
                    scope="col" 
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none w-1/6"
                    onClick={() => handleSort('client')}
                  >
                    <div className="flex items-center">
                      Cliente
                      {renderSortIcon('client')}
                    </div>
                  </th>
                  <th 
                    scope="col" 
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none w-1/12"
                    onClick={() => handleSort('amount')}
                  >
                    <div className="flex items-center">
                      Valor
                      {renderSortIcon('amount')}
                    </div>
                  </th>
                  <th 
                    scope="col" 
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none w-1/12"
                    onClick={() => handleSort('billing_day')}
                  >
                    <div className="flex items-center">
                      Dia de cobrança
                      {renderSortIcon('billing_day')}
                    </div>
                  </th>
                  <th 
                    scope="col" 
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none w-1/8"
                    onClick={() => handleSort('next_billing_date')}
                  >
                    <div className="flex items-center">
                      Próxima cobrança
                      {renderSortIcon('next_billing_date')}
                    </div>
                  </th>
                  <th 
                    scope="col" 
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none w-1/12"
                    onClick={() => handleSort('send_day')}
                  >
                    <div className="flex items-center">
                      Dia de envio
                      {renderSortIcon('send_day')}
                    </div>
                  </th>
                  <th 
                    scope="col" 
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none w-1/8"
                    onClick={() => handleSort('next_send_date')}
                  >
                    <div className="flex items-center">
                      Próximo envio
                      {renderSortIcon('next_send_date')}
                    </div>
                  </th>
                  <th 
                    scope="col" 
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none w-1/12"
                    onClick={() => handleSort('method')}
                  >
                    <div className="flex items-center">
                      Método
                      {renderSortIcon('method')}
                    </div>
                  </th>
                  <th 
                    scope="col" 
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none w-1/12"
                    onClick={() => handleSort('status')}
                  >
                    <div className="flex items-center">
                      Status
                      {renderSortIcon('status')}
                    </div>
                  </th>
                  <th scope="col" className="relative px-4 py-3 w-1/4">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredAndSortedSubscriptions.map((subscription) => (
                  <tr key={subscription.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {subscription.client?.name && subscription.client.name.trim() !== '' ? subscription.client.name : subscription.client?.email || 'Cliente não encontrado'}
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">
                        {formatCurrency(subscription.amount)}
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">
                        {subscription.billing_day}
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">
                        {formatDate(subscription.next_billing_date)}
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">
                        {subscription.send_day || '-'}
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">
                        {formatDate(subscription.next_send_date)}
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">
                        {subscription.method === 'boleto' ? 'Boleto' : 'PIX'}
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${subscription.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {subscription.active ? 'Ativa' : 'Cancelada'}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end space-x-2">
                        <button
                          onClick={() => handleEdit(subscription)}
                          className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-blue-700 bg-blue-100 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200"
                          title="Editar assinatura"
                        >
                          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          Editar
                        </button>
                        
                        {subscription.active ? (
                          <button
                            onClick={() => handleCancel(subscription.id)}
                            className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-yellow-700 bg-yellow-100 hover:bg-yellow-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 transition-colors duration-200"
                            title="Cancelar assinatura"
                          >
                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Cancelar
                          </button>
                        ) : (
                          <button
                            onClick={() => handleActivate(subscription.id)}
                            className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-green-700 bg-green-100 hover:bg-green-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors duration-200"
                            title="Reativar assinatura"
                          >
                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h.01M19 10a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Reativar
                          </button>
                        )}
                        
                        <button
                          onClick={() => handleDelete(subscription.id, subscription.client?.name && subscription.client.name.trim() !== '' ? subscription.client.name : subscription.client?.email || 'Cliente')}
                          className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors duration-200"
                          title="Excluir permanentemente"
                        >
                          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Subscriptions;