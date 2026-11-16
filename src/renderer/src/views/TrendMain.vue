<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SimpleChart from '../components/SimpleChart.vue'
import { api } from '../api/client.js'
import { useAppStore } from '../stores.js'

const route = useRoute()
const router = useRouter()
const app = useAppStore()

const activeTab = ref(route.query.his === '1' ? 'history' : 'today')
const marketSeries = ref([])
const summary = ref(null)
const riskText = ref('')
let timer = null

const labels = computed(() => marketSeries.value.map((row) => {
  const t = String(row.time || '').padStart(6, '0')
  return `${t.slice(0, 2)}:${t.slice(2, 4)}`
}))
const seriesOf = (pick) => [{ name: 'value', color: '#2f7ac0', data: marketSeries.value.map(pick).filter((v) => Number.isFinite(v)) }]

const limitUpSeries = computed(() => seriesOf((row) => Number(row.limitUpTimesCount)))
const heightSeries = computed(() => [{ name: 'height', color: '#d85a30', data: marketSeries.value.map((row) => Number(row.limitUpHeight)).filter(Number.isFinite) }])
const ratioSeries = computed(() => [{
  name: 'ratio',
  color: '#1f9d6b',
  data: marketSeries.value.map((row) => {
    const up = Number(row.upCount) || 0
    const down = Number(row.downCount) || 0
    return up + down ? (up / (up + down)) * 100 : NaN
  }).filter(Number.isFinite)
}])
const limitCompareSeries = computed(() => [
  { name: '涨停', color: '#e05353', data: marketSeries.value.map((row) => Number(row.limitUpCount)).filter(Number.isFinite) },
  { name: '跌停', color: '#17a673', data: marketSeries.value.map((row) => Number(row.limitDownCount)).filter(Number.isFinite) }
])
const kColorSeries = computed(() => [
  { name: '红K', color: '#e05353', data: marketSeries.value.map((row) => Number(row.red)).filter(Number.isFinite) },
  { name: '黄K', color: '#d9a23b', data: marketSeries.value.map((row) => Number(row.yellow)).filter(Number.isFinite) },
  { name: '蓝K', color: '#4a6fd8', data: marketSeries.value.map((row) => Number(row.blue)).filter(Number.isFinite) }
])

const distribution = computed(() => {
  const s = summary.value || {}
  return {
    labels: ['涨停', '上涨', '平盘', '下跌', '跌停'],
    data: [Number(s.limitUp) || 0, Number(s.up) || 0, Number(s.flat) || 0, Number(s.down) || 0, Number(s.limitDown) || 0],
    colors: ['#e05353', '#e06666', '#c9ced6', '#2fa37a', '#17a673']
  }
})
const hasSeries = computed(() => marketSeries.value.length > 0)
const hasDistribution = computed(() => (summary.value?.up || 0) + (summary.value?.down || 0) + (summary.value?.limitUp || 0) > 0)

async function load() {
  try {
    const list = await api.getMarketTime()
    marketSeries.value = Array.isArray(list) ? list : []
  } catch { marketSeries.value = [] }
  try {
    summary.value = await api.getStockSummaryPctChg()
  } catch { summary.value = null }
  try {
    const info = await api.getConfigInfo('行情')
    riskText.value = [info?.sourceInfo, info?.riskInfo].filter(Boolean).join('  ')
  } catch { riskText.value = '' }
}

function switchTab(tab) {
  activeTab.value = tab
  router.replace({ path: '/trend', query: tab === 'history' ? { his: '1' } : {} })
}

watch(() => route.query.his, (value) => { activeTab.value = value === '1' ? 'history' : 'today' })

onMounted(() => {
  app.setActiveGroup(1)
  load()
  timer = setInterval(load, 15000)
})
onUnmounted(() => clearInterval(timer))
</script>

