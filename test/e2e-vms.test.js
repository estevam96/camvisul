const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { encrypt, decrypt, isEncrypted } = require('../src/crypto');
const {
  getAllCameras,
  getCameraById,
  createCamera,
  updateCamera,
  deleteCamera,
  migrateLegacyEnvIfEmpty,
  db
} = require('../src/db');
const { CAMERA_PRESETS, getPreset, resolveCameraSources } = require('../src/camera-presets');

console.log('[E2E Test] ==============================================');
console.log('[E2E Test] Iniciando Verificação Ponta a Ponta do VMS...');
console.log('[E2E Test] ==============================================');

// 1. Criptografia AES-256-GCM
console.log('1. Verificando Criptografia AES-256-GCM...');
const secretPassword = 'MySecretCamPassword!#2026';
const cipherText = encrypt(secretPassword);
assert(isEncrypted(cipherText), 'A senha deve ser cifrada no formato enc:v1:');
assert.strictEqual(decrypt(cipherText), secretPassword, 'A decriptação deve restaurar a senha original');
console.log('✓ Criptografia AES-256-GCM operacional.');

// 2. Banco de dados SQLite e isolamento de credenciais
console.log('2. Verificando Repositório SQLite e Proteção de Senhas...');
const testCam1 = createCamera({
  name: 'Entrada E2E Intelbras',
  brand: 'intelbras',
  ip: '192.168.1.150',
  rtsp_port: 554,
  onvif_port: 80,
  username: 'admin',
  password: 'IntelbrasPassword123'
});

assert(testCam1.id, 'Câmera 1 criada com ID');
assert.strictEqual(testCam1.hasPassword, true);
assert.strictEqual(testCam1.password, undefined, 'Senha mascarada por padrão');

// Verifica no SQLite direto
const rawDbRow = db.prepare('SELECT password FROM cameras WHERE id = ?').get(testCam1.id);
assert(isEncrypted(rawDbRow.password), 'Senha no banco DEVE ser enc:v1:');
assert.notStrictEqual(rawDbRow.password, 'IntelbrasPassword123');

// Verifica decriptação para o streaming
const internalCam = getCameraById(testCam1.id, { includeDecryptedPassword: true });
assert.strictEqual(internalCam.password, 'IntelbrasPassword123');
console.log('✓ Persistência e proteção de senha no SQLite validadas.');

// 3. Presets de fabricantes e resolução de rotas
console.log('3. Verificando Resolução de Rotas de Múltiplos Fabricantes...');
const testCam2 = createCamera({
  name: 'Garagem E2E Hikvision',
  brand: 'hikvision',
  ip: '192.168.1.160',
  rtsp_port: 554,
  onvif_port: 8000,
  username: 'admin',
  password: 'HikvisionPassword456'
});

const sources1 = resolveCameraSources(internalCam);
assert(sources1.main[0].includes('/cam/realmonitor?channel=1&subtype=0'), 'Intelbras main deve usar realmonitor channel=1');
assert(sources1.sub[0].includes('/cam/realmonitor?channel=1&subtype=1'), 'Intelbras sub deve usar realmonitor subtype=1');

const hikInternal = getCameraById(testCam2.id, { includeDecryptedPassword: true });
const sources2 = resolveCameraSources(hikInternal);
assert(sources2.main[0].includes('/Streaming/Channels/101'), 'Hikvision main deve usar 101');
assert(sources2.sub[0].includes('/Streaming/Channels/102'), 'Hikvision sub deve usar 102');
console.log('✓ Presets e rotas de streaming validados.');

// 4. Interface HTML e CSS do VMS
console.log('4. Verificando Elementos de UI do VMS em index.html...');
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
assert(html.includes('id="btn-layout-1x1"'), 'Botão 1x1 presente');
assert(html.includes('id="btn-layout-2x2"'), 'Botão 2x2 presente');
assert(html.includes('id="btn-layout-3x3"'), 'Botão 3x3 presente');
assert(html.includes('id="vms-grid-viewport"'), 'Grid multi-câmera presente');
assert(html.includes('id="camera-dialog"'), 'Modal de configuração de câmeras presente');
assert(html.includes('id="btn-test-camera"'), 'Botão de teste de conexão presente');
assert(html.includes('id="camera-items-list"'), 'Lista de câmeras do VMS presente');
console.log('✓ Todos os componentes e modais do VMS estão presentes no HTML.');

// 5. Limpeza de teste
deleteCamera(testCam1.id);
deleteCamera(testCam2.id);

console.log('[E2E Test] ==============================================');
console.log('[E2E Test] ✓ TODOS OS TESTES E2E PASSARAM COM SUCESSO!   ');
console.log('[E2E Test] ==============================================');
