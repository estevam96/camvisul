const assert = require('assert');
const path = require('path');
const fs = require('fs');

// Garante isolamento criando um banco temporário de teste
const testDbDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(testDbDir)) fs.mkdirSync(testDbDir, { recursive: true });

const {
  getAllCameras,
  getCameraById,
  createCamera,
  updateCamera,
  deleteCamera,
  migrateLegacyEnvIfEmpty,
  db
} = require('../src/db');
const { isEncrypted } = require('../src/crypto');

console.log('[Test DB] Iniciando testes do repositório SQLite de câmeras...');

// 1. Inserir câmera de teste
const newCam = createCamera({
  name: 'Câmera Teste Garagem',
  brand: 'intelbras',
  ip: '192.168.1.100',
  rtsp_port: 554,
  onvif_port: 80,
  username: 'admin',
  password: 'PasswordSuperSegura123!',
  has_ptz: 1
});

assert(newCam.id, 'Deveria gerar um ID auto-increment');
assert.strictEqual(newCam.name, 'Câmera Teste Garagem');
assert.strictEqual(newCam.hasPassword, true, 'hasPassword deve ser true');
assert.strictEqual(newCam.password, undefined, 'A senha nunca deve vir no formato padrão');
console.log(`✓ Câmera criada com sucesso! ID: ${newCam.id}`);

// 2. Verificar que no SQLite a senha está salva cifrada com AES-256-GCM
const rawRow = db.prepare('SELECT password FROM cameras WHERE id = ?').get(newCam.id);
assert(isEncrypted(rawRow.password), 'A senha salva no SQLite DEVE estar cifrada com enc:v1:');
assert.notStrictEqual(rawRow.password, 'PasswordSuperSegura123!');
console.log('✓ Senha salva cifrada com sucesso no SQLite!');

// 3. Recuperar com includeDecryptedPassword: true
const camWithPass = getCameraById(newCam.id, { includeDecryptedPassword: true });
assert.strictEqual(camWithPass.password, 'PasswordSuperSegura123!', 'Deve decriptar a senha original');
console.log('✓ Decriptação transparente para streaming validada!');

// 4. Atualizar câmera sem alterar a senha
const updatedCam = updateCamera(newCam.id, {
  name: 'Garagem Principal VIP'
});
assert.strictEqual(updatedCam.name, 'Garagem Principal VIP');

const checkPassAfterUpdate = getCameraById(newCam.id, { includeDecryptedPassword: true });
assert.strictEqual(checkPassAfterUpdate.password, 'PasswordSuperSegura123!', 'A senha antiga deve permanecer intacta');
console.log('✓ Atualização preservou a senha encriptada!');

// 5. Testar exclusão
const deleted = deleteCamera(newCam.id);
assert.strictEqual(deleted, true, 'Exclusão deve retornar true');
assert.strictEqual(getCameraById(newCam.id), null, 'Câmera não deve mais existir');
console.log('✓ Exclusão de câmera validada!');

console.log('[Test DB] Todos os testes de banco passaram com sucesso!');
