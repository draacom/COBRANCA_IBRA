import React, { useEffect, useState } from 'react';
import api from '../services/api';
import SuccessModal from '../components/SuccessModal';
import { useAuth } from '../contexts/AuthContext';

const Profile = () => {
  const { user } = useAuth();
  const [formData, setFormData] = useState({ name: user?.name || '', email: user?.email || '', password: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [successOpen, setSuccessOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true);
        const res = await api.get('/users/me/profile');
        const u = res.data.data?.user;
        if (u) {
          setFormData({ name: u.name, email: u.email, password: '' });
        }
      } catch (err) {
        console.error('Erro ao carregar perfil', err);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      const payload = { ...formData };
      if (!payload.password) delete payload.password;
      const res = await api.put('/users/me/profile', payload);
      const updated = res.data.data?.user;
      if (updated) {
        localStorage.setItem('user', JSON.stringify(updated));
      }
      setSuccessMessage('Perfil atualizado com sucesso!');
      setSuccessOpen(true);
      setFormData((prev) => ({ ...prev, password: '' }));
    } catch (err) {
      console.error('Erro ao atualizar perfil', err);
      setError(err.response?.data?.message || 'Erro ao salvar alterações.');
    }
  };

  return (
    <div>
      <SuccessModal open={successOpen} message={successMessage} onClose={() => setSuccessOpen(false)} />
      <h1 className="text-2xl font-semibold text-gray-900">Meu Perfil</h1>
      {loading ? (
        <div className="mt-4">Carregando...</div>
      ) : (
        <div className="mt-6 bg-white shadow rounded p-4 max-w-2xl">
          {error && <div className="mb-4 p-2 bg-red-50 text-red-700 rounded">{error}</div>}
          {/* Removido alerta inline em favor do modal de sucesso padronizado */}
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
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700">Senha (deixe em branco para manter)</label>
                <input type="password" name="password" value={formData.password} onChange={handleInputChange} className="mt-1 w-full border rounded px-3 py-2" />
              </div>
            </div>
            <div className="mt-4 flex justify-end space-x-2">
              <button type="submit" className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700">Salvar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default Profile;