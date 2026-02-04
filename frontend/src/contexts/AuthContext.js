import React, { createContext, useState, useContext, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Verificar se há token no localStorage
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');
    
    console.log('AuthContext: Verificando token no localStorage:', { token: token ? 'presente' : 'ausente', userData: userData ? 'presente' : 'ausente' });
    
    if (token && userData) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      setUser(JSON.parse(userData));
      console.log('AuthContext: Usuário autenticado automaticamente');
    } else {
      console.log('AuthContext: Nenhum token ou dados de usuário encontrados');
    }
    
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    try {
      console.log('Tentando fazer login com:', { email, senha: '***' });
      const response = await api.post('/auth/login', { email, senha: password });
      console.log('Resposta do login:', response.data);
      
      const { token, user } = response.data.data;
      
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      setUser(user);
      
      console.log('Login realizado com sucesso');
      return { success: true };
    } catch (error) {
      console.error('Erro no login:', error);
      console.error('Resposta do erro:', error.response?.data);
      return { 
        success: false, 
        message: error.response?.data?.message || 'Erro ao fazer login' 
      };
    }
  };

  const logout = () => {
    console.log('AuthContext: Logout chamado');
    console.trace('AuthContext: Stack trace do logout');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    api.defaults.headers.common['Authorization'] = '';
    setUser(null);
  };

  return (
    <AuthContext.Provider 
      value={{ 
        user, 
        isAuthenticated: !!user, 
        login, 
        logout, 
        loading 
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
};