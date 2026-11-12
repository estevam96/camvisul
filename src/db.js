const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const { encrypt, decrypt, isEncrypted } = require('./crypto');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'camvisul.db');
const db = new DatabaseSync(dbPath);

// Inicializa a tabela de câmeras
db.exec(`
  CREATE TABLE IF NOT EXISTS cameras (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    brand TEXT NOT NULL DEFAULT 'generic',
    ip TEXT NOT NULL,
    rtsp_port INTEGER NOT NULL DEFAULT 554,
    onvif_port INTEGER DEFAULT 8899,
    username TEXT NOT NULL DEFAULT 'admin',
    password TEXT NOT NULL DEFAULT '',
    channel INTEGER NOT NULL DEFAULT 0,
    main_stream_uri TEXT,
    sub_stream_uri TEXT,
    has_ptz INTEGER NOT NULL DEFAULT 1,
    mac_address TEXT,
    serial_number TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Migração segura para bancos existentes
try {
  db.exec('ALTER TABLE cameras ADD COLUMN mac_address TEXT');
} catch (e) {}
try {
  db.exec('ALTER TABLE cameras ADD COLUMN serial_number TEXT');
} catch (e) {}

/**
 * Normaliza o registro da câmera para a API / consumidor
 */
function formatCameraRow(row, includeDecryptedPassword = false) {
  if (!row) return null;

  const rawPassword = row.password || '';
  const result = {
    id: row.id,
    name: row.name,
    brand: row.brand,
    ip: row.ip,
    rtsp_port: Number(row.rtsp_port) || 554,
    onvif_port: row.onvif_port !== null && row.onvif_port !== undefined ? Number(row.onvif_port) : null,
    username: row.username,
    channel: Number(row.channel) || 0,
    main_stream_uri: row.main_stream_uri || '',
    sub_stream_uri: row.sub_stream_uri || '',
    has_ptz: Boolean(row.has_ptz),
    mac_address: row.mac_address || null,
    serial_number: row.serial_number || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    hasPassword: Boolean(rawPassword)
  };

  if (includeDecryptedPassword) {
    result.password = decrypt(rawPassword);
  }

  return result;
}

/**
 * Retorna todas as câmeras cadastradas
 */
function getAllCameras(options = {}) {
  const { includeDecryptedPassword = false } = options;
  const stmt = db.prepare('SELECT * FROM cameras ORDER BY id ASC');
  const rows = stmt.all();
  return rows.map((r) => formatCameraRow(r, includeDecryptedPassword));
}

/**
 * Retorna uma câmera específica por ID
 */
function getCameraById(id, options = {}) {
  const { includeDecryptedPassword = false } = options;
  const stmt = db.prepare('SELECT * FROM cameras WHERE id = ?');
  const row = stmt.get(Number(id));
  return formatCameraRow(row, includeDecryptedPassword);
}

/**
 * Cria uma nova câmera
 */
function createCamera(data) {
  const {
    name,
    brand = 'generic',
    ip,
    rtsp_port = 554,
    onvif_port = 8899,
    username = 'admin',
    password = '',
    channel = 0,
    main_stream_uri = '',
    sub_stream_uri = '',
    has_ptz = 1,
    mac_address = null,
    serial_number = null
  } = data;

  if (!name || !ip) {
    throw new Error('Nome e endereço IP da câmera são obrigatórios.');
  }

  const encryptedPassword = encrypt(password || '');

  const stmt = db.prepare(`
    INSERT INTO cameras (
      name, brand, ip, rtsp_port, onvif_port, username, password, channel,
      main_stream_uri, sub_stream_uri, has_ptz, mac_address, serial_number, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);

  const result = stmt.run(
    String(name).trim(),
    String(brand).toLowerCase().trim(),
    String(ip).trim(),
    Number(rtsp_port) || 554,
    onvif_port ? Number(onvif_port) : null,
    String(username).trim(),
    encryptedPassword,
    Number(channel) || 0,
    main_stream_uri ? String(main_stream_uri).trim() : null,
    sub_stream_uri ? String(sub_stream_uri).trim() : null,
    has_ptz ? 1 : 0,
    mac_address ? String(mac_address).trim() : null,
    serial_number ? String(serial_number).trim() : null
  );

  return getCameraById(result.lastInsertRowid, { includeDecryptedPassword: false });
}

/**
 * Atualiza os dados de uma câmera existente
 */
