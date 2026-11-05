const { spawn, execSync } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');

class Go2rtcManager {
  constructor(options = {}) {
    this.binPath = options.binPath || path.join(__dirname, '..', 'bin', 'go2rtc');
    this.configPath = options.configPath || path.join(__dirname, '..', 'config', 'go2rtc.yaml');
    this.apiPort = options.apiPort || 1984;
    this.apiHost = '127.0.0.1';
    this.process = null;
    this.isReady = false;
  }

  /**
   * Inicia o processo go2rtc
   */
  async start() {
    if (this.process) {
      return;
    }

    // Garante que o arquivo de configuração existe a partir do exemplo se necessário
    if (!fs.existsSync(this.configPath)) {
      const examplePath = path.join(path.dirname(this.configPath), 'go2rtc.example.yaml');
      if (fs.existsSync(examplePath)) {
        fs.copyFileSync(examplePath, this.configPath);
      }
    }

    // Limpa instâncias zumbis anteriores para garantir que a nova tenha acesso pleno à rede
    const alreadyRunning = await this.checkHealth();
    if (alreadyRunning) {
      console.log(`[go2rtc] Instância residual detectada. Reiniciando para garantir acesso à rede...`);
      try {
        execSync('pkill -9 -f "bin/go2rtc" 2>/dev/null || true');
        await new Promise((r) => setTimeout(r, 500));
      } catch (e) {}
    }

    console.log(`[go2rtc] Iniciando processo: ${this.binPath}`);

    this.process = spawn(this.binPath, ['-c', this.configPath], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    this.process.stdout.on('data', (data) => {
      const line = data.toString().trim();
      if (line) {
        console.log(`[go2rtc] ${line}`);
      }
    });

    this.process.stderr.on('data', (data) => {
      const line = data.toString().trim();
      if (line) {
        console.error(`[go2rtc err] ${line}`);
      }
    });

    this.process.on('close', (code) => {
      console.log(`[go2rtc] Processo finalizado com código ${code}`);
      this.process = null;
      this.isReady = false;
    });

    // Aguarda o servidor estar pronto (até 6 segundos)
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 200));
      if (await this.checkHealth()) {
        this.isReady = true;
        console.log(`[go2rtc] Pronto e operacional na porta ${this.apiPort}`);
        return;
      }
    }

    throw new Error('Falha ao iniciar o go2rtc: timeout de inicialização');
  }

  /**
   * Verifica a saúde da API do go2rtc
   */
  checkHealth() {
    return new Promise((resolve) => {
      const req = http.get(`http://${this.apiHost}:${this.apiPort}/api`, { timeout: 1500 }, (res) => {
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  /**
   * Registra ou atualiza um stream no go2rtc (suporta fonte única ou lista com fallbacks)
   * @param {string} name - Nome do stream (ex: 'besder_main', 'besder_sub')
   * @param {string|string[]} sources - URL ou lista de URLs (com #transport=tcp para evitar timeouts UDP)
   */
  async registerStream(name, sources) {
    return new Promise((resolve, reject) => {
      const urls = Array.isArray(sources) ? sources : [sources];
      const encodedName = encodeURIComponent(name);
      const queryParams = urls.map((u) => `src=${encodeURIComponent(u)}`).join('&');

      const options = {
        hostname: this.apiHost,
        port: this.apiPort,
        path: `/api/streams?name=${encodedName}&${queryParams}`,
        method: 'PUT',
        timeout: 5000
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log(`[go2rtc] Stream '${name}' registrado com ${urls.length} fonte(s)`);
            resolve({ success: true, name });
          } else {
            reject(new Error(`Falha ao registrar stream ${name}: HTTP ${res.statusCode} - ${data}`));
          }
        });
      });

      req.on('error', (err) => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Timeout ao registrar stream no go2rtc'));
      });
      req.end();
    });
  }

  /**
   * Encaminha oferta SDP WebRTC para o go2rtc e retorna a resposta SDP.
   * Utiliza timeout estendido de 20s para permitir negociação TCP e primeiro quadro de vídeo.
   * @param {string} streamName - Nome do stream ('besder_main' ou 'besder_sub')
   * @param {string} offerSdp - SDP da oferta gerada pelo navegador
   */
  forwardWebRtcOffer(streamName, offerSdp) {
    return new Promise((resolve, reject) => {
      const body = offerSdp;
      const options = {
        hostname: this.apiHost,
        port: this.apiPort,
        path: `/api/webrtc?src=${encodeURIComponent(streamName)}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/sdp',
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: 20000 // 20 segundos para negociação estável
      };

      console.log(`[go2rtc] Negociando WebRTC para stream '${streamName}'...`);

      const req = http.request(options, (res) => {
        let answerSdp = '';
        res.on('data', (chunk) => (answerSdp += chunk));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log(`[go2rtc] Negociação WebRTC concluída com sucesso para '${streamName}'`);
            resolve(answerSdp);
          } else {
            reject(new Error(`Erro WebRTC no go2rtc: HTTP ${res.statusCode} - ${answerSdp}`));
          }
        });
      });

      req.on('error', (err) => {
        console.error(`[go2rtc err] Erro de rede ao negociar WebRTC:`, err.message);
        reject(err);
      });

      req.on('timeout', () => {
        req.destroy();
        console.error(`[go2rtc err] Timeout de 20s atingido ao negociar WebRTC para '${streamName}'`);
        reject(new Error('Timeout na negociação WebRTC com go2rtc'));
      });

      req.write(body);
      req.end();
    });
  }

  /**
   * Obtém status de todos os streams
   */
  async getStreams() {
    return new Promise((resolve, reject) => {
      http.get(`http://${this.apiHost}:${this.apiPort}/api/streams`, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve({});
          }
        });
      }).on('error', reject);
    });
  }

  /**
   * Encerra o processo go2rtc
   */
  stop() {
    if (this.process) {
      console.log('[go2rtc] Encerrando processo...');
      this.process.kill('SIGTERM');
      this.process = null;
      this.isReady = false;
    }
  }
}

module.exports = Go2rtcManager;
