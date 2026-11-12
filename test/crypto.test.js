const assert = require('assert');
const { encrypt, decrypt, isEncrypted } = require('../src/crypto');

console.log('[Test Crypto] Iniciando testes de criptografia AES-256-GCM...');

// 1. Teste de ida e volta (round-trip)
const originalPassword = 'CameraSecretPassword_2026!#';
const encrypted = encrypt(originalPassword);

assert(isEncrypted(encrypted), 'Deveria identificar a string como encriptada enc:v1:');
assert.notStrictEqual(encrypted, originalPassword, 'A cifra não deve coincidir com a senha em texto');
assert(encrypted.startsWith('enc:v1:'), 'Deveria conter o prefixo enc:v1:');

const decrypted = decrypt(encrypted);
assert.strictEqual(decrypted, originalPassword, 'A decriptação deve recuperar a senha original exatamente');
console.log('✓ Teste de ida e volta (encrypt -> decrypt) passou!');

// 2. Dois encrypts da mesma senha devem gerar cifras diferentes (devido ao IV aleatório)
const encrypted2 = encrypt(originalPassword);
assert.notStrictEqual(encrypted, encrypted2, 'Dois encrypts da mesma senha devem gerar IVs e cifras diferentes');
assert.strictEqual(decrypt(encrypted2), originalPassword, 'Ambas devem ser decriptáveis para a mesma senha');
console.log('✓ Teste de IV aleatório passou!');

// 3. Casos de borda (vazio, nulo, texto puro legada)
assert.strictEqual(encrypt(''), '', 'String vazia deve retornar vazio');
assert.strictEqual(decrypt(''), '', 'String vazia deve retornar vazio');
assert.strictEqual(decrypt('legacyPlainPassword'), 'legacyPlainPassword', 'Senha não cifrada deve ser retornada intacta como fallback');
console.log('✓ Teste de casos de borda passou!');

console.log('[Test Crypto] Todos os testes passaram com sucesso!');
