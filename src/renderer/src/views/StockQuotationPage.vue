<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api/client.js'
import { useAppStore } from '../stores.js'
import { formatPct, formatAmount, toneClass } from '../format.js'

const route = useRoute()
const app = useAppStore()

const stockId = computed(() => String(route.params.id || ''))
const quote = ref(null)
const matched = ref(null)
const minute = ref(null)
const period = ref('minute')
const verticalTab = ref('K线')
const bottomTab = ref('题材亮点')
const favorite = ref(false)
const now = ref(new Date())
const canvasRef = ref(null)
let timer = null
let observed = null

const PERIODS = [{ k: 'minute', l: '分时' }, { k: 'day', l: '日线' }, { k: 'week', l: '周线' }, { k: 'month', l: '月线' }]
const BOTTOM_TABS = ['董秘问答', '个股研报', '图谱', '题材亮点']

const name = computed(() => quote.value?.name || matched.value?.name || stockId.value)
const current = computed(() => quote.value?.current ?? matched.value?.price ?? null)
const pctChg = computed(() => quote.value?.pctChg ?? matched.value?.changePct ?? null)
const tradeState = computed(() => {
  const d = now.value
  const minutes = d.getHours() * 60 + d.getMinutes()
  if (d.getDay() === 0 || d.getDay() === 6) return '休市'
  if (minutes >= 570 && minutes < 690) return '已开市'
  if (minutes >= 690 && minutes <= 780) return '午间休市'
  if (minutes > 780 && minutes <= 900) return '已开市'
  return '未开市'
})
const orderBook = computed(() => {
  const five = quote.value?.tradeFive
  const labels = ['一', '二', '三', '四', '五']
  if (Array.isArray(five) && five.length >= 20) {
    const sell = labels.map((label, i) => ({ label: '卖' + label, price: five[i * 2], volume: five[i * 2 + 1] }))
    const buy = labels.map((label, i) => ({ label: '买' + label, price: five[10 + i * 2], volume: five[10 + i * 2 + 1] }))
    return { sell: [...sell].reverse(), buy }
  }
  const sell = [5, 4, 3, 2, 1].map((n) => ({ label: '卖' + labels[n - 1], price: null, volume: null }))
  const buy = [1, 2, 3, 4, 5].map((n) => ({ label: '买' + labels[n - 1], price: null, volume: null }))
  return { sell, buy }
})
const stats = computed(() => {
  const q = quote.value || {}
  const rows = [
    ['现价', q.current ?? '—'], ['昨收', q.preClose ?? '—'],
    ['最高价', q.high ?? '—'], ['最低价', q.low ?? '—'],
    ['开盘价', q.open ?? '—'], ['收盘价', q.close ?? '—'],
    ['涨幅', formatPct(q.pctChg)], ['10日涨幅', q.recentChange != null ? q.recentChange + '%' : '—'],
    ['成交量', q.volume ? formatAmount(q.volume) : '—'], ['成交额', q.amount ? formatAmount(q.amount) : '—'],
    ['振幅', q.amplitude != null ? q.amplitude + '%' : '—'], ['换手率', q.turnoverRate != null ? q.turnoverRate + '%' : '—'],
    ['涨停', q.limitUpPrice ?? '—'], ['跌停', q.limitDownPrice ?? '—'],
    ['市盈率(静)', q.pe ?? '—'], ['市盈率(动)', q.peDynamic ?? '—'],
    ['总市值', q.totalMarketValue ? formatAmount(q.totalMarketValue) : '—'], ['流通值', q.circulatingMarketValue ? formatAmount(q.circulatingMarketValue) : '—'],
    ['总股本', '—'], ['流通股', '—']
  ]
  return rows
})

async function load() {
  const code = stockId.value
  if (!code) return
  try { quote.value = await api.getStockRealtimeData(code) } catch { quote.value = null }
  try {
    const rank = await api.getRealtimeRank({ start: 0, end: 200, sort: 'pctChg', sortType: 'desc' })
    const rows = Array.isArray(rank?.rows) ? rank.rows : []
    matched.value = rows.length ? { name: rows.find((r) => r[2] === code)?.[1] || '', price: Number(rows.find((r) => r[2] === code)?.[3]) || null, changePct: Number(rows.find((r) => r[2] === code)?.[4]) || null } : null
  } catch { matched.value = null }
  try { minute.value = await api.getStockMinuteData(code, new Date().toISOString().slice(0, 10)) } catch { minute.value = null }
}

