<template>
  <div class="dashboard">
    <div v-if="loading && !data" class="loading">
      <div class="spinner"></div>
      <p>Carregando dados do PPDM...</p>
    </div>

    <div v-else-if="error" class="error-state">
      <h2>Erro ao carregar dados</h2>
      <p>{{ error }}</p>
      <button class="btn-refresh" @click="fetchData">Tentar novamente</button>
    </div>

    <template v-else-if="data">
      <header class="header-hero">
        <div class="hero-content">
          <p class="tagline">PowerProtect Data Manager</p>
          <h1>PPDM Command Center</h1>
          <p class="hero-description">
            Monitoring completo das atividades de backup e proteção em tempo real.
            Identifique riscos, acompanhe métricas críticas e mantenha o controle total.
          </p>
          <div class="hero-meta">
            <span>Última atualização: {{ lastUpdate }}</span>
            <span>Próxima atualização: {{ nextUpdate }}s</span>
          </div>
        </div>
        <div class="hero-actions">
          <button
            class="btn-refresh hero-btn"
            @click="fetchData"
            :disabled="loading"
          >
            {{ loading ? 'Atualizando...' : 'Atualizar agora' }}
          </button>
          <p class="hero-note">Atualização automática a cada 60 segundos</p>
        </div>
      </header>

      <section class="hero-metrics">
        <article
          v-for="metric in summaryHighlights"
          :key="metric.title"
          class="hero-card"
        >
          <p class="hero-card-label">{{ metric.title }}</p>
          <h2 class="hero-card-value">{{ metric.value }}</h2>
          <p class="hero-card-detail">{{ metric.detail }}</p>
        </article>
      </section>

      <section class="insight-grid">
        <div class="insight-card pulse-card">
          <header>
            <h3>Pulse das atividades</h3>
            <p>Execuções mais recentes</p>
          </header>
          <ul class="timeline">
            <li
              v-for="activity in timelineActivities"
              :key="activity.id"
            >
              <span class="timeline-dot" :class="getStatusClass(activity.result.status)"></span>
              <div class="timeline-content">
                <strong>{{ activity.name }}</strong>
                <span>{{ formatDate(activity.endTime) }} · {{ activity.category }}</span>
              </div>
              <span class="timeline-status">{{ activity.result.status }}</span>
            </li>
            <li v-if="timelineActivities.length === 0" class="timeline-empty">
              Nenhuma atividade registrada.
            </li>
          </ul>
        </div>

        <div class="insight-card hosts-card">
          <header>
            <h3>Hosts mais ativos</h3>
            <p>Contagem e taxa de sucesso</p>
          </header>
          <div class="hosts-list">
            <div
              v-for="host in topHosts"
              :key="host.name"
              class="host-row"
            >
              <div>
                <strong>{{ host.name }}</strong>
                <span>{{ host.total }} execuções · {{ formatPercentage(host.successRate) }} OK</span>
              </div>
              <div class="host-bytes">{{ formatBytes(host.bytes) }}</div>
            </div>
            <p v-if="topHosts.length === 0" class="hosts-empty">
              Sem hosts monitorados ainda.
            </p>
          </div>
        </div>
      </section>

      <section class="stats-section">
        <h2>Visão geral rápida</h2>
        <div class="stats-grid">
          <div class="stat-card success">
            <h3>Concluídos</h3>
            <div class="value">{{ stats.completed }}</div>
            <div class="label">Jobs bem-sucedidos</div>
          </div>

          <div class="stat-card error">
            <h3>Falhas</h3>
            <div class="value">{{ stats.failed }}</div>
            <div class="label">Jobs com erro</div>
          </div>

          <div class="stat-card warning">
            <h3>Com avisos</h3>
            <div class="value">{{ stats.warnings }}</div>
            <div class="label">Jobs com alertas</div>
          </div>

          <div class="stat-card info">
            <h3>Total</h3>
            <div class="value">{{ stats.total }}</div>
            <div class="label">Atividades em memória</div>
          </div>
        </div>
      </section>

      <section class="charts-section">
        <h2>Detalhes visuais</h2>
        <div class="charts-grid">
          <div class="chart-card">
            <h2>Status das atividades</h2>
            <StatusChart :data="chartData.status" />
          </div>

          <div class="chart-card">
            <h2>Atividades por categoria</h2>
            <CategoryChart :data="chartData.categories" />
          </div>

          <div class="chart-card">
            <h2>Dados transferidos (Top 5)</h2>
            <TransferChart :data="chartData.transfers" />
          </div>

          <div class="chart-card">
            <h2>Duração média (Top 5)</h2>
            <DurationChart :data="chartData.durations" />
          </div>
        </div>
      </section>

      <div class="alerts-section" v-if="alerts.length > 0">
        <h2>Alertas e notificações</h2>
        <div class="alerts-grid">
          <div
            v-for="alert in alerts"
            :key="alert.id"
            :class="['alert-card', alert.severity]"
          >
            <div class="alert-icon">{{ alert.icon }}</div>
            <div class="alert-content">
              <h3>{{ alert.title }}</h3>
              <p>{{ alert.message }}</p>
              <div class="alert-time">{{ alert.time }}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="activities-section">
        <h2>Últimas atividades ({{ displayActivities.length }})</h2>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Categoria</th>
                <th>Status</th>
                <th>Duração</th>
                <th>Dados transferidos</th>
                <th>Última execução</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="activity in displayActivities" :key="activity.id">
                <td>{{ activity.name }}</td>
                <td>{{ activity.category }}</td>
                <td>
                  <span :class="['status-badge', getStatusClass(activity.result.status)]">
                    {{ activity.result.status }}
                  </span>
                </td>
                <td>{{ formatDuration(activity.duration) }}</td>
                <td>{{ formatBytes(activity.result.bytesTransferred) }}</td>
                <td>{{ formatDate(activity.endTime) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import axios from 'axios'
import StatusChart from './components/StatusChart.vue'
import CategoryChart from './components/CategoryChart.vue'
import TransferChart from './components/TransferChart.vue'
import DurationChart from './components/DurationChart.vue'

export default {
  name: 'App',
  components: {
    StatusChart,
    CategoryChart,
    TransferChart,
    DurationChart
  },
  setup() {
    const data = ref(null)
    const loading = ref(false)
    const error = ref(null)
    const lastUpdate = ref('Nunca')
    const nextUpdate = ref(60)
    let refreshInterval = null
    let countdownInterval = null

    function formatDuration(ms) {
      if (ms == null) return '-'
      const seconds = Math.floor(ms / 1000)
      const minutes = Math.floor(seconds / 60)
      const hours = Math.floor(minutes / 60)

      if (hours > 0) return `${hours}h ${minutes % 60}m`
      if (minutes > 0) return `${minutes}m ${seconds % 60}s`
      return `${seconds}s`
    }

    function formatBytes(bytes) {
      if (bytes == null || bytes === '') return '-'
      if (bytes === 0) return '0 Bytes'
      const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
      const i = Math.floor(Math.log(bytes) / Math.log(1024))
      return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`
    }

    function formatDate(dateStr) {
      if (!dateStr) return '-'
      return new Date(dateStr).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    }

    function getStatusClass(status) {
      const statusMap = {
        OK: 'ok',
        WARNING: 'warning',
        FAILED: 'error',
        ERROR: 'error',
        RUNNING: 'running'
      }
      return statusMap[status] || 'info'
    }

    function formatPercentage(value) {
      if (value == null || Number.isNaN(value)) return '-'
      return `${value.toFixed(1)}%`
    }

    const stats = computed(() => {
      if (!data.value?.content) return { completed: 0, failed: 0, warnings: 0, total: 0 }

      const activities = data.value.content
      return {
        completed: activities.filter(a => a.result.status === 'OK').length,
        failed: activities.filter(a => a.result.status === 'FAILED' || a.result.status === 'ERROR').length,
        warnings: activities.filter(a => a.result.status === 'WARNING').length,
        total: activities.length
      }
    })

    const summaryMetrics = computed(() => {
      if (!data.value?.content) return { successRate: 0, avgDurationMs: 0, totalBytes: 0, hostCount: 0 }

      const activities = data.value.content
      const total = activities.length
      const averageDuration = total
        ? activities.reduce((sum, activity) => sum + (activity.duration ?? 0), 0) / total
        : 0
      const totalBytes = activities.reduce((sum, activity) => sum + Number(activity.stats?.bytesTransferred ?? 0), 0)
      const hostCount = new Set(activities.map(activity => activity.host?.name || 'Sem host')).size
      const successRate = total ? (stats.value.completed / total) * 100 : 0

      return {
        successRate,
        avgDurationMs: averageDuration,
        totalBytes,
        hostCount
      }
    })

    const summaryHighlights = computed(() => {
      const metrics = summaryMetrics.value
      const totalExecutions = data.value?.content?.length || 0

      return [
        {
          title: 'Taxa de sucesso',
          value: formatPercentage(metrics.successRate),
          detail: `${totalExecutions} execuções monitoradas`
        },
        {
          title: 'Duração média',
          value: formatDuration(metrics.avgDurationMs),
          detail: 'Média geral das execuções'
        },
        {
          title: 'Dados transferidos',
          value: formatBytes(metrics.totalBytes),
          detail: 'Acumulado da última janela'
        },
        {
          title: 'Hosts monitorados',
          value: metrics.hostCount,
          detail: 'Hosts distintos detectados'
        }
      ]
    })

    const chartData = computed(() => {
      if (!data.value?.content) return {}

      const activities = data.value.content

      const statusCounts = activities.reduce((acc, a) => {
        acc[a.result.status] = (acc[a.result.status] || 0) + 1
        return acc
      }, {})

      const categoryCounts = activities.reduce((acc, a) => {
        acc[a.category] = (acc[a.category] || 0) + 1
        return acc
      }, {})

      const transfers = activities
        .filter(a => a.result.bytesTransferred > 0)
        .sort((a, b) => b.result.bytesTransferred - a.result.bytesTransferred)
        .slice(0, 5)

      const durations = activities
        .filter(a => a.duration > 0)
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 5)

      return {
        status: statusCounts,
        categories: categoryCounts,
        transfers,
        durations
      }
    })

    const alerts = computed(() => {
      if (!data.value?.content) return []

      const alertsList = []
      const activities = data.value.content

      activities
        .filter(a => a.result.status === 'FAILED' || a.result.status === 'ERROR')
        .forEach(a => {
          alertsList.push({
            id: a.id,
            severity: 'critical',
            icon: '⚠️',
            title: 'Falha na atividade',
            message: `${a.name} falhou na última execução`,
            time: formatDate(a.endTime)
          })
        })

      activities
        .filter(a => a.result.status === 'WARNING')
        .slice(0, 5)
        .forEach(a => {
          alertsList.push({
            id: a.id,
            severity: 'warning',
            icon: '⚡',
            title: 'Aviso de atividade',
            message: `${a.name} completou com alertas`,
            time: formatDate(a.endTime)
          })
        })

      return alertsList.slice(0, 10)
    })

    const timelineActivities = computed(() => {
      if (!data.value?.content) return []

      return [...data.value.content]
        .sort((a, b) => {
          const aTime = new Date(a.endTime || a.startTime).getTime() || 0
          const bTime = new Date(b.endTime || b.startTime).getTime() || 0
          return bTime - aTime
        })
        .slice(0, 6)
    })

    const topHosts = computed(() => {
      if (!data.value?.content) return []

      const hosts = {}
      data.value.content.forEach(activity => {
        const hostName = activity.host?.name || 'Sem host'
        if (!hosts[hostName]) {
          hosts[hostName] = { name: hostName, total: 0, success: 0, bytes: 0 }
        }
        hosts[hostName].total += 1
        hosts[hostName].bytes += Number(activity.stats?.bytesTransferred ?? 0)
        if (activity.result?.status === 'OK') {
          hosts[hostName].success += 1
        }
      })

      return Object.values(hosts)
        .map(entry => ({
          ...entry,
          successRate: entry.total ? (entry.success / entry.total) * 100 : 0
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5)
    })

    const displayActivities = computed(() => {
      if (!data.value?.content) return []
      return data.value.content.slice(0, 20)
    })

    const fetchData = async () => {
      loading.value = true
      error.value = null

      try {
        const response = await axios.get('/api/ppdm-activities')
        data.value = response.data
        lastUpdate.value = new Date().toLocaleString('pt-BR')
        nextUpdate.value = 60
      } catch (err) {
        error.value = err.response?.data?.message || err.message || 'Erro ao carregar dados'
        console.error('Erro ao buscar dados:', err)
      } finally {
        loading.value = false
      }
    }

    onMounted(() => {
      fetchData()

      refreshInterval = setInterval(fetchData, 60000)
      countdownInterval = setInterval(() => {
        if (nextUpdate.value > 0) {
          nextUpdate.value--
        } else {
          nextUpdate.value = 60
        }
      }, 1000)
    })

    onUnmounted(() => {
      if (refreshInterval) clearInterval(refreshInterval)
      if (countdownInterval) clearInterval(countdownInterval)
    })

    return {
      data,
      loading,
      error,
      lastUpdate,
      nextUpdate,
      stats,
      chartData,
      summaryHighlights,
      timelineActivities,
      topHosts,
      alerts,
      displayActivities,
      fetchData,
      formatDuration,
      formatBytes,
      formatDate,
      formatPercentage,
      getStatusClass
    }
  }
}
</script>
