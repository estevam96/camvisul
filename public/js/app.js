/**
 * CamVisul - Core Application Client
 * Real-time WebRTC Streaming, Audio Controls, PTZ & UI Management
 */

(function () {
  'use strict';

  // Chaves de armazenamento local
  const STORAGE_KEY_AUTH = 'camvisul_credentials';

  // Elementos do DOM
  const elements = {
    // Header
    statusDot: document.getElementById('header-status-dot'),
    camModel: document.getElementById('header-cam-model'),
    camIp: document.getElementById('header-cam-ip'),
    liveClock: document.getElementById('live-clock'),
    qualityPill: document.getElementById('stream-quality-pill'),
    btnOpenSettings: document.getElementById('btn-open-settings'),
    btnDisconnect: document.getElementById('btn-disconnect'),

    // Layout e Grid VMS
    btnLayout1x1: document.getElementById('btn-layout-1x1'),
    btnLayout2x2: document.getElementById('btn-layout-2x2'),
    btnLayout3x3: document.getElementById('btn-layout-3x3'),
    vmsGridViewport: document.getElementById('vms-grid-viewport'),
    btnAddCamera: document.getElementById('btn-add-camera'),
    cameraItemsList: document.getElementById('camera-items-list'),
    badgeTotalCameras: document.getElementById('badge-total-cameras'),
    ptzActiveTargetLabel: document.getElementById('ptz-active-target-label'),

    // Viewport de Vídeo (Foco 1x1)
    videoCardContainer: document.getElementById('video-card-container'),
    videoPlayer: document.getElementById('video-player'),
    videoLoadingState: document.getElementById('video-loading-state'),
    loadingStateText: document.getElementById('loading-state-text'),
    audioUnmuteBanner: document.getElementById('audio-unmute-banner'),

    // Controles de Vídeo
    ctrlPlayPause: document.getElementById('ctrl-play-pause'),
    iconPause: document.getElementById('icon-pause'),
    iconPlay: document.getElementById('icon-play'),
    btnStreamHd: document.getElementById('btn-stream-hd'),
    btnStreamSd: document.getElementById('btn-stream-sd'),
    ctrlAudioToggle: document.getElementById('ctrl-audio-toggle'),
    iconAudioOn: document.getElementById('icon-audio-on'),
    iconAudioOff: document.getElementById('icon-audio-off'),
    volumeSlider: document.getElementById('volume-slider'),
    ctrlSnapshot: document.getElementById('ctrl-snapshot'),
    ctrlPip: document.getElementById('ctrl-pip'),
    ctrlFullscreen: document.getElementById('ctrl-fullscreen'),
    iconFsEnter: document.getElementById('icon-fs-enter'),
    iconFsExit: document.getElementById('icon-fs-exit'),

    // PTZ
    ptzButtons: document.querySelectorAll('.ptz-dpad .ptz-btn:not(#ptz-stop-btn)'),
    ptzStopBtn: document.getElementById('ptz-stop-btn'),
    ptzZoomButtons: document.querySelectorAll('.ptz-zoom-btn'),

    // Diagnósticos e Galeria
    diagIp: document.getElementById('diag-ip'),
    diagModel: document.getElementById('diag-model'),
    diagFw: document.getElementById('diag-fw'),
    badgeConnStatus: document.getElementById('badge-conn-status'),
    galleryContainer: document.getElementById('gallery-container'),
    snapshotCountBadge: document.getElementById('snapshot-count-badge'),

    // Modal de Login
    loginDialog: document.getElementById('login-dialog'),
    loginForm: document.getElementById('login-form'),
    dialogCloseBtn: document.getElementById('dialog-close-btn'),
    inputIp: document.getElementById('input-ip'),
    inputPort: document.getElementById('input-port'),
    inputUser: document.getElementById('input-user'),
    inputPass: document.getElementById('input-pass'),
    btnTogglePass: document.getElementById('btn-toggle-pass'),
    iconEyeShow: document.getElementById('icon-eye-show'),
    iconEyeHide: document.getElementById('icon-eye-hide'),
    selectQuality: document.getElementById('select-quality'),
    checkboxRemember: document.getElementById('checkbox-remember'),
    formFeedback: document.getElementById('form-feedback'),
    btnSubmitLogin: document.getElementById('btn-submit-login'),
    btnSpinner: document.getElementById('btn-spinner'),
    btnSubmitText: document.getElementById('btn-submit-text'),

    // Modal de Cadastro/Edição de Câmeras
    cameraDialog: document.getElementById('camera-dialog'),
    camDialogTitle: document.getElementById('cam-dialog-title'),
    cameraForm: document.getElementById('camera-form'),
    camDialogCloseBtn: document.getElementById('cam-dialog-close-btn'),
    camInputId: document.getElementById('cam-input-id'),
    camInputName: document.getElementById('cam-input-name'),
    camSelectBrand: document.getElementById('cam-select-brand'),
    camInputIp: document.getElementById('cam-input-ip'),
    camInputRtspPort: document.getElementById('cam-input-rtsp-port'),
    camInputOnvifPort: document.getElementById('cam-input-onvif-port'),
    camInputUser: document.getElementById('cam-input-user'),
    camInputPass: document.getElementById('cam-input-pass'),
    btnToggleCamPass: document.getElementById('btn-toggle-cam-pass'),
    camIconEyeShow: document.getElementById('cam-icon-eye-show'),
    camIconEyeHide: document.getElementById('cam-icon-eye-hide'),
    camPassHint: document.getElementById('cam-pass-hint'),
    camCheckboxPtz: document.getElementById('cam-checkbox-ptz'),
    camFormFeedback: document.getElementById('cam-form-feedback'),
    btnTestCamera: document.getElementById('btn-test-camera'),
    btnTestSpinner: document.getElementById('btn-test-spinner'),
    btnTestText: document.getElementById('btn-test-text'),
    btnSaveCamera: document.getElementById('btn-save-camera'),
    btnSaveSpinner: document.getElementById('btn-save-spinner'),
    btnSaveText: document.getElementById('btn-save-text')
  };

  // Preset default ports
  const BRAND_PRESET_PORTS = {
    besder: { rtsp: 554, onvif: 8899, ptz: true },
    intelbras: { rtsp: 554, onvif: 80, ptz: true },
    dahua: { rtsp: 554, onvif: 80, ptz: true },
    hikvision: { rtsp: 554, onvif: 8000, ptz: true },
    tapo: { rtsp: 554, onvif: 2020, ptz: true },
    generic: { rtsp: 554, onvif: 80, ptz: false }
  };

  // Instância do medidor de áudio
  const audioMeter = new CameraAudioMeter('audio-meter-fill');

  // Estado da Aplicação
  const state = {
    connected: false,
    activeStream: 'besder_main', // 'besder_main', 'besder_sub' ou 'cam_X_main'
    peerConnection: null,
    currentMediaStream: null,
    isMuted: true,
    volume: 0.8,
    snapshots: [],
    ptzMoving: false,
    latencyStartTime: 0,
    retryCount: 0,

    // Estado Multi-Câmeras VMS
    cameras: [],
    currentLayout: '1x1', // '1x1', '2x2', '3x3'
    selectedCameraId: null,
    gridPeerConnections: new Map(), // cameraId -> RTCPeerConnection
    gridMediaStreams: new Map(),
    activeAudioCameraId: null
  };

  /* ==========================================================================
     1. Relógio em Tempo Real
     ========================================================================== */
  function startLiveClock() {
    function updateClock() {
      const now = new Date();
      elements.liveClock.textContent = now.toLocaleTimeString('pt-BR', { hour12: false });
    }
    updateClock();
    setInterval(updateClock, 1000);
  }

  /* ==========================================================================
     2. Gerenciamento do Modal de Configuração & Credenciais
     ========================================================================== */
  function openLoginModal() {
    const cam = state.cameras.find((c) => c.id === state.selectedCameraId) || state.cameras[0] || null;
    openCameraModal(cam);
  }

  function closeLoginModal() {
    closeCameraModal();
  }

  function getSavedCredentials() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_AUTH);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return null;
  }

  function saveCredentials(creds) {
    try {
      localStorage.setItem(STORAGE_KEY_AUTH, JSON.stringify(creds));
    } catch (e) {}
  }

  function clearCredentials() {
    try {
      localStorage.removeItem(STORAGE_KEY_AUTH);
    } catch (e) {}
  }

  /* ==========================================================================
     3. Conexão com o Backend & Câmera
     ========================================================================== */
  async function connectCamera(credentials) {
    const targetLabel = credentials.ip ? ` (${credentials.ip})` : '';
    setLoadingState(true, `Autenticando na câmera Besder${targetLabel}...`);

    try {
      const response = await fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials)
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Falha ao autenticar na câmera');
      }

      state.connected = true;
      state.activeStream = credentials.quality === 'sub' ? 'besder_sub' : 'besder_main';
      state.retryCount = 0;

      // Atualiza diagnósticos na UI
      updateCameraDiagnostics(data.camera);

      // Fecha o modal de login
      closeLoginModal();

      // Inicia o pipeline de vídeo e áudio em tempo real
      await startWebRtcStream(state.activeStream);

      // Atualiza badges
      if (elements.statusDot) elements.statusDot.style.backgroundColor = 'var(--accent-green)';
      if (elements.badgeConnStatus) {
        elements.badgeConnStatus.textContent = 'Online';
        elements.badgeConnStatus.className = 'badge badge-success';
      }

      // Sincroniza a lista de câmeras no VMS
      await loadCameras();

    } catch (error) {
      console.error('[App] Erro na conexão:', error);
      setLoadingState(true, `Erro: ${error.message}`);
      showFormFeedback(error.message, 'error');
      openLoginModal();
    }
  }

  function updateCameraDiagnostics(cam) {
    if (!cam) return;
    if (elements.camModel) elements.camModel.textContent = cam.model || 'Besder XM530';
    if (elements.camIp) elements.camIp.textContent = `${cam.ip}:${cam.port}`;
    if (elements.diagIp) elements.diagIp.textContent = `${cam.ip}:${cam.port}`;
    if (elements.diagModel) elements.diagModel.textContent = `${cam.manufacturer} (${cam.model})`;
    if (elements.diagFw) elements.diagFw.textContent = cam.firmware || 'V5.00';
    updateQualityUi();
  }

  /* ==========================================================================
     4. Pipeline de Streaming WebRTC com Fallback MSE
     ========================================================================== */
  async function startWebRtcStream(streamName) {
    setLoadingState(true, 'Abrindo stream de vídeo e áudio em tempo real...');
    state.latencyStartTime = performance.now();

    // Limpa conexões prévias
    stopWebRtcStream();

    try {
      const pc = new RTCPeerConnection({
        iceServers: []
      });
      state.peerConnection = pc;

      // Solicita faixas de vídeo e áudio da câmera
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });

      // Quando receber o track de áudio ou vídeo da câmera
      pc.ontrack = (event) => {
        console.log('[WebRTC] Mídia recebida da câmera:', event.track.kind);
        const stream = event.streams[0] || new MediaStream([event.track]);
        state.currentMediaStream = stream;

        // CRÍTICO: Previne que reatribuir srcObject no segundo track congele o vídeo
        if (elements.videoPlayer.srcObject !== stream) {
          elements.videoPlayer.srcObject = stream;
        }

        elements.videoPlayer.play().catch(() => {});

        // Conecta o track de áudio ao medidor visual (VU meter)
        if (event.track.kind === 'audio') {
          audioMeter.start(stream);
        }

        // Quando o track de vídeo ou áudio desmutar, garante reprodução contínua
        event.track.onunmute = () => {
          elements.videoPlayer.play().catch(() => {});
        };

        setLoadingState(false);
        checkAudioPlaybackState();
      };

      // Watchdog de evento no elemento de vídeo
      elements.videoPlayer.onpause = () => {
        if (state.connected && !state.userPaused) {
          elements.videoPlayer.play().catch(() => {});
        }
      };

      elements.videoPlayer.onstalled = () => {
        console.warn('[Video] Fluxo estagnado, tentando reativar reprodução...');
        elements.videoPlayer.play().catch(() => {});
      };

      pc.onconnectionstatechange = () => {
        console.log('[WebRTC] Estado da conexão:', pc.connectionState);
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
          if (state.connected) {
            handleConnectionDrop(streamName);
          }
        }
      };

      // 1. Gera a oferta WebRTC local
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // 2. Envia para o backend (que conecta via RTSP TCP à câmera)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 22000);

      const response = await fetch(`/api/webrtc?src=${encodeURIComponent(streamName)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: offer.sdp,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Falha na negociação WebRTC');
      }

      // 3. Aplica a resposta SDP
      const answerSdp = await response.text();
      await pc.setRemoteDescription({
        type: 'answer',
        sdp: answerSdp
      });

      console.log('[WebRTC] Conexão estabelecida com sucesso!');
    } catch (error) {
      console.error('[WebRTC] Falha na conexão WebRTC:', error.message);
      handleConnectionDrop(streamName);
    }
  }

  let reconnectTimeoutId = null;

  /* ==========================================================================
     Watchdog Anti-Congelamento (Anti-Freeze Watchdog)
     ========================================================================== */
  function startAntiFreezeWatchdog() {
    let lastTime = -1;
    let staleCount = 0;

    setInterval(() => {
      // O watchdog monitora estritamente o player no modo Foco 1x1
      if (state.currentLayout !== '1x1' || !state.connected || !elements.videoPlayer) return;
      if (elements.videoPlayer.paused) {
        if (!state.userPaused) {
          elements.videoPlayer.play().catch(() => {});
        }
        return;
      }

      const cur = elements.videoPlayer.currentTime;
      if (cur > 0 && cur === lastTime) {
        staleCount++;
        if (staleCount >= 3) {
          console.warn('[Watchdog] Imagem estática detectada. Descongelando player...');
          elements.videoPlayer.play().catch(() => {});
          staleCount = 0;
        }
      } else {
        lastTime = cur;
        staleCount = 0;
      }
    }, 1200);
  }

  function handleConnectionDrop(streamName) {
    // NUNCA disparar reconexão do stream principal se o usuário estiver navegando em grade (2x2 ou 3x3)
    if (state.currentLayout !== '1x1' || !state.connected) return;

    state.retryCount++;
    if (state.retryCount <= 3) {
      setLoadingState(true, `Reconectando à câmera (tentativa ${state.retryCount}/3)...`);
      if (reconnectTimeoutId) clearTimeout(reconnectTimeoutId);
      reconnectTimeoutId = setTimeout(() => {
        if (state.connected && state.currentLayout === '1x1') {
          startWebRtcStream(streamName);
        }
      }, 2500);
    } else {
      setLoadingState(true, 'Conexão instável. Clique em Configuração para reiniciar.');
    }
  }

  function stopWebRtcStream() {
    if (reconnectTimeoutId) {
      clearTimeout(reconnectTimeoutId);
      reconnectTimeoutId = null;
    }
    audioMeter.stop();
    if (state.peerConnection) {
      state.peerConnection.onconnectionstatechange = null;
      state.peerConnection.oniceconnectionstatechange = null;
      state.peerConnection.ontrack = null;
      try {
        state.peerConnection.close();
      } catch (e) {}
      state.peerConnection = null;
    }
    if (elements.videoPlayer) {
      elements.videoPlayer.onpause = null;
      elements.videoPlayer.onstalled = null;
      if (elements.videoPlayer.srcObject) {
        elements.videoPlayer.srcObject = null;
      }
      if (elements.videoPlayer.src) {
        elements.videoPlayer.removeAttribute('src');
        elements.videoPlayer.load();
      }
    }
  }

  function setLoadingState(isLoading, message = '') {
    if (isLoading) {
      elements.videoLoadingState.classList.remove('hidden');
      if (message) elements.loadingStateText.textContent = message;
    } else {
      elements.videoLoadingState.classList.add('hidden');
    }
  }

  /* ==========================================================================
     5. Gerenciamento de Áudio & Autoplay
     ========================================================================== */
  function checkAudioPlaybackState() {
    if (elements.videoPlayer.muted) {
      elements.audioUnmuteBanner.classList.remove('hidden');
      elements.iconAudioOn.classList.add('hidden');
      elements.iconAudioOff.classList.remove('hidden');
    } else {
      elements.audioUnmuteBanner.classList.add('hidden');
      elements.iconAudioOn.classList.remove('hidden');
      elements.iconAudioOff.classList.add('hidden');
    }
  }

  function unmuteAudio() {
    elements.videoPlayer.muted = false;
    elements.videoPlayer.volume = state.volume;
    state.isMuted = false;
    elements.audioUnmuteBanner.classList.add('hidden');
    elements.iconAudioOn.classList.remove('hidden');
    elements.iconAudioOff.classList.add('hidden');

    if (audioMeter.audioContext && audioMeter.audioContext.state === 'suspended') {
      audioMeter.audioContext.resume();
    }
  }

  function toggleMute() {
    if (elements.videoPlayer.muted) {
      unmuteAudio();
    } else {
      elements.videoPlayer.muted = true;
      state.isMuted = true;
      elements.iconAudioOn.classList.add('hidden');
      elements.iconAudioOff.classList.remove('hidden');
    }
  }

  /* ==========================================================================
     6. Alternância de Qualidade (HD / SD)
     ========================================================================== */
  async function switchStreamQuality(quality) {
    if (!state.connected) return;
    const streamName = quality === 'sub' ? 'besder_sub' : 'besder_main';
    if (state.activeStream === streamName) return;

    state.activeStream = streamName;
    updateQualityUi();
    await startWebRtcStream(state.activeStream);
  }

  function updateQualityUi() {
    const isHd = state.activeStream === 'besder_main';
    elements.btnStreamHd.classList.toggle('active', isHd);
    elements.btnStreamSd.classList.toggle('active', !isHd);
    elements.qualityPill.textContent = isHd ? '1080p Full HD' : 'SD Fluido';
  }

  /* ==========================================================================
     7. Controle PTZ (Pan / Tilt / Zoom)
     ========================================================================== */
  async function sendPtzCommand(action, pan = 0, tilt = 0, zoom = 0) {
    try {
      const url = state.selectedCameraId
        ? `/api/cameras/${state.selectedCameraId}/ptz`
        : '/api/ptz';

      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, pan, tilt, zoom })
      });
    } catch (e) {
      console.warn('[PTZ] Falha ao enviar comando:', e);
    }
  }

  function setupPtzControls() {
    elements.ptzButtons.forEach((btn) => {
      const pan = parseFloat(btn.dataset.pan || 0);
      const tilt = parseFloat(btn.dataset.tilt || 0);

      const startMove = (e) => {
        e.preventDefault();
        btn.classList.add('active');
        state.ptzMoving = true;
        sendPtzCommand('move', pan, tilt, 0);
      };

      const stopMove = (e) => {
        e.preventDefault();
        if (state.ptzMoving) {
          btn.classList.remove('active');
          state.ptzMoving = false;
          sendPtzCommand('stop');
        }
      };

      btn.addEventListener('mousedown', startMove);
      btn.addEventListener('touchstart', startMove, { passive: false });

      btn.addEventListener('mouseup', stopMove);
      btn.addEventListener('mouseleave', stopMove);
      btn.addEventListener('touchend', stopMove);
    });

    elements.ptzStopBtn.addEventListener('click', () => {
      sendPtzCommand('stop');
    });

    elements.ptzZoomButtons.forEach((btn) => {
      const zoom = parseFloat(btn.dataset.zoom || 0);

      const startZoom = (e) => {
        e.preventDefault();
        sendPtzCommand('move', 0, 0, zoom);
      };

      const stopZoom = (e) => {
        e.preventDefault();
        sendPtzCommand('stop');
      };

      btn.addEventListener('mousedown', startZoom);
      btn.addEventListener('touchstart', startZoom, { passive: false });
      btn.addEventListener('mouseup', stopZoom);
      btn.addEventListener('mouseleave', stopZoom);
      btn.addEventListener('touchend', stopZoom);
    });
  }

  /* ==========================================================================
     8. Captura de Fotos (Snapshots em Alta Resolução)
     ========================================================================== */
  async function takeSnapshot() {
    if (!state.connected) return;

    try {
      flashViewport();

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `besder-cam-${timestamp}.jpg`;

      const response = await fetch('/api/snapshot');
      if (!response.ok) throw new Error('Falha ao obter captura');

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      addSnapshotToGallery(objectUrl, filename);
    } catch (e) {
      console.warn('[Snapshot] Fallback para frame do vídeo:', e);
      captureVideoFrame();
    }
  }

  function captureVideoFrame() {
    const video = elements.videoPlayer;
    if (!video.videoWidth || !video.videoHeight) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const filename = `besder-frame-${Date.now()}.jpg`;

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();

      addSnapshotToGallery(url, filename);
    }, 'image/jpeg', 0.95);
  }

  function flashViewport() {
    const flashEl = document.createElement('div');
    flashEl.style.position = 'absolute';
    flashEl.style.inset = '0';
    flashEl.style.backgroundColor = '#ffffff';
    flashEl.style.opacity = '0.7';
    flashEl.style.pointerEvents = 'none';
    flashEl.style.zIndex = '10';
    flashEl.style.transition = 'opacity 0.25s ease-out';
    elements.videoCardContainer.appendChild(flashEl);

    setTimeout(() => {
      flashEl.style.opacity = '0';
      setTimeout(() => flashEl.remove(), 250);
    }, 50);
  }

  function addSnapshotToGallery(url, filename) {
    state.snapshots.push({ url, filename });

    const emptyMsg = elements.galleryContainer.querySelector('.empty-gallery-msg');
    if (emptyMsg) emptyMsg.remove();

    const item = document.createElement('div');
    item.className = 'gallery-thumb-item';
    item.title = `Clique para abrir ${filename}`;

    const img = document.createElement('img');
    img.className = 'gallery-thumb-img';
    img.src = url;
    img.alt = filename;

    item.appendChild(img);
    item.addEventListener('click', () => {
      window.open(url, '_blank');
    });

    elements.galleryContainer.prepend(item);
    elements.snapshotCountBadge.textContent = `${state.snapshots.length} foto${state.snapshots.length > 1 ? 's' : ''}`;
  }

  /* ==========================================================================
     9. Feedback do Formulário
     ========================================================================== */
  function showFormFeedback(msg, type = 'error') {
    elements.formFeedback.textContent = msg;
    elements.formFeedback.className = `form-feedback ${type}`;
    elements.formFeedback.classList.remove('hidden');
  }

  function showCamFormFeedback(msg, type = 'error') {
    elements.camFormFeedback.textContent = msg;
    elements.camFormFeedback.className = `form-feedback ${type}`;
    elements.camFormFeedback.classList.remove('hidden');
  }

  /* ==========================================================================
     VMS Multi-Câmeras: Gerenciamento, Layouts e Streams em Grid
     ========================================================================== */

  /**
   * Carrega a lista de câmeras do backend e inicializa visualização
   */
  async function loadCameras() {
    try {
      const res = await fetch('/api/cameras');
      if (!res.ok) return;
      const data = await res.json();
      if (!data.success) return;

      state.cameras = data.cameras || [];
      if (elements.badgeTotalCameras) {
        elements.badgeTotalCameras.textContent = `${state.cameras.length} câmera${state.cameras.length !== 1 ? 's' : ''}`;
      }

      // Se nenhuma câmera estiver selecionada, seleciona a primeira
      if (!state.selectedCameraId && state.cameras.length > 0) {
        selectCamera(state.cameras[0].id);
      }

      renderCameraList();

      if (state.currentLayout !== '1x1') {
        renderGrid();
      } else if (!state.peerConnection && state.selectedCameraId) {
        playSelectedCameraInFocus();
      }
    } catch (e) {
      console.warn('[VMS] Erro ao carregar câmeras:', e);
    }
  }

  /**
   * Renderiza a lista de câmeras no painel inferior
   */
  function renderCameraList() {
    if (!elements.cameraItemsList) return;
    elements.cameraItemsList.innerHTML = '';

    if (state.cameras.length === 0) {
      elements.cameraItemsList.innerHTML = `
        <div style="padding: 12px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
          Nenhuma câmera cadastrada ainda.<br>Clique em <strong>Nova Câmera</strong> acima para adicionar.
        </div>
      `;
      return;
    }

    state.cameras.forEach((cam) => {
      const card = document.createElement('div');
      card.className = `camera-item-card ${cam.id === state.selectedCameraId ? 'selected' : ''}`;
      card.dataset.id = cam.id;

      card.innerHTML = `
        <div class="cam-item-left">
          <span class="status-pulse-dot" style="width: 8px; height: 8px; background: var(--accent-green);"></span>
          <div>
            <div class="cam-item-name">${escapeHtml(cam.name)}</div>
            <div class="cam-item-ip">${escapeHtml(cam.ip)}:${cam.rtsp_port} • <span style="text-transform: uppercase;">${escapeHtml(cam.brand)}</span></div>
          </div>
        </div>
        <div class="cam-item-actions">
          <button type="button" class="btn btn-secondary btn-sm btn-select-cam" title="Focar nesta câmera">Ver</button>
          <button type="button" class="btn btn-secondary btn-sm btn-edit-cam" title="Editar configurações">Editar</button>
          <button type="button" class="btn btn-outline-danger btn-sm btn-del-cam" title="Excluir câmera">Excluir</button>
        </div>
      `;

      card.querySelector('.btn-select-cam').addEventListener('click', (e) => {
        e.stopPropagation();
        selectCamera(cam.id);
        if (state.currentLayout === '1x1') {
          playSelectedCameraInFocus();
        } else {
          setLayout('1x1');
        }
      });

      card.querySelector('.btn-edit-cam').addEventListener('click', (e) => {
        e.stopPropagation();
        openCameraModal(cam);
      });

      card.querySelector('.btn-del-cam').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm(`Deseja realmente excluir a câmera "${cam.name}"?`)) {
          await deleteCameraById(cam.id);
        }
      });

      card.addEventListener('click', () => {
        selectCamera(cam.id);
      });

      elements.cameraItemsList.appendChild(card);
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Define a câmera ativa para controle de foco e PTZ
   */
  function selectCamera(cameraId) {
    state.selectedCameraId = Number(cameraId);
    const cam = state.cameras.find((c) => c.id === state.selectedCameraId);

    // Atualiza label PTZ
    if (elements.ptzActiveTargetLabel) {
      elements.ptzActiveTargetLabel.textContent = cam
        ? `Alvo PTZ: ${cam.name} (${cam.ip})`
        : 'Câmera Ativa: Nenhuma';
    }

    if (cam) {
      elements.camModel.textContent = cam.name;
      elements.camIp.textContent = `${cam.ip}:${cam.rtsp_port}`;
      if (elements.diagIp) elements.diagIp.textContent = `${cam.ip}:${cam.rtsp_port}`;
      if (elements.diagModel) elements.diagModel.textContent = `${cam.brand.toUpperCase()} - ${cam.name}`;
    }

    // Atualiza classes ativas na lista
    if (elements.cameraItemsList) {
      elements.cameraItemsList.querySelectorAll('.camera-item-card').forEach((el) => {
        el.classList.toggle('selected', Number(el.dataset.id) === state.selectedCameraId);
      });
    }

    // Atualiza borda azul no grid
    if (elements.vmsGridViewport) {
      elements.vmsGridViewport.querySelectorAll('.vms-grid-cell').forEach((el) => {
        el.classList.toggle('active-camera', Number(el.dataset.cameraId) === state.selectedCameraId);
      });
    }
  }

  /**
   * Alterna o layout de visualização (1x1, 2x2, 3x3)
   */
  function setLayout(layout) {
    state.currentLayout = layout;

    // Atualiza botões do header
    elements.btnLayout1x1.classList.toggle('active', layout === '1x1');
    elements.btnLayout2x2.classList.toggle('active', layout === '2x2');
    elements.btnLayout3x3.classList.toggle('active', layout === '3x3');

    if (layout === '1x1') {
      stopGridStreams();
      elements.vmsGridViewport.classList.add('hidden');
      elements.videoCardContainer.classList.remove('hidden');
      playSelectedCameraInFocus();
    } else {
      stopWebRtcStream();
      elements.videoCardContainer.classList.add('hidden');
      elements.vmsGridViewport.classList.remove('hidden');
      elements.vmsGridViewport.className = `vms-grid-viewport layout-${layout}`;
      renderGrid();
    }
  }

  /**
   * Inicia o player principal em alta definição (HD) da câmera selecionada
   */
  function playSelectedCameraInFocus() {
    const cam = state.cameras.find((c) => c.id === state.selectedCameraId) || state.cameras[0];
    if (!cam) return;

    state.connected = true;
    const streamName = `cam_${cam.id}_main`;
    state.activeStream = streamName;
    updateQualityUi();
    startWebRtcStream(streamName);
  }

  /**
   * Encerra todas as conexões WebRTC ativas no grid
   */
  function stopGridStreams() {
    state.gridPeerConnections.forEach((pc) => {
      try {
        pc.onconnectionstatechange = null;
        pc.oniceconnectionstatechange = null;
        pc.ontrack = null;
        pc.close();
      } catch (e) {}
    });
    state.gridPeerConnections.clear();
    state.gridMediaStreams.clear();
    state.activeAudioCameraId = null;
  }

  /**
   * Renderiza as células do Grid e estabelece streams WebRTC leves (Substream SD)
   */
  function renderGrid() {
    stopGridStreams();
    if (!elements.vmsGridViewport) return;
    elements.vmsGridViewport.innerHTML = '';

    const capacity = state.currentLayout === '3x3' ? 9 : 4;
    const visibleCams = state.cameras.slice(0, capacity);

    visibleCams.forEach((cam) => {
      const cell = document.createElement('div');
      cell.className = `vms-grid-cell ${cam.id === state.selectedCameraId ? 'active-camera' : ''}`;
      cell.dataset.cameraId = cam.id;

      const video = document.createElement('video');
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true; // No grid, inicia mudo por padrão

      const topBar = document.createElement('div');
      topBar.className = 'cell-top-bar';
      topBar.innerHTML = `
        <div class="cell-info-badge">
          <span class="status-pulse-dot" style="width: 7px; height: 7px; background: var(--accent-green);"></span>
          <span style="font-weight: 600;">${escapeHtml(cam.name)}</span>
          <span class="cell-brand-tag">${escapeHtml(cam.brand)}</span>
          <span style="font-size: 0.68rem; color: var(--text-muted); font-family: var(--font-mono);">SD</span>
        </div>
        <div class="cell-actions">
          <button type="button" class="cell-action-btn cell-audio-btn" title="Ativar Áudio desta Câmera">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>
          </button>
          <button type="button" class="cell-action-btn cell-snap-btn" title="Capturar Foto">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
          </button>
          <button type="button" class="cell-action-btn cell-max-btn" title="Focar em 1x1 (HD)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>
          </button>
        </div>
      `;

      cell.appendChild(video);
      cell.appendChild(topBar);

      // Botão de Áudio Exclusivo
      const audioBtn = topBar.querySelector('.cell-audio-btn');
      audioBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleGridAudio(cam.id, video, audioBtn);
      });

      // Botão de Snapshot da Célula
      const snapBtn = topBar.querySelector('.cell-snap-btn');
      snapBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        captureCellFrame(video, cam.name);
      });

      // Botão de Maximizar para Foco 1x1
      const maxBtn = topBar.querySelector('.cell-max-btn');
      maxBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        selectCamera(cam.id);
        setLayout('1x1');
      });

      // Clique simples: Seleciona câmera
      cell.addEventListener('click', () => {
        selectCamera(cam.id);
      });

      // Duplo clique: Abre modo Foco 1x1
      cell.addEventListener('dblclick', () => {
        selectCamera(cam.id);
        setLayout('1x1');
      });

      elements.vmsGridViewport.appendChild(cell);

      // Inicia stream WebRTC de Substream (SD) para esta célula
      connectGridCellWebRtc(cam.id, video);
    });

    // Se houver vagas no grid, renderiza cartão para adicionar
    if (visibleCams.length < capacity) {
      const emptySlot = document.createElement('div');
      emptySlot.className = 'vms-empty-cell';
      emptySlot.innerHTML = `
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="16"></line>
          <line x1="8" y1="12" x2="16" y2="12"></line>
        </svg>
        <span style="font-weight: 600; font-size: 0.9rem;">+ Adicionar Câmera</span>
      `;
      emptySlot.addEventListener('click', () => openCameraModal());
      elements.vmsGridViewport.appendChild(emptySlot);
    }
  }

  /**
   * Conecta o vídeo de uma célula ao Substream (SD) correspondente no go2rtc
   */
  async function connectGridCellWebRtc(cameraId, videoElement) {
    try {
      const streamName = `cam_${cameraId}_sub`;
      const pc = new RTCPeerConnection({ iceServers: [] });
      state.gridPeerConnections.set(cameraId, pc);

      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });

      let cellStream = null;
      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          cellStream = event.streams[0];
        } else {
          if (!cellStream) {
            cellStream = new MediaStream();
          }
          cellStream.addTrack(event.track);
        }
        state.gridMediaStreams.set(cameraId, cellStream);
        if (videoElement.srcObject !== cellStream) {
          videoElement.srcObject = cellStream;
        }
        videoElement.play().catch(() => {});
      };

      pc.onconnectionstatechange = () => {
        console.log(`[VMS Grid Câm ${cameraId}] Conexão:`, pc.connectionState);
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const res = await fetch(`/api/webrtc?src=${encodeURIComponent(streamName)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: pc.localDescription.sdp
      });

      if (res.ok) {
        const answer = await res.text();
        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: answer }));
      }
    } catch (e) {
      console.warn(`[VMS Grid] Falha ao conectar câmera ${cameraId}:`, e.message);
    }
  }

  /**
   * Alterna áudio exclusivo em uma câmera do grid
   */
  function toggleGridAudio(cameraId, videoElement, audioBtn) {
    if (state.activeAudioCameraId === cameraId) {
      // Já estava ativa -> silencia
      videoElement.muted = true;
      state.activeAudioCameraId = null;
      audioBtn.classList.remove('active');
    } else {
      // Silencia todos os outros vídeos do grid
      if (elements.vmsGridViewport) {
        elements.vmsGridViewport.querySelectorAll('video').forEach((v) => { v.muted = true; });
        elements.vmsGridViewport.querySelectorAll('.cell-audio-btn').forEach((btn) => { btn.classList.remove('active'); });
      }

      // Ativa áudio desta câmera
      videoElement.muted = false;
      videoElement.volume = state.volume;
      state.activeAudioCameraId = cameraId;
      audioBtn.classList.add('active');
      selectCamera(cameraId);
    }
  }

  /**
   * Captura foto de um elemento de vídeo específico do grid
   */
  function captureCellFrame(videoElement, cameraName) {
    if (!videoElement.videoWidth || !videoElement.videoHeight) return;

    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const filename = `${cameraName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}.jpg`;

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();

      addSnapshotToGallery(url, filename);
    }, 'image/jpeg', 0.95);
  }

  /**
   * Modal de Cadastro / Edição de Câmera
   */
  function openCameraModal(camToEdit = null) {
    elements.camFormFeedback.classList.add('hidden');
    elements.cameraForm.reset();

    if (camToEdit) {
      elements.camDialogTitle.textContent = 'Editar Câmera';
      elements.camInputId.value = camToEdit.id;
      elements.camInputName.value = camToEdit.name;
      elements.camSelectBrand.value = camToEdit.brand || 'generic';
      elements.camInputIp.value = camToEdit.ip;
      elements.camInputRtspPort.value = camToEdit.rtsp_port || 554;
      elements.camInputOnvifPort.value = camToEdit.onvif_port || '';
      elements.camInputUser.value = camToEdit.username || 'admin';
      elements.camInputPass.value = '';
      elements.camPassHint.textContent = 'Deixe em branco para manter a senha cadastrada.';
      elements.camCheckboxPtz.checked = Boolean(camToEdit.has_ptz);
      elements.btnSaveText.textContent = 'Salvar Alterações';
    } else {
      elements.camDialogTitle.textContent = 'Cadastrar Nova Câmera';
      elements.camInputId.value = '';
      elements.camSelectBrand.value = 'besder';
      elements.camInputRtspPort.value = 554;
      elements.camInputOnvifPort.value = 8899;
      elements.camInputUser.value = 'admin';
      elements.camPassHint.textContent = 'Armazenada de forma segura com criptografia AES-256-GCM.';
      elements.camCheckboxPtz.checked = true;
      elements.btnSaveText.textContent = 'Cadastrar Câmera';
    }

    elements.cameraDialog.showModal();
  }

  function closeCameraModal() {
    elements.cameraDialog.close();
  }

  /**
   * Preenchimento automático de portas por fabricante
   */
  function applyBrandPresetPorts(brand) {
    const preset = BRAND_PRESET_PORTS[brand] || BRAND_PRESET_PORTS.generic;
    elements.camInputRtspPort.value = preset.rtsp;
    elements.camInputOnvifPort.value = preset.onvif || '';
    elements.camCheckboxPtz.checked = preset.ptz;
  }

  /**
   * Teste de conexão RTSP no formulário
   */
  async function testCameraConnection() {
    const id = elements.camInputId.value ? parseInt(elements.camInputId.value, 10) : null;
    const ip = elements.camInputIp.value.trim();
    const rtsp_port = parseInt(elements.camInputRtspPort.value.trim(), 10) || 554;
    const username = elements.camInputUser.value.trim();
    const password = elements.camInputPass.value;

    if (!ip) {
      showCamFormFeedback('Informe o endereço IP da câmera para testar.', 'error');
      return;
    }

    elements.btnTestSpinner.classList.remove('hidden');
    elements.btnTestText.textContent = 'Testando...';
    elements.btnTestCamera.disabled = true;

    try {
      const res = await fetch('/api/cameras/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ip, rtsp_port, username, password })
      });
      const data = await res.json();
      if (data.success) {
        showCamFormFeedback('✓ Conexão RTSP e credenciais validadas com sucesso!', 'success');
      } else {
        showCamFormFeedback(`Falha: ${data.error || 'Não foi possível conectar'}`, 'error');
      }
    } catch (e) {
      showCamFormFeedback(`Erro de rede ao testar: ${e.message}`, 'error');
    } finally {
      elements.btnTestSpinner.classList.add('hidden');
      elements.btnTestText.textContent = 'Testar Conexão';
      elements.btnTestCamera.disabled = false;
    }
  }

  /**
   * Exclusão de câmera
   */
  async function deleteCameraById(id) {
    try {
      const res = await fetch(`/api/cameras/${id}`, { method: 'DELETE' });
      if (res.ok) {
        if (state.selectedCameraId === Number(id)) {
          state.selectedCameraId = null;
        }
        await loadCameras();
      }
    } catch (e) {
      alert(`Falha ao excluir câmera: ${e.message}`);
    }
  }

  /* ==========================================================================
     10. Inicialização de Eventos
     ========================================================================== */
  function setupEventListeners() {
    elements.btnOpenSettings.addEventListener('click', () => {
      const cam = state.cameras.find((c) => c.id === state.selectedCameraId) || state.cameras[0] || null;
      openCameraModal(cam);
    });

    if (elements.dialogCloseBtn) {
      elements.dialogCloseBtn.addEventListener('click', closeLoginModal);
    }

    if (elements.btnTogglePass && elements.inputPass) {
      elements.btnTogglePass.addEventListener('click', () => {
        const isPass = elements.inputPass.type === 'password';
        elements.inputPass.type = isPass ? 'text' : 'password';
        if (elements.iconEyeShow) elements.iconEyeShow.classList.toggle('hidden', isPass);
        if (elements.iconEyeHide) elements.iconEyeHide.classList.toggle('hidden', !isPass);
      });
    }

    if (elements.loginForm) {
      elements.loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (elements.btnSubmitLogin) {
          elements.btnSubmitLogin.disabled = true;
          if (elements.btnSpinner) elements.btnSpinner.classList.remove('hidden');
          if (elements.btnSubmitText) elements.btnSubmitText.textContent = 'Autenticando...';
        }
        if (elements.formFeedback) elements.formFeedback.classList.add('hidden');

        const creds = {
          ip: elements.inputIp ? elements.inputIp.value.trim() : '',
          port: elements.inputPort ? parseInt(elements.inputPort.value.trim(), 10) : 554,
          user: elements.inputUser ? elements.inputUser.value.trim() : 'admin',
          password: elements.inputPass ? elements.inputPass.value : '',
          quality: elements.selectQuality ? elements.selectQuality.value : 'main'
        };

        if (elements.checkboxRemember && elements.checkboxRemember.checked) {
          saveCredentials(creds);
        } else {
          clearCredentials();
        }

        await connectCamera(creds);

        if (elements.btnSubmitLogin) {
          elements.btnSubmitLogin.disabled = false;
          if (elements.btnSpinner) elements.btnSpinner.classList.add('hidden');
          if (elements.btnSubmitText) elements.btnSubmitText.textContent = 'Conectar à Câmera';
        }
      });
    }

    elements.btnDisconnect.addEventListener('click', async () => {
      stopWebRtcStream();
      stopGridStreams();
      state.connected = false;
      if (elements.statusDot) elements.statusDot.style.backgroundColor = 'var(--accent-red)';
      if (elements.badgeConnStatus) {
        elements.badgeConnStatus.textContent = 'Desconectado';
        elements.badgeConnStatus.className = 'badge';
      }
      setLoadingState(true, 'Câmera desconectada. Clique em Configuração para gerenciar conexões.');
      clearCredentials();
      const cam = state.cameras.find((c) => c.id === state.selectedCameraId) || state.cameras[0] || null;
      openCameraModal(cam);
    });

    elements.audioUnmuteBanner.addEventListener('click', unmuteAudio);
    elements.ctrlAudioToggle.addEventListener('click', toggleMute);
    elements.volumeSlider.addEventListener('input', (e) => {
      const vol = parseFloat(e.target.value);
      state.volume = vol;
      elements.videoPlayer.volume = vol;
      if (vol > 0 && elements.videoPlayer.muted) {
        unmuteAudio();
      }
    });

    elements.ctrlPlayPause.addEventListener('click', () => {
      if (elements.videoPlayer.paused) {
        elements.videoPlayer.play();
        elements.iconPause.classList.remove('hidden');
        elements.iconPlay.classList.add('hidden');
      } else {
        elements.videoPlayer.pause();
        elements.iconPause.classList.add('hidden');
        elements.iconPlay.classList.remove('hidden');
      }
    });

    elements.btnStreamHd.addEventListener('click', () => switchStreamQuality('main'));
    elements.btnStreamSd.addEventListener('click', () => switchStreamQuality('sub'));

    elements.ctrlSnapshot.addEventListener('click', takeSnapshot);

    elements.ctrlPip.addEventListener('click', async () => {
      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        } else if (elements.videoPlayer.readyState >= 2) {
          await elements.videoPlayer.requestPictureInPicture();
        }
      } catch (err) {
        console.warn('PiP não suportado:', err);
      }
    });

    elements.ctrlFullscreen.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        elements.videoCardContainer.requestFullscreen();
      } else {
        document.exitFullscreen();
      }
    });

    document.addEventListener('fullscreenchange', () => {
      const isFs = !!document.fullscreenElement;
      elements.iconFsEnter.classList.toggle('hidden', isFs);
      elements.iconFsExit.classList.toggle('hidden', !isFs);
    });

    document.addEventListener('keydown', (e) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;

      switch (e.key) {
        case 'm':
        case 'M':
          toggleMute();
          break;
        case 's':
        case 'S':
          takeSnapshot();
          break;
        case 'f':
        case 'F':
          elements.ctrlFullscreen.click();
          break;
        case 'ArrowUp':
          e.preventDefault();
          sendPtzCommand('move', 0, 0.5, 0);
          break;
        case 'ArrowDown':
          e.preventDefault();
          sendPtzCommand('move', 0, -0.5, 0);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          sendPtzCommand('move', -0.5, 0, 0);
          break;
        case 'ArrowRight':
          e.preventDefault();
          sendPtzCommand('move', 0.5, 0, 0);
          break;
        case '+':
        case '=':
          sendPtzCommand('move', 0, 0, 0.5);
          break;
        case '-':
          sendPtzCommand('move', 0, 0, -0.5);
          break;
      }
    });

    document.addEventListener('keyup', (e) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', '+', '=', '-'].includes(e.key)) {
        sendPtzCommand('stop');
      }
    });

    setupPtzControls();

    // Seletores de Layout VMS
    elements.btnLayout1x1.addEventListener('click', () => setLayout('1x1'));
    elements.btnLayout2x2.addEventListener('click', () => setLayout('2x2'));
    elements.btnLayout3x3.addEventListener('click', () => setLayout('3x3'));

    // Modal de Cadastro/Edição de Câmeras
    elements.btnAddCamera.addEventListener('click', () => openCameraModal());
    elements.camDialogCloseBtn.addEventListener('click', closeCameraModal);

    elements.camSelectBrand.addEventListener('change', (e) => {
      applyBrandPresetPorts(e.target.value);
    });

    elements.btnToggleCamPass.addEventListener('click', () => {
      const isPass = elements.camInputPass.type === 'password';
      elements.camInputPass.type = isPass ? 'text' : 'password';
      elements.camIconEyeShow.classList.toggle('hidden', isPass);
      elements.camIconEyeHide.classList.toggle('hidden', !isPass);
    });

    elements.btnTestCamera.addEventListener('click', testCameraConnection);

    elements.cameraForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      elements.btnSaveCamera.disabled = true;
      elements.btnSaveSpinner.classList.remove('hidden');
      elements.btnSaveText.textContent = 'Salvando...';
      elements.camFormFeedback.classList.add('hidden');

      const id = elements.camInputId.value;
      const camData = {
        name: elements.camInputName.value.trim(),
        brand: elements.camSelectBrand.value,
        ip: elements.camInputIp.value.trim(),
        rtsp_port: parseInt(elements.camInputRtspPort.value.trim(), 10) || 554,
        onvif_port: elements.camInputOnvifPort.value.trim() ? parseInt(elements.camInputOnvifPort.value.trim(), 10) : null,
        username: elements.camInputUser.value.trim(),
        password: elements.camInputPass.value,
        has_ptz: elements.camCheckboxPtz.checked ? 1 : 0
      };

      try {
        const url = id ? `/api/cameras/${id}` : '/api/cameras';
        const method = id ? 'PUT' : 'POST';

        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(camData)
        });

        const data = await res.json();
        if (data.success) {
          closeCameraModal();
          await loadCameras();
          if (data.camera && data.camera.id) {
            selectCamera(data.camera.id);
          }
        } else {
          showCamFormFeedback(data.error || 'Erro ao salvar câmera', 'error');
        }
      } catch (err) {
        showCamFormFeedback(`Erro de rede ao salvar: ${err.message}`, 'error');
      } finally {
        elements.btnSaveCamera.disabled = false;
        elements.btnSaveSpinner.classList.add('hidden');
        elements.btnSaveText.textContent = id ? 'Salvar Alterações' : 'Cadastrar Câmera';
      }
    });
  }

  /* ==========================================================================
     11. Hot Reload em Desenvolvimento (Live Reload)
     ========================================================================== */
  function setupDevHotReload() {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      try {
        const es = new EventSource('/dev-reload');
        es.onmessage = (event) => {
          if (event.data === 'reload') {
            console.log('[HotReload] Alteração detectada nos arquivos. Recarregando página...');
            window.location.reload();
          }
        };
      } catch (e) {
        // Ignora silenciosamente se SSE não estiver disponível
      }
    }
  }

  /* ==========================================================================
     12. Inicialização
     ========================================================================== */
  async function init() {
    startLiveClock();
    setupEventListeners();
    setupDevHotReload();
    startAntiFreezeWatchdog();

    // Carrega a lista de câmeras registradas no SQLite
    await loadCameras();

    const saved = getSavedCredentials();
    if (state.cameras.length === 0 && saved && saved.ip && saved.user) {
      elements.inputIp.value = saved.ip;
      elements.inputPort.value = saved.port || 554;
      elements.inputUser.value = saved.user;
      elements.inputPass.value = saved.password || '';
      elements.selectQuality.value = saved.quality || 'main';

      if (saved.password) {
        console.log('[App] Credenciais salvas detectadas. Conectando...');
        await connectCamera(saved);
        return;
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
