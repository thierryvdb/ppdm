<template>
  <Bar :data="chartData" :options="chartOptions" />
</template>

<script>
import { Bar } from 'vue-chartjs'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

export default {
  name: 'CategoryChart',
  components: { Bar },
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
          label: 'Atividades',
          data: values,
          backgroundColor: '#2563eb',
          borderRadius: 6
        }]
      }
    },
    chartOptions() {
      return {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                return `Atividades: ${context.parsed.y}`
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              precision: 0
            }
          }
        }
      }
    }
  }
}
</script>
