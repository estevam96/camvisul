/**
 * CamVisul - Audio Meter (Web Audio API)
 * Analisa e renderiza o nível sonoro do microfone da câmera em tempo real
 */

class CameraAudioMeter {
  constructor(fillElementId) {
    this.fillElement = document.getElementById(fillElementId);
    this.audioContext = null;
    this.analyser = null;
    this.source = null;
    this.animationFrameId = null;
    this.isRunning = false;
  }

  /**
   * Conecta o fluxo MediaStream da câmera ao analisador de áudio
   * @param {MediaStream} mediaStream
   */
  start(mediaStream) {
    this.stop();

    const audioTracks = mediaStream.getAudioTracks();
    if (!audioTracks || audioTracks.length === 0) {
      console.warn('[AudioMeter] Nenhum track de áudio detectado no stream');
      return;
    }

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) {
        console.warn('[AudioMeter] Web Audio API não suportada neste navegador');
        return;
      }

      this.audioContext = new AudioCtx();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 128;
      this.analyser.smoothingTimeConstant = 0.4;

      this.source = this.audioContext.createMediaStreamSource(mediaStream);
      this.source.connect(this.analyser);

      this.isRunning = true;
      this.render();
      console.log('[AudioMeter] Analisador de áudio iniciado com sucesso');
    } catch (err) {
      console.error('[AudioMeter] Falha ao iniciar AudioContext:', err);
    }
  }

  /**
   * Loop de renderização com requestAnimationFrame
   */
  render() {
    if (!this.isRunning || !this.analyser) return;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);

    // Calcula a média das frequências
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    const average = sum / dataArray.length;

    // Converte para porcentagem suave (0% a 100%)
    const percentage = Math.min(100, Math.round((average / 128) * 100));

    if (this.fillElement) {
      this.fillElement.style.width = `${percentage}%`;
    }

    this.animationFrameId = requestAnimationFrame(() => this.render());
  }

  /**
   * Encerra o analisador e libera recursos
   */
  stop() {
    this.isRunning = false;

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.source) {
      try {
        this.source.disconnect();
      } catch (e) {}
      this.source = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch (e) {}
      this.audioContext = null;
    }

    if (this.fillElement) {
      this.fillElement.style.width = '0%';
    }
  }
}

// Exporta para escopo global
window.CameraAudioMeter = CameraAudioMeter;
