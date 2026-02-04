import React, { useState, useEffect } from 'react';
import api from '../services/api';
import SuccessModal from '../components/SuccessModal';

const WhatsAppBulk = () => {
  const [clients, setClients] = useState([]);
  const [selectedClients, setSelectedClients] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const [successOpen, setSuccessOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [whatsappStatus, setWhatsappStatus] = useState(null);
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaPreview, setMediaPreview] = useState(null);

  // Variáveis disponíveis para substituição
  const availableVariables = [
    { key: '{nome}', description: 'Nome do cliente' },
    { key: '{email}', description: 'Email do cliente' },
    { key: '{telefone}', description: 'Telefone do cliente' },
    { key: '{documento}', description: 'CPF/CNPJ do cliente' },
    { key: '{endereco}', description: 'Endereço do cliente' },
    { key: '{numero}', description: 'Número do endereço' },
    { key: '{bairro}', description: 'Bairro do cliente' },
    { key: '{cidade}', description: 'Cidade do cliente' },
    { key: '{estado}', description: 'Estado do cliente' },
    { key: '{cep}', description: 'CEP do cliente' }
  ];

  useEffect(() => {
    fetchClients();
    checkWhatsAppStatus();
  }, []);

  const fetchClients = async () => {
    try {
      setLoading(true);
      const response = await api.get('/whatsapp/clients');
      setClients(response.data.data);
    } catch (error) {
      console.error('Erro ao buscar clientes:', error);
      setError('Erro ao carregar lista de clientes');
    } finally {
      setLoading(false);
    }
  };

  const checkWhatsAppStatus = async () => {
    try {
      const response = await api.get('/whatsapp/detailed-status');
      setWhatsappStatus(response.data.data);
    } catch (error) {
      console.error('Erro ao verificar status do WhatsApp:', error);
    }
  };

  const handleSelectAll = (checked) => {
    if (checked) {
      setSelectedClients(clients.map(client => client.id));
    } else {
      setSelectedClients([]);
    }
  };

  const handleSelectClient = (clientId, checked) => {
    if (checked) {
      setSelectedClients([...selectedClients, clientId]);
    } else {
      setSelectedClients(selectedClients.filter(id => id !== clientId));
    }
  };

  const insertVariable = (variable) => {
    const textarea = document.getElementById('message-textarea');
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newMessage = message.substring(0, start) + variable + message.substring(end);
    setMessage(newMessage);
    
    // Reposicionar cursor após a variável inserida
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + variable.length, start + variable.length);
    }, 0);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Verificar tipo de arquivo
      const allowedTypes = ['image/', 'video/', 'audio/', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument'];
      const isAllowed = allowedTypes.some(type => file.type.startsWith(type));
      
      if (!isAllowed) {
        setError('Tipo de arquivo não suportado. Use imagens, vídeos, áudios ou documentos.');
        return;
      }

      // Verificar tamanho (máximo 16MB)
      if (file.size > 16 * 1024 * 1024) {
        setError('Arquivo muito grande. Tamanho máximo: 16MB');
        return;
      }

      setMediaFile(file);
      setError('');

      // Criar preview para imagens
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => setMediaPreview(e.target.result);
        reader.readAsDataURL(file);
      } else {
        setMediaPreview(null);
      }
    }
  };

  const removeMediaFile = () => {
    setMediaFile(null);
    setMediaPreview(null);
    document.getElementById('media-input').value = '';
  };

  const handleSendMessages = async () => {
    if (selectedClients.length === 0) {
      setError('Selecione pelo menos um cliente');
      return;
    }

    if (!message.trim() && !mediaFile) {
      setError('Digite uma mensagem ou selecione um arquivo de mídia');
      return;
    }

    if (!whatsappStatus?.ready) {
      setError('WhatsApp não está conectado. Verifique a conexão antes de enviar mensagens.');
      return;
    }

    try {
      setSending(true);
      setError('');
      setResults(null);

      // Preparar dados para envio
      const formData = new FormData();
      formData.append('clientIds', JSON.stringify(selectedClients));
      formData.append('message', message);
      
      if (mediaFile) {
        formData.append('media', mediaFile);
      }

      const response = await api.post('/whatsapp/send-bulk', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setResults(response.data.data);
      setSuccessMessage(`Mensagens processadas: ${response.data.data.summary.success} enviadas, ${response.data.data.summary.errors} com erro`);
      setSuccessOpen(true);
      
      // Limpar seleção após envio
      setSelectedClients([]);
      setMessage('');
      removeMediaFile();

    } catch (error) {
      console.error('Erro ao enviar mensagens:', error);
      setError(error.response?.data?.message || 'Erro ao enviar mensagens');
    } finally {
      setSending(false);
    }
  };

  const getSelectedClientsInfo = () => {
    return clients.filter(client => selectedClients.includes(client.id));
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Envio de Mensagens WhatsApp</h1>
        <p className="text-gray-600">Envie mensagens personalizadas para múltiplos clientes via WhatsApp</p>
      </div>

      {/* Status do WhatsApp */}
      <div className="mb-6 p-4 rounded-lg border">
        <h3 className="text-lg font-semibold mb-2">Status do WhatsApp</h3>
        <div className="flex items-center space-x-2">
          <div className={`w-3 h-3 rounded-full ${whatsappStatus?.ready ? 'bg-green-500' : 'bg-red-500'}`}></div>
          <span className={whatsappStatus?.ready ? 'text-green-700' : 'text-red-700'}>
            {whatsappStatus?.ready ? 'Conectado' : 'Desconectado'}
          </span>
          {whatsappStatus?.info?.pushname && (
            <span className="text-gray-600">({whatsappStatus.info.pushname})</span>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Seleção de Clientes */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Selecionar Clientes</h2>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="select-all"
                checked={selectedClients.length === clients.length && clients.length > 0}
                onChange={(e) => handleSelectAll(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="select-all" className="text-sm text-gray-700">
                Selecionar todos ({clients.length})
              </label>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto border rounded">
            {clients.map((client) => (
              <div key={client.id} className="flex items-center p-3 border-b hover:bg-gray-50">
                <input
                  type="checkbox"
                  id={`client-${client.id}`}
                  checked={selectedClients.includes(client.id)}
                  onChange={(e) => handleSelectClient(client.id, e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-3"
                />
                <div className="flex-1">
                  <label htmlFor={`client-${client.id}`} className="cursor-pointer">
                    <div className="font-medium text-gray-900">{client.name}</div>
                    <div className="text-sm text-gray-600">
                      {client.phone && <span>📱 {client.phone}</span>}
                      {client.email && <span className="ml-2">✉️ {client.email}</span>}
                    </div>
                    {client.cidade && client.estado && (
                      <div className="text-xs text-gray-500">
                        📍 {client.cidade}, {client.estado}
                      </div>
                    )}
                  </label>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 text-sm text-gray-600">
            {selectedClients.length} cliente(s) selecionado(s)
          </div>
        </div>

        {/* Composição da Mensagem */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Compor Mensagem</h2>
          
          {/* Variáveis Disponíveis */}
          <div className="mb-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Variáveis Disponíveis:</h3>
            <div className="grid grid-cols-2 gap-2">
              {availableVariables.map((variable) => (
                <button
                  key={variable.key}
                  onClick={() => insertVariable(variable.key)}
                  className="text-left p-2 text-xs bg-red-50 hover:bg-red-100 rounded border border-red-200 transition-colors"
                  title={variable.description}
                >
                  <span className="font-mono text-red-700">{variable.key}</span>
                  <div className="text-gray-600 text-xs">{variable.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Upload de Mídia */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Anexar Mídia (Opcional)
            </label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
              {!mediaFile ? (
                <div className="text-center">
                  <input
                    type="file"
                    id="media-input"
                    onChange={handleFileChange}
                    accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                    className="hidden"
                  />
                  <label
                    htmlFor="media-input"
                    className="cursor-pointer inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                  >
                    📎 Selecionar Arquivo
                  </label>
                  <p className="text-xs text-gray-500 mt-2">
                    Suporte: Imagens, vídeos, áudios, documentos (máx. 16MB)
                  </p>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    {mediaPreview ? (
                      <img src={mediaPreview} alt="Preview" className="w-12 h-12 object-cover rounded" />
                    ) : (
                      <div className="w-12 h-12 bg-gray-200 rounded flex items-center justify-center">
                        📄
                      </div>
                    )}
                    <div>
                      <div className="text-sm font-medium text-gray-900">{mediaFile.name}</div>
                      <div className="text-xs text-gray-500">
                        {(mediaFile.size / 1024 / 1024).toFixed(2)} MB
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={removeMediaFile}
                    className="text-red-600 hover:text-red-800 text-sm"
                  >
                    ❌ Remover
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Campo de Mensagem */}
          <div className="mb-4">
            <label htmlFor="message-textarea" className="block text-sm font-medium text-gray-700 mb-2">
              Mensagem {mediaFile ? '(Legenda)' : ''}
            </label>
            <textarea
              id="message-textarea"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={mediaFile ? "Digite uma legenda para a mídia (opcional)..." : "Digite sua mensagem aqui. Use as variáveis acima para personalizar a mensagem para cada cliente."}
              className="w-full h-40 p-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            />
            <div className="text-xs text-gray-500 mt-1">
              {message.length} caracteres
            </div>
          </div>

          {/* Preview da Mensagem */}
          {message && selectedClients.length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Preview (primeiro cliente selecionado):</h3>
              <div className="p-3 bg-gray-50 border rounded text-sm">
                {(() => {
                  const firstClient = getSelectedClientsInfo()[0];
                  if (!firstClient) return message;
                  
                  return message
                    .replace(/{nome}/g, firstClient.name || '')
                    .replace(/{email}/g, firstClient.email || '')
                    .replace(/{telefone}/g, firstClient.phone || '')
                    .replace(/{documento}/g, firstClient.document || '')
                    .replace(/{cidade}/g, firstClient.cidade || '')
                    .replace(/{estado}/g, firstClient.estado || '');
                })()}
              </div>
            </div>
          )}

          {/* Botão de Envio */}
          <button
            onClick={handleSendMessages}
            disabled={sending || selectedClients.length === 0 || (!message.trim() && !mediaFile) || !whatsappStatus?.ready}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-md transition-colors"
          >
            {sending ? (
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Enviando mensagens...
              </div>
            ) : (
              `Enviar para ${selectedClients.length} cliente(s)`
            )}
          </button>
        </div>
      </div>

      {/* Resultados do Envio */}
      {results && (
        <div className="mt-6 bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Resultados do Envio</h2>
          
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="text-center p-4 bg-blue-50 rounded">
              <div className="text-2xl font-bold text-blue-600">{results.summary.total}</div>
              <div className="text-sm text-blue-700">Total</div>
            </div>
            <div className="text-center p-4 bg-green-50 rounded">
              <div className="text-2xl font-bold text-green-600">{results.summary.success}</div>
              <div className="text-sm text-green-700">Enviadas</div>
            </div>
            <div className="text-center p-4 bg-red-50 rounded">
              <div className="text-2xl font-bold text-red-600">{results.summary.errors}</div>
              <div className="text-sm text-red-700">Erros</div>
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {results.results.map((result, index) => (
              <div key={index} className={`p-3 border-l-4 mb-2 ${result.status === 'success' ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'}`}>
                <div className="font-medium">{result.clientName}</div>
                <div className={`text-sm ${result.status === 'success' ? 'text-green-700' : 'text-red-700'}`}>
                  {result.message}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <SuccessModal
        isOpen={successOpen}
        onClose={() => setSuccessOpen(false)}
        message={successMessage}
      />
    </div>
  );
};

export default WhatsAppBulk;