const net = require('net');
const crypto = require('crypto');

/**
 * Calcula hash MD5
 */
function md5(string) {
  return crypto.createHash('md5').update(string).digest('hex');
}

/**
 * Valida as credenciais RTSP contra a câmera Besder usando Digest Auth RFC 2617
 * @param {string} ip - IP da câmera (ex: 192.168.1.100)
 * @param {number} port - Porta RTSP (padrão 554)
 * @param {string} user - Usuário (ex: admin)
 * @param {string} pass - Senha configurada na câmera
 * @param {number} timeoutMs - Timeout em milissegundos
 * @returns {Promise<{success: boolean, error?: string, sdp?: string, server?: string}>}
 */
function verifyRtspCredentials(ip, port = 554, user = 'admin', pass = '', timeoutMs = 4000) {
  return new Promise((resolve) => {
    const client = new net.Socket();
    let state = 0; // 0 = aguardando desafio 401; 1 = aguardando resposta com autenticação
    let realm = '';
    let nonce = '';
    let serverHeader = '';
    const uri = `rtsp://${ip}:${port}/stream0`;

    client.setTimeout(timeoutMs);

    client.on('timeout', () => {
      client.destroy();
      resolve({
        success: false,
        error: `Tempo limite de conexão excedido com a câmera em ${ip}:${port}. Verifique se a câmera está ligada.`
      });
    });

    client.on('error', (err) => {
      resolve({
        success: false,
        error: `Não foi possível conectar à câmera (${ip}:${port}): ${err.message}`
      });
    });

    client.connect(port, ip, () => {
      // 1. Enviar requisição inicial DESCRIBE sem autenticação para obter o realm e nonce
      const initialReq =
        `DESCRIBE ${uri} RTSP/1.0\r\n` +
        `CSeq: 1\r\n` +
        `Accept: application/sdp\r\n` +
        `User-Agent: CamVisul/1.0\r\n\r\n`;
      client.write(initialReq);
    });

    client.on('data', (data) => {
      const responseText = data.toString('latin1');

      if (state === 0) {
        // Captura cabeçalho Server se presente
        const serverMatch = responseText.match(/Server:\s*([^\r\n]+)/i);
        if (serverMatch) serverHeader = serverMatch[1];

        // Se por acaso a câmera aceitar sem senha (200 OK direto)
        if (responseText.includes('200 OK')) {
          client.end();
          return resolve({
            success: true,
            server: serverHeader,
            sdp: responseText
          });
        }

        // Se não retornou 401, algo inesperado ocorreu
        if (!responseText.includes('401 Unauthorized')) {
          client.end();
          const firstLine = responseText.split('\r\n')[0];
          return resolve({
            success: false,
            error: `Resposta inesperada da câmera: ${firstLine}`
          });
        }

        // Extrai realm e nonce do cabeçalho WWW-Authenticate: Digest
        const realmMatch = responseText.match(/realm="([^"]+)"/i);
        const nonceMatch = responseText.match(/nonce="([^"]+)"/i);

        if (!realmMatch || !nonceMatch) {
          client.end();
          return resolve({
            success: false,
            error: 'A câmera retornou 401, mas não forneceu realm/nonce no formato Digest.'
          });
        }

        realm = realmMatch[1];
        nonce = nonceMatch[1];
        state = 1;

        // Cálculo do Digest Authentication:
        // HA1 = MD5(username:realm:password)
        // HA2 = MD5(method:digestURI)
        // Response = MD5(HA1:nonce:HA2)
        const ha1 = md5(`${user}:${realm}:${pass}`);
        const ha2 = md5(`DESCRIBE:${uri}`);
        const authResponse = md5(`${ha1}:${nonce}:${ha2}`);

        const authHeader =
          `Digest username="${user}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${authResponse}"`;

        const authReq =
          `DESCRIBE ${uri} RTSP/1.0\r\n` +
          `CSeq: 2\r\n` +
          `Accept: application/sdp\r\n` +
          `Authorization: ${authHeader}\r\n` +
          `User-Agent: CamVisul/1.0\r\n\r\n`;

        client.write(authReq);
      } else if (state === 1) {
        client.end();
        if (responseText.includes('200 OK')) {
          resolve({
            success: true,
            server: serverHeader,
            sdp: responseText
          });
        } else if (responseText.includes('401 Unauthorized')) {
          resolve({
            success: false,
            error: 'Usuário ou senha incorretos na câmera Besder. Use as credenciais cadastradas no app ICSee.'
          });
        } else {
          const firstLine = responseText.split('\r\n')[0];
          resolve({
            success: false,
            error: `Falha na autenticação RTSP: ${firstLine}`
          });
        }
      }
    });
  });
}

module.exports = {
  verifyRtspCredentials
};
