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

// CORS – permite que o Grafana (ou qualquer origem) acesse a API
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});
app.options('*', (_req, res) => res.sendStatus(200));

// DEBUG: loga TODAS as requests recebidas para diagnosticar o Grafana
app.use((req, _res, next) => {
  console.log(`[DEBUG] ${req.method} ${req.url} | Content-Type: ${req.headers['content-type'] || '-'} | Body keys: ${req.body ? Object.keys(req.body).join(',') : '-'}`);
  next();
});

// Configuração para aceitar certificados SSL auto-assinados (apenas para desenvolvimento)
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

// Armazenamento em memória dos dados das atividades
let activitiesData = null;
let authToken = null;
let tokenExpirationTime = null;

// Cache do mock para evitar releitura do disco a cada ciclo
let mockCache = null;

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
    console.log(`[AUTH] Autenticação bem-sucedida! Token válido até: ${expiresIn}`);

    return authToken;
  } catch (error) {
    console.error('[AUTH] Erro ao autenticar:', error.message);
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

// Carrega mock uma única vez do disco e guarda em memória
function loadMockData() {
  if (!mockCache) {
    console.log('[FETCH] Lendo saida.json do disco (primeira vez)...');
    mockCache = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'saida.json'), 'utf8')
    );
    console.log(`[FETCH] ${mockCache.content?.length || 0} atividades carregadas do mock`);
  }
  return mockCache;
}

// Função para buscar atividades da API PPDM
async function fetchActivities() {
  try {
    // Se estiver em modo mock, usar o arquivo saida.json (cache em memória)
    if (process.env.USE_MOCK_DATA === 'true') {
      console.log('[FETCH] Usando dados mock (cache em memória)');
      activitiesData = loadMockData();
      return activitiesData;
    }

    // Verificar se o token é válido, senão autenticar novamente (RENOVAÇÃO REATIVA)
    if (!isTokenValid()) {
      console.log('[FETCH] Token inválido ou expirado detectado na verificação');
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
        console.log('[FETCH] Token expirado (erro 401 da API)');
        authToken = null;
        tokenExpirationTime = null;
        await authenticatePPDM('erro 401 - renovação reativa');
      }
    }
    return null;
  }
}

// Resposta padrão para endpoints de dados – retorna o JSON raw das atividades
function sendActivities(_req, res) {
  if (!activitiesData) {
    return res.status(503).json({
      error: 'Dados ainda não disponíveis',
      message: 'Aguarde a primeira sincronização com a API'
    });
  }
  res.json(activitiesData);
}

// ------------------------------------------------------------------
// Rotas de dados – retornam JSON raw para Vue.js e Grafana JSON plugin
// ------------------------------------------------------------------

// GET /ppdm-activities  – usado pelo front-end Vue
app.get('/ppdm-activities', sendActivities);

// POST /ppdm-activities – usado pelo plugin JSON do Grafana (alguns plugins usam POST)
app.post('/ppdm-activities', sendActivities);

// GET / – o plugin marcusolsson-json-datasource faz GET na URL base do datasource.
//         Se não retornar os dados aqui, o Grafana mostra "No data".
app.get('/', sendActivities);

// POST / – fallback para plugins que usam POST
app.post('/', sendActivities);

// ------------------------------------------------------------------
// Endpoints para Grafana - retornam estatísticas pré-calculadas
// ------------------------------------------------------------------

// Estatísticas gerais para os painéis Stat do Grafana
app.get('/stats', (_req, res) => {
  if (!activitiesData || !activitiesData.content) {
    return res.status(503).json({ error: 'Dados ainda não disponíveis' });
  }

  const content = activitiesData.content;
  const stats = {
    total: content.length,
    ok: content.filter(a => a.result?.status === 'OK').length,
    failed: content.filter(a => a.result?.status === 'FAILED' || a.result?.status === 'ERROR').length,
    warning: content.filter(a => a.result?.status === 'WARNING').length,
    running: content.filter(a => a.result?.status === 'RUNNING').length
  };

  res.json(stats);
});

