# Protocolos e Hardware da Câmera Besder

## 1. Identificação do Hardware e Firmware

Através de inspeção de rede e consulta ao serviço ONVIF na porta 8899, identificamos os dados exatos do hardware da câmera:

- **Fabricante / Arquitetura:** Xiongmai SoC (XM530)
- **Modelo:** `XM530`
- **Firmware:** `V5.00..ONVIF 16.12`
- **Número de Série:** `<serial-da-camera>`
- **Endereço IP:** IP local na rede (ex: `192.168.1.100`)
- **Aplicativo Oficial:** ICSee / ICSee Pro / XMEye

---

## 2. Varredura de Portas e Serviços Disponíveis

A auditoria de conexões TCP na câmera revelou quatro serviços fundamentais ativos:

| Porta | Protocolo / Serviço | Função | Status / Observações |
|---|---|---|---|
| **80** | HTTP / Web Server | Interface NETSurveillance (Legada) & Snapshots | Requer ActiveX OCX para vídeo; porém responde a `/webcapture.jpg` para snapshots instantâneos. |
| **554** | RTSP (Real Time Streaming Protocol) | Stream de Vídeo e Áudio em Tempo Real | Servidor `H264DVR 1.0`. Suporta Digest Authentication. É a principal fonte de mídia. |
| **8899** | ONVIF 16.12 (SOAP Media/Device/PTZ) | Gestão de perfis, PTZ e capacidades | Fornece tokens de profile (`PROFILE_000`), PTZ, range de eixos e URLs de stream. |
| **34567** | Xiongmai NetIP / Sofia Protocol | Protocolo proprietário do app ICSee | Utilizado pelo app móvel ICSee para nuvem e visualização local. |

---

## 3. Especificações das Faixas de Mídia (Codecs)

De acordo com o descritor SDP (`DESCRIBE`) retornado pelo servidor RTSP da câmera Besder:

### Vídeo
- **Codec:** H.264 (AVC) / Baseline / Main Profile
- **Resolução Principal (Main Stream / stream0):** `1920x1080` (Full HD)
- **Taxa de Quadros:** 25 FPS
- **Taxa de Bits (Bitrate):** 2560 kbps
- **Resolução Secundária (Sub Stream / stream1):** `640x360` ou `800x448`
- **RTP Payload Type:** 96 (Dinâmico H264/90000)

### Áudio
- **Codec:** G.711 A-law (PCMA)
- **Frequência de Amostragem:** 8.000 Hz (8 kHz)
- **Canais:** 1 (Mono)
- **Taxa de Bits:** 64 a 128 kbps
- **RTP Payload Type:** 8 (Estático PCMA/8000)

> [!IMPORTANT]
> O áudio nativo da câmera é codificado em **G.711 A-law**. Navegadores modernos não decodificam G.711 em tags `<video>` HTML5 com fMP4 diretamente sem auxílio. Contudo, **o WebRTC suporta PCMA nativamente** na especificação SDP RFC 3551, permitindo que a engine `go2rtc` negocie o track de áudio perfeitamente sem necessidade de transcodificação pesada no computador.

---

## 4. Estrutura das URLs RTSP e Autenticação

A câmera Besder aceita dois padrões de URL RTSP na porta 554:

### Padrão 1 (RFC 2326 Standard):
- **Stream HD (1080p):** `rtsp://<usuario>:<senha>@<ip-camera>:554/stream0`
- **Stream SD (Fluido):** `rtsp://<usuario>:<senha>@<ip-camera>:554/stream1`

### Padrão 2 (Xiongmai Query Format):
- **Stream HD:** `rtsp://<ip-camera>:554/user=<usuario>_password=<senha>_channel=0_stream=0&protocol=unicast.sdp`

Ambos os padrões exigem autenticação do tipo **Digest Authentication** com usuário (geralmente `admin`) e a senha definida pelo usuário na configuração inicial pelo aplicativo ICSee.
