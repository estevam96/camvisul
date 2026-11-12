/**
 * Presets de fabricantes de câmeras IP e gerador de URLs de streaming
 */

const CAMERA_PRESETS = {
  besder: {
    brand: 'besder',
    label: 'Besder / Xiongmai / ICSee',
    defaultRtspPort: 554,
    defaultOnvifPort: 8899,
    hasPtz: true,
    generateSources: (cam) => {
      const user = encodeURIComponent(cam.username || 'admin');
      const pass = encodeURIComponent(cam.password || '');
      const ip = cam.ip;
      const port = cam.rtsp_port || 554;
      const ch = cam.channel || 0;

      return {
        main: [
          `rtsp://${ip}:${port}/user=${user}_password=${pass}_channel=${ch}_stream=0.sdp?real_stream#transport=tcp#backchannel=0`,
          `rtsp://${user}:${pass}@${ip}:${port}/stream0#transport=tcp#backchannel=0`,
          `dvrip://${user}:${pass}@${ip}:34567?channel=${ch}`
        ],
        sub: [
          `rtsp://${ip}:${port}/user=${user}_password=${pass}_channel=${ch}_stream=1.sdp?real_stream#transport=tcp#backchannel=0`,
          `rtsp://${user}:${pass}@${ip}:${port}/stream1#transport=tcp#backchannel=0`,
          `dvrip://${user}:${pass}@${ip}:34567?channel=${ch}&subtype=1`,
          `rtsp://${ip}:${port}/user=${user}_password=${pass}_channel=${ch}_stream=0.sdp?real_stream#transport=tcp#backchannel=0`,
          `rtsp://${user}:${pass}@${ip}:${port}/stream0#transport=tcp#backchannel=0`
        ]
      };
    }
  },

  intelbras: {
    brand: 'intelbras',
    label: 'Intelbras',
    defaultRtspPort: 554,
    defaultOnvifPort: 80,
    hasPtz: true,
    generateSources: (cam) => {
      const user = encodeURIComponent(cam.username || 'admin');
      const pass = encodeURIComponent(cam.password || '');
      const ip = cam.ip;
      const port = cam.rtsp_port || 554;
      const ch = (cam.channel || 0) + 1;

      return {
        main: [
          `rtsp://${user}:${pass}@${ip}:${port}/cam/realmonitor?channel=${ch}&subtype=0#transport=tcp#backchannel=0`
        ],
        sub: [
          `rtsp://${user}:${pass}@${ip}:${port}/cam/realmonitor?channel=${ch}&subtype=1#transport=tcp#backchannel=0`
        ]
      };
    }
  },

  dahua: {
    brand: 'dahua',
    label: 'Dahua',
    defaultRtspPort: 554,
    defaultOnvifPort: 80,
    hasPtz: true,
    generateSources: (cam) => {
      const user = encodeURIComponent(cam.username || 'admin');
      const pass = encodeURIComponent(cam.password || '');
      const ip = cam.ip;
      const port = cam.rtsp_port || 554;
      const ch = (cam.channel || 0) + 1;

      return {
        main: [
          `rtsp://${user}:${pass}@${ip}:${port}/cam/realmonitor?channel=${ch}&subtype=0#transport=tcp#backchannel=0`
        ],
        sub: [
          `rtsp://${user}:${pass}@${ip}:${port}/cam/realmonitor?channel=${ch}&subtype=1#transport=tcp#backchannel=0`
        ]
      };
    }
  },

  hikvision: {
    brand: 'hikvision',
    label: 'Hikvision',
    defaultRtspPort: 554,
    defaultOnvifPort: 8000,
    hasPtz: true,
    generateSources: (cam) => {
      const user = encodeURIComponent(cam.username || 'admin');
      const pass = encodeURIComponent(cam.password || '');
      const ip = cam.ip;
      const port = cam.rtsp_port || 554;
      const ch = cam.channel || 0;
      const mainChannelCode = (ch + 1) * 100 + 1; // Ex: 101
      const subChannelCode = (ch + 1) * 100 + 2;  // Ex: 102

      return {
        main: [
          `rtsp://${user}:${pass}@${ip}:${port}/Streaming/Channels/${mainChannelCode}#transport=tcp#backchannel=0`
        ],
        sub: [
          `rtsp://${user}:${pass}@${ip}:${port}/Streaming/Channels/${subChannelCode}#transport=tcp#backchannel=0`
        ]
      };
    }
  },

  tapo: {
    brand: 'tapo',
    label: 'TP-Link Tapo',
    defaultRtspPort: 554,
    defaultOnvifPort: 2020,
    hasPtz: true,
    generateSources: (cam) => {
      const user = encodeURIComponent(cam.username || 'admin');
      const pass = encodeURIComponent(cam.password || '');
      const ip = cam.ip;
      const port = cam.rtsp_port || 554;

      return {
        main: [
          `rtsp://${user}:${pass}@${ip}:${port}/stream1#transport=tcp#backchannel=0`
        ],
        sub: [
          `rtsp://${user}:${pass}@${ip}:${port}/stream2#transport=tcp#backchannel=0`
        ]
      };
    }
  },

  generic: {
    brand: 'generic',
    label: 'Genérico RTSP / ONVIF',
    defaultRtspPort: 554,
    defaultOnvifPort: 80,
    hasPtz: false,
    generateSources: (cam) => {
      const user = encodeURIComponent(cam.username || 'admin');
      const pass = encodeURIComponent(cam.password || '');
      const ip = cam.ip;
      const port = cam.rtsp_port || 554;
      const ch = cam.channel || 0;

      // Se o usuário informou rotas customizadas
      if (cam.main_stream_uri) {
        const main = cam.main_stream_uri.includes('#transport=')
          ? cam.main_stream_uri
          : `${cam.main_stream_uri}#transport=tcp#backchannel=0`;
        const sub = cam.sub_stream_uri
          ? (cam.sub_stream_uri.includes('#transport=') ? cam.sub_stream_uri : `${cam.sub_stream_uri}#transport=tcp#backchannel=0`)
          : main;
        return { main: [main], sub: [sub] };
      }

      return {
        main: [
          `rtsp://${user}:${pass}@${ip}:${port}/live/ch${ch}#transport=tcp#backchannel=0`,
          `rtsp://${user}:${pass}@${ip}:${port}/stream0#transport=tcp#backchannel=0`,
          `rtsp://${user}:${pass}@${ip}:${port}/#transport=tcp#backchannel=0`
        ],
        sub: [
          `rtsp://${user}:${pass}@${ip}:${port}/live/ch${ch}_sub#transport=tcp#backchannel=0`,
          `rtsp://${user}:${pass}@${ip}:${port}/stream1#transport=tcp#backchannel=0`,
          `rtsp://${user}:${pass}@${ip}:${port}/live/ch${ch}#transport=tcp#backchannel=0`,
          `rtsp://${user}:${pass}@${ip}:${port}/stream0#transport=tcp#backchannel=0`
        ]
      };
    }
  }
};

