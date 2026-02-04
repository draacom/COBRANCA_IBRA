import React, { useState } from 'react';
import api from '../services/api';

const TestLogin = () => {
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);

  const testConnection = async () => {
    setLoading(true);
    setResult('Testando conexão...');
    
    try {
      const response = await api.get('/auth/register');
      setResult(`✅ Conexão OK: ${JSON.stringify(response.data, null, 2)}`);
    } catch (error) {
      setResult(`❌ Erro de conexão: ${error.message}\n${JSON.stringify(error.response?.data || {}, null, 2)}`);
    } finally {
      setLoading(false);
    }
  };

  const testLogin = async () => {
    setLoading(true);
    setResult('Testando login...');
    
    try {
      const response = await api.post('/auth/login', {
        email: 'admin@teste.com',
        password: '123456'
      });
      setResult(`✅ Login OK: ${JSON.stringify(response.data, null, 2)}`);
    } catch (error) {
      setResult(`❌ Erro no login: ${error.message}\n${JSON.stringify(error.response?.data || {}, null, 2)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Teste de Conexão e Login</h1>
      
      <div className="space-y-4">
        <button 
          onClick={testConnection}
          disabled={loading}
          className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 disabled:opacity-50"
        >
          {loading ? 'Testando...' : 'Testar Conexão'}
        </button>
        
        <button 
          onClick={testLogin}
          disabled={loading}
          className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 disabled:opacity-50 ml-4"
        >
          {loading ? 'Testando...' : 'Testar Login'}
        </button>
      </div>
      
      <div className="mt-6">
        <h2 className="text-lg font-semibold mb-2">Resultado:</h2>
        <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto max-h-96">
          {result || 'Clique em um botão para testar'}
        </pre>
      </div>
    </div>
  );
};

export default TestLogin;