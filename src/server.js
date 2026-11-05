const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const fs = require('fs');

const { verifyRtspCredentials } = require('./rtsp-auth');
const { getDeviceInformation, getStreamUri, ptzContinuousMove, ptzStop } = require('./onvif-client');
const Go2rtcManager = require('./go2rtc-manager');

// Carregar variáveis de ambiente de .env se existir (sem dependência externa)
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  try {
    const envLines = fs.readFileSync(envFile, 'utf8').split('\n');
    for (const line of envLines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const eqIdx = trimmed.indexOf('=');
        const k = trimmed.slice(0, eqIdx).trim();
        const v = trimmed.slice(eqIdx + 1).trim();
        if (k && process.env[k] === undefined) {
          process.env[k] = v;
        }
      }
    }
  } catch (e) {}
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.text({ type: 'application/sdp' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Gerenciador do motor go2rtc
const go2rtc = new Go2rtcManager();

// Estado da sessão da câmera
let currentSession = {
  connected: false,
  ip: process.env.DEFAULT_CAMERA_IP || '192.168.0.21',
  port: parseInt(process.env.DEFAULT_CAMERA_PORT || '554', 10),
  user: process.env.DEFAULT_CAMERA_USER || 'admin',
  password: '',
  deviceInfo: null,
  activeStream: 'besder_main',
  streamingMode: 'webrtc',
  connectedAt: null
};

/* ==========================================================================
   Hot Reload / Live Reload SSE Endpoint
   ========================================================================== */
let sseClients = [];

app.get('/dev-reload', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.push(res);

  req.on('close', () => {
    sseClients = sseClients.filter((client) => client !== res);
  });
});

// Observador de arquivos da pasta public/ (apenas arquivos estáticos de front)
const publicDir = path.join(__dirname, '..', 'public');
let reloadDebounce = null;

try {
  fs.watch(publicDir, { recursive: true }, (eventType, filename) => {
    if (!filename) return;
    if (reloadDebounce) clearTimeout(reloadDebounce);
    reloadDebounce = setTimeout(() => {
      console.log(`[HotReload] Alteração em public/${filename}. Atualizando navegador...`);
      for (const client of sseClients) {
        try { client.write('data: reload\n\n'); } catch (e) {}
      }
    }, 150);
  });
} catch (e) {}

/**
 * Rota de conexão e autenticação
 */
app.post('/api/connect', async (req, res) => {
  try {
    const {
      ip = process.env.DEFAULT_CAMERA_IP || '192.168.0.23',
      port = process.env.DEFAULT_CAMERA_PORT || 554,
      user = process.env.DEFAULT_CAMERA_USER || 'admin',
      password = '',
      quality = 'main'
    } = req.body;

    let targetIp = ip;
    console.log(`[API] Validando credenciais para ${targetIp}:${port} (usuário: '${user}')...`);

    // 1. Validar as credenciais RTSP contra a câmera
    let authResult = await verifyRtspCredentials(targetIp, Number(port), user, password);

    // Se falhar e houver lista de fallback (DHCP alternou IP)
    if (!authResult.success) {
      const candidates = (process.env.CAMERA_FALLBACK_IPS
        ? process.env.CAMERA_FALLBACK_IPS.split(',')
        : ['192.168.0.23', '192.168.0.21'])
        .map(c => c.trim())
        .filter(c => c && c !== targetIp);

      for (const candidate of candidates) {
        console.log(`[API] Tentando IP alternativo ${candidate}:${port}...`);
        const altResult = await verifyRtspCredentials(candidate, Number(port), user, password);
        if (altResult.success) {
          console.log(`[API] Câmera detectada e autenticada no IP alternativo ${candidate}!`);
          targetIp = candidate;
          authResult = altResult;
          break;
        }
      }
    }

    if (!authResult.success) {
      console.warn(`[API] Falha de autenticação: ${authResult.error}`);
      return res.status(401).json({
        success: false,
        error: authResult.error
      });
    }

    console.log(`[API] Autenticação RTSP confirmada com sucesso em ${targetIp}!`);

    // 2. Garantir que a engine go2rtc está operacional
    if (!go2rtc.isReady) {
      await go2rtc.start();
    }

    // 3. Obter URIs dinâmicas de streaming via ONVIF (GetStreamUri)
    let onvifMainUri = null;
    let onvifSubUri = null;
    try {
      onvifMainUri = await getStreamUri(targetIp, 8899, 'PROFILE_000', user, password);
      onvifSubUri = await getStreamUri(targetIp, 8899, 'PROFILE_001', user, password);
      console.log(`[API] ONVIF URIs obtidas: main=${onvifMainUri}, sub=${onvifSubUri}`);
    } catch (e) {
      console.warn('[API] Falha ao consultar ONVIF GetStreamUri:', e.message);
    }

    const encodedUser = encodeURIComponent(user);
    const encodedPass = encodeURIComponent(password);

    const mainSources = [];
    if (onvifMainUri) {
      mainSources.push(`${onvifMainUri}#transport=tcp#backchannel=0`);
    }
    // Adicionar formato nativo Xiongmai com channel=0
    mainSources.push(`rtsp://${targetIp}:${port}/user=${encodedUser}_password=${encodedPass}_channel=0_stream=0.sdp?real_stream#transport=tcp#backchannel=0`);
    mainSources.push(`rtsp://${encodedUser}:${encodedPass}@${targetIp}:${port}/stream0#transport=tcp#backchannel=0`);
    mainSources.push(`dvrip://${encodedUser}:${encodedPass}@${targetIp}:34567`);

    const subSources = [];
    if (onvifSubUri) {
      subSources.push(`${onvifSubUri}#transport=tcp#backchannel=0`);
    }
    subSources.push(`rtsp://${targetIp}:${port}/user=${encodedUser}_password=${encodedPass}_channel=0_stream=1.sdp?real_stream#transport=tcp#backchannel=0`);
    subSources.push(`rtsp://${encodedUser}:${encodedPass}@${targetIp}:${port}/stream1#transport=tcp#backchannel=0`);
    subSources.push(`dvrip://${encodedUser}:${encodedPass}@${targetIp}:34567?channel=0&subtype=1`);

    await go2rtc.registerStream('besder_main', mainSources);
    await go2rtc.registerStream('besder_sub', subSources);

    // 4. Buscar informações do dispositivo via ONVIF (porta 8899)
    const deviceInfo = await getDeviceInformation(targetIp, 8899, user, password);

    // 5. Atualizar estado da sessão
    currentSession = {
      connected: true,
      ip: targetIp,
      port: Number(port),
      user,
      password,
      deviceInfo,
      activeStream: quality === 'sub' ? 'besder_sub' : 'besder_main',
      streamingMode: 'webrtc',
      connectedAt: new Date().toISOString()
    };

    console.log(`[API] Câmera conectada com sucesso: ${deviceInfo.model} (${deviceInfo.firmwareVersion})`);

    return res.json({
      success: true,
      message: 'Conectado com sucesso!',
      camera: {
        ip: targetIp,
        port: Number(port),
        manufacturer: deviceInfo.manufacturer,
        model: deviceInfo.model,
        firmware: deviceInfo.firmwareVersion,
        serial: deviceInfo.serialNumber,
        videoCodec: 'H.264 (AVC) @ 25 FPS',
        audioCodec: 'G.711 A-law (PCMA) 8kHz',
        resolutionMain: '1920x1080 Full HD',
        resolutionSub: '640x360 SD',
        activeStream: currentSession.activeStream
      }
    });
  } catch (error) {
    console.error('[API] Erro ao conectar:', error);
    return res.status(500).json({
      success: false,
      error: `Erro interno no servidor: ${error.message}`
    });
  }
});

/**
 * Rota WebRTC: Negocia a oferta SDP com o go2rtc com retry automático
 */
app.post('/api/webrtc', async (req, res) => {
  try {
    const streamName = req.query.src || currentSession.activeStream || 'besder_main';
    const offerSdp = typeof req.body === 'string' ? req.body : req.body.sdp;

    if (!offerSdp) {
      return res.status(400).send('Oferta SDP ausente no corpo da requisição');
    }

    if (!currentSession.connected) {
      return res.status(401).send('Câmera não conectada. Conecte-se primeiro via /api/connect');
    }

    let answerSdp;
    try {
      answerSdp = await go2rtc.forwardWebRtcOffer(streamName, offerSdp);
    } catch (firstErr) {
      console.warn(`[WebRTC] Primeira tentativa falhou (${firstErr.message}). Tentando novamente...`);
      await new Promise((r) => setTimeout(r, 600));
      answerSdp = await go2rtc.forwardWebRtcOffer(streamName, offerSdp);
    }

    res.setHeader('Content-Type', 'application/sdp');
    return res.send(answerSdp);
  } catch (error) {
    console.error('[API WebRTC] Erro final:', error.message);
    return res.status(500).send(`Falha na negociação WebRTC: ${error.message}`);
  }
});

/**
 * Rota MSE / Fragmented MP4 (fMP4 stream contínuo)
 */
app.get('/api/stream.mp4', (req, res) => {
  const streamName = req.query.src || currentSession.activeStream || 'besder_main';
  const proxyReq = http.get(`http://127.0.0.1:1984/api/frame.mp4?src=${encodeURIComponent(streamName)}`, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxyReq.on('error', (err) => {
    res.status(502).send(`Erro no stream MP4: ${err.message}`);
  });
});

/**
 * Rota de controle PTZ (Pan / Tilt / Zoom) via ONVIF
 */
app.post('/api/ptz', async (req, res) => {
  try {
    if (!currentSession.connected) {
      return res.status(401).json({ success: false, error: 'Câmera não conectada' });
    }

    const { action = 'stop', pan = 0, tilt = 0, zoom = 0 } = req.body;
    const { ip, user, password } = currentSession;

    if (action === 'move') {
      await ptzContinuousMove(ip, 8899, Number(pan), Number(tilt), Number(zoom), 'PROFILE_000', user, password);
      return res.json({ success: true, action: 'move', pan, tilt, zoom });
    } else {
      await ptzStop(ip, 8899, 'PROFILE_000', user, password);
      return res.json({ success: true, action: 'stop' });
    }
  } catch (error) {
    console.error('[API PTZ] Erro:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Captura instantânea (Snapshot em alta resolução)
 */
app.get('/api/snapshot', (req, res) => {
  if (!currentSession.connected) {
    return res.status(401).json({ error: 'Câmera não conectada' });
  }

  const { ip, user, password } = currentSession;
  const encodedPass = encodeURIComponent(password);
  const snapPath = `/webcapture.jpg?command=snap&channel=0&user=${encodeURIComponent(user)}&password=${encodedPass}`;

  const camReq = http.get(
    {
      hostname: ip,
      port: 80,
      path: snapPath,
      timeout: 4000
    },
    (camRes) => {
      if (camRes.statusCode === 200) {
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Content-Disposition', `inline; filename="besder-snap-${Date.now()}.jpg"`);
        camRes.pipe(res);
      } else {
        http.get(`http://127.0.0.1:1984/api/frame.jpeg?src=besder_main`, (gRes) => {
          res.setHeader('Content-Type', 'image/jpeg');
          gRes.pipe(res);
        }).on('error', () => {
          res.status(502).json({ error: 'Falha ao capturar imagem da câmera' });
        });
      }
    }
  );

  camReq.on('error', () => {
    http.get(`http://127.0.0.1:1984/api/frame.jpeg?src=besder_main`, (gRes) => {
      res.setHeader('Content-Type', 'image/jpeg');
      gRes.pipe(res);
    }).on('error', (err) => {
      res.status(502).json({ error: `Erro ao obter snapshot: ${err.message}` });
    });
  });
});

/**
 * Rota de status do sistema
 */
app.get('/api/status', (req, res) => {
  res.json({
    connected: currentSession.connected,
    session: currentSession.connected
      ? {
          ip: currentSession.ip,
          port: currentSession.port,
          user: currentSession.user,
          deviceInfo: currentSession.deviceInfo,
          activeStream: currentSession.activeStream,
          streamingMode: currentSession.streamingMode,
          connectedAt: currentSession.connectedAt
        }
      : null
  });
});

/**
 * Rota de desconexão
 */
app.post('/api/disconnect', (req, res) => {
  currentSession.connected = false;
  currentSession.password = '';
  res.json({ success: true, message: 'Desconectado com sucesso' });
});

// Inicialização graciosa
async function startServer() {
  try {
    await go2rtc.start();
    const server = app.listen(PORT, () => {
      console.log(`\n======================================================`);
      console.log(`🚀 CamVisul rodando com sucesso!`);
      console.log(`👉 Acesse no seu navegador: http://localhost:${PORT}`);
      console.log(`📹 CamVisul pronto para conectar na rede local`);
      console.log(`⚡ Hot Reload Ativo (Node --watch-path=./src)`);
      console.log(`======================================================\n`);
    });

    const shutdown = (isExit = false) => {
      console.log('\nFinalizando servidor CamVisul...');

      // Fecha conexões SSE para que o server.close() não fique travado
      for (const client of sseClients) {
        try { client.end(); } catch (e) {}
      }
      sseClients = [];

      // Apenas encerra go2rtc se for interrupção manual do usuário (Ctrl+C)
      if (isExit) {
        go2rtc.stop();
      }

      if (typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
      }

      server.close(() => {
        process.exit(0);
      });

      // Garante saída rápida em caso de socket pendente
      setTimeout(() => process.exit(0), 400);
    };

    // SIGINT (Ctrl+C do usuário): desliga tudo incluindo go2rtc
    process.on('SIGINT', () => shutdown(true));

    // SIGTERM (recarregamento do node --watch): recarrega apenas o Node, mantendo go2rtc vivo
    process.on('SIGTERM', () => shutdown(false));
  } catch (err) {
    console.error('Falha ao iniciar servidor:', err);
    process.exit(1);
  }
}

startServer();
