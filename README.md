# 📹 CamVisul

> **Visualizador em tempo real para Câmeras IP Besder / Xiongmai (ICSee) diretamente pelo computador, com vídeo e áudio nativos sincronizados e latência inferior a 200ms.**

[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green.svg)](https://nodejs.org/)
[![WebRTC](https://img.shields.io/badge/Streaming-WebRTC-blue.svg)](https://webrtc.org/)
[![Hardware](https://img.shields.io/badge/C%C3%A2mera-Besder%20XM530-orange.svg)](#)
[![Design](https://img.shields.io/badge/UI-Clean%20%26%20Modern-purple.svg)](#)

---

## 🎯 Por que o CamVisul foi criado?

As câmeras IP residenciais controladas pelo aplicativo **ICSee** (fabricadas pela **Besder** com chipsets Xiongmai/Sofia):
1. **Só funcionam oficialmente no celular:** Os aplicativos oficiais da fabricante só existem para Android e iOS.
2. **Web legada inacessível:** A interface web interna da câmera (porta 80) foi desenvolvida para o Internet Explorer antigo e exige um plugin ActiveX (`.ocx`) de 32 bits, que não funciona em nenhum navegador moderno (Chrome, Edge, Safari, Firefox) nem no macOS/Linux.
3. **Ausência de suporte nativo a RTSP no navegador:** Navegadores não tocam links `rtsp://` diretamente nem decodificam áudio G.711 A-law em tags de vídeo HTML5 sem transcodificação.

O **CamVisul** resolve tudo isso: ele conecta-se diretamente à câmera via rede local, empacota os fluxos de vídeo H.264 e áudio G.711A em **WebRTC de latência ultrabaixa (< 200ms)** e apresenta tudo em um painel escuro profissional, moderno e limpo.

---

## ✨ Principais Funcionalidades

- **⚡ Streaming em Tempo Real (< 200ms):** Pipeline WebRTC direto, sem buffers longos de HLS (6-15s).
- **🔊 Áudio e Vídeo Sincronizados:** Captação de som contínua pelo microfone da câmera com controle de volume e botão de áudio inteligente (respeitando as políticas de autoplay do navegador).
- **📊 Medidor de Captação Sonora (Audio Meter):** Visualizador em tempo real (Web Audio API) que indica as ondas sonoras captadas pela câmera.
- **🎮 Controle PTZ (Pan / Tilt / Zoom):** D-Pad na tela e suporte completo a **setas do teclado (↑ ↓ ← → e + / -)** para movimentar a câmera motorizada via ONVIF.
- **📸 Captura de Fotos (Snapshots):** Download instantâneo de imagens em alta resolução com data e hora.
- **🎚️ Alternador de Qualidade (HD / SD):** Troca dinâmica entre Stream Principal (1080p Full HD) e Stream Secundário (SD fluido).
- **🔒 Modal de Login Acessível:** Interface nativa `<dialog>` (conforme diretrizes W3C Modern Web), solicitando usuário e senha cadastrados no app ICSee, com opção de salvar credenciais no computador.
- **🖥️ Modo Tela Cheia e Miniatura (PiP):** Suporte a Picture-in-Picture para monitorar enquanto você trabalha em outras janelas.

---

## 🚀 Como Executar

### Método Rápido (Recomendado)
Basta abrir o terminal na pasta do projeto e executar:
```bash
./start.sh
```
O script iniciará o servidor e abrirá automaticamente o navegador no endereço `http://localhost:3000`.

### Modo Desenvolvimento (com Hot Reload)
Se você estiver editando o código do frontend ou backend:
```bash
npm run start:dev
```
*(Ou `./start.sh dev`)*. Qualquer alteração em arquivos de `src/`, `config/` ou `public/` reiniciará o servidor e recarregará a aba do navegador automaticamente!

### Método Manual
```bash
npm install
npm start
```
Abra seu navegador em `http://localhost:3000`.

---

## 🔑 Primeiro Acesso

1. No modal de conexão:
   - **IP:** Endereço IP da câmera na sua rede local (ex: `192.168.1.100`).
   - **Porta:** `554` (RTSP padrão).
   - **Usuário:** `admin` (padrão).
   - **Senha:** Digite a senha criada para a câmera no aplicativo ICSee do celular.
2. Clique em **"Conectar à Câmera"**.
3. O vídeo e o áudio em tempo real serão carregados imediatamente!

---

## ⌨️ Atalhos de Teclado

| Tecla | Ação |
|---|---|
| `↑` `↓` `←` `→` | Movimenta a câmera (Pan & Tilt) |
| `+` ou `=` | Aproxima o Zoom |
| `-` | Afasta o Zoom |
| `M` | Ativa / Desativa o som do microfone da câmera |
| `S` | Tira uma foto (Snapshot em alta resolução) |
| `F` | Alterna modo Tela Cheia |

---

## 📚 Documentação Técnica das Decisões (`doc/`)

Todas as decisões arquiteturais e de implementação estão detalhadas na pasta `doc/`:

- [📐 Arquitetura do Sistema](doc/architecture/doc.md): Diagramas de fluxo, separação de camadas e engine de streaming.
- [📡 Protocolos da Câmera Besder](doc/camera-protocols/doc.md): Mapeamento de portas (554, 8899, 80, 34567), codecs H.264 e G.711A.
- [⚡ Pipeline de Streaming em Tempo Real](doc/realtime-streaming/doc.md): Como o WebRTC entrega latência sub-segundo e sincronismo de áudio.
- [🔐 Autenticação e Segurança](doc/authentication/doc.md): Digest MD5 RFC 2617 e proteção de credenciais locais.
- [🎮 Controles PTZ (Pan/Tilt/Zoom)](doc/ptz-controls/doc.md): Integração ONVIF SOAP e atalhos de teclado.
- [🎨 Design de UI/UX e Modern Web Guidance](doc/ui-ux-design/doc.md): Conformidade com padrões modernos HTML5/CSS e `<dialog>`.
- [📖 Guia de Inicialização e Uso](doc/getting-started/doc.md): Manual de instruções e resolução de problemas.
