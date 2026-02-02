# PPDM Full Stack

Sistema completo para integração e monitoramento do PowerProtect Data Manager (PPDM).

## Componentes

- **Backend (Node.js)**: API REST com autenticação e sincronização automática
- **Frontend (Vue.js)**: Dashboard interativo com gráficos e alertas

## Início Rápido

```bash
# 1. Clone ou navegue até o diretório do projeto
cd ppdm

# 2. Inicie tudo com Docker (recomendado)
docker-compose up -d

# 3. Verifique os logs
docker-compose logs -f

# 4. Acesse as aplicações
# Frontend Dashboard: http://localhost:8080
# Backend API: http://localhost:3000/ppdm-activities
```

## Funcionalidades

### Backend
1. Autenticação automática na API PPDM para obtenção de token Bearer
2. Sincronização automática das atividades a cada 1 minuto
3. API REST para consulta das atividades
4. Suporte a modo mock para desenvolvimento
5. Renovação de token por duplo mecanismo (proativo + reativo)

### Frontend
1. Dashboard com cards de estatísticas em tempo real
2. Gráficos interativos (status, categorias, transferências, durações)
3. Quadrante de alertas com notificações críticas e avisos
4. Tabela de últimas atividades
5. Auto-refresh a cada 60 segundos
6. Design responsivo e moderno

## Instalação

### Opção 1: Usando Docker (Recomendado)

```bash
# Modo produção
docker-compose up -d

# Modo desenvolvimento (com hot reload)
docker-compose -f docker-compose.dev.yml up -d
```

### Opção 2: Instalação local

```bash
npm install
```

## Configuração

O arquivo `.env` contém as seguintes variáveis:

- `PORT`: Porta do servidor (padrão: 3000)
- `PPDM_API_URL`: URL base da API PPDM
- `PPDM_LOGIN`: Usuário para autenticação
- `PPDM_PASSWORD`: Senha para autenticação
- `USE_MOCK_DATA`: Se `true`, usa o arquivo `saida.json` ao invés da API real

## Uso

### Com Docker

#### Usando Makefile (Simplificado - Linux/Mac):
```bash
# Ver todos os comandos disponíveis
make help

# Iniciar em produção
make prod

# Iniciar em desenvolvimento
make dev

# Ver logs
make logs

# Parar containers
make down

# Rebuild completo
make rebuild

# Ver status de saúde
make health
```

#### Usando Docker Compose diretamente:
```bash
# Produção
docker-compose up -d

# Desenvolvimento
docker-compose -f docker-compose.dev.yml up -d

# Ver logs
docker-compose logs -f ppdm-backend

# Parar containers
docker-compose down

# Reconstruir a imagem
docker-compose build --no-cache
docker-compose up -d
```

### Sem Docker (Local)

#### Modo desenvolvimento (com auto-reload):
```bash
npm run dev
```

#### Modo produção:
```bash
npm start
```

## Acesso às Aplicações

Após iniciar com `docker-compose up -d`:

- **Frontend Dashboard**: http://localhost:8080
  - Interface visual completa com gráficos e alertas
  - Auto-refresh a cada 60 segundos

- **Backend API**: http://localhost:3000
  - API REST para integração
  - Healthcheck: http://localhost:3000/health

## Endpoints da API

### GET /ppdm-activities
Retorna todas as atividades sincronizadas do PPDM.

**Resposta de sucesso (200):**
```json
{
  "page": {
    "size": 81,
    "number": 1,
    "totalPages": 1,
    "totalElements": 81
  },
  "content": [...]
}
```

**Resposta quando dados não disponíveis (503):**
```json
{
  "error": "Dados ainda não disponíveis",
  "message": "Aguarde a primeira sincronização com a API"
}
```

### GET /health
Verifica o status do servidor e informações do token.

**Resposta (200):**
```json
{
  "status": "OK",
  "uptime": 123.456,
  "timestamp": "2026-01-27T12:00:00.000Z",
  "hasActivitiesData": true,
  "hasAuthToken": true,
  "tokenInfo": {
    "expiresAt": "2026-01-27T13:00:00.000Z",
    "expiresIn": 3420,
    "isValid": true
  },
  "useMockData": true
}
```

**Observação**: O campo `tokenInfo` mostra:
- `expiresAt`: Data/hora de expiração do token
- `expiresIn`: Tempo restante em segundos
- `isValid`: Se o token está válido no momento

