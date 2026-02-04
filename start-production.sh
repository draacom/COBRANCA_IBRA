#!/bin/bash

# Script de inicialização para produção
# Este script configura o ambiente e inicia a aplicação

echo "🚀 Iniciando aplicação em modo produção..."

# Verificar se as dependências estão instaladas
if ! command -v google-chrome &> /dev/null && ! command -v chromium-browser &> /dev/null && ! command -v chromium &> /dev/null; then
    echo "❌ Chrome/Chromium não encontrado!"
    echo "Execute primeiro: ./install-dependencies.sh"
    exit 1
fi

# Configurar variáveis de ambiente para produção
export NODE_ENV=production
export DISPLAY=:99

# Verificar se Xvfb está disponível para ambientes headless
if command -v xvfb-run &> /dev/null; then
    echo "🖥️ Iniciando com Xvfb (ambiente sem interface gráfica)..."
    
    # Matar processos Xvfb existentes se houver
    pkill -f Xvfb || true
    
    # Iniciar aplicação com Xvfb
    xvfb-run -a --server-args="-screen 0 1024x768x24 -ac -nolisten tcp -dpi 96 +extension GLX" node src/index.js
else
    echo "🖥️ Iniciando em modo normal..."
    node src/index.js
fi