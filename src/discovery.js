const dgram = require('dgram');
const crypto = require('crypto');
const os = require('os');
const http = require('http');

/**
 * Cria a mensagem SOAP de Probe WS-Discovery padrão ONVIF
 */
function createWsDiscoveryProbe() {
  const messageId = `uuid:${crypto.randomUUID()}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope"
            xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing"
            xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"
            xmlns:dn="http://www.onvif.org/ver10/network/wsdl">
  <e:Header>
    <w:MessageID>${messageId}</w:MessageID>
    <w:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To>
    <w:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action>
  </e:Header>
  <e:Body>
    <d:Probe>
      <d:Types>dn:NetworkVideoTransmitter</d:Types>
    </d:Probe>
  </e:Body>
</e:Envelope>`;
}

/**
 * Cria o pacote binário/JSON de busca Xiongmai (NetIP Broadcast port 34569)
 */
function createXiongmaiSearchPacket() {
  const json = JSON.stringify({ Cmd: 'Search', SubCmd: 'SearchCamera' });
  const payloadBuf = Buffer.from(json, 'utf8');

  // Cabeçalho binário padrão DVRIP/NetIP:
  // 0xFF 0x01 (Head), 0x00 0x00 (Session), 0x00 0x00 0x00 0x00 (Seq), 0x00 0x00 (Cmd 1520 / 0x05F0), len (4 bytes)
  const headerBuf = Buffer.alloc(20);
  headerBuf[0] = 0xff;
  headerBuf[1] = 0x01;
  headerBuf[2] = 0x00;
  headerBuf[3] = 0x00;
  // MsgId 1520 (0x05F0) - Search
  headerBuf.writeUInt16LE(1520, 14);
  headerBuf.writeUInt32LE(payloadBuf.length, 16);

  return Buffer.concat([headerBuf, payloadBuf]);
}

/**
 * Faz o parse da resposta XML de WS-Discovery
 * @param {string} xmlString
 * @param {Object} [rinfo=null] - Metadados do pacote UDP recebido ({ address, port })
 */
function parseWsDiscoveryResponse(xmlString, rinfo = null) {
  if (!xmlString || typeof xmlString !== 'string') return null;

  const getMatch = (regex) => {
    const match = xmlString.match(regex);
    return match ? match[1].trim() : null;
  };

  const xaddrs = getMatch(/<[^:]*:?XAddrs>([^<]+)<\/[^:]*:?XAddrs>/i);
  if (!xaddrs) return null;

  const urlMatches = xaddrs.split(/\s+/);
  const primaryUrl = urlMatches[0];

  let onvifPort = 80;
  let parsedHostname = null;

  try {
    const parsedUrl = new URL(primaryUrl);
    parsedHostname = parsedUrl.hostname;
    onvifPort = parsedUrl.port ? parseInt(parsedUrl.port, 10) : 80;
  } catch (e) {
    const fallbackMatch = primaryUrl.match(/https?:\/\/([^:/]+)(?::(\d+))?/i);
    if (fallbackMatch) {
      parsedHostname = fallbackMatch[1];
      onvifPort = fallbackMatch[2] ? parseInt(fallbackMatch[2], 10) : 80;
    }
  }

  // Prioriza SEMPRE o endereço real de origem do pacote UDP (rinfo.address),
  // pois fabricantes como Xiongmai/Besder comumente mantêm 192.168.1.10 estático
  // dentro do XML de XAddrs mesmo quando operando sob outro IP dinâmico atribuído por DHCP!
  const ip = (rinfo && rinfo.address) ? rinfo.address : parsedHostname;

  if (!ip) return null;

  const endpointRef = getMatch(/<[^:]*:?Address>([^<]+)<\/[^:]*:?Address>/i) || '';
  const scopes = getMatch(/<[^:]*:?Scopes>([^<]+)<\/[^:]*:?Scopes>/i) || '';

  // Tenta extrair hardware / modelo / fabricante dos escopos ONVIF
  let brand = 'generic';
  let model = 'Câmera ONVIF';
  let mac = null;

  if (scopes.toLowerCase().includes('besder') || scopes.toLowerCase().includes('xiongmai') || onvifPort === 8899) {
    brand = 'besder';
    model = 'Besder / Xiongmai IP';
  } else if (scopes.toLowerCase().includes('intelbras') || onvifPort === 80) {
    brand = 'intelbras';
    model = 'Intelbras VIP';
  } else if (scopes.toLowerCase().includes('hikvision') || onvifPort === 8000) {
    brand = 'hikvision';
    model = 'Hikvision IP';
  } else if (scopes.toLowerCase().includes('dahua')) {
    brand = 'dahua';
    model = 'Dahua IP';
  } else if (scopes.toLowerCase().includes('tapo') || onvifPort === 2020) {
    brand = 'tapo';
    model = 'TP-Link Tapo';
  }

  const macMatch = scopes.match(/([0-9a-f]{2}[:-][0-9a-f]{2}[:-][0-9a-f]{2}[:-][0-9a-f]{2}[:-][0-9a-f]{2}[:-][0-9a-f]{2})/i);
  if (macMatch) {
    mac = macMatch[1].toUpperCase();
  }

  let serial = null;
  const serialMatch = scopes.match(/serial\/([a-z0-9_-]+)/i);
  if (serialMatch) {
    serial = serialMatch[1];
  } else if (endpointRef.startsWith('urn:uuid:')) {
    serial = endpointRef.replace('urn:uuid:', '');
  }

  return {
    ip,
    onvif_port: onvifPort,
    rtsp_port: 554,
    brand,
    model,
    name: `${model} (${ip})`,
    mac_address: mac,
    serial_number: serial,
    xaddrs: primaryUrl,
    protocol: 'onvif'
  };
}

