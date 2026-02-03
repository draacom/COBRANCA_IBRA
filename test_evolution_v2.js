const axios = require('axios');

const apiUrl = 'http://localhost:8080';
const apiKey = '30fc8d3c-b9e5-483e-b0da-a0b6ec082f39';

async function testCreate() {
    try {
        console.log('Tentando criar instância...');
        const response = await axios.post(`${apiUrl}/instance/create`, {
            instanceName: 'default',
            qrcode: true,
            integration: 'WHATSAPP-BAILEYS'
        }, {
            headers: { 'apikey': apiKey }
        });
        console.log('Sucesso:', response.data);
    } catch (error) {
        console.error('Erro:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

testCreate();