## Modo Mock

Por padrão, o sistema está configurado para usar dados mock do arquivo `saida.json`. Para usar a API real:

1. Altere `USE_MOCK_DATA=false` no arquivo `.env`
2. Reinicie o servidor

## Estrutura do Projeto

```
ppdm/
├── backend/
│   ├── server.js                # Servidor principal
│   ├── package.json            # Dependências do backend
│   ├── .env                    # Variáveis de ambiente (não versionado)
│   ├── .env.example            # Exemplo de variáveis de ambiente
│   ├── Dockerfile              # Docker do backend
│   └── saida.json              # Dados mock
├── frontend/
│   ├── src/
│   │   ├── components/         # Componentes Vue (Charts)
│   │   ├── App.vue             # Componente principal
│   │   ├── main.js             # Entry point
│   │   └── style.css           # Estilos globais
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json            # Dependências do frontend
│   ├── Dockerfile              # Docker do frontend
│   ├── nginx.conf              # Configuração Nginx
│   └── README.md               # Documentação do frontend
├── docker-compose.yml          # Compose para produção
├── docker-compose.dev.yml      # Compose para desenvolvimento
├── Makefile                    # Comandos simplificados
└── README.md                   # Este arquivo
```

## Logs

O sistema registra logs detalhados de todas as operações:

- `[AUTH]`: Logs de autenticação
- `[FETCH]`: Logs de busca de atividades
- `[SYNC]`: Logs de sincronização
- `[ERROR]`: Logs de erros

## Docker - Comandos Úteis

### Build e execução
```bash
# Build da imagem
docker-compose build

# Iniciar em background
docker-compose up -d

# Iniciar e ver logs
docker-compose up

# Parar containers
docker-compose down

# Parar e remover volumes
docker-compose down -v
```

### Logs e monitoramento
```bash
# Ver logs em tempo real
docker-compose logs -f

# Ver logs de um serviço específico
docker-compose logs -f ppdm-backend

# Ver últimas 100 linhas dos logs
docker-compose logs --tail=100
```

### Manutenção
```bash
# Acessar o shell do container
docker-compose exec ppdm-backend sh

# Reiniciar o serviço
docker-compose restart ppdm-backend

# Ver status dos containers
docker-compose ps

# Ver uso de recursos
docker stats
```

## Healthcheck

O container inclui um healthcheck que verifica a saúde da aplicação a cada 30 segundos:

```bash
# Ver status do healthcheck
docker inspect --format='{{json .State.Health}}' ppdm-backend | jq
```

## Sistema de Renovação de Token (Duplo Mecanismo)

O backend implementa **dois mecanismos simultâneos** para garantir que o token Bearer esteja sempre válido:

### 1. Renovação Proativa ⏰
- **Quando**: A cada 55 minutos (antes do token expirar em 1 hora)
- **Como**: Timer automático que renova o token preventivamente
- **Log**: `[TOKEN-REFRESH] 🔄 Renovando token proativamente (timer 55 min)...`

### 2. Renovação Reativa ⚠️
- **Quando**: Ao detectar que o token expirou
- **Como**: Verifica antes de cada requisição + trata erro 401 da API
- **Cenários**:
  - Antes de buscar atividades: Verifica `isTokenValid()` e renova se necessário
  - Após erro 401: Força nova autenticação imediata
- **Log**: `[FETCH] ⚠️ Token inválido ou expirado detectado na verificação`

### Fluxo Combinado

```
Inicialização
    ↓
Autentica e obtém token (válido por 1h)
    ↓
┌─────────────────────────────────────────────┐
│  Renovação Proativa (Timer 55 min)          │ ← Roda em paralelo
│  + Renovação Reativa (Validação + Erro 401) │
└─────────────────────────────────────────────┘
    ↓
Token sempre válido para requisições
```

**Vantagem**: Se o timer de 55 minutos falhar ou o servidor reiniciar, a renovação reativa garante que o token seja renovado quando necessário.

## Observações

- O certificado SSL é aceito sem validação (apenas para desenvolvimento)
- O token é renovado automaticamente por dois mecanismos (proativo + reativo)
- Os dados são armazenados em memória e atualizados a cada minuto
- O Docker Compose está configurado com restart automático
- Logs são limitados a 10MB por arquivo (máximo 3 arquivos)
- Endpoint `/health` retorna informações sobre expiração do token
