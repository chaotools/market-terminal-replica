<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api/client.js'
import { useAppStore } from '../stores.js'
import { formatPct, formatPrice, toneClass } from '../format.js'

const route = useRoute()
const app = useAppStore()
const rows = ref([])
const loading = ref(false)

const kind = computed(() => String(route.meta?.svipKind || 'subject'))
const title = computed(() => ({ subject: '甄选题材', longhu: '龙虎榜', auction: '竞价优选', dingloong: '二板定龙' }[kind.value] || '甄选'))
const tabs = computed(() => {
  if (kind.value === 'longhu') return ['今日', '5日', '10日']
  if (kind.value === 'auction') return ['竞价优选', '强势竞价', '一字竞价']
  if (kind.value === 'dingloong') return ['今日', '昨日', '全部']
  return ['全部', '主线题材', '连板题材']
})
const activeTab = ref('')
const columns = computed(() => {
  if (kind.value === 'longhu') return [{ key: 'name', label: '名称' }, { key: 'code', label: '代码' }, { key: 'reason', label: '上榜原因' }, { key: 'pctChg', label: '涨跌幅', num: true }, { key: 'amount', label: '成交额', num: true }]
  if (kind.value === 'auction') return [{ key: 'name', label: '名称' }, { key: 'code', label: '代码' }, { key: 'auctionPct', label: '竞价涨幅', num: true }, { key: 'matchVolume', label: '匹配量', num: true }]
  if (kind.value === 'dingloong') return [{ key: 'name', label: '名称' }, { key: 'code', label: '代码' }, { key: 'streak', label: '连板', num: true }, { key: 'pctChg', label: '涨跌幅', num: true }, { key: 'subjectNames', label: '关联题材' }]
  return [{ key: 'name', label: '题材名称' }, { key: 'pctChg', label: '涨幅', num: true }, { key: 'limitUpCount', label: '涨停家数', num: true }, { key: 'leadStock', label: '领涨股' }, { key: 'heat', label: '热度', num: true }]
})

async function load() {
  loading.value = true
  try {
    if (kind.value === 'subject') {
      const data = await api.getSubjectList()
      rows.value = (Array.isArray(data?.list) ? data.list : []).map((s) => ({ name: s.subjectName, pctChg: s.changePct, limitUpCount: s.limitUpCount, leadStock: s.leadStock?.name || '—', heat: s.heat }))
    } else {
      const data = await api.getRealtimeRank({ start: 0, end: 120, sort: 'fastChg', sortType: 'desc' })
      const list = Array.isArray(data?.rows) ? data.rows : []
      rows.value = list.map((cells) => ({
        name: cells[1] || '',
        code: cells[2] || '',
        price: formatPrice(cells[3]),
        pctChg: Number(cells[4]) || 0,
        streak: Number(cells[6]) || 0,
        subjectNames: cells[11] || '',
        reason: kind.value === 'longhu' ? '本地契约未提供上榜原因' : '',
        amount: cells[13] || '',
        auctionPct: '—',
        matchVolume: '—'
      }))
      if (kind.value === 'dingloong') rows.value = rows.value.filter((row) => row.streak >= 2)
      if (kind.value === 'auction') rows.value = rows.value.slice(0, 20)
    }
  } catch { rows.value = [] } finally { loading.value = false }
}

function cellText(row, col) {
  const value = row[col.key]
  if (col.key === 'pctChg') return formatPct(value)
  if (value === undefined || value === null || value === '') return '—'
  return value
}

function cellClass(row, col) {
  if (col.key === 'pctChg') return toneClass(row.pctChg)
  return ''
}

onMounted(() => { app.setActiveGroup(3); activeTab.value = tabs.value[0]; load() })
</script>

<template>
  <div class="svip-simple-page">
    <div class="lead-toolbar">
      <span style="font-size: 14px; font-weight: 600; color: var(--text)">{{ title }}</span>
      <div class="lead-tabs">
        <button v-for="tab in tabs" :key="tab" class="lead-tab" :class="{ active: activeTab === tab }" @click="activeTab = tab">{{ tab }}</button>
      </div>
      <span style="margin-left: auto; color: var(--muted); font-size: 12px">共 {{ rows.length }} 条 · 本地契约</span>
    </div>
    <div class="svip-simple-body">
      <table class="data-table">
        <thead><tr><th class="num" style="width: 44px">序号</th><th v-for="col in columns" :key="col.key" :class="{ num: col.num }">{{ col.label }}</th></tr></thead>
        <tbody>
          <tr v-for="(row, index) in rows" :key="row.code || row.name">
            <td class="num muted">{{ index + 1 }}</td>
            <td v-for="col in columns" :key="col.key" :class="[col.num ? 'num' : '', cellClass(row, col)]">{{ cellText(row, col) }}</td>
          </tr>
          <tr v-if="!rows.length"><td :colspan="columns.length + 1" class="table-empty">{{ loading ? '加载中…' : '暂无数据（本地契约 server 未连接行情源）' }}</td></tr>
        </tbody>
      </table>
    </div>
    <div class="lead-pager">
      <span style="color: var(--muted)">
        原始页面：{{ title }} 数据来自 {{ kind === 'longhu' ? '/app/stock/long-hu/*' : kind === 'auction' ? '/app/realtime/stock-call-auction-data' : kind === 'dingloong' ? '/app/subject-limit-up-twice/*' : '/app/selected-subject/main/list/v2' }}（加密响应）；
        复刻版以本地契约 + 行情引擎近似展示。
      </span>
    </div>
  </div>
</template>
