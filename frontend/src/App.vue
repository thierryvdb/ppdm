<template>
  <div class="dashboard">
    <!-- Header -->
    <div class="header">
      <h1>PPDM Dashboard</h1>
      <p>PowerProtect Data Manager - Monitoramento de Atividades</p>

      <div class="refresh-info">
        <div class="status-indicator"></div>
        <span>Última atualização: {{ lastUpdate }}</span>
        <span>Próxima em: {{ nextUpdate }}s</span>
        <button
          class="btn-refresh"
          @click="fetchData"
          :disabled="loading"
        >
          {{ loading ? 'Atualizando...' : 'Atualizar Agora' }}
        </button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading && !data" class="loading">
      <div class="spinner"></div>
      <p>Carregando dados do PPDM...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="error-state">
      <h2>Erro ao Carregar Dados</h2>
      <p>{{ error }}</p>
      <button class="btn-refresh" @click="fetchData">Tentar Novamente</button>
    </div>

    <!-- Dashboard Content -->
    <template v-else-if="data">
      <!-- Stats Cards -->
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
          <h3>Com Avisos</h3>
          <div class="value">{{ stats.warnings }}</div>
          <div class="label">Jobs com alertas</div>
        </div>

        <div class="stat-card info">
          <h3>Total</h3>
          <div class="value">{{ stats.total }}</div>
          <div class="label">Total de atividades</div>
        </div>
      </div>

      <!-- Charts -->
      <div class="charts-grid">
        <div class="chart-card">
          <h2>Status das Atividades</h2>
          <StatusChart :data="chartData.status" />
        </div>

        <div class="chart-card">
          <h2>Atividades por Categoria</h2>
          <CategoryChart :data="chartData.categories" />
        </div>

        <div class="chart-card">
          <h2>Dados Transferidos (Top 5)</h2>
          <TransferChart :data="chartData.transfers" />
        </div>

        <div class="chart-card">
          <h2>Duração Média (Top 5)</h2>
          <DurationChart :data="chartData.durations" />
        </div>
      </div>

      <!-- Alerts -->
      <div class="alerts-section" v-if="alerts.length > 0">
        <h2>Alertas e Notificações</h2>
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

      <!-- Activities Table -->
      <div class="activities-section">
        <h2>Últimas Atividades ({{ displayActivities.length }})</h2>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Categoria</th>
                <th>Status</th>
                <th>Duração</th>
                <th>Dados Transferidos</th>
                <th>Última Execução</th>
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

    // Stats computados
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

    // Chart data
    const chartData = computed(() => {
      if (!data.value?.content) return {}

      const activities = data.value.content

      // Status distribution
      const statusCounts = activities.reduce((acc, a) => {
        acc[a.result.status] = (acc[a.result.status] || 0) + 1
        return acc
      }, {})

      // Categories
      const categoryCounts = activities.reduce((acc, a) => {
        acc[a.category] = (acc[a.category] || 0) + 1
        return acc
      }, {})

      // Top 5 transfers
      const transfers = activities
        .filter(a => a.result.bytesTransferred > 0)
        .sort((a, b) => b.result.bytesTransferred - a.result.bytesTransferred)
        .slice(0, 5)

      // Top 5 durations
      const durations = activities
        .filter(a => a.duration > 0)
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 5)

      return {
        status: statusCounts,
        categories: categoryCounts,
        transfers: transfers,
        durations: durations
      }
    })

    // Alerts
    const alerts = computed(() => {
      if (!data.value?.content) return []

      const alertsList = []
      const activities = data.value.content

      // Failed activities
      activities
        .filter(a => a.result.status === 'FAILED' || a.result.status === 'ERROR')
        .forEach(a => {
          alertsList.push({
            id: a.id,
            severity: 'critical',
            icon: '⚠️',
            title: 'Falha na Atividade',
            message: `${a.name} falhou na última execução`,
            time: formatDate(a.endTime)
          })
        })

      // Warning activities
      activities
        .filter(a => a.result.status === 'WARNING')
        .slice(0, 5)
        .forEach(a => {
          alertsList.push({
            id: a.id,
            severity: 'warning',
            icon: '⚡',
            title: 'Aviso de Atividade',
            message: `${a.name} completou com avisos`,
            time: formatDate(a.endTime)
          })
        })

      return alertsList.slice(0, 10)
    })

    // Display activities (últimas 20)
    const displayActivities = computed(() => {
      if (!data.value?.content) return []
      return data.value.content.slice(0, 20)
    })

    // Fetch data from API
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

    // Helpers
    const formatDuration = (ms) => {
      if (!ms) return '-'
      const seconds = Math.floor(ms / 1000)
      const minutes = Math.floor(seconds / 60)
      const hours = Math.floor(minutes / 60)

      if (hours > 0) return `${hours}h ${minutes % 60}m`
      if (minutes > 0) return `${minutes}m ${seconds % 60}s`
      return `${seconds}s`
    }

    const formatBytes = (bytes) => {
      if (!bytes) return '-'
      const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
      const i = Math.floor(Math.log(bytes) / Math.log(1024))
      return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`
    }

    const formatDate = (dateStr) => {
      if (!dateStr) return '-'
      return new Date(dateStr).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    }

    const getStatusClass = (status) => {
      const statusMap = {
        'OK': 'ok',
        'WARNING': 'warning',
        'FAILED': 'error',
        'ERROR': 'error',
        'RUNNING': 'running'
      }
      return statusMap[status] || 'info'
    }

    // Lifecycle
    onMounted(() => {
      fetchData()

      // Auto-refresh every 60 seconds
      refreshInterval = setInterval(fetchData, 60000)

      // Countdown timer
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
      alerts,
      displayActivities,
      fetchData,
      formatDuration,
      formatBytes,
      formatDate,
      getStatusClass
    }
  }
}
</script>
