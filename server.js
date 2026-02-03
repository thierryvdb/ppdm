require('dotenv').config();
const express = require('express');
const axios = require('axios');
const https = require('https');
const fs = require('fs');
const path = require('path');
const promClient = require('prom-client');

const app = express();
const PORT = process.env.PORT || 3000;

const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

const fetchDurationGauge = new promClient.Gauge({
  name: 'ppdm_fetch_duration_seconds',
  help: 'Duração da última sincronização com a API PPDM em segundos',
  registers: [register]
});

const fetchSuccessGauge = new promClient.Gauge({
  name: 'ppdm_fetch_success',
  help: '1 quando a última sincronização foi bem-sucedida, 0 caso contrário',
  registers: [register]
});

const activitiesCountGauge = new promClient.Gauge({
  name: 'ppdm_activities_cached',
  help: 'Quantidade de atividades armazenadas em cache pelo backend',
  registers: [register]
});

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
const FALLBACK_HOST_NAME = 'se1.tre-se.gov.br';
const RECENT_WINDOW_HOURS = 72;
const RECENT_PAGE_SIZE = 200;
const FULL_PAGE_SIZE = 200;
const SNAPSHOT_FILE_PATH = path.join(__dirname, 'saida.json');
const SNAPSHOT_HOUR = 23;
const SNAPSHOT_MINUTE = 59;

function updateCacheMetrics(data) {
  activitiesCountGauge.set(data?.content?.length ?? 0);
}

let historicalSnapshot = null;
let recentActivitiesCache = null;
let diskSnapshotCache = null;

function readSnapshotFromDisk(forceReload = false) {
  if (diskSnapshotCache && !forceReload) {
    return diskSnapshotCache;
  }

  try {
    const fileContent = fs.readFileSync(SNAPSHOT_FILE_PATH, 'utf8');
    const parsed = JSON.parse(fileContent);
    diskSnapshotCache = parsed;
    console.log(`[SNAPSHOT] saida.json carregado (${parsed.content?.length || 0} itens)`);
    return parsed;
  } catch (error) {
    console.warn(`[SNAPSHOT] Não foi possível ler saida.json: ${error.message}`);
    diskSnapshotCache = null;
    return null;
  }
}

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
  const snapshot = readSnapshotFromDisk();
  if (!snapshot) {
    console.warn('[FETCH] saida.json não disponível - modo mock ficará sem dados');
    return null;
  }
  updateCacheMetrics(snapshot);
  return snapshot;
}

