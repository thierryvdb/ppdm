require('dotenv').config();
const express = require('express');
const axios = require('axios');
const https = require('https');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Configuração para aceitar certificados SSL auto-assinados (apenas para desenvolvimento)
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

// Armazenamento em memória dos dados das atividades
let activitiesData = null;
let authToken = null;
let tokenExpirationTime = null;

// Função para autenticar e obter o token
async function authenticatePPDM(reason = 'inicial') {
  try {
    console.log(`[AUTH] Tentando autenticar na API PPDM (motivo: ${reason})...`);

    const response = await axios.post(
      `${process.env.PPDM_API_URL}/login`,
      {
        username: process.env.PPDM_LOGIN,
        password: process.env.PPDM_PASSWORD
      },
      {
        httpsAgent,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    authToken = response.data.access_token;

    // Assumindo que o token expira em 1 hora (ajuste conforme necessário)
    tokenExpirationTime = Date.now() + (60 * 60 * 1000);

    const expiresIn = new Date(tokenExpirationTime).toLocaleString('pt-BR');
    console.log(`[AUTH] ✓ Autenticação bem-sucedida! Token válido até: ${expiresIn}`);

    return authToken;
  } catch (error) {
    console.error('[AUTH] ✗ Erro ao autenticar:', error.message);
    if (error.response) {
      console.error('[AUTH] Status:', error.response.status);
      console.error('[AUTH] Dados:', error.response.data);
    }
    return null;
  }
}

// Função para verificar se o token ainda é válido
function isTokenValid() {
  return authToken && tokenExpirationTime && Date.now() < tokenExpirationTime;
}

// Função para buscar atividades da API PPDM
async function fetchActivities() {
  try {
    // Se estiver em modo mock, usar o arquivo saida.json
    if (process.env.USE_MOCK_DATA === 'true') {
      console.log('[FETCH] Usando dados mock do arquivo saida.json');
      const mockData = JSON.parse(
        fs.readFileSync(path.join(__dirname, 'saida.json'), 'utf8')
      );
      activitiesData = mockData;
      console.log(`[FETCH] ${mockData.content?.length || 0} atividades carregadas do mock`);
      return mockData;
    }

    // Verificar se o token é válido, senão autenticar novamente (RENOVAÇÃO REATIVA)
    if (!isTokenValid()) {
      console.log('[FETCH] ⚠️  Token inválido ou expirado detectado na verificação');
      await authenticatePPDM('token expirado - renovação reativa');
    }

    if (!authToken) {
      console.error('[FETCH] Não foi possível obter o token de autenticação');
      return null;
    }

    console.log('[FETCH] Buscando atividades da API PPDM...');

    const response = await axios.get(
      `${process.env.PPDM_API_URL}/activities`,
      {
        httpsAgent,
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    activitiesData = response.data;
    console.log(`[FETCH] ${response.data.content?.length || 0} atividades carregadas`);
    return response.data;
  } catch (error) {
    console.error('[FETCH] Erro ao buscar atividades:', error.message);
    if (error.response) {
      console.error('[FETCH] Status:', error.response.status);
      console.error('[FETCH] Dados:', error.response.data);

      // Se for erro 401, tentar autenticar novamente (RENOVAÇÃO REATIVA)
      if (error.response.status === 401) {
        console.log('[FETCH] ⚠️  Token expirado (erro 401 da API)');
        authToken = null;
        tokenExpirationTime = null;
        await authenticatePPDM('erro 401 - renovação reativa');
      }
    }
    return null;
  }
}

// Rota para obter as atividades
app.get('/ppdm-activities', (req, res) => {
  if (!activitiesData) {
    return res.status(503).json({
      error: 'Dados ainda não disponíveis',
      message: 'Aguarde a primeira sincronização com a API'
    });
  }

  res.json(activitiesData);
});

// Rota de health check
app.get('/health', (req, res) => {
  const tokenInfo = tokenExpirationTime ? {
    expiresAt: new Date(tokenExpirationTime).toISOString(),
    expiresIn: Math.max(0, Math.floor((tokenExpirationTime - Date.now()) / 1000)),
    isValid: isTokenValid()
  } : null;

  res.json({
    status: 'OK',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    hasActivitiesData: !!activitiesData,
    hasAuthToken: !!authToken,
    tokenInfo: tokenInfo,
    useMockData: process.env.USE_MOCK_DATA === 'true'
  });
});

// Função para renovar o token proativamente
async function startTokenRefreshService() {
  if (process.env.USE_MOCK_DATA !== 'true') {
    // Renovar token a cada 55 minutos (antes de expirar em 1 hora) - RENOVAÇÃO PROATIVA
    setInterval(async () => {
      console.log('[TOKEN-REFRESH] 🔄 Renovando token proativamente (timer 55 min)...');
      await authenticatePPDM('renovação proativa - timer 55 minutos');
    }, 55 * 60 * 1000); // 55 minutos

    console.log('[TOKEN-REFRESH] ✓ Serviço de renovação proativa configurado (intervalo: 55 minutos)');
    console.log('[TOKEN-REFRESH] ℹ️  Renovação também ocorre reativamente quando o token expira');
  } else {
    console.log('[TOKEN-REFRESH] ℹ️  Renovação de token desabilitada (modo mock)');
  }
}

// Função para iniciar o serviço de sincronização
async function startSyncService() {
  console.log('[SYNC] Iniciando serviço de sincronização...');

  // Buscar dados imediatamente ao iniciar
  await fetchActivities();

  // Configurar intervalo de 1 minuto (60000 ms)
  setInterval(async () => {
    console.log('[SYNC] Executando sincronização agendada...');
    await fetchActivities();
  }, 60000);

  console.log('[SYNC] Serviço de sincronização configurado (intervalo: 1 minuto)');
}

// Iniciar servidor em todas as interfaces (0.0.0.0)
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Server PPDM Backend rodando na porta ${PORT}`);
  console.log(`Escutando em todas as interfaces (0.0.0.0)`);
  console.log(`${'='.repeat(50)}\n`);
  console.log(`Rotas disponíveis:`);
  console.log(`  GET http://localhost:${PORT}/ppdm-activities`);
  console.log(`  GET http://<seu-ip>:${PORT}/ppdm-activities`);
  console.log(`  GET http://localhost:${PORT}/health`);
  console.log(`\nModo: ${process.env.USE_MOCK_DATA === 'true' ? 'MOCK (usando saida.json)' : 'API REAL'}\n`);

  // Iniciar serviço de sincronização
  await startSyncService();

  // Iniciar serviço de renovação de token
  await startTokenRefreshService();
});

// Tratamento de erros não capturados
process.on('unhandledRejection', (reason, promise) => {
  console.error('[ERROR] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[ERROR] Uncaught Exception:', error);
});
