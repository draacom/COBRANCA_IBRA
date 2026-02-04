import React, { useState, useEffect, useRef } from 'react';
import useIsMobile from '../utils/useIsMobile';
import api from '../services/api';
import SuccessModal from '../components/SuccessModal';
import { consultarCNPJ, mapearDadosCNPJ } from '../services/cnpjService';
import { 
  applyDocumentMask, 
  getDocumentType, 
  validateDocument, 
  removeDocumentFormatting 
} from '../utils/documentUtils';

const Clients = () => {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const isMobile = useIsMobile();
  const [showForm, setShowForm] = useState(false);
  
  // Estados para filtros
  const [filters, setFilters] = useState({
    name: '',
    document: '',
    phone: '',
    address: '',
    status: ''
  });
  const [filteredClients, setFilteredClients] = useState([]);
  const [formData, setFormData] = useState({
    name: '',
    document: '',
    email: '',
    phone: '',
    address: {
      endereco: '',
      numero: '',
      bairro: '',
      cidade: '',
      estado: '',
      cep: ''
    }
  });
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [successOpen, setSuccessOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [consultingCNPJ, setConsultingCNPJ] = useState(false);
  const [cnpjError, setCnpjError] = useState('');
  const formRef = useRef(null);
  const nameInputRef = useRef(null);

  useEffect(() => {
    fetchClients();
  }, []);

  // Aplicar filtros em tempo real
  useEffect(() => {
    let filtered = clients;

    if (filters.name) {
      filtered = filtered.filter(client =>
        client.name?.toLowerCase().includes(filters.name.toLowerCase())
      );
    }

    if (filters.document) {
      filtered = filtered.filter(client =>
        client.document?.includes(filters.document)
      );
    }

    if (filters.phone) {
      filtered = filtered.filter(client =>
        client.phone?.includes(filters.phone)
      );
    }

    if (filters.address) {
      filtered = filtered.filter(client => {
        const fullAddress = `${client.address?.endereco || ''} ${client.address?.numero || ''} ${client.address?.bairro || ''} ${client.address?.cidade || ''} ${client.address?.estado || ''}`.toLowerCase();
        return fullAddress.includes(filters.address.toLowerCase());
      });
    }

    if (filters.status) {
      filtered = filtered.filter(client => {
        if (filters.status === 'active') {
          return client.active === true;
        } else if (filters.status === 'inactive') {
          return client.active === false;
        }
        return true;
      });
    }

    setFilteredClients(filtered);
  }, [clients, filters]);

  const fetchClients = async () => {
    try {
      setLoading(true);
      const response = await api.get('/clients');
      setClients(Array.isArray(response.data.data) ? response.data.data : []);
    } catch (error) {
      console.error('Erro ao buscar clientes', error);
      setError('Não foi possível carregar os clientes. Tente novamente.');
      setClients([]); // Garantir que clients seja sempre um array
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = async (e) => {
    const { name, value } = e.target;
    
    if (name === 'document') {
      // Aplica máscara de CPF/CNPJ
      const maskedValue = applyDocumentMask(value);
      setFormData({ ...formData, [name]: maskedValue });
      
      // Limpa erros anteriores
      setCnpjError('');
      
      // Verifica se é um CNPJ válido e completo para consulta automática
      const cleanDocument = removeDocumentFormatting(maskedValue);
      if (cleanDocument.length === 14 && validateDocument(cleanDocument)) {
        await consultarCNPJAutomatico(cleanDocument);
      }
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters({ ...filters, [name]: value });
  };

  const consultarCNPJAutomatico = async (cnpj) => {
    try {
      setConsultingCNPJ(true);
      setCnpjError('');
      
      const dadosCNPJ = await consultarCNPJ(cnpj);
      const dadosMapeados = mapearDadosCNPJ(dadosCNPJ);
      
      // Preenche apenas os campos vazios para não sobrescrever dados já digitados
      setFormData(prevData => ({
        ...prevData,
        name: prevData.name || dadosMapeados.name,
        email: prevData.email || dadosMapeados.email,
        phone: prevData.phone || dadosMapeados.phone,
        address: {
          endereco: prevData.address.endereco || dadosMapeados.address.endereco,
          numero: prevData.address.numero || dadosMapeados.address.numero,
          bairro: prevData.address.bairro || dadosMapeados.address.bairro,
          cidade: prevData.address.cidade || dadosMapeados.address.cidade,
          estado: prevData.address.estado || dadosMapeados.address.estado,
          cep: prevData.address.cep || dadosMapeados.address.cep
        }
      }));
      
    } catch (error) {
      setCnpjError(error.message);
    } finally {
      setConsultingCNPJ(false);
    }
  };

  const handleAddressChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      address: {
        ...formData.address,
        [name]: value
      }
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    try {
      if (editingId) {
        await api.put(`/clients/${editingId}`, formData);
        setSuccessMessage('Cliente editado com sucesso!');
      } else {
        await api.post('/clients', formData);
        setSuccessMessage('Cliente criado com sucesso!');
      }
      setSuccessOpen(true);
      
      setShowForm(false);
      setFormData({
        name: '',
        document: '',
        email: '',
        phone: '',
        address: {
          endereco: '',
          numero: '',
          bairro: '',
          cidade: '',
          estado: '',
          cep: ''
        }
      });
      setEditingId(null);
      fetchClients();
    } catch (error) {
      console.error('Erro ao salvar cliente', error);
      setError(error.response?.data?.message || 'Erro ao salvar cliente. Verifique os dados e tente novamente.');
    }
  };

  const handleEdit = (client) => {
    setFormData({
      name: client.name || '',
      document: client.document || '',
      email: client.email || '',
      phone: client.phone || '',
      address: {
        endereco: client.endereco || '',
        numero: client.numero || '',
        bairro: client.bairro || '',
        cidade: client.cidade || '',
        estado: client.estado || '',
        cep: client.cep || ''
      }
    });
    setEditingId(client.id);
    setShowForm(true);
    // Em mobile, garantir visibilidade do formulário e foco inicial
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      nameInputRef.current?.focus();
    }, 0);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Tem certeza que deseja excluir este cliente?')) {
      try {
        await api.delete(`/clients/${id}`);
        fetchClients();
      } catch (error) {
        console.error('Erro ao excluir cliente', error);
        alert('Não foi possível excluir o cliente. Tente novamente.');
      }
    }
  };

  const handleToggleStatus = async (id, currentStatus) => {
    const action = currentStatus ? 'desativar' : 'ativar';
    if (window.confirm(`Tem certeza que deseja ${action} este cliente?`)) {
      try {
        await api.patch(`/clients/${id}/toggle-status`);
        setSuccessMessage(`Cliente ${action === 'ativar' ? 'ativado' : 'desativado'} com sucesso!`);
        setSuccessOpen(true);
        fetchClients();
      } catch (error) {
        console.error('Erro ao alterar status do cliente', error);
        setError('Não foi possível alterar o status do cliente. Tente novamente.');
      }
    }
  };

  return (
    <div>
      <SuccessModal open={successOpen} message={successMessage} onClose={() => setSuccessOpen(false)} />
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Clientes</h1>
        <button
          onClick={() => {
            setFormData({
              name: '',
              document: '',
              email: '',
              phone: '',
              address: {
                endereco: '',
                numero: '',
                bairro: '',
                cidade: '',
                estado: '',
                cep: ''
              }
            });
            setEditingId(null);
            setShowForm(!showForm);
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {showForm ? 'Cancelar' : 'Novo Cliente'}
        </button>
      </div>

      {showForm && (
        <div className="bg-white shadow rounded-lg p-6 mb-6" id="client-form" ref={formRef}>
          <h2 className="text-lg font-medium mb-4">
            {editingId ? 'Editar Cliente' : 'Novo Cliente'}
          </h2>
          
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
              <p className="text-red-700">{error}</p>
            </div>
          )}
          
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                  Nome
                </label>
                <input
                  type="text"
                  name="name"
                  id="name"
                  required
                  value={formData.name}
                  onChange={handleInputChange}
                  ref={nameInputRef}
                  className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                />
              </div>
              
              <div>
                <label htmlFor="document" className="block text-sm font-medium text-gray-700">
                  CPF/CNPJ
                  {consultingCNPJ && (
                    <span className="ml-2 text-blue-600 text-xs">
                      Consultando CNPJ...
                    </span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    name="document"
                    id="document"
                    required
                    value={formData.document}
                    onChange={handleInputChange}
                    className={`mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md ${
                      consultingCNPJ ? 'pr-10' : ''
                    }`}
                    placeholder="Digite o CPF ou CNPJ"
                  />
                  {consultingCNPJ && (
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                    </div>
                  )}
                </div>
                {cnpjError && (
                  <p className="mt-1 text-sm text-red-600">{cnpjError}</p>
                )}
                {getDocumentType(formData.document) === 'CNPJ' && !consultingCNPJ && !cnpjError && formData.document.length === 18 && (
                  <p className="mt-1 text-sm text-green-600">✓ Dados preenchidos automaticamente</p>
                )}
                {getDocumentType(formData.document) === 'CNPJ' && formData.document.length === 18 && !consultingCNPJ && (
                  <button
                    type="button"
                    onClick={() => consultarCNPJAutomatico(removeDocumentFormatting(formData.document))}
                    className="mt-2 text-sm text-blue-600 hover:text-blue-800 underline"
                  >
                    Consultar CNPJ novamente
                  </button>
                )}
              </div>
              
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Email
                </label>
                <input
                  type="email"
                  name="email"
                  id="email"
                  required
                  value={formData.email}
                  onChange={handleInputChange}
                  className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                />
              </div>
              
              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
                  Telefone
                </label>
                <input
                  type="text"
                  name="phone"
                  id="phone"
                  required
                  value={formData.phone}
                  onChange={handleInputChange}
                  className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                />
              </div>
              
              <div>
                <label htmlFor="endereco" className="block text-sm font-medium text-gray-700">
                  Endereço
                </label>
                <input
                  type="text"
                  name="endereco"
                  id="endereco"
                  required
                  value={formData.address.endereco}
                  onChange={handleAddressChange}
                  className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label htmlFor="numero" className="block text-sm font-medium text-gray-700">
                  Número
                </label>
                <input
                  type="text"
                  name="numero"
                  id="numero"
                  required
                  value={formData.address.numero}
                  onChange={handleAddressChange}
                  className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label htmlFor="bairro" className="block text-sm font-medium text-gray-700">
                  Bairro
                </label>
                <input
                  type="text"
                  name="bairro"
                  id="bairro"
                  required
                  value={formData.address.bairro}
                  onChange={handleAddressChange}
                  className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label htmlFor="cep" className="block text-sm font-medium text-gray-700">
                  CEP
                </label>
                <input
                  type="text"
                  name="cep"
                  id="cep"
                  required
                  value={formData.address.cep}
                  onChange={handleAddressChange}
                  className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label htmlFor="cidade" className="block text-sm font-medium text-gray-700">
                  Cidade
                </label>
                <input
                  type="text"
                  name="cidade"
                  id="cidade"
                  required
                  value={formData.address.cidade}
                  onChange={handleAddressChange}
                  className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label htmlFor="estado" className="block text-sm font-medium text-gray-700">
                  Estado
                </label>
                <input
                  type="text"
                  name="estado"
                  id="estado"
                  required
                  value={formData.address.estado}
                  onChange={handleAddressChange}
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label htmlFor="filter-name" className="block text-sm font-medium text-gray-700">
              Nome
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
            <label htmlFor="filter-document" className="block text-sm font-medium text-gray-700">
              CPF/CNPJ
            </label>
            <input
              type="text"
              id="filter-document"
              name="document"
              placeholder="Filtrar por CPF/CNPJ..."
              value={filters.document}
              onChange={handleFilterChange}
              className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
            />
          </div>
          <div>
            <label htmlFor="filter-phone" className="block text-sm font-medium text-gray-700">
              Telefone
            </label>
            <input
              type="text"
              id="filter-phone"
              name="phone"
              placeholder="Filtrar por telefone..."
              value={filters.phone}
              onChange={handleFilterChange}
              className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
            />
          </div>
          <div>
            <label htmlFor="filter-address" className="block text-sm font-medium text-gray-700">
              Endereço
            </label>
            <input
              type="text"
              id="filter-address"
              name="address"
              placeholder="Filtrar por endereço..."
              value={filters.address}
              onChange={handleFilterChange}
              className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
            />
          </div>
          <div>
            <label htmlFor="filter-status" className="block text-sm font-medium text-gray-700">
              Status
            </label>
            <select
              id="filter-status"
              name="status"
              value={filters.status}
              onChange={handleFilterChange}
              className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
            >
              <option value="">Todos os status</option>
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </select>
          </div>
        </div>
      </div>

      <div className="-mx-4 sm:-mx-6 md:-mx-8">
        <div className="bg-white shadow rounded-lg overflow-hidden">
        
        {loading ? (
          <div className="p-4 text-center">Carregando...</div>
        ) : filteredClients.length === 0 ? (
          <div className="p-4 text-center text-gray-500">Nenhum cliente encontrado</div>
        ) : (
          <div>
            {isMobile ? (
              <div className="space-y-3">
                {filteredClients.map((client) => (
                  <div key={client.id} className="bg-white p-4 rounded-md shadow-sm">
                    <div className="flex justify-between items-start">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">{client.name && client.name.trim() !== '' ? client.name : 'Nome não informado'}</div>
                        <div className="text-xs text-gray-500 truncate">{client.email || '-'}</div>
                        <div className="text-xs text-gray-500 mt-1">{client.document || 'Não informado'}</div>
                        <div className="text-xs text-gray-500 mt-1 truncate">{[client.endereco, client.numero, client.bairro, client.cidade, client.estado].filter(Boolean).join(', ') || 'Não informado'}</div>
                        <span className={`mt-2 inline-flex text-xs leading-5 font-semibold rounded-full ${client.status === 'ativo' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {client.status === 'ativo' ? 'Ativo' : 'Inativo'}
                        </span>
                      </div>
                      <div className="flex-shrink-0">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => handleToggleStatus(client.id, client.status === 'ativo')}
                            className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded ${client.status === 'ativo' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}
                          >
                            {client.status === 'ativo' ? 'Desativar' : 'Ativar'}
                          </button>
                          <button
                            onClick={() => handleEdit(client)}
                            className="inline-flex items-center px-2 py-1 text-xs font-medium text-blue-600 bg-blue-100 rounded"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => handleDelete(client.id)}
                            className="inline-flex items-center px-2 py-1 text-xs font-medium text-red-600 bg-red-100 rounded"
                          >
                            Excluir
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
            <table className="min-w-full divide-y divide-gray-200 table-auto">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Nome
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    CPF/CNPJ
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Endereço
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th scope="col" className="relative px-6 py-3">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredClients.map((client) => (
                  <tr key={client.id}>
                    <td className="px-6 py-4 whitespace-normal break-words">
                      <div className="text-sm font-medium text-gray-900 break-words">{client.name && client.name.trim() !== '' ? client.name : 'Nome não informado'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-normal break-words">
                      <div className="text-sm text-gray-500 break-words">{client.document || 'Não informado'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-normal break-words">
                      <div className="text-sm text-gray-500 break-words">{client.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-normal break-words">
                      <div className="text-sm text-gray-500 break-words">
                        {[client.endereco, client.numero, client.bairro, client.cidade, client.estado]
                          .filter(Boolean)
                          .join(', ') || 'Não informado'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${client.status === 'ativo' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {client.status === 'ativo' ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-medium">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => handleToggleStatus(client.id, client.status === 'ativo')}
                          className={`inline-flex items-center px-3 py-1 text-xs font-medium rounded transition-colors ${
                            client.status === 'ativo' 
                              ? 'bg-red-100 text-red-800 hover:bg-red-200' 
                              : 'bg-green-100 text-green-800 hover:bg-green-200'
                          }`}
                        >
                          {client.status === 'ativo' ? '🚫 Desativar' : '✅ Ativar'}
                        </button>
                        <button
                          onClick={() => handleEdit(client)}
                          className="inline-flex items-center px-3 py-1 text-xs font-medium text-blue-600 bg-blue-100 rounded hover:bg-blue-200 transition-colors"
                        >
                          ✏️ Editar
                        </button>
                        <button
                          onClick={() => handleDelete(client.id)}
                          className="inline-flex items-center px-3 py-1 text-xs font-medium text-red-600 bg-red-100 rounded hover:bg-red-200 transition-colors"
                        >
                          🗑️ Excluir
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
    </div>
  );
};

export default Clients;