function updateCamera(id, data) {
  const existing = getCameraById(id, { includeDecryptedPassword: true });
  if (!existing) {
    throw new Error(`Câmera com ID ${id} não encontrada.`);
  }

  const name = data.name !== undefined ? String(data.name).trim() : existing.name;
  const brand = data.brand !== undefined ? String(data.brand).toLowerCase().trim() : existing.brand;
  const ip = data.ip !== undefined ? String(data.ip).trim() : existing.ip;
  const rtsp_port = data.rtsp_port !== undefined ? Number(data.rtsp_port) : existing.rtsp_port;
  const onvif_port = data.onvif_port !== undefined ? (data.onvif_port ? Number(data.onvif_port) : null) : existing.onvif_port;
  const username = data.username !== undefined ? String(data.username).trim() : existing.username;
  const channel = data.channel !== undefined ? Number(data.channel) : existing.channel;
  const main_stream_uri = data.main_stream_uri !== undefined ? String(data.main_stream_uri).trim() : existing.main_stream_uri;
  const sub_stream_uri = data.sub_stream_uri !== undefined ? String(data.sub_stream_uri).trim() : existing.sub_stream_uri;
  const has_ptz = data.has_ptz !== undefined ? (data.has_ptz ? 1 : 0) : (existing.has_ptz ? 1 : 0);
  const mac_address = data.mac_address !== undefined ? (data.mac_address ? String(data.mac_address).trim() : null) : existing.mac_address;
  const serial_number = data.serial_number !== undefined ? (data.serial_number ? String(data.serial_number).trim() : null) : existing.serial_number;

  let encryptedPassword;
  if (data.password !== undefined && data.password !== null && data.password !== '') {
    // Nova senha fornecida
    encryptedPassword = encrypt(data.password);
  } else {
    // Mantém a senha existente encriptada
    const rawStmt = db.prepare('SELECT password FROM cameras WHERE id = ?');
    const rawRow = rawStmt.get(Number(id));
    encryptedPassword = rawRow.password;
  }

  const stmt = db.prepare(`
    UPDATE cameras SET
      name = ?, brand = ?, ip = ?, rtsp_port = ?, onvif_port = ?,
      username = ?, password = ?, channel = ?, main_stream_uri = ?,
      sub_stream_uri = ?, has_ptz = ?, mac_address = ?, serial_number = ?, updated_at = datetime('now')
    WHERE id = ?
  `);

  stmt.run(
    name,
    brand,
    ip,
    rtsp_port,
    onvif_port,
    username,
    encryptedPassword,
    channel,
    main_stream_uri || null,
    sub_stream_uri || null,
    has_ptz,
    mac_address,
    serial_number,
    Number(id)
  );

  return getCameraById(id, { includeDecryptedPassword: false });
}

/**
 * Atualiza especificamente os identificadores de hardware (impressão digital) da câmera
 */
function updateCameraFingerprint(id, fingerprint = {}) {
  const { mac_address, serial_number } = fingerprint;
  const existing = getCameraById(id);
  if (!existing) return null;

  const newMac = mac_address ? String(mac_address).toLowerCase().trim() : existing.mac_address;
  const newSerial = serial_number ? String(serial_number).trim() : existing.serial_number;

  const stmt = db.prepare(`
    UPDATE cameras SET
      mac_address = ?,
      serial_number = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `);
  stmt.run(newMac, newSerial, Number(id));
  return getCameraById(id);
}

/**
 * Atualiza o endereço IP da câmera (usado no auto-healing de IP dinâmico)
 */
function updateCameraIp(id, newIp) {
  if (!newIp) throw new Error('Novo endereço IP é obrigatório.');
  const cleanIp = String(newIp).trim();
  const stmt = db.prepare(`
    UPDATE cameras SET
      ip = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `);
  stmt.run(cleanIp, Number(id));
  return getCameraById(id);
}

/**
 * Localiza uma câmera pelo MAC address ou Serial Number (para auto-healing)
 */
function findCameraByFingerprint({ mac_address, serial_number }) {
  if (!mac_address && !serial_number) return null;

  if (mac_address) {
    const cleanMac = String(mac_address).toLowerCase().trim();
    const stmt = db.prepare('SELECT * FROM cameras WHERE LOWER(mac_address) = ?');
    const row = stmt.get(cleanMac);
    if (row) return formatCameraRow(row, true);
  }

  if (serial_number) {
    const cleanSerial = String(serial_number).trim();
    const stmt = db.prepare('SELECT * FROM cameras WHERE serial_number = ?');
    const row = stmt.get(cleanSerial);
    if (row) return formatCameraRow(row, true);
  }

  return null;
}

/**
 * Remove uma câmera pelo ID
 */
function deleteCamera(id) {
  const existing = getCameraById(id);
  if (!existing) return false;

  const stmt = db.prepare('DELETE FROM cameras WHERE id = ?');
  stmt.run(Number(id));
  return true;
}

/**
 * Migra credenciais legadas de variáveis de ambiente (.env) caso a tabela de câmeras esteja vazia
 */
function migrateLegacyEnvIfEmpty() {
  const countStmt = db.prepare('SELECT COUNT(*) as count FROM cameras');
  const { count } = countStmt.get();

  if (count === 0) {
    const legacyIp = process.env.DEFAULT_CAMERA_IP || '192.168.0.23';
    const legacyPort = parseInt(process.env.DEFAULT_CAMERA_PORT || '554', 10);
    const legacyUser = process.env.DEFAULT_CAMERA_USER || 'admin';
    const legacyPass = process.env.DEFAULT_CAMERA_PASS || '';

    console.log(`[Database] Banco vazio. Migrando câmera padrão inicial para IP ${legacyIp}...`);
    return createCamera({
      name: 'Câmera Principal (Besder)',
      brand: 'besder',
      ip: legacyIp,
      rtsp_port: legacyPort,
      onvif_port: 8899,
      username: legacyUser,
      password: legacyPass,
      channel: 0,
      has_ptz: 1
    });
  }

  return null;
}

module.exports = {
  db,
  getAllCameras,
  getCameraById,
  createCamera,
  updateCamera,
  deleteCamera,
  updateCameraFingerprint,
  updateCameraIp,
  findCameraByFingerprint,
  migrateLegacyEnvIfEmpty
};
