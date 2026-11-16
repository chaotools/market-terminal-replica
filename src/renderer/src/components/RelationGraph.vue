<script setup>
/**
 * 题材关系网络图 —— 对齐原版 ECharts graph series 的专业图表能力，零第三方依赖 canvas 自绘。
 * 节点 = 题材（大小按热度），边 = 题材间共享成分股数量（粗细按重合度），
 * 力导向布局 + 拖拽 + hover tooltip + 缩放，涨红跌绿。
 */
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { formatPct } from '../format.js'

const props = defineProps({
  nodes: { type: Array, default: () => [] },   // [{ id, name, value, heat, pctChg, category }]
  links: { type: Array, default: () => [] },   // [{ source, target, value }]
  height: { type: Number, default: 420 }
})
const emit = defineEmits(['select'])

const canvasRef = ref(null)
const wrapRef = ref(null)
const hovered = ref(null)
const zoom = ref(1)
let nodes = []
let links = []
let raf = null
let dragging = null
let width = 800
let dpr = 1

function initLayout() {
  const w = width, h = props.height
  const cx = w / 2, cy = h / 2
  nodes = props.nodes.map((n, i) => {
    const angle = (i / Math.max(1, props.nodes.length)) * Math.PI * 2
    const radius = 70 + (i % 3) * 55
    return {
      ...n,
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
      vx: 0, vy: 0,
      r: 8 + Math.min(14, Math.sqrt(Math.abs(n.heat || n.value || 10)) * 1.2)
    }
  })
  const idx = new Map(nodes.map((n, i) => [String(n.id), i]))
  links = props.links
    .map((l) => ({ ...l, si: idx.get(String(l.source)), ti: idx.get(String(l.target)) }))
    .filter((l) => l.si !== undefined && l.ti !== undefined)
}

function simulate() {
  const alpha = 0.92
  const w = width, h = props.height
  // 斥力
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j]
      let dx = b.x - a.x, dy = b.y - a.y
      let d2 = dx * dx + dy * dy || 1
      const force = 1400 / d2
      const d = Math.sqrt(d2)
      dx /= d; dy /= d
      a.vx -= dx * force; a.vy -= dy * force
      b.vx += dx * force; b.vy += dy * force
    }
  }
  // 引力（边）
  for (const l of links) {
    const a = nodes[l.si], b = nodes[l.ti]
    const dx = b.x - a.x, dy = b.y - a.y
    const d = Math.sqrt(dx * dx + dy * dy) || 1
    const target = 90 - Math.min(40, (l.value || 1) * 2)
    const k = (d - target) * 0.015
    a.vx += dx * k; a.vy += dy * k
    b.vx -= dx * k; b.vy -= dy * k
  }
  // 向心力 + 阻尼 + 边界
  for (const n of nodes) {
    if (dragging === n) { n.vx = 0; n.vy = 0; continue }
    n.vx += (w / 2 - n.x) * 0.0015
    n.vy += (h / 2 - n.y) * 0.0015
    n.vx *= alpha; n.vy *= alpha
    n.x += n.vx; n.y += n.vy
    n.x = Math.max(n.r + 4, Math.min(w - n.r - 4, n.x))
    n.y = Math.max(n.r + 4, Math.min(h - n.r - 4, n.y))
  }
}

function draw() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, props.height)
  ctx.save()
  ctx.translate(width / 2, props.height / 2)
  ctx.scale(zoom.value, zoom.value)
  ctx.translate(-width / 2, -props.height / 2)

  // 边
  for (const l of links) {
    const a = nodes[l.si], b = nodes[l.ti]
    ctx.beginPath()
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y)
    ctx.strokeStyle = 'rgba(150,165,185,0.35)'
    ctx.lineWidth = Math.min(5, 0.6 + (l.value || 1) * 0.25)
    ctx.stroke()
  }
  // 节点
  for (const n of nodes) {
    const pct = Number(n.pctChg)
    const color = Number.isFinite(pct) ? (pct > 0 ? '#d92b2b' : pct < 0 ? '#1a9a52' : '#9aa5b1') : '#4472c4'
    ctx.beginPath()
    ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.globalAlpha = hovered.value && hovered.value.id !== n.id ? 0.35 : 0.85
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke()
    ctx.fillStyle = '#fff'
    ctx.font = '9px sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText((n.name || '').slice(0, 4), n.x, n.y)
  }
  ctx.restore()
}

function loop() {
  simulate()
  draw()
  raf = requestAnimationFrame(loop)
}

function resize() {
  const wrap = wrapRef.value
  if (!wrap) return
  width = wrap.clientWidth || 800
  dpr = window.devicePixelRatio || 1
  const canvas = canvasRef.value
  if (canvas) { canvas.width = width * dpr; canvas.height = props.height * dpr; canvas.style.width = width + 'px'; canvas.style.height = props.height + 'px' }
}

function pos(e) {
  const r = canvasRef.value.getBoundingClientRect()
  const px = (e.clientX - r.left - width / 2) / zoom.value + width / 2
  const py = (e.clientY - r.top - props.height / 2) / zoom.value + props.height / 2
  return { x: px, y: py }
}
function onMove(e) {
  const p = pos(e)
  if (dragging) { dragging.x = p.x; dragging.y = p.y; return }
  hovered.value = nodes.find((n) => Math.hypot(n.x - p.x, n.y - p.y) <= n.r + 3) || null
}
function onDown(e) {
  const p = pos(e)
  dragging = nodes.find((n) => Math.hypot(n.x - p.x, n.y - p.y) <= n.r + 3) || null
}
function onUp(e) {
  if (dragging) {
    const p = pos(e)
    if (Math.hypot(dragging.x - p.x, dragging.y - p.y) < 4) emit('select', dragging)
  }
  dragging = null
}
function onWheel(e) {
  e.preventDefault()
  zoom.value = Math.min(2.5, Math.max(0.4, zoom.value + (e.deltaY > 0 ? -0.1 : 0.1)))
}

onMounted(() => { resize(); initLayout(); loop(); window.addEventListener('resize', resize) })
onUnmounted(() => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) })
watch(() => [props.nodes, props.links], () => { initLayout() }, { deep: false })
</script>

<template>
  <div ref="wrapRef" class="relation-graph" :style="{ height: height + 'px' }">
    <canvas ref="canvasRef"
            @mousemove="onMove" @mousedown="onDown" @mouseup="onUp" @mouseleave="onUp" @wheel="onWheel"></canvas>
    <div class="rg-legend"><span class="rg-dot up"></span>上涨 <span class="rg-dot down"></span>下跌 <span class="rg-dot flat"></span>平/未知 · 拖拽节点 / 滚轮缩放</div>
    <div v-if="hovered" class="rg-tip">
      <b>{{ hovered.name }}</b>
      <span :class="Number(hovered.pctChg) > 0 ? 'up' : Number(hovered.pctChg) < 0 ? 'down' : ''">{{ formatPct(hovered.pctChg) }}</span>
      <span v-if="hovered.heat != null">热度 {{ hovered.heat }}</span>
    </div>
    <div v-if="!nodes.length" class="rg-empty">未连接行情源，暂无关系图数据</div>
  </div>
</template>
