# Pipeline de Streaming em Tempo Real e Áudio Sincronizado

## 1. O Desafio da Reprodução no Navegador

Câmeras de segurança IP como a Besder emitem vídeo e áudio via conexões RTSP sobre RTP/UDP ou TCP. No entanto, navegadores web não implementam um cliente RTSP nativo por questões históricas de segurança e padrões web.

As abordagens tradicionais para contornar isso possuem desvantagens críticas:
- **HLS (HTTP Live Streaming):** Cria blocos de vídeo (`.ts` ou `.m4s`) gravados em disco ou memória. O atraso mínimo é de 6 a 12 segundos, tornando a visualização incompatível com o conceito de "tempo real".
- **MJPEG (Motion JPEG):** Transmite apenas imagens JPEG em sequência (`multipart/x-mixed-replace`). Não suporta áudio de forma alguma e consome banda excessiva.
- **Transcodificação via FFmpeg para WebSocket:** Consome alta CPU e frequentemente dessincroniza áudio e vídeo com instabilidade de buffers.

---

## 2. A Solução: Pipeline WebRTC

A tecnologia adotada no **CamVisul** é a entrega via **WebRTC** (`RTCPeerConnection`), mediada pela engine ultraleve `go2rtc`:

```
Câmera Besder (RTSP:554)
   │
   │  [Vídeo H.264 + Áudio G.711A (PCMA)]
   ▼
go2rtc Engine (Porta 1984 / 8555)
   │
   │  [Negociação SDP Offer/Answer via REST]
   │  [Envio via WebRTC SRTP/UDP local]
   ▼
Navegador Web (HTML5 <video> com MediaStream)
   ├── Track de Vídeo (H.264 decodificado por aceleração de hardware)
   └── Track de Áudio (Decodificado nativamente e alimentado no Web Audio API)
```

### Vantagens Desta Abordagem:
1. **Latência de ~100 a 200 milissegundos:** Praticamente instantâneo, exatamente como no aplicativo ICSee do celular.
2. **Sincronia Perfeita:** Áudio e vídeo viajam em pacotes RTP com timestamps compartilhados.
3. **Zero Uso de CPU:** O fluxo de vídeo H.264 não é recodificado; o navegador utiliza a placa de vídeo (Apple Silicon GPU no Mac) para decodificação direta por hardware.
4. **Áudio Nativo:** O codec G.711 PCMA da câmera é suportado diretamente no handshake WebRTC da maioria dos navegadores modernos.

---

## 3. Gestão de Políticas de Áudio dos Navegadores

Os navegadores modernos (Chrome, Safari, Firefox, Edge) impõem uma política rígida de **Autoplay de Áudio**: nenhum som pode ser emitido antes de um gesto explícito do usuário (clique, toque ou teclado).

Para contornar essa restrição sem frustrar o usuário:
1. O player inicia o `<video>` com o atributo `muted = true` para garantir que o fluxo de vídeo conecte imediatamente sem ser bloqueado pela política de autoplay.
2. Um badge/botão flutuante estilizado e intuitivo (**"🔊 Clique para Ativar Áudio"**) aparece sobre a imagem da câmera caso o som esteja mutado.
3. Ao clicar, o áudio é desmutado instantaneamente e o volume é restaurado para o nível definido pelo usuário.
4. Uma chave no painel de controle permite ajustar o volume continuamente (0% a 100%) ou mutar a qualquer instante.

---

## 4. Visualizador de Nível de Captação (Audio Meter)

Para garantir ao usuário que o microfone da câmera está captando áudio mesmo durante silêncio ou ruído ambiente, o CamVisul utiliza a **Web Audio API**:

```javascript
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const source = audioCtx.createMediaStreamSource(stream);
const analyser = audioCtx.createAnalyser();
analyser.fftSize = 256;
source.connect(analyser);
```

Um indicador de decibéis em tempo real mostra as ondas sonoras captadas pela câmera, conferindo aspecto profissional de monitoramento.

---

## 5. Estratégias de Recuperação Automática (Resilience)

Se houver oscilação de Wi-Fi entre o computador e a câmera:
- O cliente WebRTC detecta os eventos `connectionstatechange` e `iceconnectionstatechange`.
- Caso o estado passe para `disconnected` ou `failed`, o CamVisul exibe um aviso suave de reconexão e renegocia a oferta WebRTC automaticamente após 3 segundos com backoff exponencial.

---

## 6. Prevenção de Congelamento de Imagem (Anti-Freeze Pipeline)

1. **Resolução Dinâmica de URI via ONVIF (`GetStreamUri`):** O firmware Xiongmai `V5.00.R02` não mantém streaming contínuo sob `/stream0` genérico. O backend consulta o serviço ONVIF Media (`PROFILE_000`) para obter a rota exata com token Unicast (`/user=..._password=..._channel=0_stream=0&protocol=unicast.sdp?real_stream`), garantindo transmissão ininterrupta de milhares de pacotes RTP.
2. **Auto-Descoberta e Contingência de IP:** Caso o roteador alterne o IP da câmera via DHCP, o backend suporta fallback transparente para endereços alternativos configurados.
3. **Guarda de Reatribuição no `pc.ontrack`:** Impede que o track de áudio reatribua `video.srcObject`, o que reinicia o decoder do navegador e congela a imagem no primeiro quadro.
4. **Fontes Múltiplas com Transporte TCP Interleaved:** URLs registradas com `#transport=tcp#backchannel=0`, combinando ONVIF RTSP, formato Xiongmai `.sdp` e protocolo DVRIP (porta 34567).
5. **Watchdog Anti-Congelamento:** Monitor contínuo a cada 1.2s que detecta estagnação de quadros e força play automático.
6. **Alternador WebRTC / MSE:** Botão no painel para alternar entre WebRTC e fMP4 contínuo (`/api/stream.mp4`).