function draw() {
  const canvas = canvasRef.value
  if (!canvas) return
  const wrap = canvas.parentElement
  const width = wrap?.clientWidth || 600
  const height = wrap?.clientHeight || 420
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.max(1, Math.floor(width * dpr))
  canvas.height = Math.max(1, Math.floor(height * dpr))
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, width, height)

  const pad = { left: 56, right: 60, top: 10, bottom: 24 }
  const plotW = width - pad.left - pad.right
  const volH = 58
  const plotH = height - pad.top - pad.bottom - volH - 8
  const preClose = Number(quote.value?.preClose) || null

  ctx.strokeStyle = '#eef1f5'
  ctx.lineWidth = 1
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (plotH * i) / 4
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + plotW, y); ctx.stroke()
  }
  for (let i = 0; i <= 3; i++) {
    const y = pad.top + plotH + 8 + (volH * i) / 3
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + plotW, y); ctx.stroke()
  }

  ctx.font = '10px "Microsoft YaHei", sans-serif'
  ctx.fillStyle = '#9aa3af'
  const times = ['09:30', '10:30', '11:30/13:00', '14:00', '15:00']
  times.forEach((label, i) => {
    const x = pad.left + (plotW * i) / (times.length - 1)
    ctx.fillText(label, x - (i === 0 ? 0 : i === times.length - 1 ? 26 : 22), height - 8)
  })

  // 左右双轴刻度：有昨收时按 ±10% 计算，否则显示百分比参考
  const pctMarks = [0.1, 0.05, 0, -0.05, -0.1]
  pctMarks.forEach((ratio) => {
    const y = pad.top + plotH / 2 - (plotH / 2) * (ratio / 0.1)
    ctx.fillStyle = '#e05353'
    ctx.fillText((ratio > 0 ? '+' : '') + (ratio * 100).toFixed(2) + '%', pad.left + plotW + 6, y + 3)
    if (preClose) {
      ctx.fillStyle = '#9aa3af'
      ctx.fillText((preClose * (1 + ratio)).toFixed(2), 8, y + 3)
    }
  })

  // 昨收基准线
  if (preClose) {
    const baseY = pad.top + plotH / 2
    ctx.strokeStyle = '#d9a23b'
    ctx.setLineDash([4, 3])
    ctx.beginPath(); ctx.moveTo(pad.left, baseY); ctx.lineTo(pad.left + plotW, baseY); ctx.stroke()
    ctx.setLineDash([])
  }

  const rows = minute.value?.data
  if (Array.isArray(rows) && rows.length) {
    const values = rows.map((pair) => Number(pair[1])).filter((v) => Number.isFinite(v))
    const vols = rows.map((pair) => Number(pair[2]) || 0)
    if (values.length) {
      const center = preClose || (Math.max(...values) + Math.min(...values)) / 2
      const span = Math.max(Math.abs(Math.max(...values) - center), Math.abs(center - Math.min(...values)), 1e-6) * 2
      const yOf = (v) => pad.top + plotH / 2 - ((v - center) / span) * plotH
      ctx.strokeStyle = '#1f9d6b'
      ctx.lineWidth = 1.2
      ctx.beginPath()
      values.forEach((v, i) => {
        const x = pad.left + (plotW * i) / Math.max(1, values.length - 1)
        const y = yOf(v)
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      })
      ctx.stroke()
      const maxVol = Math.max(...vols) || 1
      vols.forEach((v, i) => {
        const x = pad.left + (plotW * i) / Math.max(1, values.length - 1)
        const h = (v / maxVol) * volH
        ctx.fillStyle = '#e05353'
        ctx.fillRect(x - 1, pad.top + plotH + 8 + volH - h, 2, h)
      })
    }
  }
}

function toggleFavorite() {
  favorite.value = !favorite.value
  try {
    const key = 'replica-favorites'
    const list = JSON.parse(localStorage.getItem(key) || '[]')
    const next = favorite.value ? [...new Set([...list, stockId.value])] : list.filter((code) => code !== stockId.value)
    localStorage.setItem(key, JSON.stringify(next))
  } catch { /* ignore */ }
}

function applyQuote() { load() }

onMounted(async () => {
  app.setActiveGroup(1)
  try {
    const list = JSON.parse(localStorage.getItem('replica-favorites') || '[]')
    favorite.value = list.includes(stockId.value)
  } catch { /* ignore */ }
  await load()
  timer = setInterval(() => { now.value = new Date(); load() }, 8000)
  requestAnimationFrame(draw)
  observed = new ResizeObserver(() => requestAnimationFrame(draw))
  if (canvasRef.value) observed.observe(canvasRef.value.parentElement)
})

