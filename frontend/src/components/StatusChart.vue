<template>
  <Doughnut :data="chartData" :options="chartOptions" />
</template>

<script>
import { Doughnut } from 'vue-chartjs'
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'

ChartJS.register(ArcElement, Tooltip, Legend)

export default {
  name: 'StatusChart',
  components: { Doughnut },
  props: {
    data: {
      type: Object,
      required: true
    }
  },
  computed: {
    chartData() {
      const labels = Object.keys(this.data)
      const values = Object.values(this.data)

      return {
        labels: labels,
        datasets: [{
          data: values,
          backgroundColor: [
            '#10b981', // OK - Green
            '#f59e0b', // WARNING - Yellow
            '#ef4444', // FAILED/ERROR - Red
            '#3b82f6', // Running - Blue
            '#6b7280'  // Others - Gray
          ],
          borderWidth: 0
        }]
      }
    },
    chartOptions() {
      return {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              padding: 15,
              font: {
                size: 12
              }
            }
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const label = context.label || ''
                const value = context.parsed || 0
                const total = context.dataset.data.reduce((a, b) => a + b, 0)
                const percentage = ((value / total) * 100).toFixed(1)
                return `${label}: ${value} (${percentage}%)`
              }
            }
          }
        }
      }
    }
  }
}
</script>
