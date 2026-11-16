<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api/client.js'
import { useAppStore } from '../stores.js'
import { formatPct, formatAmount, formatPrice, toneClass } from '../format.js'

const route = useRoute()
const app = useAppStore()

const sideTab = ref('mine')
const chartTab = ref('minute')
const filterTab = ref('all')
const rows = ref([])
const selected = ref(null)
const subjects = ref([])
const loading = ref(false)
const keyword = ref(String(route.query.keyword || ''))
let timer = null

const COLUMNS = [
  { key: 'name', label: '名称', width: 92 },
  { key: 'code', label: '代码', width: 78 },
  { key: 'price', label: '现价', align: 'right', width: 72 },
  { key: 'pctChg', label: '涨跌幅', align: 'right', width: 80 },
  { key: 'pct10', label: '10日涨跌幅', align: 'right', width: 92 },
  { key: 'streak', label: '连板天数', align: 'right', width: 78 },
  { key: 'speed', label: '涨速', align: 'right', width: 72 },
  { key: 'change', label: '涨跌', align: 'right', width: 70 },
  { key: 'marketValue', label: '总市值', align: 'right', width: 84 },
  { key: 'subjectCount', label: '关联题材数', align: 'right', width: 86 },
  { key: 'subjectNames', label: '关联题材', width: 260 },
  { key: 'volume', label: '成交量', align: 'right', width: 84 },
  { key: 'amount', label: '成交额', align: 'right', width: 84 },
  { key: 'turnoverRate', label: '换手率', align: 'right', width: 78 }
]

const filteredRows = computed(() => {
  const kw = keyword.value.trim()
  if (!kw) return rows.value
  return rows.value.filter((row) => String(row.name || '').includes(kw) || String(row.code || '').includes(kw))
})

async function load() {
  loading.value = true
  try {
    const data = await api.getRealtimeRank({ start: 0, end: 200, sort: 'pctChg', sortType: 'desc' })
    const rawRows = Array.isArray(data?.rows) ? data.rows : []
    rows.value = rawRows.map((cells, index) => ({
      index: index + 1,
      name: cells[1] || '',
      code: cells[2] || '',
      price: formatPrice(cells[3]),
      pctChg: formatPct(cells[4]),
      pct10: formatPct(cells[5]),
      streak: cells[6] && cells[6] !== '--' ? cells[6] + '天' : '--',
      speed: formatPct(cells[7]),
      change: cells[8] ?? '--',
      marketValue: cells[9] ? formatAmount(cells[9]) : '--',
      subjectCount: cells[10] ?? '--',
      subjectNames: cells[11] || '--',
      volume: cells[12] ? formatAmount(cells[12]) : '--',
      amount: cells[13] ? formatAmount(cells[13]) : '--',
      turnoverRate: cells[14] ?? '--'
    }))
  } catch { rows.value = [] } finally { loading.value = false }
}

async function loadSubjects() {
  try {
    const data = await api.getSubjectList()
    subjects.value = Array.isArray(data?.list) ? data.list : []
  } catch { subjects.value = [] }
}

function selectRow(row) { selected.value = row }

onMounted(() => {
  app.setActiveGroup(1)
  load()
  loadSubjects()
  timer = setInterval(load, 15000)
})
onUnmounted(() => clearInterval(timer))
</script>