// Endpoint para contagem de jobs OK
app.get('/stats/ok', (_req, res) => {
  if (!activitiesData || !activitiesData.content) {
    return res.status(503).json({ error: 'Dados ainda não disponíveis' });
  }
  const count = activitiesData.content.filter(a => a.result?.status === 'OK').length;
  res.json({ count });
});

// Endpoint para contagem de jobs Failed/Error
app.get('/stats/failed', (_req, res) => {
  if (!activitiesData || !activitiesData.content) {
    return res.status(503).json({ error: 'Dados ainda não disponíveis' });
  }
  const count = activitiesData.content.filter(a =>
    a.result?.status === 'FAILED' || a.result?.status === 'ERROR'
  ).length;
  res.json({ count });
});

// Endpoint para contagem de jobs Warning
app.get('/stats/warning', (_req, res) => {
  if (!activitiesData || !activitiesData.content) {
    return res.status(503).json({ error: 'Dados ainda não disponíveis' });
  }
  const count = activitiesData.content.filter(a => a.result?.status === 'WARNING').length;
  res.json({ count });
});

// ------------------------------------------------------------------
// Endpoints para gráficos e tabela do Grafana (arrays simples)
// ------------------------------------------------------------------

// Dados para o gráfico de duração (array de objetos com time e duration em minutos)
// Filtra apenas JOB_GROUP ou jobs sem pai para evitar duplicação
app.get('/chart/duration', (_req, res) => {
  if (!activitiesData || !activitiesData.content) {
    return res.status(503).json([]);
  }
  const data = activitiesData.content
    .filter(a => a.startTime && a.duration && (a.classType === 'JOB_GROUP' || !a.parentId))
    .map(a => ({
      time: a.startTime,
      duration: Math.round(a.duration / 60000 * 100) / 100 // converte ms para minutos (2 decimais)
    }))
    .sort((a, b) => new Date(a.time) - new Date(b.time));
  res.json(data);
});

// Dados para o gráfico de bytes transferidos
// Filtra apenas JOB_GROUP ou jobs sem pai para evitar duplicação
app.get('/chart/bytes', (_req, res) => {
  if (!activitiesData || !activitiesData.content) {
    return res.status(503).json([]);
  }
  const data = activitiesData.content
    .filter(a => a.startTime && a.stats?.bytesTransferred && (a.classType === 'JOB_GROUP' || !a.parentId))
    .map(a => ({
      time: a.startTime,
      bytes: a.stats.bytesTransferred
    }))
    .sort((a, b) => new Date(a.time) - new Date(b.time));
  res.json(data);
});

// Dados para a tabela de atividades (ordenado por start decrescente - mais recentes primeiro)
// Filtra apenas JOB_GROUP (atividades pai) para evitar duplicação com jobs filhos
app.get('/table/activities', (_req, res) => {
  if (!activitiesData || !activitiesData.content) {
    return res.status(503).json([]);
  }
  const data = activitiesData.content
    // Filtra apenas JOB_GROUP (resumos) ou jobs que não têm pai (atividades independentes)
    .filter(a => a.classType === 'JOB_GROUP' || !a.parentId)
    .map(a => ({
      name: a.name || '',
      category: a.category || '',
      status: a.result?.status || '',
      state: a.state || '',
      start: a.startTime || '',
      end: a.endTime || '',
      duration: a.duration || 0,
      bytes: a.stats?.bytesTransferred || 0
    }))
    .sort((a, b) => new Date(b.start) - new Date(a.start));
  res.json(data);
});

// Rota de health check
app.get('/health', (_req, res) => {
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
      console.log('[TOKEN-REFRESH] Renovando token proativamente (timer 55 min)...');
      await authenticatePPDM('renovação proativa - timer 55 minutos');
    }, 55 * 60 * 1000); // 55 minutos

    console.log('[TOKEN-REFRESH] Serviço de renovação proativa configurado (intervalo: 55 minutos)');
    console.log('[TOKEN-REFRESH] Renovação também ocorre reativamente quando o token expira');
  } else {
    console.log('[TOKEN-REFRESH] Renovação de token desabilitada (modo mock)');
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
  console.log(`  GET  http://localhost:${PORT}/ppdm-activities`);
  console.log(`  POST http://localhost:${PORT}/ppdm-activities`);
  console.log(`  GET  http://localhost:${PORT}/health`);
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