/**
 * Faz o parse da resposta Xiongmai NetIP (binário + JSON)
 * @param {Buffer} msgBuffer
 * @param {Object} [rinfo=null] - Metadados do pacote UDP recebido ({ address, port })
 */
function parseXiongmaiResponse(msgBuffer, rinfo = null) {
  try {
    let jsonStr = '';
    const idx = msgBuffer.indexOf('{');
    if (idx !== -1) {
      jsonStr = msgBuffer.slice(idx).toString('utf8');
    } else {
      return null;
    }

    const data = JSON.parse(jsonStr);
    const body = data.Ret || data;

    const ip = (rinfo && rinfo.address) ? rinfo.address : (body.HostIP || body.ip || null);
    if (!ip) return null;

    const mac = body.MAC || body.mac || null;
    const serial = body.SerialNo || body.serial || body.serialNumber || null;
    const model = body.DeviceType || 'XM530 Besder/ICSee';

    return {
      ip,
      onvif_port: 8899,
      rtsp_port: 554,
      brand: 'besder',
      model,
      name: `Besder ICSee (${ip})`,
      mac_address: mac ? String(mac).toUpperCase() : null,
      serial_number: serial,
      protocol: 'netip'
    };
  } catch (e) {
    return null;
  }
}

/**
 * Envia uma requisição SOAP HTTP rápida com timeout
 */
function postSoapRequest(ip, port, path, body, timeoutMs = 800) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: ip,
      port: port,
      path: path,
      method: 'POST',
      timeout: timeoutMs,
      headers: {
        'Content-Type': 'application/soap+xml; charset=utf-8',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });

    req.on('error', () => {
      resolve(null);
    });

    req.write(body);
    req.end();
  });
}

/**
 * Enriquece o dispositivo ONVIF consultando GetDeviceInformation e GetNetworkInterfaces
 * para obter o Serial Number de hardware real e o MAC address real da interface ativa (ex: Wi-Fi).
 */
async function enrichOnvifDevice(device, timeoutMs = 900) {
  if (!device || !device.ip || !device.onvif_port) return device;

  try {
    const soapDevInfo = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
  <s:Body><tds:GetDeviceInformation/></s:Body>
</s:Envelope>`;

    const soapNetInterfaces = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
  <s:Body><tds:GetNetworkInterfaces/></s:Body>
</s:Envelope>`;

    const [devInfoRes, netRes] = await Promise.all([
      postSoapRequest(device.ip, device.onvif_port, '/onvif/device_service', soapDevInfo, timeoutMs),
      postSoapRequest(device.ip, device.onvif_port, '/onvif/device_service', soapNetInterfaces, timeoutMs)
    ]);

    let serial = device.serial_number;
    let model = device.model;
    let mac = device.mac_address;
    const allMacs = [];

    if (devInfoRes && devInfoRes.statusCode === 200) {
      const serialMatch = devInfoRes.body.match(/<[^:]*:?SerialNumber>([^<]+)<\/[^:]*:?SerialNumber>/i);
      if (serialMatch && serialMatch[1]) serial = serialMatch[1].trim();

      const modelMatch = devInfoRes.body.match(/<[^:]*:?Model>([^<]+)<\/[^:]*:?Model>/i);
      if (modelMatch && modelMatch[1]) model = modelMatch[1].trim();
    }

    if (netRes && netRes.statusCode === 200) {
      const matches = Array.from(netRes.body.matchAll(/<[^:]*:?HwAddress>([^<]+)<\/[^:]*:?HwAddress>/gi));
      for (const m of matches) {
        const foundMac = m[1].trim().toUpperCase();
        if (!allMacs.includes(foundMac)) allMacs.push(foundMac);
      }
      // Se houver mais de um MAC (ex: eth0 dummy 00:12:43... e eth2 Wi-Fi real),
      // prioriza o MAC da interface real que não usa o prefixo genérico de fábrica 00:12:43
      if (allMacs.length > 0) {
        const wifiMac = allMacs.find(m => !m.startsWith('00:12:43')) || allMacs[allMacs.length - 1];
        mac = wifiMac;
      }
    }

    return {
      ...device,
      serial_number: serial,
      model: model,
      name: `${device.brand === 'besder' ? 'Besder ICSee' : model} (${device.ip})`,
      mac_address: mac,
      all_macs: allMacs.length > 0 ? allMacs : (mac ? [mac] : [])
    };
  } catch (e) {
    return device;
  }
}

