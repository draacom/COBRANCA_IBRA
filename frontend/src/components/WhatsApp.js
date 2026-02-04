import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Alert, AlertDescription } from './ui/alert';
import { Badge } from './ui/badge';
import { Loader2, RefreshCw, Smartphone, CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react';
import api from '../services/api';

const WhatsApp = () => {
  const [status, setStatus] = useState(null);
  const [qrCode, setQrCode] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reconnecting, setReconnecting] = useState(false);
  const [error, setError] = useState(null);

  const fetchWhatsAppStatus = async () => {
    try {
      const response = await api.get('/whatsapp/detailed-status');
      setStatus(response.data.data);
      setError(null);
    } catch (err) {
      console.error('Error fetching WhatsApp status:', err);
      let msg = err.response?.data?.message || err.message;
      if (err.response?.status === 500 && !err.response?.data?.message) {
         msg = 'Erro interno no servidor (500). A Evolution API pode estar offline ou configurada incorretamente.';
      }
      setError(msg);
    }
  };

  const fetchQRCode = async () => {
    try {
      const response = await api.get('/whatsapp/qrcode');
      setQrCode(response.data.data);
    } catch (err) {
      console.error('Error fetching QR code:', err);
    }
  };

  const handleReconnect = async () => {
    setReconnecting(true);
    try {
      await api.post('/whatsapp/reconnect');
      
      // Aguardar um pouco antes de atualizar o status
      setTimeout(() => {
        fetchWhatsAppStatus();
        fetchQRCode();
      }, 2000);

    } catch (err) {
      console.error('Error reconnecting WhatsApp:', err);
      let msg = err.response?.data?.message || err.message;
      if (err.response?.status === 500 && !err.response?.data?.message) {
         msg = 'Erro interno no servidor (500). Verifique os logs do backend.';
      }
      setError(msg);
    } finally {
      setReconnecting(false);
    }
  };

  const refreshData = async () => {
    setLoading(true);
    await Promise.all([fetchWhatsAppStatus(), fetchQRCode()]);
    setLoading(false);
  };

  useEffect(() => {
    refreshData();
    
    // Atualizar status a cada 10 segundos
    const interval = setInterval(() => {
      fetchWhatsAppStatus();
      if (status && !status.ready) {
        fetchQRCode();
      }
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = (ready) => {
    if (ready) {
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    } else {
      return <XCircle className="h-5 w-5 text-red-500" />;
    }
  };

  const getStatusBadge = (ready) => {
    if (ready) {
      return <Badge className="bg-green-100 text-green-800">Conectado</Badge>;
    } else {
      return <Badge className="bg-red-100 text-red-800">Desconectado</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Carregando status do WhatsApp...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">WhatsApp</h1>
        <Button 
          onClick={refreshData} 
          variant="outline" 
          size="sm"
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {error && (
        <Alert className="border-red-200 bg-red-50">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">
            {error}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Status Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              Status da Conexão
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {status && (
              <>
                <div className="flex items-center justify-between">
                  <span className="font-medium">Status:</span>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(status.ready)}
                    {getStatusBadge(status.ready)}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-medium">Mensagem:</span>
                  <span className="text-sm text-gray-600">{status.statusMessage || status.message}</span>
                </div>

                {status.info && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Usuário:</span>
                      <span className="text-sm text-gray-600">{status.info.pushname || 'N/A'}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="font-medium">Número:</span>
                      <span className="text-sm text-gray-600">{status.info.wid?.user || 'N/A'}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="font-medium">Plataforma:</span>
                      <span className="text-sm text-gray-600">{status.info.platform || 'N/A'}</span>
                    </div>
                  </>
                )}

                {!status.ready && (
                  <Button 
                    onClick={handleReconnect} 
                    className="w-full mt-4"
                    disabled={reconnecting}
                  >
                    {reconnecting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Reconectando...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Reconectar
                      </>
                    )}
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* QR Code Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Conexão WhatsApp
            </CardTitle>
          </CardHeader>
          <CardContent>
            {status && status.ready ? (
              <div className="text-center py-8">
                <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-green-700 mb-2">
                  WhatsApp Conectado!
                </h3>
                <p className="text-gray-600">
                  Seu WhatsApp está conectado e pronto para enviar mensagens.
                </p>
              </div>
            ) : (
              <div className="text-center">
                {qrCode && qrCode.hasQR ? (
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold mb-4">
                      Escaneie o QR Code
                    </h3>
                    <div className="flex justify-center">
                      <img 
                        src={qrCode.qrCode} 
                        alt="QR Code WhatsApp" 
                        className="border rounded-lg shadow-lg max-w-xs"
                      />
                    </div>
                    <div className="text-sm text-gray-600 space-y-2">
                      <p>1. Abra o WhatsApp no seu celular</p>
                      <p>2. Toque em Menu ou Configurações</p>
                      <p>3. Toque em WhatsApp Web</p>
                      <p>4. Escaneie este código</p>
                    </div>
                  </div>
                ) : (
                  <div className="py-8">
                    <AlertTriangle className="h-16 w-16 text-yellow-500 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-yellow-700 mb-2">
                      QR Code não disponível
                    </h3>
                    <p className="text-gray-600 mb-4">
                      {qrCode?.message || status?.statusMessage || 'Aguardando geração do QR code...'}
                    </p>
                    <Button 
                      onClick={handleReconnect} 
                      variant="outline"
                      disabled={reconnecting}
                    >
                      {reconnecting ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Gerando...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Gerar QR Code
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Instructions Card */}
      <Card>
        <CardHeader>
          <CardTitle>Instruções</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm text-gray-600">
            <p>
              <strong>Para conectar o WhatsApp:</strong> Escaneie o QR code acima com seu celular.
            </p>
            <p>
              <strong>Status da conexão:</strong> O sistema verifica automaticamente a cada 10 segundos.
            </p>
            <p>
              <strong>Problemas de conexão:</strong> Use o botão "Reconectar" para tentar uma nova conexão.
            </p>
            <p>
              <strong>Importante:</strong> Mantenha o WhatsApp do celular conectado à internet para o funcionamento correto.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default WhatsApp;