# Arquitetura do Sistema - CamVisul

## 1. Visão Geral

O **CamVisul** é uma aplicação desktop/web moderna desenvolvida para permitir a visualização em tempo real de câmeras IP residenciais (como a câmera **Besder** com firmware Xiongmai/ICSee) diretamente pelo computador, sem a necessidade de emuladores Android ou do aplicativo móvel ICSee.

O principal desafio técnico de câmeras ICSee/Besder é que seu servidor web interno legado (porta 80) depende de plugins ActiveX (Internet Explorer antigo com controles OCX de 32 bits), impossibilitando a reprodução direta em navegadores modernos como Chrome, Edge, Safari e Firefox. Além disso, navegadores não suportam nativamente o protocolo RTSP nem o codec de áudio G.711 (PCMA) em tags de vídeo padrão sem transcodificação ou encapsulamento WebRTC.

Para superar essa limitação e fornecer **vídeo e áudio sincronizados em tempo real com latência inferior a 200ms**, o CamVisul adota uma arquitetura em camadas de alto desempenho.

---

## 2. Diagrama de Arquitetura

```mermaid
graph TD
    subgraph Camera ["Câmera Besder (Rede Local)"]
        RTSP["Servidor RTSP (Porta 554)<br>H.264 1080p + G.711A Audio"]
        ONVIF["Servidor ONVIF (Porta 8899)<br>PTZ, Snapshots & Device Info"]
        HTTP["Servidor HTTP (Porta 80)<br>Snapshots Rápidos"]
    end

    subgraph CamVisulCore ["CamVisul Backend (Computador Local)"]
        Server["Node.js Express Server (:3000)<br>API REST & Controlador"]
        Streamer["go2rtc Engine (:1984 / :8554 / :8555)<br>Gateway RTSP -> WebRTC"]
        AuthVal["RTSP Digest Auth Validator"]
        PTZClient["ONVIF SOAP PTZ Controller"]
    end

    subgraph UserInterface ["Interface do Usuário (Navegador Moderno)"]
        Dashboard["Dashboard Moderno & Clean (HTML5 / CSS / Vanilla JS)"]
        WebRTCClient["WebRTC RTCPeerConnection<br>(Vídeo H.264 + Áudio PCM/Opus em Tempo Real)"]
        AudioMeter["Web Audio API<br>Visualizador de Nível de Microfone"]
        PTZPad["Controles D-Pad PTZ"]
    end

    RTSP -->|RTSP Interleaved TCP| Streamer
    Streamer -->|WebRTC PeerConnection (Áudio + Vídeo)| WebRTCClient
    Server -->|Gerencia Processo & Streams| Streamer
    AuthVal -->|Validação de Credenciais| RTSP
    PTZClient -->|Comandos PTZ SOAP| ONVIF
    HTTP -->|Proxy de Capturas JPEG| Server
    Dashboard -->|Controle REST / WebSocket| Server
    WebRTCClient --> AudioMeter
    PTZPad -->|POST /api/ptz| Server
```

---

## 3. Componentes Principais

### 3.1. Núcleo de Streaming (`go2rtc`)
- **Papel:** Engine de streaming de alto desempenho em Go.
- **Funcionamento:**
  - Conecta-se à câmera Besder via RTSP (`rtsp://user:pass@<camera-ip>:554/stream0` para HD ou `/stream1` para SD).
  - Encapsula o fluxo H.264 e converte/negocia o codec de áudio G.711A para entrega via WebRTC.
  - Oferece fallback automático para MSE (Fragmented MP4) e HLS caso necessário.
  - Fornece latência ultrabaixa (~100 a 200 ms), tornando o stream verdadeiramente em "tempo real".

### 3.2. Servidor de Controle Node.js (`server.js`)
- **Papel:** Orquestrador do sistema, API REST e servidor da interface visual.
- **Responsabilidades:**
  - Inicialização e monitoramento do processo `go2rtc`.
  - Validação de login e senha contra o servidor RTSP da câmera antes de registrar os streams.
  - Integração com o protocolo ONVIF (porta 8899) para movimentação PTZ (pan/tilt/zoom).
  - Proxy seguro de snapshots JPEG em alta resolução diretamente da câmera.
  - Servir os arquivos estáticos da interface web em `http://localhost:3000`.

### 3.3. Interface do Usuário (Frontend Clean & Moderno)
- **Papel:** Experiência de visualização elegante, escura (estilo central de monitoramento profissional), rápida e responsiva.
- **Recursos:**
  - Tag `<video>` com playback WebRTC de baixa latência.
  - Controle de áudio nativo (mute/unmute, volume e medidor visual de captação de som).
  - Modal de autenticação acessível construído com a tag nativa `<dialog>`, seguindo as diretrizes modernas do W3C.
  - D-Pad de controle PTZ para câmeras motorizadas Besder.
  - Captura e download instantâneo de fotos/snapshots em arquivo JPEG.
  - Alternância entre Stream Principal (1080p Full HD) e Stream Secundário (Fluido).

---

## 4. Decisões de Design e Justificativas

1. **Por que WebRTC em vez de HLS ou RTMP?**
   - O HLS tradicional introduz de 6 a 15 segundos de latência devido ao buffer de segmentos `.ts`/`.m4s`.
   - O RTMP exige Flash (descontinuado) ou conversão pesada.
   - O WebRTC entrega latência sub-segundo (~100-200ms) com sincronismo perfeito entre áudio e vídeo diretamente na API nativa do navegador (`RTCPeerConnection`).

2. **Por que arquitetura local (sem cloud)?**
   - Conforme especificado pelo usuário: conexão direta ao IP local da câmera.
   - Máxima privacidade: as credenciais e o tráfego de vídeo e áudio nunca saem da rede doméstica.
   - Desempenho máximo: fluxo transmitido com taxa máxima de bits sem engasgos de internet externa.

3. **Por que Node.js + `go2rtc` empacotado?**
   - O usuário precisa de uma aplicação que execute no Mac sem instalar pacotes complexos ou compilar código C++.
   - O binário do `go2rtc` (arm64 nativo) é autossuficiente e pesa apenas 7 MB.
   - O Node.js orquestra todo o ciclo de vida com `npm start` ou `./start.sh` abrindo o navegador com um único clique.
