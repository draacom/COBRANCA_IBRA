const axios = require('axios');

const API_URL = 'http://localhost:8081';
const API_KEY = '30fc8d3c-b9e5-483e-b0da-a0b6ec082f39'; // Peguei do .env ou settings padrão, vou confirmar se é essa
const INSTANCE_NAME = 'default';

async function testEvolution() {
    console.log('🔍 Iniciando diagnóstico da Evolution API...');

    // 1. Verificar Status da Instância
    try {
        console.log(`\n1️⃣ Testando Connection State (/instance/connectionState/${INSTANCE_NAME})...`);
        const resState = await axios.get(`${API_URL}/instance/connectionState/${INSTANCE_NAME}`, {
            headers: { 'apikey': API_KEY }
        });
        console.log('✅ Status Code:', resState.status);
        console.log('📦 Response Body:', JSON.stringify(resState.data, null, 2));
    } catch (error) {
        console.error('❌ Erro ao verificar status:', error.message);
        if (error.response) console.error('Dados do erro:', error.response.data);
    }

    // 2. Tentar Obter QR Code (Connect)
    try {
        console.log(`\n2️⃣ Testando Connect/QR Code (/instance/connect/${INSTANCE_NAME})...`);
        const resConnect = await axios.get(`${API_URL}/instance/connect/${INSTANCE_NAME}`, {
            headers: { 'apikey': API_KEY }
        });
        console.log('✅ Status Code:', resConnect.status);
        // Não logar o base64 inteiro para não poluir
        const data = resConnect.data;
        if (data.base64) data.base64 = '[BASE64_STRING_OMITTED]';
        if (data.qrcode?.base64) data.qrcode.base64 = '[BASE64_STRING_OMITTED]';
        console.log('📦 Response Body:', JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('❌ Erro ao conectar/gerar QR:', error.message);
        if (error.response) console.error('Dados do erro:', error.response.data);
    }

    // 3. Listar todas as instâncias (para ver se "default" existe mesmo)
    try {
        console.log(`\n3️⃣ Listando todas as instâncias (/instance/fetchInstances)...`);
        const resList = await axios.get(`${API_URL}/instance/fetchInstances`, {
            headers: { 'apikey': API_KEY }
        });
        console.log('✅ Status Code:', resList.status);
        console.log('📦 Response Body:', JSON.stringify(resList.data, null, 2));
    } catch (error) {
        console.error('❌ Erro ao listar instâncias:', error.message);
        if (error.response) console.error('Dados do erro:', error.response.data);
    }
}

testEvolution();
