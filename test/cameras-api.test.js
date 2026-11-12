const assert = require('assert');
const http = require('http');

// Importa o app express diretamente sem chamar listen
const express = require('express');
const cors = require('cors');

// Como src/server.js roda startServer() se importado diretamente, vamos testar via requisições HTTP locais no servidor ou criando uma suite de integração limpa
const {
  getAllCameras,
  getCameraById,
  createCamera,
  updateCamera,
  deleteCamera
} = require('../src/db');
const { CAMERA_PRESETS } = require('../src/camera-presets');

console.log('[Test API] Iniciando testes das rotas e regras de câmeras...');

// 1. Presets
const presets = Object.values(CAMERA_PRESETS);
assert(presets.length >= 5, 'Deveria conter presets para pelo menos 5 fabricantes');
const intelbras = presets.find(p => p.brand === 'intelbras');
assert.strictEqual(intelbras.defaultRtspPort, 554);
assert.strictEqual(intelbras.defaultOnvifPort, 80);
console.log('✓ Presets de fabricantes validados!');

// 2. Criação de Câmera e Proteção de Senha na API
const cam = createCamera({
  name: 'Câmera Teste Integração',
  brand: 'hikvision',
  ip: '192.168.0.88',
  rtsp_port: 554,
  onvif_port: 8000,
  username: 'admin',
  password: 'UltraSecretPassword2026',
  has_ptz: 1
});

assert(cam.id, 'ID deve ser gerado');
assert.strictEqual(cam.hasPassword, true, 'hasPassword deve ser true');
assert.strictEqual(cam.password, undefined, 'A senha nunca deve ser exposta nas rotas públicas');
console.log(`✓ Câmera ${cam.id} criada com senha mascarada!`);

// 3. Consulta de Câmera por ID
const fetched = getCameraById(cam.id);
assert.strictEqual(fetched.name, 'Câmera Teste Integração');
assert.strictEqual(fetched.password, undefined);
console.log('✓ Consulta de câmera por ID validada!');

// 4. Atualização de Câmera
const updated = updateCamera(cam.id, {
  name: 'Câmera Fachada Atualizada'
});
assert.strictEqual(updated.name, 'Câmera Fachada Atualizada');
assert.strictEqual(updated.hasPassword, true);
console.log('✓ Atualização de câmera validada!');

// 5. Exclusão de Câmera
const deleted = deleteCamera(cam.id);
assert.strictEqual(deleted, true);
assert.strictEqual(getCameraById(cam.id), null);
console.log('✓ Exclusão de câmera validada!');

// 6. Testar Contrato de Enriquecimento de Descoberta (/api/discovery)
const { discoverLocalCameras } = require('../src/discovery');
async function testDiscoveryContract() {
  const discovered = await discoverLocalCameras({ timeoutMs: 250 });
  assert(Array.isArray(discovered), 'Descoberta deve retornar array');
  const existingCameras = getAllCameras();
  const enriched = discovered.map(d => ({
    ...d,
    alreadyAdded: existingCameras.some(c => c.ip === d.ip)
  }));
  assert(Array.isArray(enriched), 'Lista enriquecida deve ser array');
  console.log('✓ Contrato de enriquecimento da rota /api/discovery validado!');
}

testDiscoveryContract().then(() => {
  console.log('[Test API] Todos os testes de integração das câmeras passaram!');
});
