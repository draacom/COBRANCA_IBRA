import React, { useState, useEffect } from 'react';
import useIsMobile from '../utils/useIsMobile';
import { Link } from 'react-router-dom';
import api from '../services/api';
import WhatsAppStatus from '../components/WhatsAppStatus';

const Dashboard = () => {
  const [stats, setStats] = useState({
    clientCount: 0,
    activeSubscriptions: 0,
    pendingInvoices: 0,
    overdueInvoices: 0,
    paidInvoices: 0,
    revenueMonth: 0,
    totalInvoices: 0,
    unpaidInvoices: 0,
    totalInvoicesAmount: 0,
    unpaidInvoicesAmount: 0
  });
  const [loading, setLoading] = useState(true);
  const [lists, setLists] = useState({ pending: [], overdue: [] });
  const [hoverCard, setHoverCard] = useState(null); // desktop hover
  const [openCard, setOpenCard] = useState(null); // mobile click toggle
  const [rawInvoices, setRawInvoices] = useState([]);

  // Utilitários de data
  const toYMD = (d) => {
    const date = new Date(d);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const getMonthStartEnd = (base = new Date()) => {
    const start = new Date(base.getFullYear(), base.getMonth(), 1);
    const end = new Date(base.getFullYear(), base.getMonth() + 1, 0);
    return { startYMD: toYMD(start), endYMD: toYMD(end) };
  };
  const { startYMD: defaultStart, endYMD: defaultEnd } = getMonthStartEnd(new Date());
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const isMobile = useIsMobile();

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Buscar dados reais do backend considerando intervalo
        const [clientsRes, subscriptionsRes, invoicesRes, revenueRes] = await Promise.all([
          api.get('/clients'),
          api.get('/subscriptions'),
          api.get('/invoices', { params: { startDate, endDate } }),
          api.get('/reports/revenue', { params: { startDate, endDate } })
        ]);

        const clients = clientsRes?.data?.data || [];
        const subscriptions = subscriptionsRes?.data?.data || [];
        const invoices = invoicesRes?.data?.data || [];
        const revenue = revenueRes?.data?.data?.total || 0;

        // Guardar invoices crus para aplicar filtro adicional, se necessário
        setRawInvoices(Array.isArray(invoices) ? invoices : []);

        const clientCount = Array.isArray(clients) ? clients.length : 0;
        const activeSubscriptions = Array.isArray(subscriptions)
          ? subscriptions.filter((s) => s.active === true || s.status === 'ativo').length
          : 0;
        // Atualizar contadores gerais não dependentes de período e receita do backend
        setStats((prev) => ({
          ...prev,
          clientCount,
          activeSubscriptions,
          revenueMonth: Number(revenue) || 0
        }));
      } catch (error) {
        console.error('Erro ao carregar dados do dashboard', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [startDate, endDate]);

  // Recalcular estatísticas com base no intervalo selecionado
  useEffect(() => {
    // Utilitários de data para considerar vencidas por due_date < hoje
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const parseDateOnly = (d) => {
      if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
        const [y, m, day] = d.split('-').map(Number);
        return new Date(y, m - 1, day);
      }
      const dt = new Date(d);
      return isNaN(dt.getTime()) ? today : dt;
    };
    const inRange = (inv) => {
      const dd = parseDateOnly(inv.due_date);
      const ddStr = toYMD(dd);
      return ddStr >= startDate && ddStr <= endDate;
    };
    const invoicesInRange = Array.isArray(rawInvoices) ? rawInvoices.filter(inRange) : [];
    const isOverdue = (inv) => {
      const dd = parseDateOnly(inv.due_date);
      return dd < today && inv.status !== 'paid' && inv.status !== 'canceled';
    };
    const isPendingActive = (inv) => {
      const dd = parseDateOnly(inv.due_date);
      return inv.status === 'pending' && dd >= today;
    };
    const pendingOnly = invoicesInRange.filter(isPendingActive);
    const overdueOnly = invoicesInRange.filter(isOverdue);
    const paidInvoices = invoicesInRange.filter((i) => i.status === 'paid').length;
    const totalInvoices = invoicesInRange.length;
    const unpaidInvoices = invoicesInRange.filter((i) => i.status !== 'paid').length;
    const totalInvoicesAmount = invoicesInRange.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
    const unpaidInvoicesAmount = invoicesInRange.reduce((sum, i) => sum + (i.status !== 'paid' ? (Number(i.amount) || 0) : 0), 0);
    const revenueFromRange = rawInvoices.reduce((sum, i) => {
      if (i.status === 'paid' && i.paid_date) {
        const pd = parseDateOnly(i.paid_date);
        const pdStr = toYMD(pd);
        if (pdStr >= startDate && pdStr <= endDate) {
          return sum + (Number(i.amount) || 0);
        }
      }
      return sum;
    }, 0);

    setStats((prev) => ({
      ...prev,
      pendingInvoices: pendingOnly.length,
      overdueInvoices: overdueOnly.length,
      paidInvoices,
      revenueMonth: Number(revenueFromRange) || prev.revenueMonth,
      totalInvoices,
      unpaidInvoices,
      totalInvoicesAmount,
      unpaidInvoicesAmount
    }));
    setLists({ pending: pendingOnly, overdue: overdueOnly });
  }, [startDate, endDate, rawInvoices]);

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(Number(value) || 0);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('pt-BR').format(date);
  };

  const renderListPopover = (type) => {
    const items = type === 'pending' ? lists.pending : lists.overdue;
    if (!items || items.length === 0) return null;
    const show = (isMobile ? openCard === type : hoverCard === type || openCard === type);
    if (!show) return null;
    const topItems = items.slice(0, 10);
    return (
      <div className={`absolute z-20 mt-2 ${isMobile ? 'w-full left-0' : 'w-80'} bg-white border border-gray-200 rounded-md shadow-lg p-3`}>
        <div className="text-sm font-medium text-gray-700 mb-2">
          {type === 'pending' ? 'Cobranças pendentes' : 'Cobranças vencidas'} ({items.length})
        </div>
        <ul className="max-h-64 overflow-auto divide-y divide-gray-100">
          {topItems.map((inv) => (
            <li key={inv.id} className="py-2 text-sm text-gray-700">
              <div className="flex justify-between">
                <span className="mr-2 truncate">{inv.client?.name || inv.client?.email || 'Cliente'}</span>
                <span className="font-medium">{formatCurrency(inv.amount)}</span>
              </div>
              <div className="text-xs text-gray-500">Vencimento: {formatDate(inv.due_date)}</div>
            </li>
          ))}
        </ul>
        {items.length > topItems.length && (
          <div className="mt-2 text-xs text-gray-500">+{items.length - topItems.length} mais</div>
        )}
      </div>
    );
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
      {/* Filtro de Data */}
      <div className="mt-4 bg-white shadow rounded-lg p-4">
        <div className="flex flex-col sm:flex-row sm:items-end sm:space-x-4 space-y-3 sm:space-y-0">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700">Início</label>
            <input
              type="date"
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700">Fim</label>
            <input
              type="date"
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div className="flex-shrink-0">
            <button
              type="button"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              onClick={() => {
                const { startYMD, endYMD } = getMonthStartEnd(new Date());
                setStartDate(startYMD);
                setEndDate(endYMD);
              }}
            >
              Mês atual
            </button>
          </div>
        </div>
      </div>

      <WhatsAppStatus />
      
      {loading ? (
        <div className="mt-6 text-center">Carregando...</div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {/* Card - Total de Clientes */}
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0 bg-blue-500 rounded-md p-3">
                  <svg className="h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Total de Clientes
                    </dt>
                    <dd>
                      <div className="text-lg font-medium text-gray-900">
                        {stats.clientCount}
                      </div>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          {/* Card - Assinaturas Ativas */}
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0 bg-green-500 rounded-md p-3">
                  <svg className="h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Assinaturas Ativas
                    </dt>
                    <dd>
                      <div className="text-lg font-medium text-gray-900">
                        {stats.activeSubscriptions}
                      </div>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          {/* Card - Cobranças Pendentes */}
          <div
            className="relative bg-white overflow-visible shadow rounded-lg"
            onMouseEnter={isMobile ? undefined : () => setHoverCard('pending')}
            onMouseLeave={isMobile ? undefined : () => setHoverCard((prev) => (prev === 'pending' ? null : prev))}
            onClick={() => setOpenCard((prev) => (prev === 'pending' ? null : 'pending'))}
          >
            <div className="px-4 py-5 sm:p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0 bg-yellow-500 rounded-md p-3">
                  <svg className="h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Cobranças Pendentes
                    </dt>
                    <dd>
                      <div className="text-lg font-medium text-gray-900">
                        {stats.pendingInvoices}
                      </div>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
            {renderListPopover('pending')}
          </div>

          {/* Card - Cobranças Vencidas */}
          <div
            className="relative bg-white overflow-visible shadow rounded-lg"
            onMouseEnter={isMobile ? undefined : () => setHoverCard('overdue')}
            onMouseLeave={isMobile ? undefined : () => setHoverCard((prev) => (prev === 'overdue' ? null : prev))}
            onClick={() => setOpenCard((prev) => (prev === 'overdue' ? null : 'overdue'))}
          >
            <div className="px-4 py-5 sm:p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0 bg-red-500 rounded-md p-3">
                  <svg className="h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Cobranças Vencidas
                    </dt>
                    <dd>
                      <div className="text-lg font-medium text-gray-900">
                        {stats.overdueInvoices}
                      </div>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
            {renderListPopover('overdue')}
          </div>

          {/* Card - Cobranças Pagas */}
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0 bg-indigo-500 rounded-md p-3">
                  <svg className="h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Cobranças Pagas
                    </dt>
                    <dd>
                      <div className="text-lg font-medium text-gray-900">
                        {stats.paidInvoices}
                      </div>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          {/* Card - Total de Cobranças (Valor) */}
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0 bg-purple-500 rounded-md p-3">
                  <svg className="h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M3 12h18M3 17h18" />
                  </svg>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Total de Cobranças
                    </dt>
                    <dd>
                      <div className="text-lg font-medium text-gray-900">
                        {formatCurrency(stats.totalInvoicesAmount)}
                      </div>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          {/* Card - Cobranças Não Pagas (Valor) */}
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0 bg-gray-500 rounded-md p-3">
                  <svg className="h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Cobranças Não Pagas
                    </dt>
                    <dd>
                      <div className="text-lg font-medium text-gray-900">
                        {formatCurrency(stats.unpaidInvoicesAmount)}
                      </div>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          {/* Card - Cobranças Pagas (Valor) */}
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0 bg-red-500 rounded-md p-3">
                  <svg className="h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Cobranças Pagas
                    </dt>
                    <dd>
                      <div className="text-lg font-medium text-gray-900">
                        {new Intl.NumberFormat('pt-BR', {
                          style: 'currency',
                          currency: 'BRL'
                        }).format(stats.revenueMonth)}
                      </div>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;