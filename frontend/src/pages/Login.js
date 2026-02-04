import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await login(email, password);
      if (result.success) {
        navigate('/');
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError('Ocorreu um erro ao fazer login. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const [remember, setRemember] = useState(true);

  return (
    <div className="min-h-screen w-full bg-red-50">
      <div className="flex min-h-screen">
        {/* Coluna esquerda: imagem e banner azul */}
        <div
          className="hidden lg:flex w-1/2 relative bg-red-600"
          style={{
            backgroundImage: `url(${process.env.PUBLIC_URL}/brand/login-banner.jpg)`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <div className="absolute inset-0 bg-red-700/40" />
          <div className="absolute bottom-0 left-0 right-0 bg-red-600 py-6 px-8">
            <p className="text-white text-2xl font-semibold">
              Solução e Tecnologia para <span className="font-bold">#Revolucionar</span> seu negócio
            </p>
          </div>
        </div>

        {/* Coluna direita: formulário de login */}
        <div className="w-full lg:w-1/2 flex items-center justify-center px-6 sm:px-10 py-10 bg-white">
          <div className="w-full max-w-md">
            {/* Logo */}
            <div className="flex justify-center mb-6">
              <img
                src={`${process.env.PUBLIC_URL}/brand/logo.png`}
                alt="IBRA Informática"
                className="h-16"
                onError={(e) => {
                  // Oculta a imagem se o arquivo não existir
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>

            {/* Boas-vindas */}
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-red-700">Boas-vindas!</h2>
              <p className="mt-1 text-sm text-red-600">Faça login para continuar</p>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div>
                  <label htmlFor="email-address" className="block text-sm font-medium text-red-700">
                    E-mail
                  </label>
                  <input
                    id="email-address"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-red-600 focus:ring-red-600 sm:text-sm"
                    placeholder="seuemail@exemplo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label htmlFor="password" className="block text-sm font-medium text-red-700">
                      Senha
                    </label>
                    <a href="#" className="text-sm text-red-600 hover:text-red-700">Esqueceu sua senha?</a>
                  </div>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-red-600 focus:ring-red-600 sm:text-sm"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>

              {/* Lembrar de mim */}
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-600"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-700">
                  Lembrar de mim
                </label>
              </div>

              {error && (
                <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex justify-center py-2.5 px-4 rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-600 disabled:opacity-50"
              >
                {loading ? 'Entrando...' : 'Login'}
              </button>

          
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;