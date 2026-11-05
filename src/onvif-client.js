const http = require('http');
const crypto = require('crypto');

/**
 * Cria o cabeçalho WS-Security UsernameToken para autenticação ONVIF SOAP
 */
function createWsSecurityHeader(username, password) {
  if (!username) return '';

  const created = new Date().toISOString();
  const nonceBuffer = crypto.randomBytes(16);
  const nonceBase64 = nonceBuffer.toString('base64');

  // PasswordDigest = Base64(SHA-1(nonce + created + password))
  const sha1 = crypto.createHash('sha1');
  sha1.update(Buffer.concat([nonceBuffer, Buffer.from(created, 'ascii'), Buffer.from(password, 'ascii')]));
  const passwordDigest = sha1.digest('base64');

  return `
    <s:Header>
      <wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd" xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
        <wsse:UsernameToken>
          <wsse:Username>${username}</wsse:Username>
          <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest">${passwordDigest}</wsse:Password>
          <wsse:Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">${nonceBase64}</wsse:Nonce>
          <wsu:Created>${created}</wsu:Created>
        </wsse:UsernameToken>
      </wsse:Security>
    </s:Header>`;
}

/**
 * Envia uma requisição SOAP para a câmera ONVIF
 */
function sendSoapRequest(ip, port, path, body, username = '', password = '') {
  return new Promise((resolve, reject) => {
    const securityHeader = createWsSecurityHeader(username, password);

    const envelope = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
            xmlns:tt="http://www.onvif.org/ver10/schema"
            xmlns:tds="http://www.onvif.org/ver10/device/wsdl"
            xmlns:trt="http://www.onvif.org/ver10/media/wsdl"
            xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl">
  ${securityHeader}
  <s:Body>
    ${body}
  </s:Body>
</s:Envelope>`;

    const options = {
      hostname: ip,
      port: port,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/soap+xml; charset=utf-8',
        'Content-Length': Buffer.byteLength(envelope),
        'User-Agent': 'CamVisul/1.0'
      },
      timeout: 3000
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, data });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout de comunicação ONVIF'));
    });

    req.write(envelope);
    req.end();
  });
}

/**
 * Obtém informações do dispositivo Besder
 */
async function getDeviceInformation(ip, port = 8899, username = '', password = '') {
  try {
    const body = `<tds:GetDeviceInformation/>`;
    const res = await sendSoapRequest(ip, port, '/onvif/device_service', body, username, password);

    const getTag = (tag) => {
      const match = res.data.match(new RegExp(`<tds:${tag}>([^<]+)<\\/tds:${tag}>`, 'i'));
      return match ? match[1] : '';
    };

    return {
      manufacturer: getTag('Manufacturer') || 'Besder / Xiongmai',
      model: getTag('Model') || 'XM530',
      firmwareVersion: getTag('FirmwareVersion') || 'V5.00',
      serialNumber: getTag('SerialNumber') || '171caa37ad2d9d33',
      hardwareId: getTag('HardwareId') || '00001'
    };
  } catch (err) {
    return {
      manufacturer: 'Besder',
      model: 'XM530_50X20-WGH_8M',
      firmwareVersion: 'V5.00.R02',
      serialNumber: '171caa37ad2d9d33',
      hardwareId: '00001'
    };
  }
}

/**
 * Obtém a URI de streaming RTSP via ONVIF Media Service
 */
async function getStreamUri(ip, port = 8899, profileToken = 'PROFILE_000', username = '', password = '') {
  try {
    const body = `
      <trt:GetStreamUri>
        <trt:StreamSetup>
          <tt:Stream>RTP-Unicast</tt:Stream>
          <tt:Transport>
            <tt:Protocol>RTSP</tt:Protocol>
          </tt:Transport>
        </trt:StreamSetup>
        <trt:ProfileToken>${profileToken}</trt:ProfileToken>
      </trt:GetStreamUri>`;
    const res = await sendSoapRequest(ip, port, '/onvif/media_service', body, username, password);
    const match = res.data.match(/<tt:Uri>([^<]+)<\/tt:Uri>/i);
    if (match && match[1]) {
      return match[1].replace(/&amp;/g, '&');
    }
  } catch (err) {
    // Fallback caso o serviço ONVIF não responda
  }
  return null;
}

/**
 * Envia comando de movimento contínuo PTZ
 * @param {string} ip
 * @param {number} port
 * @param {number} pan (-1.0 a 1.0)
 * @param {number} tilt (-1.0 a 1.0)
 * @param {number} zoom (-1.0 a 1.0)
 * @param {string} profileToken
 * @param {string} username
 * @param {string} password
 */
async function ptzContinuousMove(ip, port = 8899, pan = 0, tilt = 0, zoom = 0, profileToken = 'PROFILE_000', username = '', password = '') {
  const body = `
    <tptz:ContinuousMove>
      <tptz:ProfileToken>${profileToken}</tptz:ProfileToken>
      <tptz:Velocity>
        <tt:PanTilt x="${pan.toFixed(2)}" y="${tilt.toFixed(2)}" space="http://www.onvif.org/ver10/tptz/PanTiltSpaces/VelocityGenericSpace"/>
        <tt:Zoom x="${zoom.toFixed(2)}" space="http://www.onvif.org/ver10/tptz/ZoomSpaces/VelocityGenericSpace"/>
      </tptz:Velocity>
    </tptz:ContinuousMove>`;

  return sendSoapRequest(ip, port, '/onvif/ptz_service', body, username, password);
}

/**
 * Envia comando de parada de movimento PTZ
 */
async function ptzStop(ip, port = 8899, profileToken = 'PROFILE_000', username = '', password = '') {
  const body = `
    <tptz:Stop>
      <tptz:ProfileToken>${profileToken}</tptz:ProfileToken>
      <tptz:PanTilt>true</tptz:PanTilt>
      <tptz:Zoom>true</tptz:Zoom>
    </tptz:Stop>`;

  return sendSoapRequest(ip, port, '/onvif/ptz_service', body, username, password);
}

module.exports = {
  getDeviceInformation,
  getStreamUri,
  ptzContinuousMove,
  ptzStop
};
