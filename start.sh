#!/usr/bin/env bash
# ==============================================================================
# CamVisul - Script de Inicialização Rápida
# Inicia o servidor e abre automaticamente o navegador no computador
# ==============================================================================

set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "=========================================================="
echo "📹 Iniciando CamVisul • Visualizador Câmera Besder (ICSee)"
echo "=========================================================="

# 1. Verifica se o Node.js está instalado
if ! command -v node &> /dev/null; then
    echo "❌ Erro: Node.js não foi encontrado. Por favor instale o Node.js (v18+)."
    exit 1
fi

# 2. Garante a presença e permissão de execução do binário go2rtc
if [ ! -f "bin/go2rtc" ]; then
    bash scripts/download-go2rtc.sh
else
    chmod +x bin/go2rtc
fi

# 3. Garante o arquivo de configuração
if [ ! -f "config/go2rtc.yaml" ] && [ -f "config/go2rtc.example.yaml" ]; then
    cp config/go2rtc.example.yaml config/go2rtc.yaml
fi

# 4. Verifica se dependências npm estão instaladas
if [ ! -d "node_modules" ]; then
    echo "📦 Instalando dependências npm..."
    npm install
fi

# 5. Inicia o servidor Node.js
(
  # Aguarda 1.5s e abre o navegador automaticamente no Mac
  sleep 1.5
  if command -v open &> /dev/null; then
      echo "🌐 Abrindo interface no navegador padrão..."
      open "http://localhost:3000"
  fi
) &

if [ "$1" == "dev" ] || [ "$1" == "start:dev" ] || [ "$1" == "--dev" ]; then
    echo "⚡ Modo Hot Reload Ativo (node --watch-path=./src)..."
    exec node --watch-path=./src src/server.js
else
    echo "🚀 Subindo servidor CamVisul em modo padrão..."
    exec node src/server.js
fi
