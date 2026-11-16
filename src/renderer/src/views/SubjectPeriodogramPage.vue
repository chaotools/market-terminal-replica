<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useAppStore } from '../stores.js'
import { formatPct, toneClass } from '../format.js'
import { loadSnapshot, connectStream, emptySnapshot } from '../data.js'

const app = useAppStore()
const snap = ref(emptySnapshot())
const market = ref('sh')
let stopStream = null
let timer = null

const MARKETS = [
  { key: 'sh', label: '上证' },
  { key: 'sz', label: '深证' },
  { key: 'cy', label: '创业板' }
]
const rotation = computed(() => snap.value.rotation || { days: [], subjectIds: [], cells: [] })
const subjects = computed(() => snap.value.subjects || [])
const days = computed(() => rotation.value.days || [])
const hasHistory = computed(() => Boolean(rotation.value.days?.length))

const matrix = computed(() => {
  if (!hasHistory.value) return []
  return (rotation.value.subjectIds || []).map((def) => {
    const values = []
    for (let day = 0; day < days.value.length; day++) {
      const cell = (rotation.value.cells || []).find((c) => c.subjectId === def.id)
      values.push(cell ? cell.values[day] || 0 : 0)
    }
    const subject = subjects.value.find((s) => s.subjectId === def.id)
    return { id: def.id, name: def.name, values, changePct: subject?.changePct ?? 0 }
  }).sort((a, b) => b.changePct - a.changePct)
})

function applySnapshot(data) {
  snap.value = data
  app.setSource(data.source || 'local')
  app.setMeta(data.meta || {})
}

onMounted(async () => {
  app.setActiveGroup(3)
  applySnapshot(await loadSnapshot())
  stopStream = connectStream(applySnapshot)
  timer = setInterval(async () => { applySnapshot(await loadSnapshot()) }, 15000)
})
onUnmounted(() => { stopStream?.(); clearInterval(timer) })
</script>

<template>
  <div class="svip-simple-page">
    <div class="lead-toolbar">
      <span style="font-size: 14px; font-weight: 600">题材周期图</span>
      <div class="lead-tabs">
        <button v-for="item in MARKETS" :key="item.key" class="lead-tab" :class="{ active: market === item.key }" @click="market = item.key">{{ item.label }}</button>
      </div>
      <span style="margin-left: auto; color: var(--muted); font-size: 12px">近 {{ days.length }} 个交易日 · {{ MARKETS.find((m) => m.key === market)?.label }}</span>
    </div>
    <div class="svip-simple-body">
      <table class="data-table" v-if="matrix.length">
        <thead>
          <tr><th>题材</th><th v-for="day in days" :key="day" class="num">{{ day }}</th></tr>
        </thead>
        <tbody>
          <tr v-for="row in matrix" :key="row.id">
            <td>{{ row.name }}</td>
            <td v-for="(value, index) in row.values" :key="index" class="num" :class="toneClass(row.changePct)">{{ value || '—' }}</td>
          </tr>
        </tbody>
      </table>
      <div v-else class="table-empty" style="padding: 30px">
        本地暂无轮动历史快照（原始接口 /app/subject/history-cycle 为加密响应）。
        连接行情源后，复刻版按交易日累积周期矩阵；当前不伪造数据。
      </div>
    </div>
    <div class="lead-pager">
      <span style="color: var(--muted)">原始页面：/subject-periodogram，支持上证/深证/创业板切换与题材周期热力矩阵。</span>
    </div>
  </div>
</template>
