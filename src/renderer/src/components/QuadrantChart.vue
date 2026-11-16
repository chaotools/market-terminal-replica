<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'

const props = defineProps({
  quadrants: { type: Object, default: () => ({ points: [] }) },
  selected: { type: String, default: '' }
})
const emit = defineEmits(['select'])

const canvasRef = ref(null)
const wrapRef = ref(null)
let observer = null
let hitBoxes = []

const STAGE_COLOR = {
  '加速': '#d63031', '发酵': '#e39b25', '主线': '#a32d2d',
  '分歧': '#7f77dd', '退潮': '#0f7a57', '萌芽': '#8b929d'
}

function draw() {
  const canvas = canvasRef.value
  const wrap = wrapRef.value
  if (!canvas || !wrap) return
  const rect = wrap.getBoundingClientRect()
  const W = Math.max(240, rect.width)
  const H = Math.max(180, rect.height)
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.round(W * dpr)
  canvas.height = Math.round(H * dpr)
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, W, H)

  const points = props.quadrants.points || []
  if (!points.length) return
  const padL = 34, padR = 12, padT = 14, padB = 26
  const plotW = W - padL - padR
  const plotH = H - padT - padB
  const heatMid = Number(props.quadrants.heatMid) || 50
  const pctMid = Number(props.quadrants.pctMid) || 0
  const xMin = 0, xMax = 100
  const ys = points.map((p) => Number(p.y) || 0)
  const yMin = Math.min(-1, ...ys) - 1
  const yMax = Math.max(1, ...ys) + 1
  const xOf = (v) => padL + ((v - xMin) / (xMax - xMin)) * plotW
  const yOf = (v) => padT + ((yMax - v) / (yMax - yMin)) * plotH
  const midX = xOf(heatMid)
  const midY = yOf(pctMid)

  ctx.fillStyle = '#fbf6f5'
  ctx.fillRect(midX, padT, W - padR - midX, midY - padT)
  ctx.fillStyle = '#f4f8fa'
  ctx.fillRect(padL, padT, midX - padL, midY - padT)
  ctx.fillStyle = '#f7f9fb'
  ctx.fillRect(padL, midY, midX - padL, H - padB - midY)
  ctx.fillStyle = '#f2f8f5'
  ctx.fillRect(midX, midY, W - padR - midX, H - padB - midY)

  ctx.strokeStyle = '#d3d8df'
  ctx.lineWidth = 1
  ctx.setLineDash([4, 4])
  ctx.beginPath(); ctx.moveTo(midX, padT); ctx.lineTo(midX, H - padB); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(padL, midY); ctx.lineTo(W - padR, midY); ctx.stroke()
  ctx.setLineDash([])
  ctx.strokeStyle = '#e4e7eb'
  ctx.strokeRect(padL, padT, plotW, plotH)

  ctx.font = '10px -apple-system, "Microsoft YaHei", sans-serif'
  ctx.fillStyle = '#8b929d'
  ctx.fillText('低热度高涨幅', padL + 6, padT + 13)
  ctx.fillText('高热度高涨幅', midX + 6, padT + 13)
  ctx.fillText('低热度低涨幅', padL + 6, H - padB - 7)
  ctx.fillText('高热度低涨幅', midX + 6, H - padB - 7)
  ctx.fillText(`热度 ${heatMid}`, midX + 4, H - 6)
  ctx.fillText(`涨幅 ${pctMid}%`, 2, midY - 4)

  hitBoxes = []
  for (const p of points) {
    const x = xOf(Number(p.x))
    const y = yOf(Number(p.y))
    const active = p.subjectId === props.selected
    const color = STAGE_COLOR[p.stage] || '#185fa5'
    ctx.beginPath()
    ctx.arc(x, y, active ? 7 : 5, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.globalAlpha = active ? 1 : 0.82
    ctx.fill()
    ctx.globalAlpha = 1
    if (active) {
      ctx.strokeStyle = '#14213d'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
    ctx.fillStyle = '#4a515c'
    const label = String(p.subjectName || '').replace('示例·', '')
    ctx.fillText(label, x + 8, y - 6)
    hitBoxes.push({ x, y, id: p.subjectId })
  }
}

function onClick(event) {
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  let best = null
  let dist = 18
  for (const b of hitBoxes) {
    const d = Math.hypot(b.x - x, b.y - y)
    if (d < dist) { dist = d; best = b }
  }
  if (best) emit('select', best.id)
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
watch(() => [props.quadrants, props.selected], () => nextTick(draw), { deep: true })
</script>

<template>
  <div class="quadrant-block">
    <div class="block-title">
      <span>题材四象限</span>
      <span class="hint">热度 × 涨幅 · 点击散点切换题材</span>
    </div>
    <div ref="wrapRef" class="quadrant-wrap">
      <canvas ref="canvasRef" @click="onClick"></canvas>
    </div>
  </div>
</template>
