const assert = require('assert');
const {
  createWsDiscoveryProbe,
  createXiongmaiSearchPacket,
  parseWsDiscoveryResponse,
  parseXiongmaiResponse,
  discoverLocalCameras
} = require('../src/discovery');

console.log('[Test Discovery] Iniciando testes do motor de descoberta de câmeras...');

// 1. Validar estrutura do Probe WS-Discovery
const probe = createWsDiscoveryProbe();
assert(probe.includes('dn:NetworkVideoTransmitter'), 'Probe deve conter NetworkVideoTransmitter');
assert(probe.includes('http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe'), 'Action deve ser Probe');
console.log('✓ Probe WS-Discovery ONVIF gerado corretamente!');

// 2. Validar pacote de busca Xiongmai
const xmPacket = createXiongmaiSearchPacket();
assert(Buffer.isBuffer(xmPacket), 'Pacote Xiongmai deve ser um Buffer');
assert.strictEqual(xmPacket[0], 0xff, 'Magic byte 0 deve ser 0xFF');
assert.strictEqual(xmPacket[1], 0x01, 'Magic byte 1 deve ser 0x01');
assert(xmPacket.toString('utf8').includes('SearchCamera'), 'Payload deve conter SearchCamera');
console.log('✓ Pacote de busca Xiongmai NetIP gerado corretamente!');

// 3. Testar parser de resposta ONVIF WS-Discovery (exemplo real de câmera Besder e Intelbras)
const mockOnvifXml = `<?xml version="1.0" encoding="utf-8"?>
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://www.w3.org/2003/05/soap-envelope" xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing" xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery" xmlns:dn="http://www.onvif.org/ver10/network/wsdl">
  <SOAP-ENV:Header>
    <wsa:MessageID>urn:uuid:7c07b46d-9fcb-494b-bf2e-001243abcdef</wsa:MessageID>
    <wsa:RelatesTo>uuid:12345</wsa:RelatesTo>
    <wsa:To>http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous</wsa:To>
    <wsa:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/ProbeMatches</wsa:Action>
  </SOAP-ENV:Header>
  <SOAP-ENV:Body>
    <d:ProbeMatches>
      <d:ProbeMatch>
        <wsa:EndpointReference>
          <wsa:Address>urn:uuid:7c07b46d-9fcb-494b-bf2e-001243abcdef</wsa:Address>
        </wsa:EndpointReference>
        <d:Types>dn:NetworkVideoTransmitter</d:Types>
        <d:Scopes>onvif://www.onvif.org/type/video_encoder onvif://www.onvif.org/hardware/XM530 onvif://www.onvif.org/name/Besder onvif://www.onvif.org/location/mac/00:12:43:ab:cd:ef</d:Scopes>
        <d:XAddrs>http://192.168.0.45:8899/onvif/device_service</d:XAddrs>
        <d:MetadataVersion>1</d:MetadataVersion>
      </d:ProbeMatch>
    </d:ProbeMatches>
  </SOAP-ENV:Body>
</SOAP-ENV:Envelope>`;

const parsedOnvif = parseWsDiscoveryResponse(mockOnvifXml);
assert(parsedOnvif, 'Deve fazer parse da resposta ONVIF com sucesso');
assert.strictEqual(parsedOnvif.ip, '192.168.0.45');
assert.strictEqual(parsedOnvif.onvif_port, 8899);
assert.strictEqual(parsedOnvif.brand, 'besder');
assert.strictEqual(parsedOnvif.mac_address, '00:12:43:AB:CD:EF');
assert.strictEqual(parsedOnvif.serial_number, '7c07b46d-9fcb-494b-bf2e-001243abcdef');
console.log('✓ Parser de WS-Discovery ONVIF validado com sucesso!');

// 4. Testar parser de resposta Xiongmai NetIP
const mockXmJson = JSON.stringify({
  Ret: {
    HostIP: '192.168.0.45',
    Netmask: '255.255.255.0',
    GateWay: '192.168.0.1',
    MAC: '00:12:43:ab:cd:ef',
    SerialNo: '171caa37ad2d9d33',
    DeviceType: 'XM530 Besder ICSee',
    Port: 34567
  }
});
const mockXmBuffer = Buffer.concat([Buffer.alloc(20), Buffer.from(mockXmJson, 'utf8')]);
const parsedXm = parseXiongmaiResponse(mockXmBuffer);
assert(parsedXm, 'Deve fazer parse da resposta Xiongmai com sucesso');
assert.strictEqual(parsedXm.ip, '192.168.0.45');
assert.strictEqual(parsedXm.mac_address, '00:12:43:AB:CD:EF');
assert.strictEqual(parsedXm.serial_number, '171caa37ad2d9d33');
assert.strictEqual(parsedXm.brand, 'besder');
console.log('✓ Parser de resposta Xiongmai NetIP validado com sucesso!');

// 5. Testar ciclo de execução de discoverLocalCameras com timeout curto
async function testDiscoveryRun() {
  const start = Date.now();
  const cameras = await discoverLocalCameras({ timeoutMs: 300 });
  const duration = Date.now() - start;
  assert(Array.isArray(cameras), 'discoverLocalCameras deve retornar um Array');
  assert(duration >= 250, 'Deve aguardar a janela de timeout para capturar respostas');
  console.log(`✓ Ciclo assíncrono de discoverLocalCameras finalizado em ${duration}ms!`);
}

testDiscoveryRun().then(() => {
  console.log('[Test Discovery] Todos os testes de descoberta passaram com sucesso!');
}).catch((err) => {
  console.error('[Test Discovery] Erro:', err);
  process.exit(1);
});
