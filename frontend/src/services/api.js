import axios from 'axios';

// Determina a baseURL dinamicamente para evitar depender do proxy do CRA
function resolveBaseURL() {
  const envURL = process.env.REACT_APP_API_URL;
  // Se a env for absoluta, respeitar
  if (envURL && /^https?:\/\//.test(envURL)) return envURL;

  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const port = typeof window !== 'undefined' ? window.location.port : '';

  // Ambientes de desenvolvimento acessíveis por navegador (3000/3003/3004): apontar para porta 3001 no mesmo host
  if (port === '3000' || port === '3003' || port === '3004') {
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:3001/api';
    }
    return `${window.location.protocol}//${hostname}:3001/api`;
  }

  // Caso contrário, usar relativo (produção com Nginx proxyando /api)
  return '/api';
}

const resolvedBaseURL = resolveBaseURL();
// Opcional: ajuda debug no navegador
try { console.debug('API baseURL:', resolvedBaseURL); } catch (_) {}

const api = axios.create({
  baseURL: resolvedBaseURL,
});

// Interceptor para adicionar token em todas as requisições
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Interceptor para renovar token quando expirar
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    console.log('API Interceptor: Erro capturado:', {
      status: error.response?.status,
      url: originalRequest?.url,
      isAuthEndpoint: originalRequest?.url?.startsWith('/auth/'),
      retry: originalRequest._retry
    });

    // Se o erro for 401 (Unauthorized), não tentar refresh em endpoints de auth (login/register)
    const isAuthEndpoint = originalRequest?.url?.startsWith('/auth/');
    if (error.response?.status === 401 && !originalRequest._retry && 
        originalRequest.url !== '/auth/refresh' && !isAuthEndpoint) {
      originalRequest._retry = true;
      
      console.log('API Interceptor: Tentando renovar token...');
      
      try {
        // Tentar renovar o token
        const token = localStorage.getItem('token');
        const response = await axios.post(
          `${api.defaults.baseURL}/auth/refresh`,
          { token }
        );
        
        const { token: newToken } = response.data.data;
        localStorage.setItem('token', newToken);
        api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
        originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
        
        console.log('API Interceptor: Token renovado com sucesso');
        return api(originalRequest);
      } catch (refreshError) {
        console.log('API Interceptor: Falha ao renovar token, fazendo logout');
        // Se falhar, fazer logout
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }
    
    return Promise.reject(error);
  }
);

export default api;