import React, { useState, useEffect } from 'react';
import useIsMobile from '../utils/useIsMobile';
import api from '../services/api';
import SuccessModal from '../components/SuccessModal';

const Invoices = () => {
  const isMobile = useIsMobile();
  const [invoices, setInvoices] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [error, setError] = useState('');
  const [successOpen, setSuccessOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [formData, setFormData] = useState({
    client_id: '',
    amount: '',
    due_date: '',
    payment_method: 'boleto',
    title: ''
  });
  const [editFormData, setEditFormData] = useState({
    amount: '',
    due_date: '',
    title: ''
  });
  const [filters, setFilters] = useState({
    status: '',
    client_query: '',
    start_date: '',
    end_date: '',
    sent: ''
  });
  const [filteredInvoices, setFilteredInvoices] = useState([]);

  // Helpers de data sem timezone (YYYY-MM-DD)
  const toYMDLocal = (d) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const isYMD = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
  const formatDatePtBR = (s) => {
    if (!s) return '-';
    const str = String(s).trim();
    if (isYMD(str)) {
      const [y, m, d] = str.split('-');
      return `${d}/${m}/${y}`;
    }
    const d = new Date(str);
    if (isNaN(d.getTime())) return str;
    return new Intl.DateTimeFormat('pt-BR').format(d);
  };

  useEffect(() => {
    // Configurar data padrão para os últimos 30 dias usando data local
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);

    setFilters(prev => ({
      ...prev,
      start_date: toYMDLocal(thirtyDaysAgo),
      end_date: toYMDLocal(today)
    }));

    fetchData();
  }, []);

  // Aplicar filtros em tempo real
  useEffect(() => {
    let filtered = invoices;

    if (filters.status) {
      filtered = filtered.filter(invoice => invoice.status === filters.status);
    }

    if (filters.client_query) {
      const q = filters.client_query.trim().toLowerCase();
      filtered = filtered.filter(invoice => {
        const name = invoice.client?.name ? invoice.client.name.toLowerCase() : '';
        const email = invoice.client?.email ? invoice.client.email.toLowerCase() : '';
        return (name.includes(q) || email.includes(q));
      });
    }

    if (filters.start_date) {
      filtered = filtered.filter(invoice => {
        const inv = isYMD(invoice.due_date) ? invoice.due_date : toYMDLocal(new Date(invoice.due_date));
        return inv >= filters.start_date;
      });
    }

    if (filters.end_date) {
      filtered = filtered.filter(invoice => {
        const inv = isYMD(invoice.due_date) ? invoice.due_date : toYMDLocal(new Date(invoice.due_date));
        return inv <= filters.end_date;
      });
    }

    if (filters.sent) {
      if (filters.sent === 'sent') {
        filtered = filtered.filter(invoice => invoice.sent_at);
      } else if (filters.sent === 'not_sent') {
        filtered = filtered.filter(invoice => !invoice.sent_at);
      }
    }

    setFilteredInvoices(filtered);
  }, [invoices, filters]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [invoicesRes, clientsRes] = await Promise.all([
        api.get('/invoices'),
        api.get('/clients')
      ]);
      setInvoices(invoicesRes.data.data);
      
      // Garantir que sempre seja um array
      const clientsData = clientsRes.data;
      if (Array.isArray(clientsData)) {
        setClients(clientsData);
      } else if (clientsData && Array.isArray(clientsData.data)) {
        setClients(clientsData.data);
      } else {
        console.warn('Resposta da API de clientes não contém um array válido:', clientsData);
        setClients([]);
      }
    } catch (error) {
      console.error('Erro ao buscar dados', error);
      setClients([]); // Garantir que seja um array vazio em caso de erro
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters({ ...filters, [name]: value });
  };

  const resetForm = () => {
    setFormData({
      client_id: '',
      amount: '',
      due_date: '',
      payment_method: 'boleto',
      title: ''
    });
    setError('');
  };

  const resetEditForm = () => {
    setEditFormData({
      amount: '',
      due_date: '',
      title: ''
    });
    setError('');
  };

  // Normaliza data para o formato aceito por <input type="date"> (YYYY-MM-DD)
  const toDateInputValue = (dateValue) => {
    if (!dateValue) return '';
    if (typeof dateValue === 'string') {
      if (dateValue.includes('/')) {
        // Formato dd/mm/yyyy
        const [dd, mm, yyyy] = dateValue.split('/').map(s => s.trim());
        if (dd && mm && yyyy) {
          return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
        }
      }
      const d = new Date(dateValue);
      if (!isNaN(d.getTime())) {
        const tzDate = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
        return tzDate.toISOString().split('T')[0];
      }
      return '';
    } else if (dateValue instanceof Date) {
      const tzDate = new Date(dateValue.getTime() - dateValue.getTimezoneOffset() * 60000);
      return tzDate.toISOString().split('T')[0];
    }
    return '';
  };

  const handleEdit = (invoice) => {
    if (invoice.status === 'paid') {
      alert('Não é possível editar uma cobrança já paga');
      return;
    }
    
    setEditingInvoice(invoice);
    setEditFormData({
      amount: invoice.amount.toString(),
      due_date: toDateInputValue(invoice.due_date),
      title: invoice.title || ''
    });
    setShowEditForm(true);
    setError('');
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (!editingInvoice) {
        setError('Nenhuma cobrança selecionada para edição');
        return;
      }
      // Usar o cliente API compartilhado para respeitar baseURL dinâmica e incluir token
      const response = await api.put(`/invoices/${editingInvoice.id}`, editFormData);
      const data = response.data;

      if (data.status === 'success') {
        setSuccessMessage('Cobrança atualizada com sucesso!');
        setSuccessOpen(true);
        setShowEditForm(false);
        setEditingInvoice(null);
        resetEditForm();
        fetchData();
      } else {
        setError(data.message || 'Erro ao atualizar cobrança');
      }
    } catch (error) {
      console.error('Error updating invoice:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        config: error.config
      });
      setError(error.response?.data?.message || 'Erro ao atualizar cobrança');
    } finally {
      setLoading(false);
    }
  };



  const handleResendNotification = async (id, type) => {
    console.log('🔄 handleResendNotification chamado:', { id, type });
    
    try {
      const channels = type === 'email' ? ['email'] : ['whatsapp'];
      console.log('📤 Enviando requisição:', {
        url: `/invoices/${id}/send`,
        channels,
        fullUrl: `${api.defaults.baseURL}/invoices/${id}/send`
      });
      
      const response = await api.post(`/invoices/${id}/send`, { channels });
      console.log('✅ Resposta da API:', response.data);
      
      setSuccessMessage(`Notificação por ${type === 'email' ? 'email' : 'WhatsApp'} enviada com sucesso!`);
      setSuccessOpen(true);
      
      // Recarregar a lista de faturas para atualizar o status
      fetchData();
    } catch (error) {
      console.error('❌ Erro ao enviar notificação:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        config: error.config
      });
      
      const errorMessage = error.response?.data?.message || 'Não foi possível enviar a notificação. Tente novamente.';
      alert(errorMessage);
    }
  };

  const handleDeleteInvoice = async (id) => {
    if (window.confirm('Tem certeza que deseja excluir esta cobrança?')) {
      try {
        await api.delete(`/invoices/${id}`);
        setSuccessMessage('Cobrança deletada com sucesso!');
        setSuccessOpen(true);
        fetchData();
      } catch (error) {
        console.error('Erro ao excluir cobrança', error);
        alert('Não foi possível excluir a cobrança. Tente novamente.');
      }
    }
  };

  const handleMarkAsPaid = async (id) => {
    if (window.confirm('Tem certeza que deseja marcar esta cobrança como paga?')) {
      try {
        await api.post(`/invoices/${id}/mark-paid`);
        setSuccessMessage('Cobrança marcada como paga com sucesso!');
        setSuccessOpen(true);
        fetchData();
      } catch (error) {
        console.error('Erro ao marcar como paga', error);
        alert('Não foi possível marcar a cobrança como paga. Tente novamente.');
      }
    }
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setCreating(true);
    try {
      // Normalizar valor para aceitar vírgula e pontos de milhar
      const normalizedAmountStr = String(formData.amount)
        .replace(/\s+/g, '')
        .replace(/\./g, '') // remove pontos de milhar
        .replace(',', '.'); // converte vírgula decimal em ponto
      const normalizedAmount = parseFloat(normalizedAmountStr);

      // Validação simples de obrigatórios antes de enviar
      if (!formData.client_id || !formData.due_date || !formData.payment_method || !isFinite(normalizedAmount)) {
        setError('Preencha cliente, valor (número válido), vencimento e método.');
        return;
      }

      const payload = {
        client_id: formData.client_id,
        amount: normalizedAmount,
        due_date: formData.due_date,
        payment_method: formData.payment_method,
        title: formData.title || undefined
      };
      await api.post('/invoices/ad_hoc', payload);
      setSuccessMessage('Cobrança avulsa criada e enviada com sucesso!');
      setSuccessOpen(true);
      setShowForm(false);
      setFormData({ client_id: '', amount: '', due_date: '', payment_method: 'boleto', title: '' });
      fetchData();
    } catch (err) {
      console.error('Erro ao criar cobrança avulsa', err);
      const msg = err?.response?.data?.message || 'Não foi possível criar a cobrança avulsa.';
      const details = err?.response?.data?.details;
      const prettyDetails = details
        ? (typeof details === 'string' ? details : JSON.stringify(details))
        : '';
      setError(prettyDetails ? `${msg} - ${prettyDetails}` : msg);
    } finally {
      setCreating(false);
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const formatDate = (dateString) => formatDatePtBR(dateString);

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'paid':
        return 'bg-green-100 text-green-800';
      case 'overdue':
        return 'bg-red-100 text-red-800';
      case 'canceled':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'pending':
        return 'Pendente';
      case 'paid':
        return 'Paga';
      case 'overdue':
        return 'Vencida';
      case 'canceled':
        return 'Cancelada';
      default:
        return status;
    }
  };

  return (
    <div>
      <SuccessModal open={successOpen} message={successMessage} onClose={() => setSuccessOpen(false)} />
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Cobranças</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {showForm ? 'Cancelar' : 'Nova Cobrança Avulsa'}
        </button>
      </div>

      {showForm && (
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-lg font-medium mb-4">Nova Cobrança Avulsa</h2>
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
              <p className="text-red-700">{error}</p>
            </div>
          )}

      {showEditForm && (
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-lg font-medium mb-4">Editar Cobrança</h2>
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
              <p className="text-red-700">{error}</p>
            </div>
          )}
          <form onSubmit={handleEditSubmit}>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label htmlFor="edit_amount" className="block text-sm font-medium text-gray-700">Valor</label>
                <input
                  type="number"
                  step="0.01"
                  id="edit_amount"
                  name="amount"
                  value={editFormData.amount}
                  onChange={(e) => setEditFormData({ ...editFormData, amount: e.target.value })}
                  className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                  placeholder="0,00"
                />
              </div>
              <div>
                <label htmlFor="edit_due_date" className="block text-sm font-medium text-gray-700">Vencimento</label>
                <input
                  type="date"
                  id="edit_due_date"
                  name="due_date"
                  value={editFormData.due_date}
                  onChange={(e) => setEditFormData({ ...editFormData, due_date: e.target.value })}
                  className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="edit_title" className="block text-sm font-medium text-gray-700">Título</label>
                <input
                  type="text"
                  id="edit_title"
                  name="title"
                  value={editFormData.title}
                  onChange={(e) => setEditFormData({ ...editFormData, title: e.target.value })}
                  className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                  placeholder="Descrição da cobrança"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => {
                  setShowEditForm(false);
                  setEditingInvoice(null);
                  resetEditForm();
                }}
                className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {loading ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </div>
          </form>
        </div>
      )}
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label htmlFor="client_id" className="block text-sm font-medium text-gray-700">Cliente</label>
                <select
                  id="client_id"
                  name="client_id"
                  value={formData.client_id}
                  onChange={handleFormChange}
                  className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                >
                  <option value="">Selecione um cliente</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>{client.name && client.name.trim() !== '' ? client.name : client.email}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="amount" className="block text-sm font-medium text-gray-700">Valor</label>
                <input
                  type="number"
                  step="0.01"
                  id="amount"
                  name="amount"
                  value={formData.amount}
                  onChange={handleFormChange}
                  className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                  placeholder="0,00"
                />
              </div>
              <div>
                <label htmlFor="due_date" className="block text-sm font-medium text-gray-700">Vencimento</label>
                <input
                  type="date"
                  id="due_date"
                  name="due_date"
                  value={formData.due_date}
                  onChange={handleFormChange}
                  className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label htmlFor="payment_method" className="block text-sm font-medium text-gray-700">Método</label>
                <select
                  id="payment_method"
                  name="payment_method"
                  value={formData.payment_method}
                  onChange={handleFormChange}
                  className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                >
                  <option value="boleto">Boleto</option>
                  <option value="pix">PIX</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="title" className="block text-sm font-medium text-gray-700">Título (opcional)</label>
                <input
                  type="text"
                  id="title"
                  name="title"
                  value={formData.title}
                  onChange={handleFormChange}
                  className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                  placeholder="Descrição da cobrança"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="submit"
                disabled={creating}
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
              >
                {creating ? 'Gerando Cobrança' : 'Criar e Enviar'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-lg font-medium mb-4">Filtros (Últimos 30 dias por padrão)</h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label htmlFor="start_date" className="block text-sm font-medium text-gray-700">
              Data Inicial
            </label>
            <input
              type="date"
              id="start_date"
              name="start_date"
              value={filters.start_date}
              onChange={handleFilterChange}
              className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
            />
          </div>
          
          <div>
            <label htmlFor="end_date" className="block text-sm font-medium text-gray-700">
              Data Final
            </label>
            <input
              type="date"
              id="end_date"
              name="end_date"
              value={filters.end_date}
              onChange={handleFilterChange}
              className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
            />
          </div>
          
          <div>
            <label htmlFor="client_query" className="block text-sm font-medium text-gray-700">
              Cliente (digite para buscar)
            </label>
            <input
              type="text"
              id="client_query"
              name="client_query"
              value={filters.client_query}
              onChange={handleFilterChange}
              placeholder="Nome ou e-mail do cliente"
              className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            />
          </div>
          
          <div>
            <label htmlFor="status" className="block text-sm font-medium text-gray-700">
              Status do Pagamento
            </label>
            <select
              id="status"
              name="status"
              value={filters.status}
              onChange={handleFilterChange}
              className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            >
              <option value="">Todos</option>
              <option value="pending">Pendente</option>
              <option value="paid">Paga</option>
              <option value="overdue">Vencida</option>
              <option value="canceled">Cancelada</option>
            </select>
          </div>
          
          <div>
            <label htmlFor="sent" className="block text-sm font-medium text-gray-700">
              Status de Envio
            </label>
            <select
              id="sent"
              name="sent"
              value={filters.sent}
              onChange={handleFilterChange}
              className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            >
              <option value="">Todos</option>
              <option value="sent">Enviado</option>
              <option value="not_sent">Não Enviado</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-4 text-center">Carregando...</div>
        ) : filteredInvoices.length === 0 ? (
          <div className="p-4 text-center text-gray-500">Nenhuma cobrança encontrada</div>
        ) : (
          <div className={isMobile ? '' : 'overflow-x-visible'}>
            {isMobile ? (
              <div className="divide-y divide-gray-200">
                {filteredInvoices.map((invoice) => (
                  <div key={invoice.id} className="p-4 bg-white">
                    <div className="flex justify-between">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {invoice.client?.name && invoice.client.name.trim() !== '' ? invoice.client.name : invoice.client?.email || 'Cliente não encontrado'}
                        </div>
                        <div className="text-xs text-gray-500">Vencimento: {formatDate(invoice.due_date)}</div>
                        <div className="text-xs text-gray-500">Pagamento: {formatDate(invoice.paid_date)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-gray-700">{formatCurrency(invoice.amount)}</div>
                        <span className={`mt-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadgeClass(invoice.status)}`}>
                          {getStatusText(invoice.status)}
                        </span>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-end space-x-2">
                      {invoice.status !== 'paid' && (
                        <>
                          <button onClick={() => handleResendNotification(invoice.id, 'email')} className="px-2 py-1 text-xs font-medium text-blue-600 bg-blue-100 rounded">
                            📧
                          </button>
                          <button onClick={() => handleResendNotification(invoice.id, 'whatsapp')} className="px-2 py-1 text-xs font-medium text-green-600 bg-green-100 rounded">
                            📱
                          </button>
                          <button onClick={() => handleMarkAsPaid(invoice.id)} className="px-2 py-1 text-xs font-medium text-green-700 bg-green-100 rounded">
                            ✓
                          </button>
                        </>
                      )}
                      <button onClick={() => handleDeleteInvoice(invoice.id)} className="px-2 py-1 text-xs font-medium text-red-600 bg-red-100 rounded">
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
            <table className="min-w-full divide-y divide-gray-200 table-fixed">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cliente
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Valor
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Vencimento
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pagamento
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Método
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Envio
                  </th>
                  <th scope="col" className="relative px-6 py-3 w-72">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredInvoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {invoice.client?.name && invoice.client.name.trim() !== '' ? invoice.client.name : invoice.client?.email || 'Cliente não encontrado'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-500">
                        {formatCurrency(invoice.amount)}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-500">
                        {formatDate(invoice.due_date)}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-500">
                        {formatDate(invoice.paid_date)}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-500">
                        {invoice.payment_method === 'boleto' ? 'Boleto' : 'PIX'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadgeClass(invoice.status)}`}>
                        {getStatusText(invoice.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${invoice.sent ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                        {invoice.sent ? 'Enviado' : 'Não enviado'}
                      </span>
                    </td>
                    <td className="px-6 py-4 w-72 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end space-x-2">
                        {/* Botões sempre disponíveis, exceto para cobranças pagas */}
                        {invoice.status !== 'paid' && (
                          <>
                            <button
                              onClick={() => handleResendNotification(invoice.id, 'email')}
                              className="inline-flex items-center px-2 py-1 text-xs font-medium text-blue-600 bg-blue-100 rounded hover:bg-blue-200 transition-colors"
                              title="Reenviar por Email"
                            >
                              📧
                            </button>
                            <button
                              onClick={() => handleResendNotification(invoice.id, 'whatsapp')}
                              className="inline-flex items-center px-2 py-1 text-xs font-medium text-green-600 bg-green-100 rounded hover:bg-green-200 transition-colors"
                              title="Reenviar por WhatsApp"
                            >
                              📱
                            </button>
                            <button
                              onClick={() => handleMarkAsPaid(invoice.id)}
                              className="inline-flex items-center px-2 py-1 text-xs font-medium text-green-600 bg-green-100 rounded hover:bg-green-200 transition-colors"
                              title="Marcar como Paga"
                            >
                              ✓
                            </button>
                          </>
                        )}
                        {/* Botão de excluir sempre disponível */}
                        <button
                          onClick={() => handleDeleteInvoice(invoice.id)}
                          className="inline-flex items-center px-2 py-1 text-xs font-medium text-red-600 bg-red-100 rounded hover:bg-red-200 transition-colors"
                          title="Excluir Cobrança"
                        >
                          🗑️
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

export default Invoices;