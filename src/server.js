const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const fs = require('fs');

const { verifyRtspCredentials } = require('./rtsp-auth');
const { getDeviceInformation, getStreamUri, ptzContinuousMove, ptzStop } = require('./onvif-client');
const Go2rtcManager = require('./go2rtc-manager');
const {
  getAllCameras,
  getCameraById,
  createCamera,
  updateCamera,
  deleteCamera,
  updateCameraFingerprint,
  updateCameraIp,
  findCameraByFingerprint,
  migrateLegacyEnvIfEmpty
} = require('./db');
const { CAMERA_PRESETS, getPreset } = require('./camera-presets');
const { discoverLocalCameras } = require('./discovery');

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
const INITIAL_PORT = parseInt(process.env.PORT || '3000', 10);
const portFilePath = path.join(__dirname, '..', '.port');

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
 * Atualiza o fingerprint de hardware (Serial/MAC) de uma câmera em segundo plano
 */
async function refreshCameraFingerprint(cam) {
  try {
    if (cam.serial_number && cam.mac_address) return;
    const onvifPort = cam.onvif_port || (cam.brand === 'besder' ? 8899 : 80);
    const info = await getDeviceInformation(cam.ip, onvifPort, cam.username, cam.password);
    if (info && (info.serialNumber || info.hardwareId)) {
      updateCameraFingerprint(cam.id, {
        serial_number: info.serialNumber || info.hardwareId
      });
      console.log(`[Fingerprint] Câmera ${cam.id} (${cam.name}) vinculada ao Serial: ${info.serialNumber || info.hardwareId}`);
    }
  } catch (err) {
    // Silencioso se câmera estiver inacessível no momento
  }
}

/**
 * Sincroniza todas as câmeras cadastradas no SQLite com o go2rtc
 */
async function syncAllCamerasWithGo2rtc() {
  try {
    if (!go2rtc.isReady) {
      await go2rtc.start();
    }
    const cameras = getAllCameras({ includeDecryptedPassword: true });
    for (const cam of cameras) {
      try {
        await go2rtc.registerCameraStreams(cam);
        refreshCameraFingerprint(cam).catch(() => {});
      } catch (err) {
        console.warn(`[go2rtc] Não foi possível registrar streams da câmera ${cam.id} (${cam.name}):`, err.message);
      }
    }
    console.log(`[go2rtc] Sincronização concluída: ${cameras.length} câmera(s) no banco.`);
  } catch (err) {
    console.error('[go2rtc] Erro ao sincronizar câmeras:', err.message);
  }
}

let lastAutoHealingRunTime = 0;
const AUTO_HEALING_COOLDOWN_MS = 25000;
let isAutoHealingInProgress = false;

/**
 * Tenta localizar câmeras cadastradas cujo IP tenha mudado na rede local (Auto-Healing)
 */
