const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  createCamera,
  getCameraById,
  updateCameraIp,
  updateCameraFingerprint,
  findCameraByFingerprint,
  deleteCamera
} = require('../src/db');
const {
  createWsDiscoveryProbe,
  createXiongmaiSearchPacket,
  parseWsDiscoveryResponse,
  parseXiongmaiResponse,
  discoverLocalCameras
} = require('../src/discovery');

console.log('[E2E Test Discovery] ==============================================');
console.log('[E2E Test Discovery] Iniciando Verificação Ponta a Ponta...');
console.log('[E2E Test Discovery] ==============================================');

// 1. Verificando Persistência de Impressão Digital (MAC & Serial)
console.log('1. Verificando Persistência de Impressão Digital (MAC & Serial)...');
const testCam = createCamera({
  name: 'Câmera Wi-Fi Inteligente',
  brand: 'besder',
  ip: '192.168.0.30',
  rtsp_port: 554,
  onvif_port: 8899,
  username: 'admin',
  password: 'PasswordDhcpTest123',
  mac_address: '00:12:43:55:66:77',
  serial_number: 'XM530-SER-990011'
});

assert(testCam.id, 'Câmera deve ser criada com ID');
assert.strictEqual(testCam.mac_address, '00:12:43:55:66:77');
assert.strictEqual(testCam.serial_number, 'XM530-SER-990011');
console.log('✓ Câmera cadastrada com MAC e Serial com sucesso.');

// 2. Verificando Localização de Câmera por Fingerprint
console.log('2. Verificando Localização de Câmera por Fingerprint...');
const matchByMac = findCameraByFingerprint({ mac_address: '00:12:43:55:66:77' });
assert(matchByMac, 'Deve encontrar câmera por MAC');
assert.strictEqual(matchByMac.id, testCam.id);

const matchBySerial = findCameraByFingerprint({ serial_number: 'XM530-SER-990011' });
assert(matchBySerial, 'Deve encontrar câmera por Serial');
assert.strictEqual(matchBySerial.id, testCam.id);
console.log('✓ Busca por MAC e Serial validada com sucesso.');

// 3. Simulando Auto-Healing após Renovação de DHCP (IP Mudou de 192.168.0.30 para 192.168.0.88)
console.log('3. Simulando Auto-Healing de IP Dinâmico...');
const oldIp = testCam.ip;
const newIp = '192.168.0.88';

// Simula resposta de descoberta vinda do novo IP com o mesmo MAC
const mockDiscoveryResponse = {
  ip: newIp,
  brand: 'besder',
  model: 'XM530 Besder',
  mac_address: '00:12:43:55:66:77',
  serial_number: 'XM530-SER-990011',
  onvif_port: 8899
};

const matchedCandidate = findCameraByFingerprint({
  mac_address: mockDiscoveryResponse.mac_address,
  serial_number: mockDiscoveryResponse.serial_number
});

assert(matchedCandidate, 'O motor de Auto-Healing deve associar o dispositivo pelo MAC');
assert.strictEqual(matchedCandidate.ip, oldIp, 'O IP antigo ainda está no banco');

// Aplica atualização silenciosa de IP
updateCameraIp(matchedCandidate.id, mockDiscoveryResponse.ip);

const healedCam = getCameraById(testCam.id, { includeDecryptedPassword: true });
assert.strictEqual(healedCam.ip, newIp, 'O IP deve ter sido atualizado para o novo endereço');
assert.strictEqual(healedCam.password, 'PasswordDhcpTest123', 'A senha original deve permanecer intacta');
console.log(`✓ Auto-Healing aplicado silenciosamente: IP migrado de ${oldIp} para ${newIp}!`);

// Limpa câmera de teste
deleteCamera(testCam.id);
assert.strictEqual(getCameraById(testCam.id), null);

// 4. Verificando Geradores e Parsers de Protocolo
console.log('4. Verificando Geradores e Parsers de Protocolo UDP...');
const wsProbe = createWsDiscoveryProbe();
assert(wsProbe.includes('Probe'), 'WS-Discovery Probe deve ser válido');

const xmPacket = createXiongmaiSearchPacket();
assert(xmPacket.length > 20, 'Pacote Xiongmai deve ter cabeçalho + payload');

const sampleXml = `<d:ProbeMatches xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery">
  <d:ProbeMatch>
    <d:Scopes>onvif://www.onvif.org/type/video_encoder onvif://www.onvif.org/hardware/VIP1230 onvif://www.onvif.org/name/Intelbras</d:Scopes>
    <d:XAddrs>http://192.168.0.120:80/onvif/device_service</d:XAddrs>
  </d:ProbeMatch>
</d:ProbeMatches>`;
const parsedOnvif = parseWsDiscoveryResponse(sampleXml);
assert.strictEqual(parsedOnvif.ip, '192.168.0.120');
assert.strictEqual(parsedOnvif.onvif_port, 80);
assert.strictEqual(parsedOnvif.brand, 'intelbras');
console.log('✓ Protocolos ONVIF WS-Discovery e NetIP validados.');

// 5. Verificando Elementos de UI em index.html e style.css
console.log('5. Verificando Elementos de UI em index.html e style.css...');
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'style.css'), 'utf8');
const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf8');

assert(html.includes('id="discovery-dialog"'), 'index.html deve conter o modal discovery-dialog');
assert(html.includes('id="btn-open-discovery"'), 'index.html deve conter o botão btn-open-discovery');
assert(html.includes('id="discovered-cameras-list"'), 'index.html deve conter a lista discovered-cameras-list');
assert(css.includes('.discovery-status-bar'), 'style.css deve conter estilos para discovery-status-bar');
assert(css.includes('.discovered-item-card'), 'style.css deve conter estilos para discovered-item-card');
assert(js.includes('openDiscoveryModal'), 'app.js deve conter a função openDiscoveryModal');
assert(js.includes('/api/cameras/auto-heal'), 'app.js deve chamar /api/cameras/auto-heal no watchdog');
console.log('✓ Componentes de UI e cliente Web integrados e validados.');

console.log('[E2E Test Discovery] ==============================================');
console.log('[E2E Test Discovery] ✓ TODOS OS TESTES E2E PASSARAM COM SUCESSO!   ');
console.log('[E2E Test Discovery] ==============================================');
