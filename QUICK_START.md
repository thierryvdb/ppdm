# Quick Start - PPDM Full Stack

## Iniciar Tudo (Produção)

```bash
docker-compose up -d
```

**Acesse:**
- Dashboard: http://localhost:8080
- API: http://localhost:3000/ppdm-activities
- Health: http://localhost:3000/health

## Iniciar em Desenvolvimento

```bash
docker-compose -f docker-compose.dev.yml up -d
```

Com hot reload automático para backend e frontend.

## Ver Logs

```bash
# Todos os serviços
docker-compose logs -f

# Apenas backend
docker-compose logs -f ppdm-backend

# Apenas frontend
docker-compose logs -f ppdm-frontend
```

## Parar Tudo

```bash
docker-compose down
```

## Rebuild Completo

```bash
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

## Executar Localmente (Sem Docker)

### Backend

```bash
# Instalar dependências
npm install

# Iniciar
npm start
```

### Frontend

```bash
cd frontend

# Instalar dependências
npm install

# Iniciar dev server
npm run dev
```

## Configurações Importantes

### Alterar para API Real (não mock)

Edite `.env`:
```
USE_MOCK_DATA=false
```

Reinicie o backend:
```bash
docker-compose restart ppdm-backend
```

### Alterar Intervalo de Sincronização

Edite `server.js` linha 168:
```javascript
// Padrão: 60000 (1 minuto)
setInterval(async () => {
  await fetchActivities();
}, 60000);
```

### Alterar Auto-refresh do Dashboard

Edite `frontend/src/App.vue`:
```javascript
// Padrão: 60000 (1 minuto)
refreshInterval = setInterval(fetchData, 60000)
```

## Solução de Problemas

### Container não inicia

```bash
# Ver logs de erro
docker-compose logs ppdm-backend
docker-compose logs ppdm-frontend

# Rebuild
docker-compose build --no-cache
```

### API retorna erro

1. Verifique se o backend está rodando:
```bash
curl http://localhost:3000/health
```

2. Verifique os logs:
```bash
docker-compose logs -f ppdm-backend
```

### Frontend não carrega dados

1. Abra o console do navegador (F12)
2. Verifique se há erro de CORS ou conexão
3. Confirme que o backend está acessível:
```bash
curl http://localhost:3000/ppdm-activities
```

### Porta já em uso

Se as portas 3000 ou 8080 já estiverem em uso, edite `docker-compose.yml`:

```yaml
ports:
  - "3001:3000"  # Backend
  - "8081:8080"  # Frontend
```

## Comandos Make (Linux/Mac)

```bash
make help      # Ver todos os comandos
make prod      # Iniciar produção
make dev       # Iniciar desenvolvimento
make logs      # Ver logs
make down      # Parar tudo
make rebuild   # Rebuild completo
make health    # Verificar saúde
```

## Estrutura dos Dados

Os dados vêm no formato:

```json
{
  "page": {
    "size": 81,
    "number": 1,
    "totalPages": 1,
    "totalElements": 81
  },
  "content": [
    {
      "id": "...",
      "name": "Job name",
      "category": "PROTECT",
      "state": "COMPLETED",
      "result": {
        "status": "OK",
        "bytesTransferred": 1234567890
      },
      "duration": 12345,
      "endTime": "2026-01-27T12:00:00Z"
    }
  ]
}
```

## Próximos Passos

1. Personalize as cores em `frontend/src/style.css`
2. Ajuste os alertas em `frontend/src/App.vue`
3. Configure credenciais reais no `.env`
4. Configure HTTPS para produção
5. Adicione autenticação no frontend (se necessário)