watch([minute, quote], () => requestAnimationFrame(draw), { deep: true })
onUnmounted(() => {
  clearInterval(timer)
  observed?.disconnect()
})
</script>

<template>
  <div class="quotation-page">
    <aside class="q-side">
      <div class="side-tabs">
        <button class="active">我的自选</button>
        <button>题材挖掘</button>
      </div>
      <div class="side-empty">
        <div class="empty-box"></div>
        <div>暂无自选股票</div>
        <button class="empty-action">+ 添加自选</button>
      </div>
    </aside>

    <div class="q-main">
      <div class="q-chart-row">
        <div class="q-vtabs">
          <button v-for="tab in ['K线', '分时']" :key="tab" class="q-vtab" :class="{ active: verticalTab === tab }" @click="verticalTab = tab">{{ tab }}</button>
        </div>
        <div class="q-chart">
          <div class="q-chart-head">
            <div class="tab-strip" style="border: none; padding: 0">
              <button v-for="p in PERIODS" :key="p.k" class="tab" :class="{ active: period === p.k }" @click="period = p.k">{{ p.l }}</button>
            </div>
            <span style="margin-left: auto"><button class="tool-btn">竞价优选</button></span>
          </div>
          <div class="q-chart-info">
            <span v-if="quote">{{ name }} {{ quote.current ?? '—' }} · 幅 {{ formatPct(quote.pctChg) }} · 均 {{ quote.avprice ?? '—' }} · 量 {{ quote.volume ? formatAmount(quote.volume) : '—' }}</span>
            <span v-else>{{ name }} · 未连接行情源</span>
          </div>
          <div class="q-chart-canvas">
            <canvas ref="canvasRef"></canvas>
            <div class="q-chart-empty" v-if="period !== 'minute'">日/周/月 K 线需要历史行情通道（/API/KLine2..5），本地契约 server 空态</div>
          </div>
        </div>
      </div>

      <div class="q-bottoms">
        <div class="tab-strip" style="height: 30px">
          <button v-for="tab in BOTTOM_TABS" :key="tab" class="tab" :class="{ active: bottomTab === tab }" @click="bottomTab = tab">{{ tab }}</button>
        </div>
        <div class="q-bottom-body">
          <template v-if="bottomTab === '题材亮点' || bottomTab === '图谱'">
            <div class="q-section-title">{{ name }} 关联题材</div>
            <div class="q-note" v-if="!quote">未连接行情源，暂无可展示的关联题材；原始页面数据来自 /app/stock/query/:id 与 /app/subject 系接口（加密响应）。</div>
            <div class="q-note" v-else>关联题材列表由本地契约 server 按个股所属题材返回。</div>
          </template>
          <template v-else>
            <div class="q-note">
              {{ bottomTab }} 数据来自原始应用的加密接口（/app/stock/qa/v2、/app/stock-report/v2/list 等）；
              复刻版在接入本地契约后按相同结构展示，当前显示空态。
            </div>
          </template>
        </div>
      </div>
    </div>

    <aside class="q-right">
      <div class="q-right-head">
        <div class="q-symbol"><span class="q-name">{{ name }}</span><span class="q-code">{{ stockId }}</span></div>
        <div class="q-price" :class="toneClass(pctChg)">
          {{ current ?? '—' }}
          <span class="q-change">{{ formatPct(pctChg) }}</span>
        </div>
        <div class="q-action"><button :class="{ done: favorite }" @click="toggleFavorite">{{ favorite ? '已加入自选' : '+ 加入自选' }}</button></div>
      </div>
      <div class="q-book">
        <div class="q-book-row"><span>交易状态</span><span class="p">{{ tradeState }}</span><span class="v"></span></div>
      </div>
      <div class="q-book">
        <div class="q-section-title">盘口</div>
        <div class="q-book-row" v-for="row in orderBook.sell" :key="row.label"><span>{{ row.label }}</span><span class="p">{{ row.price ?? '—' }}</span><span class="v">{{ row.volume ?? '—' }}</span></div>
        <div style="height: 6px"></div>
        <div class="q-book-row" v-for="row in orderBook.buy" :key="row.label"><span>{{ row.label }}</span><span class="p">{{ row.price ?? '—' }}</span><span class="v">{{ row.volume ?? '—' }}</span></div>
      </div>
      <div class="q-stats">
        <div class="q-stat-grid">
          <div class="q-stat" v-for="row in stats" :key="row[0]"><span>{{ row[0] }}</span><b>{{ row[1] }}</b></div>
        </div>
      </div>
    </aside>
  </div>
</template>
