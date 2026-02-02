<template>
  <Bar :data="chartData" :options="chartOptions" />
</template>

<script>
import { Bar } from 'vue-chartjs'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

export default {
  name: 'DurationChart',
  components: { Bar },
  props: {
    data: {
      type: Array,
      required: true
    }
  },
  computed: {
    chartData() {
      const labels = this.data.map(a => this.truncateName(a.name))
      const values = this.data.map(a => (a.duration / 1000 / 60).toFixed(2)) // Minutes

      return {
        labels: labels,
        datasets: [{
          label: 'Minutos',
          data: values,
          backgroundColor: '#f59e0b',
          borderRadius: 6
        }]
      }
    },
    chartOptions() {
      return {
        responsive: true,
        maintainAspectRatio: true,
        indexAxis: 'y',
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const minutes = context.parsed.x
                if (minutes >= 60) {
                  const hours = (minutes / 60).toFixed(1)
                  return `${hours} horas`
                }
                return `${minutes} minutos`
              }
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true
          }
        }
      }
    }
  },
  methods: {
    truncateName(name) {
      return name.length > 30 ? name.substring(0, 30) + '...' : name
    }
  }
}
</script>
