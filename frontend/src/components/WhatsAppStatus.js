import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

const WhatsAppStatus = () => {
  const [status, setStatus] = useState({ ready: false, status: 'disconnected' });
  const [loading, setLoading] = useState(true);

  const checkStatus = useCallback(async () => {
    setLoading(true);
    try {
      const timestamp = Date.now();
      const response = await api.get(`/whatsapp/status?t=${timestamp}`);
      setStatus(response.data.data || { ready: false, status: 'disconnected' });
    } catch (error) {
      setStatus({ ready: false, status: 'disconnected' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();
    // Verificar status a cada 30 segundos
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  const handleManualRefresh = () => {
    checkStatus();
  };

  return (
    <div className="mb-4 p-4 border rounded-lg">
      <div className="flex items-center">
        <span className={`inline-block w-3 h-3 rounded-full mr-2 ${status.ready ? 'bg-green-500' : 'bg-red-500'}`}></span>
        <span className="font-medium">
          {loading ? 'Verificando status do WhatsApp...' : (status.ready ? 'WhatsApp conectado' : 'WhatsApp desconectado')}
        </span>
      </div>
    </div>
  );
};

export default WhatsAppStatus;