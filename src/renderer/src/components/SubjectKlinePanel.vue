<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { formatPct, toneClass } from '../format.js'

const props = defineProps({
  subject: { type: Object, default: () => ({}) },
  candles: { type: Array, default: () => [] },
  code: { type: String, default: '' }
})

const period = ref('day')
const periods = [{ k: 'day', l: '日线' }, { k: 'week', l: '周线' }, { k: 'month', l: '月线' }]
const canvasRef = ref(null)
let observed = null

const last = computed(() => props.candles[props.candles.length - 1] || null)
const ma = (n) => {
  const list = props.candles.slice(-n)
  if (!list.length) return null
  return list.reduce((sum, c) => sum + (Number(c.close) || 0), 0) / list.length
}
const hasCandles = computed(() => props.candles.length > 0)

function draw() {
  const canvas = canvasRef.value
  if (!canvas) return
  const wrap = canvas.parentElement
  const width = wrap?.clientWidth || 360
  const height = wrap?.clientHeight || 400
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.max(1, Math.floor(width * dpr))
  canvas.height = Math.max(1, Math.floor(height * dpr))
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)

  const pad = { left: 8, right: 52, top: 12, bottom: 22 }
  const plotW = width - pad.left - pad.right
  const mainH = height * 0.58
  const volH = height * 0.18
  const indiH = height - mainH - volH - pad.bottom - pad.top

  const grid = (y0, h) => {
    ctx.strokeStyle = '#eef1f5'
    ctx.lineWidth = 1
    for (let i = 0; i <= 4; i++) {
      const y = y0 + (h * i) / 4
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + plotW, y); ctx.stroke()
    }
  }
  grid(pad.top, mainH)
  grid(pad.top + mainH + 6, volH)
  grid(pad.top + mainH + volH + 16, indiH)
  ctx.fillStyle = '#9aa3af'
  ctx.font = '10px "Microsoft YaHei", sans-serif'

  if (!hasCandles.value) {
    return
  }

  const candles = props.candles
  const highs = Math.max(...candles.map((c) => Number(c.high) || 0))
  const lows = Math.min(...candles.map((c) => Number(c.low) || Infinity))
  const span = (highs - lows) || 1
  const slot = plotW / candles.length
  const bw = Math.max(1.5, Math.min(9, slot * 0.66))
  const yOf = (v) => pad.top + mainH - ((v - lows) / span) * mainH

  ctx.strokeStyle = '#e05353'
  ctx.fillStyle = '#9aa3af'
  ctx.beginPath(); ctx.moveTo(0, yOf(Number(last.value.close) || 0)); ctx.lineTo(width, yOf(Number(last.value.close) || 0)); ctx.stroke()

  const maxVol = Math.max(...candles.map((c) => Number(c.volume) || 0)) || 1
  let prevClose = null
  candles.forEach((c, i) => {
    const x = pad.left + slot * i + slot / 2
    const open = Number(c.open) || 0
    const close = Number(c.close) || 0
    const high = Number(c.high) || 0
    const low = Number(c.low) || 0
    const up = close >= open
    ctx.strokeStyle = up ? '#e05353' : '#17a673'
    ctx.fillStyle = up ? '#e05353' : '#17a673'
    ctx.beginPath(); ctx.moveTo(x, yOf(high)); ctx.lineTo(x, yOf(low)); ctx.stroke()
    const y1 = yOf(Math.max(open, close))
    const y2 = yOf(Math.min(open, close))
    ctx.fillRect(x - bw / 2, y1, bw, Math.max(1, y2 - y1))
    const volY = pad.top + mainH + 6 + volH - ((Number(c.volume) || 0) / maxVol) * volH
    ctx.fillRect(x - bw / 2, volY, bw, Math.max(1, pad.top + mainH + 6 + volH - volY))
    prevClose = close
  })

  const drawLine = (values, color) => {
    ctx.strokeStyle = color
    ctx.lineWidth = 1.2
    ctx.beginPath()
    values.forEach((v, i) => {
      if (v == null) return
      const x = pad.left + slot * i + slot / 2
      const y = yOf(v)
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    })
    ctx.stroke()
  }
  const maValues = (n) => candles.map((_, i) => {
    if (i < n - 1) return null
    const list = candles.slice(i - n + 1, i + 1)
    return list.reduce((sum, c) => sum + (Number(c.close) || 0), 0) / n
  })
  drawLine(maValues(5), '#d9a23b')
  drawLine(maValues(10), '#4a6fd8')

  ctx.fillStyle = '#9aa3af'
  ctx.font = '10px "Microsoft YaHei", sans-serif'
  for (let i = 0; i <= 4; i++) {
    const value = lows + (span * i) / 4
    const y = pad.top + mainH - (mainH * i) / 4
    ctx.fillText(value.toFixed(2), pad.left + plotW + 4, y + 3)
  }
}

watch(() => [props.candles, props.subject], () => requestAnimationFrame(draw), { deep: true })
watch(period, () => requestAnimationFrame(draw))

onMounted(() => {
  requestAnimationFrame(draw)
  observed = new ResizeObserver(() => requestAnimationFrame(draw))
  if (canvasRef.value) observed.observe(canvasRef.value.parentElement)
})
onUnmounted(() => observed?.disconnect())

const HEAD = computed(() => last.value
  ? {
      开: Number(last.value.open).toFixed(2),
      高: Number(last.value.high).toFixed(2),
      低: Number(last.value.low).toFixed(2),
      收: Number(last.value.close).toFixed(2),
      幅: formatPct(props.subject?.changePct),
      量: Number(last.value.volume) ? (Number(last.value.volume) / 1e4).toFixed(1) + '万' : '—'
    }
  : null)
</script>

<template>
  <aside class="kline-panel">
    <div class="chart-tabs">
      <button v-for="p in periods" :key="p.k" :class="{ active: period === p.k }" @click="period = p.k">{{ p.l }}</button>
    </div>
    <div class="kline-head">
      <div><span class="sym">{{ subject?.subjectName || '—' }}</span><span>{{ code || '' }}</span></div>
      <div v-if="HEAD">{{ HEAD.开 }} / {{ HEAD.高 }} / {{ HEAD.低 }} / <span :class="toneClass(subject?.changePct)">{{ HEAD.收 }}</span> · {{ HEAD.幅 }} · {{ HEAD.量 }}</div>
      <div v-if="candles.length">MA5 {{ ma(5)?.toFixed(2) }} · MA10 {{ ma(10)?.toFixed(2) }}</div>
      <div v-else>该通道不提供历史 K 线（服务端 /API/StockHistoryDay 空态）</div>
    </div>
    <div class="kline-canvas-wrap">
      <canvas ref="canvasRef"></canvas>
      <div class="kline-empty" v-if="!candles.length">无日线数据</div>
    </div>
  </aside>
</template>