async function autoHealCameras(targetCameraId = null) {
  const now = Date.now();
  if (isAutoHealingInProgress) {
    return { success: false, reason: 'Em andamento' };
  }
  if (now - lastAutoHealingRunTime < AUTO_HEALING_COOLDOWN_MS) {
    return { success: false, reason: 'Cooldown ativo' };
  }

  isAutoHealingInProgress = true;
  lastAutoHealingRunTime = now;

  try {
    const allCams = getAllCameras({ includeDecryptedPassword: true });
    if (!allCams || allCams.length === 0) {
      return { success: false, reason: 'Sem câmeras cadastradas' };
    }

    console.log('[Auto-Healing] Disparando varredura UDP para verificar IPs de câmeras...');
    const discovered = await discoverLocalCameras({ timeoutMs: 1800 });

    if (!discovered || discovered.length === 0) {
      console.log('[Auto-Healing] Nenhuma câmera respondeu às sondas no momento.');
      return { success: true, updated: [] };
    }

    const updatedCameras = [];

    for (const cam of allCams) {
      if (targetCameraId && cam.id !== Number(targetCameraId)) {
        continue;
      }

      // Procura correspondência na lista de descobertas por MAC ou Serial
      const match = discovered.find((d) => {
        const macMatch = d.mac_address && cam.mac_address &&
          d.mac_address.toLowerCase() === cam.mac_address.toLowerCase();
        const allMacMatch = d.all_macs && cam.mac_address &&
          d.all_macs.some(m => m.toLowerCase() === cam.mac_address.toLowerCase());
        const serialMatch = d.serial_number && cam.serial_number &&
          d.serial_number === cam.serial_number;
        return macMatch || allMacMatch || serialMatch;
      });

      if (match) {
        // Atualiza fingerprint no SQLite caso faltasse MAC ou Serial
        if (!cam.mac_address && match.mac_address) {
          updateCameraFingerprint(cam.id, { mac_address: match.mac_address });
        }
        if (!cam.serial_number && match.serial_number) {
          updateCameraFingerprint(cam.id, { serial_number: match.serial_number });
        }

        if (match.ip && match.ip !== cam.ip) {
          console.log(`[Auto-Healing] ⚡ IP da Câmera ${cam.id} (${cam.name}) mudou de ${cam.ip} para ${match.ip}! Atualizando silenciosamente...`);

          // 1. Atualiza no SQLite
          updateCameraIp(cam.id, match.ip);

          // 2. Atualiza os streams no go2rtc dinamicamente
          const updatedCam = getCameraById(cam.id, { includeDecryptedPassword: true });
          if (go2rtc.isReady) {
            await go2rtc.registerCameraStreams(updatedCam);
          }

          updatedCameras.push({
            id: cam.id,
            name: cam.name,
            oldIp: cam.ip,
            newIp: match.ip
          });
        }
      }
    }

    return { success: true, updated: updatedCameras };
  } catch (err) {
    console.error('[Auto-Healing] Erro durante auto-healing:', err.message);
    return { success: false, error: err.message };
  } finally {
    isAutoHealingInProgress = false;
  }
}

/* ==========================================================================
   Rotas RESTful de Gerenciamento de Câmeras (VMS Multi-Câmeras)
   ========================================================================== */

/**
 * Retorna os presets de marcas de câmeras disponíveis
 */
app.get('/api/presets', (req, res) => {
  res.json({
    success: true,
    presets: Object.values(CAMERA_PRESETS).map((p) => ({
      brand: p.brand,
      label: p.label,
      defaultRtspPort: p.defaultRtspPort,
      defaultOnvifPort: p.defaultOnvifPort,
      hasPtz: p.hasPtz
    }))
  });
});

/**
 * Varre a rede local e descobre câmeras IP (ONVIF WS-Discovery e Xiongmai NetIP)
 */
