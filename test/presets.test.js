const assert = require('assert');
const { CAMERA_PRESETS, getPreset, resolveCameraSources } = require('../src/camera-presets');

console.log('[Test Presets] Validando presets de marcas e resolução de rotas...');

// 1. Validar marcas esperadas
const expectedBrands = ['besder', 'intelbras', 'dahua', 'hikvision', 'tapo', 'generic'];
for (const b of expectedBrands) {
  const p = getPreset(b);
  assert(p, `Preset ${b} deve existir`);
  assert(p.defaultRtspPort, `Preset ${b} deve ter porta RTSP padrão`);
}
console.log('✓ Todos os presets esperados existem!');

// 2. Testar resolução para Intelbras
const intelbrasCam = {
  id: 1,
  name: 'Entrada Intelbras',
  brand: 'intelbras',
  ip: '192.168.0.50',
  rtsp_port: 554,
  username: 'admin',
  password: 'myPassword!',
  channel: 0
};
const intelbrasSources = resolveCameraSources(intelbrasCam);
assert(intelbrasSources.main.some(s => s.includes('/cam/realmonitor?channel=1&subtype=0')), 'Mainstream Intelbras deve usar channel=1&subtype=0');
assert(intelbrasSources.sub.some(s => s.includes('/cam/realmonitor?channel=1&subtype=1')), 'Substream Intelbras deve usar channel=1&subtype=1');
assert(intelbrasSources.main[0].includes('#transport=tcp'), 'Deve forçar interleaved TCP');
console.log('✓ Resolução de rotas Intelbras validada!');

// 3. Testar injeção de URI dinâmica ONVIF
const onvifMain = 'rtsp://192.168.0.50:554/live/main_onvif';
const withOnvif = resolveCameraSources(intelbrasCam, { main: onvifMain });
assert.strictEqual(withOnvif.main[0], `${onvifMain}#transport=tcp#backchannel=0`, 'URI ONVIF deve ser colocada como primeira prioridade');
console.log('✓ Injeção de URIs dinâmicas ONVIF validada!');

console.log('[Test Presets] Todos os testes de presets passaram!');