/**
 * Executa a descoberta de câmeras IP na rede local via WS-Discovery e NetIP
 * @param {Object} options
 * @param {number} [options.timeoutMs=2000] - Tempo limite da varredura UDP
 * @returns {Promise<Array<Object>>} Lista de câmeras descobertas
 */
function discoverLocalCameras(options = {}) {
  const { timeoutMs = 2000 } = options;

  return new Promise((resolve) => {
    const discoveredMap = new Map(); // chave: ip ou mac_address

    const onvifSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const netipSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    let isClosed = false;

    async function cleanup() {
      if (isClosed) return;
      isClosed = true;

      try {
        onvifSocket.close();
      } catch (e) {}

      try {
        netipSocket.close();
      } catch (e) {}

      const rawResults = Array.from(discoveredMap.values());

      // Enriquece dispositivos ONVIF com chamada rápida SOAP para extrair o serial e MACs reais
      try {
        const enriched = await Promise.all(rawResults.map(dev => enrichOnvifDevice(dev, 900)));
        resolve(enriched);
      } catch (e) {
        resolve(rawResults);
      }
    }

    const timer = setTimeout(cleanup, timeoutMs);

    function registerDevice(device) {
      if (!device || !device.ip) return;

      const key = device.mac_address || device.serial_number || device.ip;
      if (discoveredMap.has(key)) {
        // Mescla informações existentes com novas
        const existing = discoveredMap.get(key);
        discoveredMap.set(key, {
          ...existing,
          ...device,
          mac_address: device.mac_address || existing.mac_address,
          serial_number: device.serial_number || existing.serial_number,
          protocol: `${existing.protocol}+${device.protocol}`
        });
      } else {
        discoveredMap.set(key, device);
      }
    }

    // 1. Escuta WS-Discovery ONVIF
    onvifSocket.on('error', () => {});
    onvifSocket.on('message', (msg, rinfo) => {
      const parsed = parseWsDiscoveryResponse(msg.toString('utf8'), rinfo);
      if (parsed) registerDevice(parsed);
    });

    // 2. Escuta Xiongmai NetIP
    netipSocket.on('error', () => {});
    netipSocket.on('message', (msg, rinfo) => {
      const parsed = parseXiongmaiResponse(msg, rinfo);
      if (parsed) registerDevice(parsed);
    });

    // Bind e envio das sondas
    try {
      onvifSocket.bind(0, () => {
        try {
          onvifSocket.setBroadcast(true);
          onvifSocket.setMulticastTTL(2);
          const probeMsg = createWsDiscoveryProbe();
          const buf = Buffer.from(probeMsg, 'utf8');
          onvifSocket.send(buf, 0, buf.length, 3702, '239.255.255.250');
        } catch (e) {}
      });
    } catch (e) {}

    try {
      netipSocket.bind(0, () => {
        try {
          netipSocket.setBroadcast(true);
          const packet = createXiongmaiSearchPacket();
          netipSocket.send(packet, 0, packet.length, 34569, '255.255.255.255');
        } catch (e) {}
      });
    } catch (e) {}
  });
}

module.exports = {
  createWsDiscoveryProbe,
  createXiongmaiSearchPacket,
  parseWsDiscoveryResponse,
  parseXiongmaiResponse,
  enrichOnvifDevice,
  discoverLocalCameras
};
