# 📹 CamVisul VMS

> **Sistema de Videomonitoramento (VMS / CFTV) em tempo real para computador, com matriz de visualização em Grid (1x1, 2x2, 3x3), suporte universal a múltiplas câmeras de qualquer fabricante, áudio e vídeo sincronizados e latência ultrabaixa (< 200ms).**

[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green.svg)](https://nodejs.org/)
[![WebRTC](https://img.shields.io/badge/Streaming-WebRTC%20Ultra--Low%20Latency-blue.svg)](https://webrtc.org/)
[![Database](https://img.shields.io/badge/Storage-SQLite%20Local-yellow.svg)](https://sqlite.org/)
[![Security](https://img.shields.io/badge/Security-AES--256--GCM-red.svg)](#)
[![Hardware](https://img.shields.io/badge/Compatibilidade-Multi--Marca%20ONVIF%20%2F%20RTSP-orange.svg)](#)

---

## 🎯 Por que o CamVisul foi criado?

1. **Restrição aos Aplicativos Móveis:** A maioria das câmeras residenciais e comerciais (Besder/ICSee, Intelbras, Tapo, etc.) depende de aplicativos de celular fechados.
2. **Web Legada Incompatível:** Interfaces web internas de câmeras IP frequentemente dependem de plugins ActiveX (`.ocx`) de 32 bits do Internet Explorer legado, incompatíveis com Chrome, Safari, Edge e macOS/Linux.
3. **Incompatibilidade RTSP Nativa:** Navegadores não reproduzem streams `rtsp://` diretamente nem decodificam codecs legados de áudio (como G.711 A-law) sem transcodificação.
4. **Falta de uma Central VMS Leve para Desktop:** Sistemas profissionais de CFTV costumam ser pesados, caros ou exigir configurações complexas de NVR.

O **CamVisul** resolve tudo isso: ele conecta-se diretamente às câmeras na sua rede local, empacota os fluxos de vídeo H.264 e áudio em **WebRTC de latência ultrabaixa (< 200ms)** e apresenta uma central de monitoramento moderna, escura e completa diretamente no seu navegador.

---

## ✨ Principais Funcionalidades

- **🎛️ Matriz de Monitoramento em Grid (1x1, 2x2, 3x3):**
  - Alterne entre visão individual em **1x1** (Foco HD), **2x2** (até 4 câmeras simultâneas) ou **3x3** (até 9 câmeras simultâneas).
  - Dê duplo clique em qualquer quadrante para expandir instantaneamente para o modo 1x1 em alta resolução.
- **🌐 Suporte Universal Multi-Marca:**
  - Presets inteligentes com preenchimento automático de portas para **Intelbras**, **Hikvision**, **Dahua**, **TP-Link Tapo**, **Besder / Xiongmai / ICSee** e câmeras genéricas **RTSP / ONVIF**.
- **⚡ Streaming WebRTC em Tempo Real (< 200ms):**
  - Conexão ponto a ponto direta, sem atrasos longos de buffer de HLS (6-15s).
- **🚀 Otimização Inteligente de Banda e GPU:**
  - No modo Grid, as câmeras transmitem automaticamente o **Substream (SD)** para poupar GPU e rede.
  - Ao focar em 1x1, o fluxo comuta dinamicamente para o **Mainstream (1080p Full HD)**.
- **🔐 Criptografia Forte de Senhas em Repouso (AES-256-GCM):**
  - Todas as senhas salvas no SQLite (`data/camvisul.db`) são protegidas com criptografia simétrica autenticada **AES-256-GCM** e chave exclusiva da máquina. Senhas nunca são expostas em texto puro na API.
- **🎮 Controle PTZ Contextual (Pan / Tilt / Zoom):**
  - Clique em qualquer câmera do grid para selecioná-la. Os comandos do D-Pad na tela e os **atalhos de teclado (↑ ↓ ← → e + / -)** serão direcionados automaticamente para a câmera ativa.
- **🔊 Áudio Exclusivo e Medidor Sonoro (VU Meter):**
  - No modo Grid, as câmeras iniciam com áudio mudo. Ativar o som em uma câmera silencia automaticamente as outras, prevenindo sobreposição e ruídos.
- **📸 Captura Instantânea de Fotos (Snapshots):**
  - Download rápido de fotos em alta resolução direto de qualquer câmera do grid.
- **🖥️ PiP e Tela Cheia:**
  - Modo Picture-in-Picture flutuante e modo tela cheia para monitoramento contínuo.

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
*(Ou `./start.sh dev`)*. Qualquer alteração em arquivos de `src/`, `config/` ou `public/` reiniciará o servidor e atualizará a aba do navegador automaticamente!

### Método Manual
```bash
npm install
npm start
```
Abra seu navegador em `http://localhost:3000`.

---

## 🔑 Gerenciando Câmeras

1. Clique no botão **"Nova Câmera"** no cabeçalho ou clique em um espaço vago no Grid.
2. Selecione o **Fabricante / Preset** (ex: *Intelbras*, *Hikvision*, *Tapo*, *Besder* ou *Genérico*):
   - As portas RTSP e ONVIF serão preenchidas automaticamente.
3. Preencha o **Nome**, **Endereço IP** e as **Credenciais** da câmera.
4. Clique em **"Testar Conexão"** para validar o acesso na rede.
5. Clique em **"Cadastrar Câmera"** para salvar no banco local SQLite com senha criptografada.
6. A câmera aparecerá imediatamente no Grid de monitoramento!

---

## ⌨️ Atalhos de Teclado

| Tecla | Ação |
|---|---|
| `↑` `↓` `←` `→` | Movimenta a câmera selecionada (Pan & Tilt) |
| `+` ou `=` | Aproxima o Zoom |
| `-` | Afasta o Zoom |
| `M` | Ativa / Desativa o áudio da câmera selecionada |
| `S` | Tira uma foto (Snapshot em alta resolução) |
| `F` | Alterna modo Tela Cheia |

---

## 📚 Documentação Técnica das Decisões (`doc/`)

Todas as decisões arquiteturais e de implementação estão detalhadas na pasta `doc/`:

- [📐 Arquitetura do Sistema](doc/architecture/doc.md): Diagramas de fluxo, separação de camadas e engine de streaming.
- [📡 Protocolos da Câmera Besder e Fabricantes](doc/camera-protocols/doc.md): Mapeamento de portas (554, 8899, 80, 8000, 2020), codecs H.264 e G.711A.
- [⚡ Pipeline de Streaming em Tempo Real](doc/realtime-streaming/doc.md): Como o WebRTC entrega latência sub-segundo e sincronismo de áudio.
- [🔐 Autenticação e Segurança](doc/authentication/doc.md): Criptografia AES-256-GCM em repouso e Digest MD5 RFC 2617.
- [🎮 Controles PTZ (Pan/Tilt/Zoom)](doc/ptz-controls/doc.md): Integração ONVIF SOAP e roteamento contextual.
- [🎨 Design de UI/UX e Modern Web Guidance](doc/ui-ux-design/doc.md): Conformidade com padrões modernos HTML5/CSS e `<dialog>`.
- [📖 Guia de Inicialização e Uso](doc/getting-started/doc.md): Manual de instruções e resolução de problemas.