/**
 * Retorna o preset de uma marca ou genérico se não encontrado
 */
function getPreset(brand) {
  const normalized = String(brand || 'generic').toLowerCase().trim();
  return CAMERA_PRESETS[normalized] || CAMERA_PRESETS.generic;
}

/**
 * Resolve as listas de fontes de streaming (main e sub) para uma câmera
 * @param {object} camera Objeto da câmera com dados de conexão e senha em texto
 * @param {object} onvifUris URIs dinâmicas obtidas via ONVIF { main, sub } (opcional)
 */
function resolveCameraSources(camera, onvifUris = {}) {
  const preset = getPreset(camera.brand);
  const sources = preset.generateSources(camera);

  // Se o ONVIF retornou URIs dinâmicas válidas, adiciona-as no início da lista com máxima prioridade
  if (onvifUris.main) {
    const formattedMain = onvifUris.main.includes('#transport=')
      ? onvifUris.main
      : `${onvifUris.main}#transport=tcp#backchannel=0`;
    sources.main.unshift(formattedMain);
  }

  if (onvifUris.sub) {
    const formattedSub = onvifUris.sub.includes('#transport=')
      ? onvifUris.sub
      : `${onvifUris.sub}#transport=tcp#backchannel=0`;
    sources.sub.unshift(formattedSub);
  }

  return sources;
}

module.exports = {
  CAMERA_PRESETS,
  getPreset,
  resolveCameraSources
};
