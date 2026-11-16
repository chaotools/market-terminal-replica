<script setup>
import { computed } from 'vue'

const props = defineProps({
  type: { type: String, default: 'line' }, // line | area | multi | bar
  series: { type: Array, default: () => [] }, // [{ name, color, data: number[] }]
  labels: { type: Array, default: () => [] },
  yMin: { type: Number, default: null },
  yMax: { type: Number, default: null }
})

const W = 600
const H = 300
const PAD = { left: 34, right: 8, top: 10, bottom: 20 }

const allValues = computed(() => props.series.flatMap((s) => s.data || []).filter((v) => Number.isFinite(v)))
const min = computed(() => props.yMin ?? (allValues.value.length ? Math.min(...allValues.value) : 0))
const max = computed(() => props.yMax ?? (allValues.value.length ? Math.max(...allValues.value) : 1))
const span = computed(() => (max.value - min.value) || 1)

const plotW = W - PAD.left - PAD.right
const plotH = H - PAD.top - PAD.bottom

function x(index) {
  const count = Math.max(1, (props.labels.length || Math.max(...props.series.map((s) => s.data?.length || 0), 1)) - 1)
  return PAD.left + (index / count) * plotW
}
function y(value) {
  return PAD.top + plotH - ((value - min.value) / span.value) * plotH
}

function linePath(data) {
  if (!data?.length) return ''
  return data.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
}
function areaPath(data) {
  if (!data?.length) return ''
  return `${linePath(data)} L${x(data.length - 1).toFixed(1)},${(PAD.top + plotH).toFixed(1)} L${x(0).toFixed(1)},${(PAD.top + plotH).toFixed(1)} Z`
}

const gridY = computed(() => {
  const lines = []
  const steps = 4
  for (let i = 0; i <= steps; i++) {
    const value = min.value + (span.value * i) / steps
    lines.push({ y: y(value), label: formatValue(value) })
  }
  return lines
})
function formatValue(value) {
  const abs = Math.abs(value)
  if (abs >= 10000) return (value / 10000).toFixed(1) + '万'
  if (abs >= 100) return value.toFixed(0)
  if (abs >= 10) return value.toFixed(1)
  return value.toFixed(2)
}

const barWidth = computed(() => {
  const count = Math.max(1, props.series[0]?.data?.length || 1)
  return Math.max(4, Math.min(40, (plotW / count) * 0.55))
})
const xLabels = computed(() => {
  if (!props.labels.length) return []
  const step = Math.max(1, Math.ceil(props.labels.length / 8))
  return props.labels.filter((_, i) => i % step === 0)
})
</script>

<template>
  <svg class="simple-chart" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none">
    <line
      v-for="(grid, i) in gridY" :key="'g' + i"
      :x1="PAD.left" :y1="grid.y" :x2="W - PAD.right" :y2="grid.y"
      stroke="#eef1f5" stroke-width="1"
    />
    <text
      v-for="(grid, i) in gridY" :key="'t' + i"
      :x="PAD.left - 4" :y="grid.y + 3" text-anchor="end"
      font-size="10" fill="#9aa3af"
    >{{ grid.label }}</text>

    <g v-if="type === 'bar'">
      <template v-for="(series, si) in series" :key="'bs' + si">
        <rect
          v-for="(value, i) in series.data" :key="'bar' + si + '-' + i"
          :x="x(i) - barWidth / 2 + si * (barWidth + 2)"
          :y="y(value)"
          :width="barWidth"
          :height="Math.max(0, PAD.top + plotH - y(value))"
          :fill="series.color || '#2f7ac0'"
        />
      </template>
    </g>

    <g v-else>
      <g v-for="(series, si) in series" :key="'s' + si">
        <path v-if="type === 'area' || type === 'multi'" :d="areaPath(series.data)" :fill="(series.color || '#2f7ac0') + '22'" />
        <path :d="linePath(series.data)" fill="none" :stroke="series.color || '#2f7ac0'" stroke-width="1.4" />
      </g>
    </g>

    <text
      v-for="(label, i) in xLabels" :key="'x' + i"
      :x="x(labels.indexOf(label))" :y="H - 6" text-anchor="middle" font-size="10" fill="#9aa3af"
    >{{ label }}</text>
  </svg>
</template>
