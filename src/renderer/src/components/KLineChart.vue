<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'

const props = defineProps({
  candles: { type: Array, default: () => [] },
  quote: { type: Object, default: () => ({}) }
})

const canvasRef = ref(null)
const wrapRef = ref(null)
const tipRef = ref(null)
const hoverIndex = ref(-1)
let observer = null

const UP = '#d63031'
const DOWN = '#0f7a57'
const GRID = '#eef0f3'
const AXIS = '#8b929d'

function movingAverage(n) {
  const out = []
  let sum = 0
  props.candles.forEach((c, i) => {
    sum += c.close
    if (i >= n) sum -= props.candles[i - n].close
    out.push(i >= n - 1 ? sum / n : null)
  })
  return out
}

function draw() {
  const canvas = canvasRef.value
  const wrap = wrapRef.value
  if (!canvas || !wrap) return
  const rect = wrap.getBoundingClientRect()
  const W = Math.max(200, rect.width)
  const H = Math.max(160, rect.height)
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.round(W * dpr)
  canvas.height = Math.round(H * dpr)
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, W, H)

  const candles = props.candles
  if (!candles.length) return
  const padL = 8
  const padR = 54
  const padT = 10
  const padB = 18
  const priceH = (H - padT - padB) * 0.72
  const volTop = padT + priceH + 10
  const volH = (H - padT - padB) * 0.22
  const plotW = W - padL - padR

  let min = Infinity
  let max = -Infinity
  for (const c of candles) {
    min = Math.min(min, c.low)
    max = Math.max(max, c.high)
  }
  const span = Math.max(0.01, max - min)
  min -= span * 0.08
  max += span * 0.08
  const yOf = (p) => padT + ((max - p) / (max - min)) * priceH
  const maxVol = Math.max(...candles.map((c) => c.volume || 0), 1)

  ctx.font = '11px ui-monospace, Consolas, monospace'
  ctx.textAlign = 'left'
  ctx.strokeStyle = GRID
  ctx.lineWidth = 1
  ctx.fillStyle = AXIS
  for (let i = 0; i <= 4; i++) {
    const p = max - ((max - min) * i) / 4
    const y = yOf(p)
    ctx.beginPath()
    ctx.moveTo(padL, y)
    ctx.lineTo(padL + plotW, y)
    ctx.stroke()
    ctx.fillText(p.toFixed(2), padL + plotW + 6, y + 4)
  }
  ctx.beginPath()
  ctx.moveTo(padL, volTop - 6)
  ctx.lineTo(padL + plotW, volTop - 6)
  ctx.stroke()

  const step = plotW / candles.length
  const bw = Math.max(2, Math.min(14, step * 0.62))
  candles.forEach((c, i) => {
    const x = padL + step * (i + 0.5)
    const rising = c.close >= c.open
    const color = rising ? UP : DOWN
    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(x, yOf(c.high))
    ctx.lineTo(x, yOf(c.low))
    ctx.stroke()
    const y1 = yOf(Math.max(c.open, c.close))
    const y2 = yOf(Math.min(c.open, c.close))
    ctx.fillRect(x - bw / 2, y1, bw, Math.max(1, y2 - y1))
    const vh = ((c.volume || 0) / maxVol) * volH
    ctx.globalAlpha = 0.45
    ctx.fillRect(x - bw / 2, volTop + volH - vh, bw, vh)
    ctx.globalAlpha = 1
  })

  const drawMA = (n, color) => {
    const ma = movingAverage(n)
    ctx.strokeStyle = color
    ctx.lineWidth = 1.2
    ctx.beginPath()
    let started = false
    ma.forEach((v, i) => {
      if (v == null) return
      const x = padL + step * (i + 0.5)
      const y = yOf(v)
      if (started) ctx.lineTo(x, y)
      else { ctx.moveTo(x, y); started = true }
    })
    ctx.stroke()
  }
  drawMA(5, '#e39b25')
  drawMA(10, '#185fa5')

  const last = candles[candles.length - 1]
  const lastPrice = Number(props.quote?.price) || last.close
  const ly = yOf(Math.min(max, Math.max(min, lastPrice)))
  ctx.strokeStyle = AXIS
  ctx.setLineDash([4, 4])
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(padL, ly)
  ctx.lineTo(padL + plotW, ly)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = '#14213d'
  ctx.fillRect(padL + plotW + 2, ly - 8, padR - 6, 16)
  ctx.fillStyle = '#ffffff'
  ctx.fillText(lastPrice.toFixed(2), padL + plotW + 6, ly + 4)

  if (hoverIndex.value >= 0 && hoverIndex.value < candles.length) {
    const x = padL + step * (hoverIndex.value + 0.5)
    ctx.strokeStyle = AXIS
    ctx.setLineDash([3, 3])
    ctx.beginPath()
    ctx.moveTo(x, padT)
    ctx.lineTo(x, volTop + volH)
    ctx.stroke()
    ctx.setLineDash([])
  }
}

function onMove(event) {
  const canvas = canvasRef.value
  if (!canvas || !props.candles.length) return
  const rect = canvas.getBoundingClientRect()
  const plotW = rect.width - 8 - 54
  const step = plotW / props.candles.length
  const idx = Math.floor((event.clientX - rect.left - 8) / step)
  hoverIndex.value = Math.max(0, Math.min(props.candles.length - 1, idx))
  const c = props.candles[hoverIndex.value]
  const tip = tipRef.value
  if (tip && c) {
    tip.style.display = 'block'
    tip.style.left = `${Math.min(rect.width - 230, Math.max(4, event.clientX - rect.left + 12))}px`
    tip.style.top = `${Math.max(4, event.clientY - rect.top - 44)}px`
    tip.textContent = `开 ${Number(c.open).toFixed(2)}  高 ${Number(c.high).toFixed(2)}  低 ${Number(c.low).toFixed(2)}  收 ${Number(c.close).toFixed(2)}`
  }
  draw()
}

function onLeave() {
  hoverIndex.value = -1
  if (tipRef.value) tipRef.value.style.display = 'none'
  draw()
}

onMounted(() => {
  nextTick(draw)
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(draw)
    if (wrapRef.value) observer.observe(wrapRef.value)
  }
  window.addEventListener('resize', draw)
})
onUnmounted(() => {
  observer?.disconnect()
  window.removeEventListener('resize', draw)
})
watch(() => props.candles, () => nextTick(draw))
watch(() => props.quote?.price, () => nextTick(draw))
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <span>K 线 · 日线</span>
      <span class="hint">MA5 <b style="color:#e39b25">—</b> / MA10 <b style="color:#185fa5">—</b> · 演示数据</span>
    </div>
    <div class="chart-head">
      <span class="symbol">{{ quote.name || '—' }} <small class="num" style="color:var(--muted)">{{ quote.code || '' }}</small></span>
      <span class="price num" :class="quote.changePct > 0 ? 'up' : quote.changePct < 0 ? 'down' : 'flat'">{{ Number(quote.price || 0).toFixed(2) }}</span>
      <span class="delta num" :class="quote.changePct > 0 ? 'up' : quote.changePct < 0 ? 'down' : 'flat'">{{ quote.changePct > 0 ? '+' : '' }}{{ Number(quote.changePct || 0).toFixed(2) }}%</span>
      <span class="meta">成交量 {{ Number(quote.volume || 0).toLocaleString() }}</span>
    </div>
    <div ref="wrapRef" class="chart-wrap">
      <canvas ref="canvasRef" @mousemove="onMove" @mouseleave="onLeave"></canvas>
      <div ref="tipRef" class="chart-tip"></div>
    </div>
  </section>
</template>
