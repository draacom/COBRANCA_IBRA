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

// Função para log colorido
function log(message, color = 'reset') {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`${colors[color]}[${timestamp}] ${message}${colors.reset}`);
}

// Função para verificar se uma porta está em uso
function isPortInUse(port) {
    return new Promise((resolve) => {
        const net = require('net');
        const server = net.createServer();
        
        server.listen(port, () => {
            server.once('close', () => {
                resolve(false);
            });
            server.close();
        });
        
        server.on('error', () => {
            resolve(true);
        });
    });
}

// Função para aguardar um tempo
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Função para iniciar o backend
async function startBackend() {
    log('🚀 Iniciando Backend...', 'blue');
    
    // Verificar se a porta 3001 está em uso
    const backendPortInUse = await isPortInUse(3001);
    if (backendPortInUse) {
        log('⚠️  Porta 3001 já está em uso. Backend pode já estar rodando.', 'yellow');
        return null;
    }
    
    const backend = spawn('npm', ['run', 'start:back'], {
        cwd: path.resolve(__dirname),
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true
    });
    
    backend.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
            log(`[BACKEND] ${output}`, 'green');
        }
    });
    
    backend.stderr.on('data', (data) => {
        const output = data.toString().trim();
        if (output && !output.includes('DeprecationWarning')) {
            log(`[BACKEND ERROR] ${output}`, 'red');
        }
    });
    
    backend.on('close', (code) => {
        if (code !== 0) {
            log(`❌ Backend encerrado com código ${code}`, 'red');
        } else {
            log('✅ Backend encerrado normalmente', 'green');
        }
    });
    
    backend.on('error', (error) => {
        log(`❌ Erro ao iniciar backend: ${error.message}`, 'red');
    });
    
    return backend;
}

// Função para iniciar o frontend
async function startFrontend() {
    log('🎨 Iniciando Frontend...', 'cyan');
    
    // Verificar se o diretório frontend existe
    const frontendPath = path.join(path.resolve(__dirname), 'frontend');
    if (!fs.existsSync(frontendPath)) {
        log('❌ Diretório frontend não encontrado!', 'red');
        return null;
    }
    
    // Verificar se a porta 3003 está em uso
    const frontendPortInUse = await isPortInUse(3003);
    if (frontendPortInUse) {
        log('⚠️  Porta 3003 já está em uso. Frontend pode já estar rodando.', 'yellow');
        return null;
    }
    
    // Aguardar um pouco para o backend inicializar
    await sleep(3000);
    
    const frontend = spawn('npm', ['start'], {
        cwd: frontendPath,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
        env: {
            ...process.env,
            PORT: '3003',
            HOST: '0.0.0.0',
            BROWSER: 'none' // Não abrir o navegador automaticamente
        }
    });
    
    frontend.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
            log(`[FRONTEND] ${output}`, 'cyan');
        }
    });
    
    frontend.stderr.on('data', (data) => {
        const output = data.toString().trim();
        if (output && !output.includes('DeprecationWarning')) {
            log(`[FRONTEND ERROR] ${output}`, 'red');
        }
    });
    
    frontend.on('close', (code) => {
        if (code !== 0) {
            log(`❌ Frontend encerrado com código ${code}`, 'red');
        } else {
            log('✅ Frontend encerrado normalmente', 'cyan');
        }
    });
    
    frontend.on('error', (error) => {
        log(`❌ Erro ao iniciar frontend: ${error.message}`, 'red');
    });
    
    return frontend;
}

// Função principal
async function main() {
    log('🔥 Iniciando Sistema de Cobrança...', 'bright');
    log('📋 Backend: http://localhost:3001', 'blue');
    log('🌐 Frontend: http://localhost:3003', 'cyan');
    log('', 'reset');
    
    const processes = [];
    
    try {
        // Iniciar backend
        const backend = await startBackend();
        if (backend) {
            processes.push(backend);
        }
        
        // Iniciar frontend
        const frontend = await startFrontend();
        if (frontend) {
            processes.push(frontend);
        }
        
        if (processes.length === 0) {
            log('❌ Nenhum processo foi iniciado. Verifique se as portas estão livres.', 'red');
            process.exit(1);
        }
        
        // Aguardar um pouco e mostrar status
        await sleep(5000);
        log('', 'reset');
        log('✅ Sistema iniciado com sucesso!', 'green');
        log('📊 Acesse o painel em: http://localhost:3003', 'bright');
        log('🔌 API disponível em: http://localhost:3001', 'bright');
        log('', 'reset');
        log('💡 Pressione Ctrl+C para encerrar todos os serviços', 'yellow');
        
    } catch (error) {
        log(`❌ Erro ao iniciar sistema: ${error.message}`, 'red');
        process.exit(1);
    }
    
    // Tratamento de encerramento
    process.on('SIGINT', () => {
        log('', 'reset');
        log('🛑 Encerrando sistema...', 'yellow');
        
        processes.forEach((proc, index) => {
            if (proc && !proc.killed) {
                const serviceName = index === 0 ? 'Backend' : 'Frontend';
                log(`🔄 Encerrando ${serviceName}...`, 'yellow');
                proc.kill('SIGTERM');
                
                // Forçar encerramento após 5 segundos
                setTimeout(() => {
                    if (!proc.killed) {
                        log(`⚡ Forçando encerramento do ${serviceName}...`, 'red');
                        proc.kill('SIGKILL');
                    }
                }, 5000);
            }
        });
        
        setTimeout(() => {
            log('✅ Sistema encerrado!', 'green');
            process.exit(0);
        }, 6000);
    });
    
    // Manter o processo principal vivo
    process.stdin.resume();
}

// Verificar se é ambiente de produção
if (process.env.NODE_ENV === 'production') {
    log('🏭 Modo de produção detectado', 'magenta');
    log('💡 Para produção, use: ./start-production.sh', 'yellow');
    log('', 'reset');
}

// Iniciar aplicação
main().catch((error) => {
    log(`❌ Erro fatal: ${error.message}`, 'red');
    process.exit(1);
});