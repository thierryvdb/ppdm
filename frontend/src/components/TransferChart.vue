<template>
  <Bar :data="chartData" :options="chartOptions" />
</template>

<script>
import { Bar } from 'vue-chartjs'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

export default {
  name: 'TransferChart',
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
      const values = this.data.map(a => (a.result.bytesTransferred / 1024 / 1024 / 1024).toFixed(2)) // GB

      return {
        labels: labels,
        datasets: [{
          label: 'GB Transferidos',
          data: values,
          backgroundColor: '#10b981',
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
                return `${context.parsed.x} GB`
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
