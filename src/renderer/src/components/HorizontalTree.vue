<script setup>
/**
 * 题材图谱横向树 —— 对齐原版 HorizontalTree / vip-tree 的思维导图式布局。
 * 从左到右分层：题材根 → 关联题材 → 成分股；SVG 贝塞尔曲线连接，
 * 节点显示涨跌幅（涨红跌绿），右侧配说明文字；支持缩放、拖拽平移、一键展开。
 * 数据来自服务端 /app/subject/graph-tree（领域引擎按共享成分股派生）。
 */
import { computed, ref, watch } from 'vue'
import { formatPct } from '../format.js'

const props = defineProps({
  tree: { type: Array, default: () => [] },
  hiddenNames: { type: Boolean, default: false }
})
const emit = defineEmits(['select', 'open-subject', 'open-stock'])

const scale = ref(1)
const collapsed = ref({})
const collapAll = ref(false)
const selected = ref(null)
const offset = ref({ x: 0, y: 0 })
let dragging = false
let dragStart = null

const NODE_W = 96, NODE_H = 30
const COL_GAP = 200, ROW_GAP = 44

const layout = computed(() => {
  const nodes = [], edges = []
  const roots = props.tree || []
  if (!roots.length) return { nodes, edges, width: 0, height: 0, cols: 0 }

  let maxCol = 0
  let leafRow = 0
  // 经典树布局：叶子依次占行，父节点 y = 子节点 y 的均值
  function walk(node, level, col, parentKey) {
    const key = node.subjectId || node.stockId || `${col}-${nodes.length}`
    // 默认收起第三层（成分股），保持脑图紧凑；用户可逐节点或一键展开
    const defaultCollapsed = level >= 2
    const isCollapsed = collapAll.value || (collapsed.value[key] === undefined ? defaultCollapsed : collapsed.value[key])
    const childNodes = node.children?.length ? node.children : (node.stocks?.length ? node.stocks : [])
    const children = isCollapsed ? [] : childNodes
    const n = {
      key, name: node.name, pctChg: node.pctChg, heat: node.heat,
      limitUpCount: node.limitUpCount, reason: node.reason || '', level,
      stockId: node.stockId, subjectId: node.subjectId,
      business: node.business, top: node.top, raw: node,
      hasChildren: !!childNodes.length,
      isCollapsed,
      col, x: 30 + col * COL_GAP, y: 0, children
    }
    nodes.push(n)
    maxCol = Math.max(maxCol, col)
    const childLayouts = children.map((c) => walk(c, level + 1, col + 1, key))
    if (childLayouts.length) {
      n.y = childLayouts.reduce((sum, c) => sum + c.y, 0) / childLayouts.length
    } else {
      n.y = 40 + leafRow * ROW_GAP
      leafRow++
    }
    if (parentKey) edges.push({ from: parentKey, to: key })
    return n
  }
  for (const root of roots) walk(root, 0, 0, null)

  const height = Math.max(120, leafRow * ROW_GAP + 60)
  const width = (maxCol + 1) * COL_GAP + NODE_W + 260
  return { nodes, edges, width, height, cols: maxCol + 1 }
})

