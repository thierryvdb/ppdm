# PPDM Frontend

Dashboard Vue.js para visualização e monitoramento de atividades do PowerProtect Data Manager (PPDM).

## Tecnologias

- **Vue 3** - Framework JavaScript progressivo
- **Vite** - Build tool rápido
- **Chart.js** - Biblioteca de gráficos
- **Axios** - Cliente HTTP
- **Nginx** - Servidor web para produção

## Funcionalidades

- Dashboard com cards de estatísticas
- Gráficos interativos:
  - Status das atividades (Doughnut)
  - Atividades por categoria (Bar)
  - Top 5 transferências de dados (Horizontal Bar)
  - Top 5 durações de jobs (Horizontal Bar)
- Quadrante de alertas com notificações
- Tabela de últimas atividades
- Auto-refresh a cada 60 segundos
- Design responsivo

## Desenvolvimento Local

### Pré-requisitos

- Node.js 18+ instalado
- Backend rodando na porta 3000

### Instalação

```bash
cd frontend
npm install
```

### Executar

```bash
npm run dev
```

Acesse: http://localhost:8080

### Build

```bash
npm run build
```

## Docker

### Build da imagem

```bash
docker build -t ppdm-frontend .
```

### Executar com Docker

```bash
docker run -p 8080:8080 ppdm-frontend
```

## Docker Compose (Recomendado)

Use o docker-compose na raiz do projeto para executar frontend + backend juntos:

```bash
cd ..
docker-compose up -d
```

Acesse:
- Frontend: http://localhost:8080
- Backend: http://localhost:3000

## Estrutura do Projeto

```
frontend/
├── src/
│   ├── components/
│   │   ├── StatusChart.vue      # Gráfico de status (Doughnut)
│   │   ├── CategoryChart.vue    # Gráfico de categorias (Bar)
│   │   ├── TransferChart.vue    # Gráfico de transferências (Horizontal Bar)
│   │   └── DurationChart.vue    # Gráfico de durações (Horizontal Bar)
│   ├── App.vue                  # Componente principal
│   ├── main.js                  # Entry point
│   └── style.css                # Estilos globais
├── index.html
├── vite.config.js
├── package.json
├── Dockerfile
├── nginx.conf
└── README.md
```

## Configuração da API

O frontend faz proxy das requisições `/api/*` para o backend na porta 3000.

Em desenvolvimento (Vite):
- Configurado em `vite.config.js`

Em produção (Nginx):
- Configurado em `nginx.conf`

## Personalização

### Cores

Edite as variáveis CSS em `src/style.css`:

```css
:root {
  --primary-color: #2563eb;
  --success-color: #10b981;
  --warning-color: #f59e0b;
  --error-color: #ef4444;
  /* ... */
}
```

### Intervalo de Atualização

Edite em `src/App.vue`:

```javascript
// Altere 60000 (60 segundos) para o intervalo desejado
refreshInterval = setInterval(fetchData, 60000)
```

## Problemas Comuns

### CORS Error

Se encontrar erro de CORS, certifique-se que:
1. O backend está rodando
2. O proxy está configurado corretamente
3. As portas estão corretas

### Charts não aparecem

Certifique-se que:
1. Os dados estão no formato correto
2. Chart.js está instalado: `npm install chart.js vue-chartjs`

## Produção

O Dockerfile usa build multi-stage:
1. **Build**: Compila o Vue com Vite
2. **Production**: Serve com Nginx otimizado

Benefícios:
- Imagem final pequena (~25MB)
- Nginx com gzip habilitado
- Proxy reverso para API
- Alta performance
