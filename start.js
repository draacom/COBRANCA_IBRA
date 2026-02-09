const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Cores para logs
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`${colors[color]}[${timestamp}] ${message}${colors.reset}`);
}

function isPortInUse(port) {
  return new Promise((resolve) => {
    const net = require('net');
    const server = net.createServer();

    server.listen(port, () => {
      server.once('close', () => resolve(false));
      server.close();
    });

    server.on('error', () => resolve(true));
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function startBackend() {
  const backendPort = process.env.PORT || 8080;
  log('🚀 Iniciando Backend (Porta ' + backendPort + ')...', 'blue');

  const inUse = await isPortInUse(Number(backendPort));
  if (inUse) {
    log(`⚠️  Porta ${backendPort} já está em uso. Backend pode já estar rodando.`, 'yellow');
    // Em produção/deploy, se a porta já estiver em uso, pode ser fatal.
    // Mas vamos tentar rodar mesmo assim caso seja um falso positivo ou socket lingering.
  }

  const isWin = process.platform === 'win32';
  const cmd = isWin ? 'cmd.exe' : 'npm';
  const args = isWin ? ['/c', 'npm', 'run', 'start:back'] : ['run', 'start:back'];

  const backend = spawn(cmd, args, {
    cwd: path.resolve(__dirname),
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false
  });

  backend.stdout.on('data', (d) => {
    const out = d.toString().trim();
    if (out) log(`[BACKEND] ${out}`, 'green');
  });
  backend.stderr.on('data', (d) => {
    const out = d.toString().trim();
    if (out && !out.includes('DeprecationWarning')) log(`[BACKEND ERROR] ${out}`, 'red');
  });
  backend.on('close', (code) => {
    if (code !== 0) log(`❌ Backend encerrado com código ${code}`, 'red');
    else log('✅ Backend encerrado normalmente', 'green');
  });
  backend.on('error', (err) => log(`❌ Erro ao iniciar backend: ${err.message}`, 'red'));

  return backend;
}

async function startFrontend() {
  const frontendPort = 8080;
  log('🎨 Iniciando Frontend...', 'cyan');

  const frontendPath = path.join(path.resolve(__dirname), 'frontend');
  if (!fs.existsSync(frontendPath)) {
    log('❌ Diretório frontend não encontrado!', 'red');
    return null;
  }

  const inUse = await isPortInUse(Number(frontendPort));
  if (inUse) {
    log(`⚠️  Porta ${frontendPort} já está em uso. Frontend pode já estar rodando.`, 'yellow');
    return null;
  }

  // Aguarda um pouco para o backend inicializar
  await sleep(3000);

  const isWin = process.platform === 'win32';
  const cmd = isWin ? 'cmd.exe' : 'npm';
  const args = isWin ? ['/c', 'npm', 'start'] : ['start'];

  // Usa o script start atual do frontend (serve -s build -l 3003)
  const frontend = spawn(cmd, args, {
    cwd: frontendPath,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false,
    env: {
      ...process.env,
      PORT: String(frontendPort),
      HOST: '0.0.0.0',
      BROWSER: 'none'
    }
  });

  frontend.stdout.on('data', (d) => {
    const out = d.toString().trim();
    if (out) log(`[FRONTEND] ${out}`, 'cyan');
  });
  frontend.stderr.on('data', (d) => {
    const out = d.toString().trim();
    if (out && !out.includes('DeprecationWarning')) log(`[FRONTEND ERROR] ${out}`, 'red');
  });
  frontend.on('close', (code) => {
    if (code !== 0) log(`❌ Frontend encerrado com código ${code}`, 'red');
    else log('✅ Frontend encerrado normalmente', 'cyan');
  });
  frontend.on('error', (err) => log(`❌ Erro ao iniciar frontend: ${err.message}`, 'red'));

  return frontend;
}

async function startEvolution() {
  const evolutionPort = 8081;
  log('🧬 Iniciando Evolution API...', 'magenta');

  const evolutionPath = path.join(path.resolve(__dirname), 'evolution-api-main');
  if (!fs.existsSync(evolutionPath)) {
    log('❌ Diretório evolution-api-main não encontrado!', 'red');
    return null;
  }

  const inUse = await isPortInUse(Number(evolutionPort));
  if (inUse) {
    log(`⚠️  Porta ${evolutionPort} já está em uso. Evolution API pode já estar rodando.`, 'yellow');
    return null;
  }

  const isWin = process.platform === 'win32';
  const cmd = isWin ? 'cmd.exe' : 'npm';
  const args = isWin ? ['/c', 'npm', 'run', 'start:prod'] : ['run', 'start:prod'];

  const evolution = spawn(cmd, args, {
    cwd: evolutionPath,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false,
    env: { ...process.env, PORT: '8081', SERVER_PORT: '8081' }
  });

  evolution.stdout.on('data', (d) => {
    const out = d.toString().trim();
    if (out) log(`[EVOLUTION] ${out}`, 'magenta');
  });
  evolution.stderr.on('data', (d) => {
    const out = d.toString().trim();
    if (out && !out.includes('DeprecationWarning')) log(`[EVOLUTION ERROR] ${out}`, 'red');
  });
  evolution.on('close', (code) => {
    if (code !== 0) log(`❌ Evolution API encerrada com código ${code}`, 'red');
    else log('✅ Evolution API inicializada (modo daemon)', 'magenta');
  });
  evolution.on('error', (err) => log(`❌ Erro ao iniciar Evolution API: ${err.message}`, 'red'));

  return evolution;
}

async function main() {
  log('🔥 Iniciando Sistema de Cobrança...', 'bright');
  log('🚀 Servidor (Frontend + Backend): http://localhost:8080', 'blue');
  log('🔗 Evolution API: http://localhost:8081', 'magenta');
  log('', 'reset');

  const processes = [];
  try {
    const backend = await startBackend();
    if (backend) processes.push(backend);

    const evolution = await startEvolution();
    if (evolution) processes.push(evolution);

    // Frontend agora é servido pelo backend, não precisamos iniciar separado
    // const frontend = await startFrontend();
    // if (frontend) processes.push(frontend);

    if (processes.length === 0) {
      log('❌ Nenhum processo foi iniciado. Verifique se as portas estão livres.', 'red');
      process.exit(1);
    }

    await sleep(5000);
    log('', 'reset');
    log('✅ Sistema iniciado com sucesso!', 'green');
    log('📊 Acesse o painel em: http://localhost:8080', 'bright');
    log('', 'reset');
    log('💡 Pressione Ctrl+C para encerrar todos os serviços', 'yellow');
  } catch (err) {
    log(`❌ Erro ao iniciar sistema: ${err.message}`, 'red');
    process.exit(1);
  }

  // Encerramento gracioso
  const shutdown = () => {
    log('', 'reset');
    log('🛑 Encerrando sistema...', 'yellow');
    try {
      processes.forEach((p) => {
        if (p && typeof p.kill === 'function') {
          p.kill('SIGINT');
        }
      });
    } catch (e) {
      // ignora
    }
    log('👋 Até mais!', 'magenta');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();

