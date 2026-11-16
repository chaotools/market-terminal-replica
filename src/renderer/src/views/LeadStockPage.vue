<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api/client.js'
import { useAppStore } from '../stores.js'
import { formatPct, formatPrice, toneClass } from '../format.js'

const router = useRouter()
const app = useAppStore()

const POOL_TABS = ['竞价优选', '黄线', '蓝线', '人气龙头', '涨停', '涨停开板']
const DAY_TABS = ['今日', '昨日', '全部']
const VIEW_TABS = ['列表', '多股同列', '分时', '日K', '雷霆判势']

const poolTab = ref('涨停')
const dayTab = ref('今日')
const viewTab = ref('列表')
const rows = ref([])
const page = ref(1)
const loading = ref(false)

const PAGE_SIZE = 24

const filtered = computed(() => {
  if (!rows.value.length) return []
  if (poolTab.value === '涨停' || poolTab.value === '涨停开板') return rows.value.filter((row) => Number(row.streak) > 0)
  if (poolTab.value === '人气龙头') return [...rows.value].sort((a, b) => b.heat - a.heat).slice(0, 60)
  return rows.value
})

const pageRows = computed(() => filtered.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))
const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE_SIZE)))

async function load() {
  loading.value = true
  try {
    const data = await api.getRealtimeRank({ start: 0, end: 300, sort: 'fastChg', sortType: 'desc' })
    const list = Array.isArray(data?.rows) ? data.rows : []
    rows.value = list.map((cells, index) => ({
      index: index + 1,
      name: cells[1] || '',
      code: cells[2] || '',
      price: formatPrice(cells[3]),
      pctChg: Number(cells[4]) || 0,
      streak: Number(cells[6]) || 0,
      subjectNames: cells[11] || '',
      heat: 100 - index
    }))
  } catch { rows.value = [] } finally { loading.value = false }
}

function prevDay() { if (page.value > 1) page.value -= 1 }
function nextDay() { if (page.value < totalPages.value) page.value += 1 }

onMounted(() => { app.setActiveGroup(3); load() })
</script>

<template>
  <div class="lead-page">
    <div class="lead-toolbar">
      <div class="lead-tabs">
        <button v-for="tab in POOL_TABS" :key="tab" class="lead-tab" :class="{ active: poolTab === tab }" @click="poolTab = tab">{{ tab }}</button>
      </div>
      <div class="lead-daytabs">
        <button v-for="tab in ['上一天', '下一天']" :key="tab" @click="tab === '上一天' ? prevDay() : nextDay()">{{ tab }}</button>
        <button v-for="tab in DAY_TABS" :key="tab" :class="{ active: dayTab === tab }" @click="dayTab = tab">{{ tab }}</button>
        <button class="lead-tab">指标筛选</button>
      </div>
    </div>
    <div class="lead-toolbar">
      <div class="lead-tabs">
        <button v-for="tab in VIEW_TABS" :key="tab" class="lead-tab" :class="{ active: viewTab === tab }" @click="viewTab = tab">{{ tab }}</button>
      </div>
      <span style="margin-left: auto; color: var(--muted); font-size: 12px">
        {{ dayTab }} · {{ poolTab }} · 共 {{ filtered.length }} 只（本地契约空态时无数据）
      </span>
    </div>

    <div class="stock-card-grid" v-if="pageRows.length">
      <div v-for="row in pageRows" :key="row.code" class="stock-card">
        <div class="sc-name">{{ row.name || row.code }}</div>
        <div class="sc-code">{{ row.code }} · {{ row.streak ? row.streak + '板' : '首板' }}</div>
        <div class="sc-pct" :class="toneClass(row.pctChg)">{{ formatPct(row.pctChg) }}</div>
        <div class="sc-code">{{ row.subjectNames || '—' }}</div>
      </div>
    </div>
    <div class="stock-card-grid" v-else>
      <div class="table-empty" style="grid-column: 1 / -1">
        {{ loading ? '加载中…' : `${poolTab} · ${dayTab} 暂无数据（本地契约 server 未连接行情源）` }}
      </div>
    </div>

    <div class="lead-pager">
      <button class="tool-btn" @click="prevDay">上一页</button>
      <span>{{ page }} / {{ totalPages }}</span>
      <button class="tool-btn" @click="nextDay">下一页</button>
      <span style="margin-left: auto; color: var(--muted)">
        原始页面：竞价优选/黄线/蓝线/人气龙头/涨停/涨停开板 + 列表/多股同列/分时/日K/雷霆判势；
        数据来自 /app/stock/stock-pool-config、/app/stock/pick-rank-day/v2/:subjectId/:type 等（加密响应）。
      </span>
    </div>
  </div>
</template>
