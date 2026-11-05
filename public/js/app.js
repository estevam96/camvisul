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

    // Viewport de Vídeo
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
    btnSubmitText: document.getElementById('btn-submit-text')
  };

  // Instância do medidor de áudio
  const audioMeter = new CameraAudioMeter('audio-meter-fill');

  // Estado da Aplicação
  const state = {
    connected: false,
    activeStream: 'besder_main', // 'besder_main' ou 'besder_sub'
    peerConnection: null,
    currentMediaStream: null,
    isMuted: true,
    volume: 0.8,
    snapshots: [],
    ptzMoving: false,
    latencyStartTime: 0,
    retryCount: 0
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
     2. Gerenciamento do Modal de Login & Credenciais
     ========================================================================== */
  function openLoginModal() {
    elements.formFeedback.className = 'form-feedback hidden';
    elements.loginDialog.showModal();
  }

  function closeLoginModal() {
    elements.loginDialog.close();
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
      elements.statusDot.style.backgroundColor = 'var(--accent-green)';
      elements.badgeConnStatus.textContent = 'Online';
      elements.badgeConnStatus.className = 'badge badge-success';

    } catch (error) {
      console.error('[App] Erro na conexão:', error);
      setLoadingState(true, `Erro: ${error.message}`);
      showFormFeedback(error.message, 'error');
      openLoginModal();
    }
  }

  function updateCameraDiagnostics(cam) {
    if (!cam) return;
    elements.camModel.textContent = cam.model || 'Besder XM530';
    elements.camIp.textContent = `${cam.ip}:${cam.port}`;
    elements.diagIp.textContent = `${cam.ip}:${cam.port}`;
    elements.diagModel.textContent = `${cam.manufacturer} (${cam.model})`;
    elements.diagFw.textContent = cam.firmware || 'V5.00';
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

  /* ==========================================================================
     Watchdog Anti-Congelamento (Anti-Freeze Watchdog)
     ========================================================================== */
  function startAntiFreezeWatchdog() {
    let lastTime = -1;
    let staleCount = 0;

    setInterval(() => {
      if (!state.connected || !elements.videoPlayer) return;
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
    state.retryCount++;
    if (state.retryCount <= 3) {
      setLoadingState(true, `Reconectando à câmera (tentativa ${state.retryCount}/3)...`);
      setTimeout(() => {
        if (state.connected) startWebRtcStream(streamName);
      }, 2500);
    } else {
      setLoadingState(true, 'Conexão instável. Clique em Conexão para reiniciar.');
    }
  }

  function stopWebRtcStream() {
    audioMeter.stop();
    if (state.peerConnection) {
      try {
        state.peerConnection.close();
      } catch (e) {}
      state.peerConnection = null;
    }
    if (elements.videoPlayer.srcObject) {
      elements.videoPlayer.srcObject = null;
    }
    if (elements.videoPlayer.src) {
      elements.videoPlayer.removeAttribute('src');
      elements.videoPlayer.load();
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
    if (!state.connected) return;

    try {
      await fetch('/api/ptz', {
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

  /* ==========================================================================
     10. Inicialização de Eventos
     ========================================================================== */
  function setupEventListeners() {
    elements.btnOpenSettings.addEventListener('click', openLoginModal);
    elements.dialogCloseBtn.addEventListener('click', closeLoginModal);

    elements.btnTogglePass.addEventListener('click', () => {
      const isPass = elements.inputPass.type === 'password';
      elements.inputPass.type = isPass ? 'text' : 'password';
      elements.iconEyeShow.classList.toggle('hidden', isPass);
      elements.iconEyeHide.classList.toggle('hidden', !isPass);
    });

    elements.loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      elements.btnSubmitLogin.disabled = true;
      elements.btnSpinner.classList.remove('hidden');
      elements.btnSubmitText.textContent = 'Autenticando...';
      elements.formFeedback.classList.add('hidden');

      const creds = {
        ip: elements.inputIp.value.trim(),
        port: parseInt(elements.inputPort.value.trim(), 10),
        user: elements.inputUser.value.trim(),
        password: elements.inputPass.value,
        quality: elements.selectQuality.value
      };

      if (elements.checkboxRemember.checked) {
        saveCredentials(creds);
      } else {
        clearCredentials();
      }

      await connectCamera(creds);

      elements.btnSubmitLogin.disabled = false;
      elements.btnSpinner.classList.add('hidden');
      elements.btnSubmitText.textContent = 'Conectar à Câmera';
    });

    elements.btnDisconnect.addEventListener('click', async () => {
      stopWebRtcStream();
      state.connected = false;
      elements.statusDot.style.backgroundColor = 'var(--accent-red)';
      elements.badgeConnStatus.textContent = 'Desconectado';
      elements.badgeConnStatus.className = 'badge';
      setLoadingState(true, 'Câmera desconectada. Clique em Conexão para entrar.');
      clearCredentials();
      openLoginModal();
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

    const saved = getSavedCredentials();
    if (saved && saved.ip && saved.user) {
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

    openLoginModal();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
