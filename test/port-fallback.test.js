const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

const serverScript = path.join(__dirname, '..', 'src', 'server.js');
const portFile = path.join(__dirname, '..', '.port');

function createBlocker(port) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => res.end('blocker'));
    server.listen(port, () => resolve(server));
  });
}

function runServerInstance(env = {}) {
  const child = spawn(process.execPath, [serverScript], {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Timeout aguardando inicialização do servidor. Output:\n${output}`));
    }, 10000);

    child.stdout.on('data', (d) => {
      const str = d.toString();
      output += str;
      const match = str.match(/http:\/\/localhost:(\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve({ child, port: parseInt(match[1], 10), output });
      }
    });

    child.stderr.on('data', (d) => {
      output += d.toString();
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code !== 0 && !output.includes('http://localhost:')) {
        reject(new Error(`Servidor encerrou com código ${code}. Output:\n${output}`));
      }
    });
  });
}

async function runTests() {
  console.log('🧪 Iniciando testes de porta dinâmica e fallback (EADDRINUSE)...\n');

  // Teste 1: Porta personalizada base (ex: 3910) ocupada -> deve rodar em 3911
  console.log('1️⃣ Testando fallback de 1 porta ocupada (3910 ocupada -> deve usar 3911)...');
  const blocker1 = await createBlocker(3910);
  let appInstance1;
  try {
    appInstance1 = await runServerInstance({ PORT: '3910' });
    console.log(`   ✅ Servidor subiu na porta: ${appInstance1.port}`);
    assert.strictEqual(appInstance1.port, 3911, 'Deveria ter subido na porta 3911');
    assert.strictEqual(fs.readFileSync(portFile, 'utf8').trim(), '3911', 'Arquivo .port deve conter 3911');
  } finally {
    if (appInstance1) {
      appInstance1.child.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 300));
    }
    blocker1.close();
  }

  // Teste 2: Múltiplas portas ocupadas (3920 e 3921 ocupadas -> deve usar 3922)
  console.log('\n2️⃣ Testando fallback de múltiplas portas ocupadas (3920 e 3921 ocupadas -> deve usar 3922)...');
  const blocker2A = await createBlocker(3920);
  const blocker2B = await createBlocker(3921);
  let appInstance2;
  try {
    appInstance2 = await runServerInstance({ PORT: '3920' });
    console.log(`   ✅ Servidor subiu na porta: ${appInstance2.port}`);
    assert.strictEqual(appInstance2.port, 3922, 'Deveria ter subido na porta 3922');
    assert.strictEqual(fs.readFileSync(portFile, 'utf8').trim(), '3922', 'Arquivo .port deve conter 3922');
  } finally {
    if (appInstance2) {
      appInstance2.child.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 300));
    }
    blocker2A.close();
    blocker2B.close();
  }

  console.log('\n🎉 Todos os testes de porta dinâmica passaram com sucesso!');
}

runTests().catch((err) => {
  console.error('\n❌ Falha nos testes:', err);
  process.exit(1);
});