app.get('/api/discovery', async (req, res) => {
  try {
    const timeoutMs = parseInt(req.query.timeout, 10) || 2000;
    const discovered = await discoverLocalCameras({ timeoutMs });

    // Enriquecer com status indicando se a câmera já está cadastrada
    const existingCameras = getAllCameras();
    const enriched = discovered.map((d) => {
      const isAlreadyAdded = existingCameras.some((c) =>
        (d.mac_address && c.mac_address && c.mac_address.toLowerCase() === d.mac_address.toLowerCase()) ||
        (d.all_macs && c.mac_address && d.all_macs.some(m => m.toLowerCase() === c.mac_address.toLowerCase())) ||
        (d.serial_number && c.serial_number && c.serial_number === d.serial_number) ||
        (c.ip === d.ip)
      );
      return {
        ...d,
        alreadyAdded: isAlreadyAdded
      };
    });

    res.json({
      success: true,
      total: enriched.length,
      cameras: enriched
    });
  } catch (err) {
    console.error('[API Discovery] Erro na varredura:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Lista todas as câmeras cadastradas no banco SQLite
 */
app.get('/api/cameras', (req, res) => {
  try {
    const cameras = getAllCameras();
    res.json({ success: true, cameras });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Retorna uma câmera específica
 */
app.get('/api/cameras/:id', (req, res) => {
  try {
    const cam = getCameraById(req.params.id);
    if (!cam) {
      return res.status(404).json({ success: false, error: 'Câmera não encontrada' });
    }
    res.json({ success: true, camera: cam });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Testa conectividade e autenticação RTSP antes de salvar
 */
app.post('/api/cameras/test', async (req, res) => {
  try {
    const { id, ip, rtsp_port = 554, username = 'admin', password = '' } = req.body;
    if (!ip) {
      return res.status(400).json({ success: false, error: 'Endereço IP é obrigatório.' });
    }

    let effectivePassword = password;
    if (!effectivePassword && id) {
      const existing = getCameraById(id, { includeDecryptedPassword: true });
      if (existing && existing.password) {
        effectivePassword = existing.password;
      }
    }

    const authResult = await verifyRtspCredentials(ip, Number(rtsp_port), username, effectivePassword);
    if (!authResult.success) {
      return res.status(401).json({ success: false, error: authResult.error || 'Falha na autenticação RTSP' });
    }

    res.json({ success: true, message: 'Conexão e autenticação RTSP validadas com sucesso!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Cadastra uma nova câmera no SQLite e registra seus streams no go2rtc
 */
app.post('/api/cameras', async (req, res) => {
  try {
    const {
      name,
      brand = 'generic',
      ip,
      rtsp_port = 554,
      onvif_port,
      username = 'admin',
      password = '',
      channel = 0,
      main_stream_uri = '',
      sub_stream_uri = '',
      has_ptz = 1
    } = req.body;

    if (!name || !ip) {
      return res.status(400).json({ success: false, error: 'Nome e IP são obrigatórios.' });
    }

    const newCam = createCamera({
      name,
      brand,
      ip,
      rtsp_port,
      onvif_port,
      username,
      password,
      channel,
      main_stream_uri,
      sub_stream_uri,
      has_ptz
    });

    // Registra imediatamente no go2rtc
    try {
      if (!go2rtc.isReady) await go2rtc.start();
      const camWithPass = getCameraById(newCam.id, { includeDecryptedPassword: true });
      await go2rtc.registerCameraStreams(camWithPass);
    } catch (regErr) {
      console.warn(`[API] Câmera salva, aviso ao registrar streams: ${regErr.message}`);
    }

    res.status(201).json({ success: true, camera: newCam });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Atualiza os dados de uma câmera existente
 */
app.put('/api/cameras/:id', async (req, res) => {
  try {
    const updated = updateCamera(req.params.id, req.body);

    try {
      if (!go2rtc.isReady) await go2rtc.start();
      const camWithPass = getCameraById(updated.id, { includeDecryptedPassword: true });
      await go2rtc.registerCameraStreams(camWithPass);
    } catch (regErr) {
      console.warn(`[API] Câmera atualizada, aviso no go2rtc: ${regErr.message}`);
    }

    res.json({ success: true, camera: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Remove uma câmera do SQLite e desregistra seus streams do go2rtc
 */
app.delete('/api/cameras/:id', async (req, res) => {
  try {
    const id = req.params.id;
    await go2rtc.unregisterCameraStreams(id);
    const deleted = deleteCamera(id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Câmera não encontrada' });
    }
    res.json({ success: true, message: 'Câmera removida com sucesso' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Envia comandos de movimentação PTZ para uma câmera específica
 */
app.post('/api/cameras/:id/ptz', async (req, res) => {
  try {
    const id = req.params.id;
    const cam = getCameraById(id, { includeDecryptedPassword: true });
    if (!cam) {
      return res.status(404).json({ success: false, error: 'Câmera não encontrada' });
    }

    if (!cam.has_ptz) {
      return res.status(400).json({ success: false, error: 'Esta câmera não possui motor/suporte a PTZ' });
    }

    const { action = 'stop', pan = 0, tilt = 0, zoom = 0 } = req.body;
    const onvifPort = cam.onvif_port || (cam.brand === 'besder' ? 8899 : 80);

    if (action === 'move') {
      await ptzContinuousMove(cam.ip, onvifPort, Number(pan), Number(tilt), Number(zoom), 'PROFILE_000', cam.username, cam.password);
      return res.json({ success: true, action: 'move', cameraId: id });
    } else {
      await ptzStop(cam.ip, onvifPort, 'PROFILE_000', cam.username, cam.password);
      return res.json({ success: true, action: 'stop', cameraId: id });
    }
  } catch (error) {
    console.error(`[API PTZ Câmera ${req.params.id}] Erro:`, error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

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

    // Persiste o fingerprint de hardware na base SQLite se aplicável
    try {
      const allCams = getAllCameras();
      const matchedCam = allCams.find((c) => c.ip === targetIp) || allCams[0];
      if (matchedCam && (deviceInfo.serialNumber || deviceInfo.hardwareId)) {
        updateCameraFingerprint(matchedCam.id, {
          serial_number: deviceInfo.serialNumber || deviceInfo.hardwareId
        });
      }
    } catch (e) {}

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
  const streamName = req.query.src || currentSession.activeStream || 'besder_main';
  try {
    const offerSdp = typeof req.body === 'string' ? req.body : req.body.sdp;

    if (!offerSdp) {
      return res.status(400).send('Oferta SDP ausente no corpo da requisição');
    }

    if (!go2rtc.isReady) {
      await go2rtc.start();
    }

    if (!req.query.src && !currentSession.connected) {
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

    // Se o stream falhar por unreachable host / timeout, dispara auto-healing reativo em background
    if (error.message.includes('host is down') || error.message.includes('timeout') || error.message.includes('operation not permitted')) {
      const matchCamId = String(streamName).match(/^cam_(\d+)_/);
      const camId = matchCamId ? Number(matchCamId[1]) : null;
      autoHealCameras(camId).catch(() => {});
    }

    return res.status(500).send(`Falha na negociação WebRTC: ${error.message}`);
  }
});

/**
 * Força verificação e auto-healing de IPs para câmeras registradas
 */
app.post('/api/cameras/auto-heal', async (req, res) => {
  const { cameraId } = req.body || {};
  const result = await autoHealCameras(cameraId ? Number(cameraId) : null);
  res.json(result);
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

/**
 * Inicia o servidor HTTP tentando a porta inicial configurada.
 * Se a porta estiver em uso (EADDRINUSE), tenta a próxima porta disponível sequencialmente (3001, 3002, ...).
 */
function listenWithPortFallback(app, initialPort, maxAttempts = 50) {
  return new Promise((resolve, reject) => {
    let currentPort = initialPort;
    let initialPortRetried = false;
    let attempts = 0;

    function tryListen() {
      if (attempts >= maxAttempts) {
        return reject(
          new Error(`Nenhuma porta disponível encontrada a partir da porta ${initialPort} após ${maxAttempts} tentativas.`)
        );
      }

      const server = http.createServer(app);

      server.once('listening', () => {
        resolve({ server, port: currentPort });
      });

      server.once('error', (err) => {
        server.removeAllListeners();
        try { server.close(); } catch (e) {}

        if (err.code === 'EADDRINUSE') {
          // Pequena tolerância para reloads rápidos do watch liberarem o socket
          if (currentPort === initialPort && !initialPortRetried) {
            initialPortRetried = true;
            setTimeout(tryListen, 120);
            return;
          }

          console.warn(`⚠️ Porta ${currentPort} já está ocupada. Tentando próxima porta: ${currentPort + 1}...`);
          attempts++;
          currentPort++;
          tryListen();
        } else {
          reject(err);
        }
      });

      server.listen(currentPort);
    }

    tryListen();
  });
}

// Inicialização graciosa
async function startServer() {
  try {
    await go2rtc.start();

    // Auto-migra credenciais legadas se o banco de dados estiver vazio
    try {
      migrateLegacyEnvIfEmpty();
    } catch (e) {
      console.warn('[DB] Aviso na migração inicial:', e.message);
    }

    // Sincroniza câmeras do banco com go2rtc
    await syncAllCamerasWithGo2rtc();

    const { server, port: actualPort } = await listenWithPortFallback(app, INITIAL_PORT);

    // Registra a porta ativa em .port para scripts auxiliares (ex: start.sh)
    try {
      fs.writeFileSync(portFilePath, String(actualPort));
    } catch (e) {}

    console.log(`\n======================================================`);
    console.log(`🚀 CamVisul rodando com sucesso!`);
    console.log(`👉 Acesse no seu navegador: http://localhost:${actualPort}`);
    console.log(`📹 CamVisul pronto para conectar na rede local`);
    console.log(`⚡ Hot Reload Ativo (Node --watch-path=./src)`);
    console.log(`======================================================\n`);

    // Timer de health-check e auto-healing periódico a cada 60s
    const healingInterval = setInterval(() => {
      try {
        const cams = getAllCameras();
        if (cams.length > 0) {
          autoHealCameras().catch(() => {});
        }
      } catch (e) {}
    }, 60000);

    const shutdown = (isExit = false) => {
      console.log('\nFinalizando servidor CamVisul...');
      clearInterval(healingInterval);

      // Limpa arquivo de porta ativa
      try {
        if (fs.existsSync(portFilePath)) fs.unlinkSync(portFilePath);
      } catch (e) {}

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
