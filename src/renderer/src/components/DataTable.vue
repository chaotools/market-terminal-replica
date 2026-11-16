<script setup>
/**
 * 重型数据表格（复刻原版 VXE-table 的核心能力）：
 * - 列配置 columns: [{ key, label, width, align, sortable, format, tone, fixed }]
 * - 点击表头排序（升/降/取消三态）
 * - 固定首列（左侧 sticky）
 * - 行选择、空状态、加载态、虚拟滚动（超过阈值时只渲染可视区）
 * - 涨红跌绿由 tone 字段声明，颜色遵循 A 股习惯
 */
import { computed, ref, watch } from 'vue'

const props = defineProps({
  columns: { type: Array, required: true },
  rows: { type: Array, default: () => [] },
  rowKey: { type: String, default: 'code' },
  height: { type: Number, default: 0 },
  virtualThreshold: { type: Number, default: 200 },
  loading: { type: Boolean, default: false },
  emptyText: { type: String, default: '暂无数据' },
  activeKey: { type: [String, Number], default: '' }
})
const emit = defineEmits(['row-click'])

const sortKey = ref('')
const sortDir = ref('') // asc | desc | ''
const scrollTop = ref(0)

const ROW_H = 30

function toggleSort(col) {
  if (!col.sortable) return
  if (sortKey.value !== col.key) { sortKey.value = col.key; sortDir.value = 'desc'; return }
  if (sortDir.value === 'desc') sortDir.value = 'asc'
  else if (sortDir.value === 'asc') { sortKey.value = ''; sortDir.value = '' }
  else sortDir.value = 'desc'
}

const sorted = computed(() => {
  if (!sortKey.value || !sortDir.value) return props.rows
  const col = props.columns.find((c) => c.key === sortKey.value)
  const getter = col?.sortValue || ((r) => r[col?.key])
  const mult = sortDir.value === 'asc' ? 1 : -1
  return [...props.rows].sort((a, b) => {
    const av = getter(a), bv = getter(b)
    const an = Number(av), bn = Number(bv)
    if (Number.isFinite(an) && Number.isFinite(bn)) return (an - bn) * mult
    return String(av ?? '').localeCompare(String(bv ?? ''), 'zh-CN') * mult
  })
})

const virtual = computed(() => props.height > 0 && sorted.value.length > props.virtualThreshold)
const visible = computed(() => {
  if (!virtual.value) return { start: 0, list: sorted.value, offsetTop: 0, offsetBottom: 0 }
  const start = Math.max(0, Math.floor(scrollTop.value / ROW_H) - 5)
  const count = Math.ceil(props.height / ROW_H) + 10
  const list = sorted.value.slice(start, start + count)
  return { start, list, offsetTop: start * ROW_H, offsetBottom: Math.max(0, (sorted.value.length - start - count) * ROW_H) }
})

function cellText(col, row) {
  const raw = row[col.key]
  if (col.format) return col.format(raw, row)
  if (col.tone) {
    const n = Number(raw)
    if (!Number.isFinite(n)) return raw ?? '--'
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%'
  }
  return raw ?? '--'
}
function cellClass(col, row) {
  const cls = []
  if (col.align === 'right' || col.tone) cls.push('dt-num')
  if (col.tone) {
    const n = Number(row[col.key])
    if (Number.isFinite(n)) cls.push(n > 0 ? 'up' : n < 0 ? 'down' : 'flat')
  }
  if (col.class) cls.push(typeof col.class === 'function' ? col.class(row) : col.class)
  return cls
}
function onScroll(e) { if (virtual.value) scrollTop.value = e.target.scrollTop }
watch(() => props.rows.length, () => { if (virtual.value) scrollTop.value = 0 })
</script>

<template>
  <div class="dt-wrap" :class="{ 'dt-virtual': virtual }" :style="height > 0 ? { height: height + 'px' } : {}">
    <div class="dt-scroll" @scroll="onScroll">
      <table class="dt-table">
        <colgroup>
          <col v-for="c in columns" :key="c.key" :style="c.width ? { width: (typeof c.width === 'number' ? c.width + 'px' : c.width) } : {}" />
        </colgroup>
        <thead>
          <tr>
            <th v-for="c in columns" :key="c.key"
                :class="{ 'dt-sortable': c.sortable, 'dt-num': c.align === 'right' || c.tone, 'dt-fixed': c.fixed, 'dt-sorted': sortKey === c.key }"
                @click="toggleSort(c)">
              <span class="dt-th-label">{{ c.label }}</span>
              <span v-if="c.sortable" class="dt-sort-icon">{{ sortKey === c.key ? (sortDir === 'asc' ? '▲' : '▼') : '↕' }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <template v-if="virtual">
            <tr style="height:0"><td :colspan="columns.length" :style="{ padding: 0, border: 0, height: visible.offsetTop + 'px' }"></td></tr>
          </template>
          <tr v-for="row in visible.list" :key="row[rowKey]"
              :class="{ active: activeKey && String(row[rowKey]) === String(activeKey) }"
              @click="emit('row-click', row)">
            <td v-for="c in columns" :key="c.key" :class="cellClass(c, row)" :title="String(cellText(c, row))">{{ cellText(c, row) }}</td>
          </tr>
          <template v-if="virtual">
            <tr style="height:0"><td :colspan="columns.length" :style="{ padding: 0, border: 0, height: visible.offsetBottom + 'px' }"></td></tr>
          </template>
          <tr v-if="!loading && !sorted.length"><td :colspan="columns.length" class="dt-empty">{{ emptyText }}</td></tr>
          <tr v-if="loading"><td :colspan="columns.length" class="dt-empty">加载中…</td></tr>
        </tbody>
      </table>
    </div>
    <div v-if="virtual" class="dt-virtual-tip">虚拟滚动 · 显示 {{ visible.start + 1 }}–{{ visible.start + visible.list.length }} / {{ sorted.length }}</div>
  </div>
</template>
