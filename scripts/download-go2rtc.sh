#!/usr/bin/env bash
# ==============================================================================
# Script de Download Automático do binário oficial go2rtc
# Suporta macOS (Darwin) e Linux, arquiteturas x86_64 e ARM64
# ==============================================================================

set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )"
BIN_DIR="$DIR/bin"
BIN_FILE="$BIN_DIR/go2rtc"

VERSION="v1.9.15"

if [ -f "$BIN_FILE" ]; then
    echo "✅ Binário go2rtc já presente em $BIN_FILE"
    chmod +x "$BIN_FILE"
    exit 0
fi

echo "⬇️  Binário go2rtc não encontrado. Baixando versão oficial ($VERSION)..."
mkdir -p "$BIN_DIR"

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "$ARCH" in
    x86_64|amd64)
        GO_ARCH="amd64"
        ;;
    arm64|aarch64)
        GO_ARCH="arm64"
        ;;
    *)
        echo "❌ Arquitetura não suportada automaticamente: $ARCH"
        echo "Por favor, baixe o binário apropriado em https://github.com/AlexxIT/go2rtc/releases e coloque em bin/go2rtc"
        exit 1
        ;;
esac

case "$OS" in
    darwin)
        GO_OS="darwin"
        ;;
    linux)
        GO_OS="linux"
        ;;
    *)
        echo "❌ Sistema operacional não suportado automaticamente pelo script: $OS"
        echo "Por favor, baixe o binário para seu SO em https://github.com/AlexxIT/go2rtc/releases e coloque em bin/go2rtc"
        exit 1
        ;;
esac

BINARY_NAME="go2rtc_${GO_OS}_${GO_ARCH}"
DOWNLOAD_URL="https://github.com/AlexxIT/go2rtc/releases/download/${VERSION}/${BINARY_NAME}"

echo "📡 Baixando de: $DOWNLOAD_URL"
if command -v curl &> /dev/null; then
    curl -L --fail --progress-bar -o "$BIN_FILE" "$DOWNLOAD_URL"
elif command -v wget &> /dev/null; then
    wget -q --show-progress -O "$BIN_FILE" "$DOWNLOAD_URL"
else
    echo "❌ Erro: curl ou wget necessários para o download automático."
    exit 1
fi

chmod +x "$BIN_FILE"
echo "✅ Binário go2rtc instalado com sucesso em $BIN_FILE"
