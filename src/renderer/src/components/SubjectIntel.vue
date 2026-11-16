<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  events: { type: Array, default: () => [] },
  subjectId: { type: String, default: '' },
  subjects: { type: Array, default: () => [] }
})

const TYPE_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'theme', label: '新题材' },
  { value: 'event', label: '新事件' },
  { value: 'system', label: '系统' }
]
const EVENT_TYPES = new Set(['limitup', 'ladder', 'rank'])

const filterType = ref('')
const keyword = ref('')
const onlyCurrent = ref(false)
const applied = ref({ type: '', keyword: '', current: false })

const today = (() => {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
})()

const groups = computed(() => {
  const { type, keyword: kw, current } = applied.value
  const list = props.events.filter((e) => {
    if (current && e.subjectId !== props.subjectId) return false
    if (type === 'system' && e.type !== 'system') return false
    if (type === 'event' && !EVENT_TYPES.has(e.type)) return false
    if (type === 'theme' && (EVENT_TYPES.has(e.type) || e.type === 'system')) return false
    if (kw) {
      const text = `${e.subjectName} ${e.title || ''} ${e.body || ''}`
      if (!text.includes(kw)) return false
    }
    return true
  }).sort((a, b) => (b.ts || 0) - (a.ts || 0))

  const map = new Map()
  for (const event of list) {
    const key = event.date || '今天'
    if (!map.has(key)) map.set(key, { date: key, weekday: event.weekday || '', list: [] })
    map.get(key).list.push(event)
  }
  return [...map.values()].map((group) => ({
    ...group,
    label: `${group.date === today ? '今天 ' : ''}${group.date} ${group.weekday}`.trim()
  }))
})

const total = computed(() => groups.value.reduce((n, g) => n + g.list.length, 0))
const currentName = computed(() => props.subjects.find((s) => s.subjectId === props.subjectId)?.subjectName || '')

function search() {
  applied.value = { type: filterType.value, keyword: keyword.value.trim(), current: onlyCurrent.value }
}
function reset() {
  filterType.value = ''
  keyword.value = ''
  onlyCurrent.value = false
  applied.value = { type: '', keyword: '', current: false }
}

const pct = (v) => `${v > 0 ? '+' : ''}${Number(v || 0).toFixed(2)}`
const cls = (v) => (v > 0 ? 'up' : v < 0 ? 'down' : 'flat')
const badgeOf = (type) => {
  if (type === 'system') return '系统'
  return EVENT_TYPES.has(type) ? '新事件' : '新题材'
}
</script>

<template>
  <section class="panel intel-panel">
    <div class="panel-head">
      <span>题材情报</span>
      <span class="hint">{{ total }} 条 · 行情派生</span>
    </div>

    <div class="intel-filter">
      <select v-model="filterType" class="intel-select">
        <option v-for="o in TYPE_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
      <input
        v-model="keyword"
        class="intel-input"
        placeholder="请输入关键词搜索"
        @keyup.enter="search"
      />
      <button class="intel-btn primary" @click="search">搜索</button>
      <label class="intel-check">
        <input v-model="onlyCurrent" type="checkbox" @change="search" />
        仅当前题材
      </label>
      <button class="intel-btn" @click="reset">全部题材动态</button>
      <span v-if="onlyCurrent" class="intel-scope">{{ currentName }}</span>
    </div>

    <div class="panel-body intel-body">
      <template v-for="group in groups" :key="group.date">
        <div class="tl-date">{{ group.label }}</div>
        <div v-for="e in group.list" :key="e.id" class="tl-item">
          <div class="tl-axis">
            <time class="num">{{ e.time }}</time>
            <i class="tl-dot" :class="{ system: e.type === 'system' }"></i>
          </div>
          <div class="tl-main">
            <div class="tl-head">
              <b>{{ e.subjectName }}</b>
              <span v-if="e.type !== 'system'" class="num" :class="cls(e.changePct)">{{ pct(e.changePct) }}%</span>
              <span class="tl-badge" :class="{ system: e.type === 'system' }">{{ badgeOf(e.type) }}</span>
            </div>
            <div class="tl-title">{{ e.title }}</div>
            <div class="tl-body">{{ e.body }}（来源：{{ e.source }}）</div>
          </div>
        </div>
      </template>
      <div v-if="!total" class="empty-hint">没有匹配的情报</div>
    </div>

    <div class="intel-foot">内容由实时行情派生，不是第三方资讯；原程序此处的正文来自其服务端聚合的资讯源</div>
  </section>
</template>