<template>
  <div class="market-page">
    <aside class="market-side">
      <div class="side-tabs">
        <button :class="{ active: sideTab === 'mine' }" @click="sideTab = 'mine'">我的自选</button>
        <button :class="{ active: sideTab === 'dig' }" @click="sideTab = 'dig'">题材挖掘</button>
      </div>
      <div class="side-empty" v-if="sideTab === 'mine'">
        <div class="empty-box"></div>
        <div>暂无自选股票</div>
        <button class="empty-action">+ 添加自选</button>
      </div>
      <div v-else style="flex: 1; overflow: auto; padding: 6px">
        <table class="data-table" v-if="subjects.length">
          <thead><tr><th>题材名称</th><th class="num">热度</th><th class="num">涨幅</th></tr></thead>
          <tbody>
            <tr v-for="item in subjects.slice(0, 40)" :key="item.subjectId">
              <td>{{ item.subjectName }}</td>
              <td class="num">{{ item.heat }}</td>
              <td class="num" :class="toneClass(item.changePct)">{{ formatPct(item.changePct) }}</td>
            </tr>
          </tbody>
        </table>
        <div v-else class="side-empty"><div>未连接行情源</div></div>
      </div>
    </aside>

    <div class="market-main">
      <div class="table-toolbar">
        <span>全部A股</span>
        <span class="muted" style="color: var(--muted)">共 {{ filteredRows.length }} 只</span>
        <input v-model="keyword" placeholder="搜索名称/代码" style="height: 24px; border: 1px solid var(--border); border-radius: 3px; padding: 0 8px; font-size: 12px; width: 160px" />
        <div class="right"><button class="tool-btn">导出</button></div>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th class="num" style="width: 44px">序号</th>
              <th v-for="col in COLUMNS" :key="col.key" :class="{ num: col.align === 'right' }" :style="{ width: col.width + 'px' }">{{ col.label }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in filteredRows" :key="row.code" :class="{ active: selected?.code === row.code }" @click="selectRow(row)">
              <td class="num muted">{{ row.index }}</td>
              <td>{{ row.name }}</td>
              <td class="muted">{{ row.code }}</td>
              <td class="num" :class="toneClass(row.pctChg)">{{ row.price }}</td>
              <td class="num" :class="toneClass(row.pctChg)">{{ row.pctChg }}</td>
              <td class="num" :class="toneClass(row.pct10)">{{ row.pct10 }}</td>
              <td class="num">{{ row.streak }}</td>
              <td class="num" :class="toneClass(row.speed)">{{ row.speed }}</td>
              <td class="num" :class="toneClass(row.change)">{{ row.change }}</td>
              <td class="num">{{ row.marketValue }}</td>
              <td class="num">{{ row.subjectCount }}</td>
              <td class="muted">{{ row.subjectNames }}</td>
              <td class="num">{{ row.volume }}</td>
              <td class="num">{{ row.amount }}</td>
              <td class="num">{{ row.turnoverRate }}</td>
            </tr>
            <tr v-if="!filteredRows.length">
              <td colspan="15" class="table-empty">{{ loading ? '加载中…' : '暂无数据（未连接行情源）' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="market-bottom">
        <button class="tab" :class="{ active: filterTab === 'all' }" @click="filterTab = 'all'">全部</button>
        <button class="tab" :class="{ active: filterTab === 'sh' }" @click="filterTab = 'sh'">上证</button>
        <button class="tab" :class="{ active: filterTab === 'sz' }" @click="filterTab = 'sz'">深证</button>
        <button class="tab" :class="{ active: filterTab === 'cy' }" @click="filterTab = 'cy'">创业</button>
      </div>
    </div>

    <aside class="market-chart">
      <div class="chart-tabs">
        <button v-for="tab in [{ k: 'minute', l: '分时' }, { k: 'day', l: '日线' }, { k: 'week', l: '周线' }, { k: 'month', l: '月线' }]" :key="tab.k"
          :class="{ active: chartTab === tab.k }" @click="chartTab = tab.k">{{ tab.l }}</button>
      </div>
      <div class="chart-head-info" v-if="selected">
        <span><b>{{ selected.name }}</b> {{ selected.code }}</span>
        <span :class="toneClass(selected.pctChg)">{{ selected.pctChg }}</span>
        <span>现价 <b>{{ selected.price }}</b></span>
      </div>
      <div class="chart-placeholder">
        {{ selected ? '未连接行情源，暂无分时/K线数据' : '选择左侧股票查看行情' }}
      </div>
    </aside>
  </div>
</template>
