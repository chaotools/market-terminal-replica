<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '../stores.js'
import { formatPct, toneClass } from '../format.js'
import { loadSnapshot, connectStream, emptySnapshot } from '../data.js'

const router = useRouter()
const app = useAppStore()
const snap = ref(emptySnapshot())
const sortKey = ref('limitup')
let stopStream = null
let timer = null

const RAIL = [
  { label: '题材掘金', path: '/subject/excavate' },
  { label: '题材轮动', path: '/subject/periodic' },
  { label: '全部题材', path: '/subject/all' }
]

const SLOTS = 11

const subjects = computed(() => snap.value.subjects || [])
const rotation = computed(() => snap.value.rotation || { days: [], subjectIds: [], cells: [] })

const days = computed(() => {
  if (rotation.value.days?.length) return rotation.value.days
  // 无本地历史快照时：只显示最近交易日列头，矩阵体为空（不伪造数据）
  const list = []
  const cursor = new Date()
  while (list.length < 10) {
    const week = cursor.getDay()
    if (week !== 0 && week !== 6) list.push(cursor.toISOString().slice(5, 10))
    cursor.setDate(cursor.getDate() - 1)
  }
  return list
})

const hasHistory = computed(() => Boolean(rotation.value.days?.length))

const matrix = computed(() => {
  if (!hasHistory.value) return []
  const byDay = rotation.value.days.map((_, dayIndex) => {
    const cellMap = new Map()
    for (const cell of rotation.value.cells || []) {
      cellMap.set(cell.subjectId, cell.values[dayIndex] || 0)
    }
    return [...(rotation.value.subjectIds || [])]
      .map((def) => ({ id: def.id, name: def.name, value: cellMap.get(def.id) || 0 }))
      .sort((a, b) => (sortKey.value === 'limitup'
        ? (subjectById(b.id)?.limitUpCount || 0) - (subjectById(a.id)?.limitUpCount || 0) || b.value - a.value
        : (subjectById(b.id)?.changePct || 0) - (subjectById(a.id)?.changePct || 0) || b.value - a.value))
  })
  const rows = []
  for (let slot = 0; slot < SLOTS; slot++) {
    rows.push(byDay.map((dayList) => dayList[slot] || null))
  }
  return rows
})

function subjectById(id) {
  return subjects.value.find((s) => s.subjectId === id)
}

function cellCount(item) {
  if (!item) return ''
  const s = subjectById(item.id)
  if (!s) return ''
  return sortKey.value === 'limitup' ? `${s.limitUpCount ?? 0} 板` : formatPct(s.changePct)
}

function applySnapshot(data) {
  snap.value = data
  app.setSource(data.source || 'local')
  app.setMeta(data.meta || {})
}

onMounted(async () => {
  app.setActiveGroup(2)
  applySnapshot(await loadSnapshot())
  stopStream = connectStream(applySnapshot)
  timer = setInterval(async () => { applySnapshot(await loadSnapshot()) }, 20000)
})

onUnmounted(() => {
  stopStream?.()
  clearInterval(timer)
})
</script>

<template>
  <div class="periodic-page">
    <aside class="subject-rail">
      <button v-for="item in RAIL" :key="item.path" class="rail-tab" :class="{ active: item.path === '/subject/periodic' }" @click="router.push(item.path)">{{ item.label }}</button>
    </aside>
    <div class="periodic-main">
      <div class="periodic-toolbar">
        <button class="tool-btn" :class="{ 'tool-btn-active': sortKey === 'limitup' }" :style="sortKey === 'limitup' ? 'border-color: var(--accent); color: var(--accent)' : ''" @click="sortKey = 'limitup'">按涨停数</button>
        <button class="tool-btn" :class="{ 'tool-btn-active': sortKey === 'pct' }" :style="sortKey === 'pct' ? 'border-color: var(--accent); color: var(--accent)' : ''" @click="sortKey = 'pct'">按涨幅</button>
        <span style="margin-left: auto; color: var(--muted); font-size: 12px">轮动矩阵 · 近 {{ days.length }} 个交易日</span>
      </div>
      <div class="matrix-wrap">
        <table class="matrix-table">
          <thead>
            <tr>
              <th class="matrix-rank">排名</th>
              <th v-for="day in days" :key="day">{{ day.includes('-') ? day : day }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, rowIndex) in matrix" :key="rowIndex">
              <td class="matrix-rank"><span class="rank-badge" :class="'r' + (rowIndex + 1)">{{ rowIndex + 1 }}</span></td>
              <td v-for="(item, dayIndex) in row" :key="dayIndex">
                <template v-if="item">
                  <span class="matrix-cell-name">{{ item.name }}</span>
                  <span class="matrix-cell-count">{{ cellCount(item) }}</span>
                </template>
                <span v-else class="matrix-cell-count">—</span>
              </td>
            </tr>
            <tr v-if="!matrix.length">
              <td :colspan="days.length + 1" class="table-empty">
                本地暂无轮动历史快照（原始接口 /app/subject/history-cycle 为加密响应）。
                连接行情源后，复刻版会按交易日累积热度矩阵并在此展示；当前不伪造数据。
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
