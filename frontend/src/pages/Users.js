import React, { useEffect, useState } from 'react';
import api from '../services/api';
import SuccessModal from '../components/SuccessModal';
import { useAuth } from '../contexts/AuthContext';

const Users = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'user',
  });
  const [successOpen, setSuccessOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchUsers();
    } else {
      setLoading(false);
    }
  }, [user]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await api.get('/users');
      setUsers(Array.isArray(response.data.data) ? response.data.data : []);
    } catch (err) {
      console.error('Erro ao buscar usuários', err);
      setError('Não foi possível carregar os usuários.');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      const payload = { ...formData };
      
      // Validação para novo usuário
      if (!editingId && !payload.password) {
        setError('Senha é obrigatória para novo usuário.');
        setLoading(false);
        return;
      }
      
      console.log('Enviando dados:', { editingId, payload });
      
      let response;
      if (editingId) {
        // Para edição, remover senha se estiver vazia
        if (!payload.password || payload.password.trim() === '') {
          delete payload.password;
        }
        console.log('Editando usuário:', editingId, payload);
        response = await api.put(`/users/${editingId}`, payload);
        setSuccessMessage('Usuário editado com sucesso!');
      } else {
        console.log('Criando usuário:', payload);
        response = await api.post('/users', payload);
        setSuccessMessage('Usuário criado com sucesso!');
      }
      
      console.log('Resposta da API:', response.data);
      
      setSuccessOpen(true);
      setShowForm(false);
      setEditingId(null);
      setFormData({ name: '', email: '', password: '', role: 'user' });
      await fetchUsers(); // Aguardar a atualização da lista
      
    } catch (err) {
      console.error('Erro ao salvar usuário:', err);
      console.error('Resposta de erro:', err.response?.data);
      
      const errorMessage = err.response?.data?.message || 
                          err.response?.data?.error || 
                          'Erro ao salvar usuário.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (u) => {
    setFormData({ name: u.name, email: u.email, password: '', role: u.role });
    setEditingId(u.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Deseja realmente EXCLUIR este usuário? Esta ação não pode ser desfeita.')) {
      try {
        await api.delete(`/users/${id}`);
        setSuccessMessage('Usuário excluído com sucesso!');
        setSuccessOpen(true);
        fetchUsers();
      } catch (err) {
        console.error('Erro ao excluir usuário', err);
        alert('Não foi possível excluir o usuário.');
      }
    }
  };

  const handleActivate = async (id) => {
    try {
      await api.patch(`/users/${id}/activate`);
      setSuccessMessage('Usuário ativado com sucesso!');
      setSuccessOpen(true);
      fetchUsers();
    } catch (err) {
      console.error('Erro ao ativar usuário', err);
      alert('Não foi possível ativar o usuário.');
    }
  };

  const handleDeactivate = async (id) => {
    if (window.confirm('Deseja realmente desativar este usuário?')) {
      try {
        await api.patch(`/users/${id}/deactivate`);
        setSuccessMessage('Usuário desativado com sucesso!');
        setSuccessOpen(true);
        fetchUsers();
      } catch (err) {
        console.error('Erro ao desativar usuário', err);
        alert('Não foi possível desativar o usuário.');
      }
    }
  };

  const handleSearch = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/users?search=${encodeURIComponent(searchTerm)}`);
      setUsers(Array.isArray(response.data.data) ? response.data.data : []);
    } catch (err) {
      console.error('Erro na busca', err);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  if (user?.role !== 'admin') {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Usuários</h1>
        <div className="mt-4 p-4 bg-yellow-50 text-yellow-700 rounded">Acesso negado. Apenas administradores.</div>
      </div>
    );
  }

  return (
    <div>
      <SuccessModal open={successOpen} message={successMessage} onClose={() => setSuccessOpen(false)} />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Usuários</h1>
        <button
          onClick={() => { setShowForm(true); setEditingId(null); setFormData({ name: '', email: '', password: '', role: 'user' }); }}
          className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
        >
          Novo Usuário
        </button>
      </div>

      {showForm && (
        <div className="mt-6 bg-white shadow rounded p-4">
          <h2 className="text-lg font-medium text-gray-900 mb-4">{editingId ? 'Editar Usuário' : 'Criar Usuário'}</h2>
          {error && <div className="mb-4 p-2 bg-red-50 text-red-700 rounded">{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Nome</label>
                <input type="text" name="name" value={formData.name} onChange={handleInputChange} className="mt-1 w-full border rounded px-3 py-2" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <input type="email" name="email" value={formData.email} onChange={handleInputChange} className="mt-1 w-full border rounded px-3 py-2" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Senha {editingId ? '(deixe em branco para não alterar)' : ''}</label>
                <input type="password" name="password" value={formData.password} onChange={handleInputChange} className="mt-1 w-full border rounded px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Permissão</label>
                <select name="role" value={formData.role} onChange={handleInputChange} className="mt-1 w-full border rounded px-3 py-2">
                  <option value="user">Usuário</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
            </div>
            <div className="mt-4 flex justify-end space-x-2">
              <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="px-4 py-2 rounded border">Cancelar</button>
              <button type="submit" className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700">Salvar</button>
            </div>
          </form>
        </div>
      )}

      <div className="mt-6 bg-white shadow rounded">
        <div className="p-4 border-b">
          <div className="flex items-center">
            <div className="relative flex-grow">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nome ou email..."
                className="w-full pr-10 pl-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
              <button onClick={handleSearch} className="absolute inset-y-0 right-0 px-3 flex items-center">Buscar</button>
            </div>
          </div>
        </div>
        {loading ? (
          <div className="p-4 text-center">Carregando...</div>
        ) : users.length === 0 ? (
          <div className="p-4 text-center text-gray-500">Nenhum usuário encontrado</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Permissão</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="relative px-6 py-3"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{u.name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">{u.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-500">{u.role}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${u.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>{u.active ? 'Ativo' : 'Inativo'}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end space-x-2">
                        <button 
                          onClick={() => handleEdit(u)} 
                          className="inline-flex items-center px-3 py-1 text-xs font-medium text-blue-600 bg-blue-100 rounded hover:bg-blue-200 transition-colors"
                        >
                          ✏️ Editar
                        </button>
                        {u.active ? (
                          <button 
                            onClick={() => handleDeactivate(u.id)} 
                            className="inline-flex items-center px-3 py-1 text-xs font-medium text-orange-600 bg-orange-100 rounded hover:bg-orange-200 transition-colors"
                          >
                            ⏸️ Desativar
                          </button>
                        ) : (
                          <button 
                            onClick={() => handleActivate(u.id)} 
                            className="inline-flex items-center px-3 py-1 text-xs font-medium text-green-600 bg-green-100 rounded hover:bg-green-200 transition-colors"
                          >
                            ▶️ Ativar
                          </button>
                        )}
                        <button 
                          onClick={() => handleDelete(u.id)} 
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
          </div>
        )}
      </div>
    </div>
  );
};

export default Users;