// Função para buscar atividades da API PPDM (últimas 72 horas)
async function fetchActivities() {
  const fetchStart = Date.now();
  if (process.env.USE_MOCK_DATA === 'true') {
    console.log('[FETCH] Usando dados mock (cache em memória)');
    activitiesData = loadMockData();
    const durationSeconds = (Date.now() - fetchStart) / 1000;
    fetchDurationGauge.set(durationSeconds);
    fetchSuccessGauge.set(activitiesData ? 1 : 0);
    return activitiesData;
  }

  try {
    await ensureAuthenticated('busca das últimas 72 horas');

    if (!authToken) {
      console.error('[FETCH] Não foi possível obter o token de autenticação');
      fetchSuccessGauge.set(0);
      return null;
    }

    console.log(`[FETCH] Solicitando atividades dos últimos ${RECENT_WINDOW_HOURS}h da API PPDM...`);
    const sinceTimestamp = new Date(Date.now() - RECENT_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
    const filter = `startTime ge "${sinceTimestamp}"`;
    const recentContent = await fetchPaginatedActivities({ filter, pageSize: RECENT_PAGE_SIZE });

    recentActivitiesCache = {
      page: {
        size: recentContent.length,
        number: 1,
        totalPages: 1,
        totalElements: recentContent.length
      },
      content: recentContent
    };

    console.log(`[FETCH] ${recentContent.length} registros recentes carregados`);
    rebuildActivitiesData();
    fetchSuccessGauge.set(1);
    return activitiesData;
  } catch (error) {
    console.error('[FETCH] Erro ao buscar atividades recentes:', error.message);
    if (error.response) {
      console.error('[FETCH] Status:', error.response.status);
      console.error('[FETCH] Dados:', error.response.data);
      if (error.response.status === 401) {
        console.log('[FETCH] Token expirado (erro 401 da API)');
        authToken = null;
        tokenExpirationTime = null;
        await authenticatePPDM('erro 401 - renovação reativa');
      }
    }
    fetchSuccessGauge.set(0);
    return null;
  } finally {
    const durationSeconds = (Date.now() - fetchStart) / 1000;
    fetchDurationGauge.set(durationSeconds);
  }
}

function mergeActivities(historical = [], recent = []) {
  const map = new Map();
  historical.forEach(activity => {
    if (activity?.id) {
      map.set(activity.id, activity);
    }
  });
  recent.forEach(activity => {
    if (activity?.id) {
      map.set(activity.id, activity);
    }
  });

  return Array.from(map.values())
    .sort((a, b) => {
      const aTime = new Date(a.endTime || a.startTime).getTime() || 0;
      const bTime = new Date(b.endTime || b.startTime).getTime() || 0;
      return bTime - aTime;
    });
}

function rebuildActivitiesData() {
  const recent = recentActivitiesCache?.content ?? [];
  const historical = historicalSnapshot?.content ?? [];
  const merged = mergeActivities(historical, recent);
  activitiesData = {
    page: {
      size: merged.length,
      number: 1,
      totalPages: 1,
      totalElements: merged.length
    },
    content: merged,
    _links: {
      self: { href: `${process.env.PPDM_API_URL}/activities` }
    }
  };
  updateCacheMetrics(activitiesData);
}

async function ensureAuthenticated(reason) {
  if (!isTokenValid()) {
    console.log(`[AUTH] Token inválido antes de ${reason}`);
    await authenticatePPDM(reason);
  }
}

async function fetchPaginatedActivities({ filter = '', pageSize = RECENT_PAGE_SIZE } = {}) {
  const accumulated = [];
  let currentPage = 1;
  let totalPages = 1;
  const params = new URLSearchParams();
  params.set('pageSize', String(pageSize));
  if (filter) {
    params.set('filter', filter);
  }

  do {
    params.set('page', String(currentPage));
    const url = `${process.env.PPDM_API_URL}/activities?${params.toString()}`;
    const response = await axios.get(url, {
      httpsAgent,
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    });
    const data = response.data || {};
    const pageContent = Array.isArray(data.content) ? data.content : [];
    accumulated.push(...pageContent);
    totalPages = data.page?.totalPages ?? currentPage;
    console.log(`[FETCH] Página ${currentPage}/${totalPages} carregada (${pageContent.length} registros)`);
    currentPage += 1;
  } while (currentPage <= totalPages);

  return accumulated;
}

async function downloadFullActivitiesSnapshot() {
  if (process.env.USE_MOCK_DATA === 'true') {
    console.log('[SNAPSHOT] Modo mock ativo; download completo não será executado');
    return;
  }

  try {
    await ensureAuthenticated('snapshot diário completo');
    console.log('[SNAPSHOT] Iniciando download completo das atividades (paginação)...');
    const allContent = await fetchPaginatedActivities({ pageSize: FULL_PAGE_SIZE });
    const snapshotPayload = {
      page: {
        size: allContent.length,
        number: 1,
        totalPages: 1,
        totalElements: allContent.length
      },
      content: allContent,
      _links: {
        self: { href: `${process.env.PPDM_API_URL}/activities` }
      }
    };
    fs.writeFileSync(SNAPSHOT_FILE_PATH, JSON.stringify(snapshotPayload, null, 2), 'utf8');
    diskSnapshotCache = snapshotPayload;
    historicalSnapshot = snapshotPayload;
    console.log(`[SNAPSHOT] Download completo salvo em saida.json (${allContent.length} registros)`);
    rebuildActivitiesData();
  } catch (error) {
    console.error('[SNAPSHOT] Erro ao baixar snapshot completo:', error.message);
    if (error.response) {
      console.error('[SNAPSHOT] Status:', error.response.status);
      console.error('[SNAPSHOT] Dados:', error.response.data);
    }
  }
}

function getNextSnapshotTime(hour = SNAPSHOT_HOUR, minute = SNAPSHOT_MINUTE) {
  const next = new Date();
  next.setHours(hour, minute, 0, 0);
  if (next <= Date.now()) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

function startDailySnapshotService() {
  if (process.env.USE_MOCK_DATA === 'true') {
    console.log('[SNAPSHOT] Modo mock ativo; job diário desabilitado');
    return;
  }

  const nextRun = getNextSnapshotTime();
  const delay = nextRun.getTime() - Date.now();
  console.log(`[SNAPSHOT] Próximo download completo agendado para ${nextRun.toISOString()}`);
  setTimeout(async () => {
    try {
      console.log('[SNAPSHOT] Executando captura completa diária...');
      await downloadFullActivitiesSnapshot();
    } catch (error) {
      console.error('[SNAPSHOT] Ocorreu um erro na captura diária:', error.message);
    } finally {
      startDailySnapshotService();
    }
  }, delay);
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

// Endpoint com métricas agregadas usadas pelos novos cards do Grafana
app.get('/stats/summary', (_req, res) => {
  if (!activitiesData || !activitiesData.content) {
    return res.status(503).json({ error: 'Dados ainda não disponíveis' });
  }

  const content = activitiesData.content;
  const total = content.length;
  const ok = content.filter(a => a.result?.status === 'OK').length;
  const averageDurationMs = total
    ? content.reduce((sum, activity) => sum + (activity.duration ?? 0), 0) / total
    : 0;
  const totalBytes = content.reduce((sum, activity) => sum + Number(activity.stats?.bytesTransferred ?? 0), 0);
  const hostCount = new Set(content.map(activity => activity.host?.name || FALLBACK_HOST_NAME)).size;

  res.json({
    successRate: total ? (ok / total) * 100 : 0,
    averageDurationMs,
    totalBytes,
    hostCount
  });
});

// Endpoint com métricas por host para dashboards de hosts
app.get('/stats/hosts', (_req, res) => {
  if (!activitiesData || !activitiesData.content) {
    return res.status(503).json({ error: 'Dados ainda não disponíveis' });
  }

  const hostMetrics = buildHostMetrics(activitiesData.content);
  res.json({ hosts: hostMetrics });
});

function buildHostMetrics(activities = []) {
  const hosts = {};

  activities.forEach(activity => {
    const hostName = activity.host?.name || FALLBACK_HOST_NAME;
    if (!hosts[hostName]) {
      hosts[hostName] = {
        name: hostName,
        total: 0,
        success: 0,
        durationSum: 0,
        bytesSum: 0,
        lastStatus: activity.result?.status || 'UNKNOWN',
        lastRun: activity.endTime || activity.startTime || null
      };
    }

    const host = hosts[hostName];
    host.total += 1;
    if (activity.result?.status === 'OK') {
      host.success += 1;
    }
    host.durationSum += activity.duration ?? 0;
    host.bytesSum += Number(activity.stats?.bytesTransferred ?? 0);

    const activityTime = new Date(activity.endTime || activity.startTime).getTime() || 0;
    const currentLastTime = host.lastRun ? new Date(host.lastRun).getTime() : 0;
    if (activityTime > currentLastTime) {
      host.lastStatus = activity.result?.status || host.lastStatus;
      host.lastRun = activity.endTime || activity.startTime;
    }
  });

  return Object.values(hosts)
    .map(host => ({
      name: host.name,
      totalExecutions: host.total,
      successRate: host.total ? (host.success / host.total) * 100 : 0,
      averageDurationMs: host.total ? host.durationSum / host.total : 0,
      totalBytes: host.bytesSum,
      lastStatus: host.lastStatus,
      lastRun: host.lastRun
    }))
    .sort((a, b) => b.totalExecutions - a.totalExecutions);
}

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

// ------------------------------------------------------------------
// Endpoints para Dashboard Individual (filtrado por nome da atividade)
// ------------------------------------------------------------------

// Lista de atividades únicas (para dropdown/variável do Grafana)
// Retorna formato compatível com variáveis do Grafana: array de objetos com __text e __value
app.get('/activities/list', (_req, res) => {
  if (!activitiesData || !activitiesData.content) {
    return res.status(503).json([]);
  }
  const names = [...new Set(
    activitiesData.content
      .filter(a => a.classType === 'JOB_GROUP' || !a.parentId)
      .map(a => a.name)
      .filter(Boolean)
  )].sort();
  // Formato para variáveis do Grafana
  res.json(names.map(name => ({ __text: name, __value: name, name })));
});

// Estatísticas filtradas por nome da atividade (query param ou path param)
app.get('/activity/stats', (req, res) => {
  if (!activitiesData || !activitiesData.content) {
    return res.status(503).json({ error: 'Dados ainda não disponíveis' });
  }

  const activityName = req.query.name || '';
  console.log(`[DEBUG] /activity/stats - name param: "${activityName}"`);
  const content = activitiesData.content.filter(a =>
    (a.classType === 'JOB_GROUP' || !a.parentId) &&
    a.name === activityName
  );

  const stats = {
    total: content.length,
    ok: content.filter(a => a.result?.status === 'OK').length,
    failed: content.filter(a => a.result?.status === 'FAILED' || a.result?.status === 'ERROR').length,
    warning: content.filter(a => a.result?.status === 'WARNING').length,
    running: content.filter(a => a.result?.status === 'RUNNING').length,
    avgDuration: content.length > 0
      ? Math.round(content.reduce((sum, a) => sum + (a.duration || 0), 0) / content.length / 60000 * 100) / 100
      : 0,
    totalBytes: content.reduce((sum, a) => sum + (a.stats?.bytesTransferred || 0), 0),
    lastStatus: content.length > 0 ? (content.sort((a, b) => new Date(b.startTime) - new Date(a.startTime))[0]?.result?.status || 'N/A') : 'N/A'
  };

  res.json(stats);
});

// Histórico de duração filtrado por nome da atividade
app.get('/activity/duration', (req, res) => {
  if (!activitiesData || !activitiesData.content) {
    return res.status(503).json([]);
  }

  const activityName = req.query.name || '';
  const data = activitiesData.content
    .filter(a =>
      a.startTime &&
      a.duration &&
      (a.classType === 'JOB_GROUP' || !a.parentId) &&
      a.name === activityName
    )
    .map(a => ({
      time: a.startTime,
      duration: Math.round(a.duration / 60000 * 100) / 100
    }))
    .sort((a, b) => new Date(a.time) - new Date(b.time));
  res.json(data);
});

// Histórico de bytes filtrado por nome da atividade
app.get('/activity/bytes', (req, res) => {
  if (!activitiesData || !activitiesData.content) {
    return res.status(503).json([]);
  }

  const activityName = req.query.name || '';
  const data = activitiesData.content
    .filter(a =>
      a.startTime &&
      a.stats?.bytesTransferred &&
      (a.classType === 'JOB_GROUP' || !a.parentId) &&
      a.name === activityName
    )
    .map(a => ({
      time: a.startTime,
      bytes: a.stats.bytesTransferred
    }))
    .sort((a, b) => new Date(a.time) - new Date(b.time));
  res.json(data);
});

// Tabela de execuções filtrada por nome da atividade
app.get('/activity/executions', (req, res) => {
  if (!activitiesData || !activitiesData.content) {
    return res.status(503).json([]);
  }

  const activityName = req.query.name || '';
  const data = activitiesData.content
    .filter(a => (a.classType === 'JOB_GROUP' || !a.parentId) && a.name === activityName)
    .map(a => ({
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

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.send(await register.metrics());
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

// Restaurar dados em memória a partir do último snapshot disponível
if (process.env.USE_MOCK_DATA === 'true') {
  activitiesData = loadMockData();
} else {
  historicalSnapshot = readSnapshotFromDisk();
  rebuildActivitiesData();
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
  console.log(`  GET  http://localhost:${PORT}/metrics`);
  console.log(`\nModo: ${process.env.USE_MOCK_DATA === 'true' ? 'MOCK (usando saida.json)' : 'API REAL'}\n`);

  // Iniciar serviço de sincronização
  await startSyncService();

  // Iniciar serviço de renovação de token
  await startTokenRefreshService();

  // Agendar download completo diário
  startDailySnapshotService();
});

// Tratamento de erros não capturados
process.on('unhandledRejection', (reason, promise) => {
  console.error('[ERROR] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[ERROR] Uncaught Exception:', error);
});
