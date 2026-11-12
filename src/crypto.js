const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const PREFIX = 'enc:v1';

let cachedKey = null;

/**
 * Obtém ou inicializa a chave mestra de criptografia (32 bytes para AES-256).
 * Prioridade:
 * 1. Variável de ambiente APP_SECRET_KEY ou CAMVISUL_SECRET_KEY
 * 2. Arquivo local seguro em data/.secret.key
 */
function getEncryptionKey() {
  if (cachedKey) return cachedKey;

  const envKey = process.env.APP_SECRET_KEY || process.env.CAMVISUL_SECRET_KEY;
  if (envKey) {
    cachedKey = crypto.createHash('sha256').update(envKey).digest();
    return cachedKey;
  }

  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const keyPath = path.join(dataDir, '.secret.key');
  if (fs.existsSync(keyPath)) {
    cachedKey = fs.readFileSync(keyPath);
    if (cachedKey.length === 32) {
      return cachedKey;
    }
  }

  // Gera nova chave criptográfica aleatória de 256 bits (32 bytes)
  const newKey = crypto.randomBytes(32);
  try {
    fs.writeFileSync(keyPath, newKey, { mode: 0o600 });
  } catch (e) {
    // Caso o filesystem restrinja chmod
    fs.writeFileSync(keyPath, newKey);
  }
  cachedKey = newKey;
  return cachedKey;
}

/**
 * Criptografa uma string em texto plano usando AES-256-GCM.
 * @param {string} plaintext
 * @returns {string} Formato enc:v1:<iv_hex>:<tag_hex>:<ciphertext_hex>
 */
function encrypt(plaintext) {
  if (plaintext === null || plaintext === undefined || plaintext === '') {
    return '';
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(String(plaintext), 'utf8'),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();

  return `${PREFIX}:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decriptografa uma string cifrada no formato enc:v1:...
 * @param {string} ciphertext
 * @returns {string} Texto plano original
 */
function decrypt(ciphertext) {
  if (!ciphertext || typeof ciphertext !== 'string') {
    return '';
  }

  // Se não estiver no formato encriptado, retorna como está (fallback gracioso)
  if (!ciphertext.startsWith(`${PREFIX}:`)) {
    return ciphertext;
  }

  const parts = ciphertext.split(':');
  if (parts.length !== 5) {
    throw new Error('Formato de cifra inválido para AES-256-GCM');
  }

  const [, , ivHex, tagHex, dataHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const encryptedData = Buffer.from(dataHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(encryptedData),
    decipher.final()
  ]);

  return decrypted.toString('utf8');
}

/**
 * Verifica se uma string está cifrada no formato do CamVisul
 */
function isEncrypted(str) {
  return typeof str === 'string' && str.startsWith(`${PREFIX}:`);
}

module.exports = {
  encrypt,
  decrypt,
  isEncrypted,
  getEncryptionKey
};
