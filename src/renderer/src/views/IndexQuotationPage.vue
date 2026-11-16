<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useAppStore } from '../stores.js'
import { formatPct, formatAmount, toneClass } from '../format.js'
import { loadSnapshot, connectStream, emptySnapshot } from '../data.js'

const route = useRoute()
const app = useAppStore()
const snap = ref(emptySnapshot())
const canvasRef = ref(null)
let stopStream = null
let observed = null

const indexId = computed(() => String(route.params.id || ''))
const indices = computed(() => snap.value.market?.indices || [])
const index = computed(() => indices.value.find((i) => String(i.code) === indexId.value) || indices.value[0] || {})
const market = computed(() => snap.value.market || {})

function draw() {
  const canvas = canvasRef.value
  if (!canvas) return
  const width = canvas.parentElement?.clientWidth || 600
  const height = canvas.parentElement?.clientHeight || 360
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.floor(width * dpr)
  canvas.height = Math.floor(height * dpr)
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, width, height)
  ctx.strokeStyle = '#eef1f5'
  for (let i = 0; i <= 4; i++) {
    const y = 20 + ((height - 40) * i) / 4
    ctx.beginPath(); ctx.moveTo(40, y); ctx.lineTo(width - 12, y); ctx.stroke()
  }
  ctx.fillStyle = '#9aa3af'
  ctx.font = '11px "Microsoft YaHei", sans-serif'
  ctx.fillText('指数分时/历史走势需 /API/KLine2..5 通道（8080）本地契约空态', 48, height / 2)
}

function applySnapshot(data) {
  snap.value = data
  app.setSource(data.source || 'local')
  app.setMeta(data.meta || {})
  requestAnimationFrame(draw)
}

onMounted(async () => {
  app.setActiveGroup(1)
  applySnapshot(await loadSnapshot())
  stopStream = connectStream(applySnapshot)
  requestAnimationFrame(draw)
  observed = new ResizeObserver(() => requestAnimationFrame(draw))
  if (canvasRef.value) observed.observe(canvasRef.value.parentElement)
})
onUnmounted(() => { stopStream?.(); observed?.disconnect() })
</script>

<template>
  <div class="quotation-page">
    <div class="q-main">
      <div class="q-chart">
        <div class="q-chart-head">
          <span style="font-size: 14px; font-weight: 600">{{ index.name || '指数详情' }}</span>
          <span class="muted">{{ index.code || indexId }}</span>
          <span :class="toneClass(index.changePct)" style="font-weight: 600">{{ formatPct(index.changePct) }}</span>
        </div>
        <div class="q-chart-canvas" style="min-height: 460px">
          <canvas ref="canvasRef"></canvas>
        </div>
        <div class="lead-pager">
          <span style="color: var(--muted)">原始页面：/market-trend/composite-index/quotation/:id，展示指数分时、成分股与涨跌分布；分时数据来自本地 8080 图表引擎通道。</span>
        </div>
      </div>
    </div>
    <aside class="q-right">
      <div class="q-right-head">
        <div class="q-symbol"><span class="q-name">{{ index.name || '—' }}</span><span class="q-code">{{ index.code || indexId }}</span></div>
        <div class="q-price" :class="toneClass(index.changePct)">{{ index.price ?? '—' }} <span class="q-change">{{ formatPct(index.changePct) }}</span></div>
      </div>
      <div class="q-stats">
        <div class="q-stat-grid">
          <div class="q-stat"><span>上涨家数</span><b>{{ market.upCount ?? '—' }}</b></div>
          <div class="q-stat"><span>下跌家数</span><b>{{ market.downCount ?? '—' }}</b></div>
          <div class="q-stat"><span>涨停</span><b>{{ market.limitUpCount ?? '—' }}</b></div>
          <div class="q-stat"><span>跌停</span><b>{{ market.limitDownCount ?? '—' }}</b></div>
          <div class="q-stat"><span>成交额</span><b>{{ formatAmount(market.turnover) }}</b></div>
          <div class="q-stat"><span>更新时间</span><b>{{ market.updatedAt || '—' }}</b></div>
        </div>
        <p class="q-note">指数行情来自 /app/realtime/index/v2 等公开接口；本地契约未连接行情源时显示空态。</p>
      </div>
    </aside>
  </div>
</template>