const nodeMap = computed(() => new Map(layout.value.nodes.map((n) => [n.key, n])))
function edgePath(e) {
  const a = nodeMap.value.get(e.from), b = nodeMap.value.get(e.to)
  if (!a || !b) return ''
  const x1 = a.x + NODE_W, y1 = a.y + NODE_H / 2
  const x2 = b.x, y2 = b.y + NODE_H / 2
  const mx = (x1 + x2) / 2
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`
}
const nodeColor = (n) => {
  const pct = Number(n.pctChg)
  if (!Number.isFinite(pct)) return '#9aa5b1'
  return pct > 0 ? '#d92b2b' : pct < 0 ? '#1a9a52' : '#9aa5b1'
}
const nodeBg = (n) => n.level === 0 ? '#fff2f2' : n.stockId ? '#f7f9fc' : '#fff'
const badge = (n) => n.business && n.top ? '情绪/行业' : n.business ? '行业' : n.top ? '情绪' : ''
const displayName = (n) => props.hiddenNames && (n.stockId || n.level > 1) ? '******' : n.name

function toggle(n) { collapsed.value = { ...collapsed.value, [n.key]: !n.isCollapsed }; collapAll.value = false }
function toggleAll() { collapAll.value = !collapAll.value; if (!collapAll.value) collapsed.value = {} }
function zoom(d) { scale.value = Math.min(1.8, Math.max(0.4, Math.round((scale.value + d) * 10) / 10)) }
function resetView() { scale.value = 1; offset.value = { x: 0, y: 0 } }
function onNodeClick(n) { selected.value = n; emit('select', { node: n.raw, level: n.level, kind: n.stockId ? 'stock' : 'subject' }) }
function onNodeDbl(n) {
  if (n.stockId) emit('open-stock', n.stockId)
  else if (n.subjectId) emit('open-subject', n.subjectId)
}
function onMouseDown(e) {
  if (e.target.closest('.gt-node')) return
  dragging = true
  dragStart = { x: e.clientX - offset.value.x, y: e.clientY - offset.value.y }
}
function onMouseMove(e) { if (dragging) offset.value = { x: e.clientX - dragStart.x, y: e.clientY - dragStart.y } }
function onMouseUp() { dragging = false }
function onWheel(e) { e.preventDefault(); zoom(e.deltaY > 0 ? -0.08 : 0.08) }
watch(() => props.tree, () => { selected.value = null; collapsed.value = {}; collapAll.value = false })
</script>

<template>
  <div class="graph-tree">
    <div class="gt-toolbar">
      <div class="gt-hint">共享成分股形成的题材关联 · 单击选中 / 双击进入 · 拖拽平移</div>
      <div class="gt-actions">
        <button class="gt-icon" title="缩小" @click="zoom(-0.1)">−</button>
        <span class="gt-scale">{{ Math.round(scale * 100) }}%</span>
        <button class="gt-icon" title="放大" @click="zoom(0.1)">+</button>
        <button class="gt-btn" @click="resetView">复位</button>
        <button class="gt-btn" @click="toggleAll">{{ collapAll ? '一键展开' : '一键收起' }}</button>
      </div>
    </div>
    <div class="gt-viewport"
         @mousedown="onMouseDown" @mousemove="onMouseMove" @mouseup="onMouseUp" @mouseleave="onMouseUp" @wheel="onWheel">
      <div class="gt-stage" :style="{ width: layout.width + 'px', height: layout.height + 'px', transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }">
        <svg class="gt-edges" :width="layout.width" :height="layout.height">
          <path v-for="(e, i) in layout.edges" :key="i" :d="edgePath(e)" class="gt-edge" />
        </svg>
        <div v-for="n in layout.nodes" :key="n.key" class="gt-node"
             :class="{ 'gt-root': n.level === 0, 'gt-stock': !!n.stockId, 'gt-selected': selected?.key === n.key }"
             :style="{ left: n.x + 'px', top: n.y + 'px', background: nodeBg(n) }"
             @click.stop="onNodeClick(n)" @dblclick.stop="onNodeDbl(n)">
          <span v-if="badge(n)" class="gt-badge">{{ badge(n) }}</span>
          <span class="gt-name">{{ displayName(n) }}</span>
          <span class="gt-pct" :style="{ color: nodeColor(n) }">{{ formatPct(n.pctChg) }}</span>
          <span v-if="n.hasChildren" class="gt-toggle" @click.stop="toggle(n)">{{ n.isCollapsed ? '+' : '−' }}</span>
        </div>
        <div v-for="n in layout.nodes" :key="'r-' + n.key" v-show="n.reason" class="gt-reason"
             :style="{ left: (n.x + NODE_W + 14) + 'px', top: (n.y + 4) + 'px' }">{{ n.reason }}</div>
      </div>
      <div v-if="!layout.nodes.length" class="gt-empty">未连接行情源，暂无题材图谱数据</div>
    </div>
    <div v-if="selected" class="gt-selection">
      当前选中：<b>{{ selected.name }}</b>
      <span :class="selected.pctChg > 0 ? 'up' : selected.pctChg < 0 ? 'down' : ''">{{ formatPct(selected.pctChg) }}</span>
      <span v-if="selected.heat != null">· 热度 {{ selected.heat }}</span>
      <span v-if="selected.limitUpCount != null">· 涨停 {{ selected.limitUpCount }} 家</span>
    </div>
  </div>
</template>