<template>
  <div class="trend-page">
    <div class="tab-strip">
      <button class="tab" :class="{ active: activeTab === 'today' }" @click="switchTab('today')">今日走势</button>
      <button class="tab" :class="{ active: activeTab === 'history' }" @click="switchTab('history')">历史走势</button>
    </div>

    <template v-if="activeTab === 'today'">
      <div class="trend-grid">
        <div class="trend-panel">
          <div class="panel-title">涨跌分布<span class="panel-legend"><span>涨停 {{ distribution.data[0] }}</span><span>跌停 {{ distribution.data[4] }}</span></span></div>
          <div class="chart-body">
            <SimpleChart type="bar" :series="[{ name: 'distribution', color: '#2f7ac0', data: distribution.data }]" :labels="distribution.labels" :y-min="0" v-if="hasDistribution" />
            <div class="chart-empty" v-else>未连接行情源，暂无涨跌分布</div>
          </div>
        </div>

        <div class="trend-panel">
          <div class="panel-title">连板个数分时走势<span class="panel-legend"><span><i style="background:#e05353"></i>连板数</span></span></div>
          <div class="chart-body">
            <SimpleChart type="line" :series="limitUpSeries" :labels="labels" v-if="hasSeries" />
            <div class="chart-empty" v-else>未连接行情源，暂无分时数据</div>
          </div>
        </div>

        <div class="trend-panel">
          <div class="panel-title">连板高度分时走势<span class="panel-legend"><span><i style="background:#d85a30"></i>最高板</span></span></div>
          <div class="chart-body">
            <SimpleChart type="area" :series="heightSeries" :labels="labels" :y-min="0" v-if="hasSeries" />
            <div class="chart-empty" v-else>未连接行情源，暂无分时数据</div>
          </div>
        </div>

        <div class="trend-panel">
          <div class="panel-title">上涨比率分时走势<span class="panel-legend"><span><i style="background:#1f9d6b"></i>上涨比率</span></span></div>
          <div class="chart-body">
            <SimpleChart type="area" :series="ratioSeries" :labels="labels" :y-min="0" :y-max="100" v-if="hasSeries" />
            <div class="chart-empty" v-else>未连接行情源，暂无分时数据</div>
          </div>
        </div>

        <div class="trend-panel">
          <div class="panel-title">涨跌停分时走势对比<span class="panel-legend"><span><i style="background:#e05353"></i>涨停 {{ marketSeries.length ? marketSeries[marketSeries.length - 1].limitUpCount : '—' }}</span><span><i style="background:#17a673"></i>跌停 {{ marketSeries.length ? marketSeries[marketSeries.length - 1].limitDownCount : '—' }}</span></span></div>
          <div class="chart-body">
            <SimpleChart type="multi" :series="limitCompareSeries" :labels="labels" :y-min="0" v-if="hasSeries" />
            <div class="chart-empty" v-else>未连接行情源，暂无分时数据</div>
          </div>
        </div>

        <div class="trend-panel">
          <div class="panel-title">红K、黄K、蓝K分时走势对比<span class="panel-legend"><span><i style="background:#e05353"></i>红K {{ marketSeries.length ? marketSeries[marketSeries.length - 1].red : '—' }}</span><span><i style="background:#d9a23b"></i>黄K {{ marketSeries.length ? marketSeries[marketSeries.length - 1].yellow : '—' }}</span><span><i style="background:#4a6fd8"></i>蓝K {{ marketSeries.length ? marketSeries[marketSeries.length - 1].blue : '—' }}</span></span></div>
          <div class="chart-body">
            <SimpleChart type="multi" :series="kColorSeries" :labels="labels" :y-min="0" v-if="hasSeries" />
            <div class="chart-empty" v-else>未连接行情源，暂无分时数据</div>
          </div>
        </div>
      </div>
      <div class="trend-foot">{{ riskText || '数据来源说明：基于本地 API 契约 server；未连接真实行情源时为空。' }}</div>
    </template>

    <template v-else>
      <div class="trend-grid">
        <div class="trend-panel" style="grid-column: span 3">
          <div class="panel-title">历史走势</div>
          <div class="chart-body">
            <div class="chart-empty">历史走势需要真实历史行情通道（/app/realtime/market/calendar/:a/:b），本地契约 server 未连接数据源时为空。</div>
          </div>
        </div>
      </div>
      <div class="trend-foot">{{ riskText || '' }}</div>
    </template>
  </div>
</template>
