<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SubjectKlinePanel from '../components/SubjectKlinePanel.vue'
import HorizontalTree from '../components/HorizontalTree.vue'
import RelationGraph from '../components/RelationGraph.vue'
import DataTable from '../components/DataTable.vue'
import { useAppStore } from '../stores.js'
import { formatPct, formatAmount, toneClass } from '../format.js'
import { loadSnapshot, connectStream, fetchDetail, fetchGraph, emptySnapshot } from '../data.js'

const route = useRoute()
const router = useRouter()
const app = useAppStore()
const snap = ref(emptySnapshot())
const detail = ref({ stocks: [], candles: [], code: '' })
const graph = ref([])
const selectedNode = ref(null)
const graphView = ref('tree') // tree | network | table
const tab = ref(route.meta?.tab || 'rank')
let stopStream = null
let timer = null

const TABS = [
  { key: 'rank', label: '题材排名' },
  { key: 'tree', label: '题材图谱' },
  { key: 'intro', label: '题材介绍' }
]

const subjectId = computed(() => String(route.params.subjectId || ''))
const subject = computed(() => (snap.value.subjects || []).find((s) => String(s.subjectId) === subjectId.value) || {})
const tree = computed(() => snap.value.tree || [])
const peers = computed(() => (snap.value.subjects || []).filter((s) => s.sector === subject.value.sector && s.subjectId !== subject.value.subjectId))

// 关系图：根节点 + 关联题材作为节点，根目录到每个关联题材连边
const graphNodes = computed(() => {
  if (!graph.value.length) return []
  const root = graph.value[0]
  const nodes = [{ id: root.subjectId, name: root.name, heat: root.heat, pctChg: root.pctChg, category: 'center' }]
  for (const child of root.children || []) {
    nodes.push({ id: child.subjectId, name: child.name, heat: child.heat, pctChg: child.pctChg, category: 'related' })
  }
  return nodes
})
const graphLinks = computed(() => {
  if (!graph.value.length) return []
  const root = graph.value[0]
  return (root.children || []).map((c) => {
    const m = /共享\s*(\d+)\s*只/.exec(c.reason || '')
    return { source: root.subjectId, target: c.subjectId, value: m ? Number(m[1]) : 1 }
  })
})

// 表格：题材图谱成分股明细
const graphColumns = computed(() => [
  { key: 'name', label: '名称', width: 120, fixed: true, sortable: true },
  { key: 'code', label: '代码', width: 80, sortable: true },
  { key: 'price', label: '现价', width: 78, align: 'right', sortable: true, format: (v) => Number(v).toFixed(2) || '--' },
  { key: 'pctChg', label: '涨跌幅', width: 86, align: 'right', sortable: true, tone: true },
  { key: 'limitUpStreak', label: '连板', width: 66, align: 'right', sortable: true, format: (v) => v > 0 ? v + '板' : '—' },
  { key: 'subjectText', label: '关联题材', sortable: true, format: (v, row) => row.subjectText }
])
const graphTableRows = computed(() => {
  const root = graph.value[0]
  if (!root) return []
  const byName = new Map()
  const all = [...(root.stocks || [])]
  for (const child of root.children || []) for (const s of child.stocks || []) all.push(s)
  for (const s of all) {
    if (!s?.stockId) continue
    if (!byName.has(s.stockId)) byName.set(s.stockId, { ...s, subjectText: (s.subjectIds || []).slice(0, 4).join('、') })
  }
  return [...byName.values()]
})

async function load() {
  if (!subjectId.value) return
  detail.value = await fetchDetail(snap.value, subjectId.value, '')
  if (tab.value === 'tree') graph.value = await fetchGraph(subjectId.value)
}

function onGraphSelect({ node, kind }) {
  selectedNode.value = node
}
function onOpenSubject(id) {
  if (id && String(id) !== subjectId.value) router.push(`/subject/detail/${id}/vip-tree`)
}
function onOpenStock(code) {
  if (code) router.push(`/market-trend/stock/quotation/${code}`)
}
watch(tab, (value) => {
  if (value === 'tree' && !graph.value.length && subjectId.value) fetchGraph(subjectId.value).then((g) => { graph.value = g })
})

function applySnapshot(data) {
  snap.value = data
  app.setSource(data.source || 'local')
  app.setMeta(data.meta || {})
  // 图谱页首次进入时行情可能尚未就绪：快照到位后再补拉一次树
  if (tab.value === 'tree' && !graph.value.length && subjectId.value) {
    fetchGraph(subjectId.value).then((g) => { if (g.length) graph.value = g })
  }
}

function selectSubject(id) {
  router.push(`/subject/detail/${id}`)
}

function descOf(stock) {
  if (stock.subjectNames) return stock.subjectNames
  return subject.value?.subjectName ? `所属题材：${subject.value.subjectName}` : '暂无简介（原始应用的个股简介来自加密接口）'
}

onMounted(async () => {
  app.setActiveGroup(2)
  applySnapshot(await loadSnapshot())
  await load()
  stopStream = connectStream(applySnapshot)
  timer = setInterval(() => {
    load()
    // 图谱数据若因数据源刚启动而未就绪，6 秒粒度补拉，数据到位即刻显示
    if (tab.value === 'tree' && graph.value.length <= 1 && subjectId.value) {
      fetchGraph(subjectId.value).then((g) => { if (g.length > 1) graph.value = g })
    }
  }, 6000)
})
watch(() => route.meta?.tab, (value) => { if (value) tab.value = value }, { immediate: false })
watch(() => route.params.subjectId, () => { load() })
onUnmounted(() => { stopStream?.(); clearInterval(timer) })
</script>

<template>
  <div class="detail-page">
    <aside class="detail-rail">
      <button v-for="item in TABS" :key="item.key" class="rail-tab" :class="{ active: tab === item.key }" @click="tab = item.key">{{ item.label }}</button>
    </aside>

    <div class="detail-main">
      <div class="detail-head">
        <div class="detail-title">{{ subject?.subjectName || '题材详情' }}</div>
        <div class="detail-sub">
          热度 {{ subject?.heat ?? '—' }} · 涨幅 {{ formatPct(subject?.changePct) }} · 涨停 {{ subject?.limitUpCount ?? '—' }} 家 ·
          最高 {{ subject?.limitUpHeight ?? '—' }} 板 · 龙头 {{ subject?.leadStock?.name || '—' }}
        </div>
      </div>

      <div class="detail-table-wrap" v-if="tab === 'rank'">
        <table class="data-table">
          <thead><tr><th style="width: 46%;">名称 / 涨幅</th><th>说明</th></tr></thead>
          <tbody>
            <tr v-for="stock in detail.stocks" :key="stock.code" class="detail-stock-row">
              <td>
                <div class="detail-stock-name">{{ stock.name }}</div>
                <div class="detail-stock-pct" :class="toneClass(stock.changePct)">{{ formatPct(stock.changePct) }}</div>
              </td>
              <td class="detail-desc">{{ descOf(stock) }}</td>
            </tr>
            <tr v-if="!detail.stocks.length"><td colspan="2" class="table-empty">未连接行情源，暂无成分股</td></tr>
          </tbody>
        </table>
      </div>

      <div class="detail-table-wrap detail-graph-wrap" v-else-if="tab === 'tree'">
        <div class="graph-views">
          <button v-for="v in [{k:'tree',l:'横向树'},{k:'network',l:'关系网络'},{k:'table',l:'成分明细'}]"
                  :key="v.k" class="lead-tab" :class="{ active: graphView === v.k }" @click="graphView = v.k">{{ v.l }}</button>
          <span class="graph-view-tip">共 {{ graphNodes.length }} 个关联题材 · {{ graphLinks.length }} 条关联边</span>
        </div>
        <HorizontalTree
          v-if="graphView === 'tree'"
          :tree="graph"
          @select="onGraphSelect"
          @open-subject="onOpenSubject"
          @open-stock="onOpenStock"
        />
        <RelationGraph
          v-else-if="graphView === 'network'"
          :nodes="graphNodes" :links="graphLinks" :height="420"
          @select="(n) => onOpenSubject(n.id)"
        />
        <DataTable
          v-else
          :columns="graphColumns" :rows="graphTableRows" row-key="stockId" :height="420"
          empty-text="未连接行情源，暂无成分明细"
          @row-click="(r) => onOpenStock(r.stockId)"
        />
        <div v-if="selectedNode && graphView === 'tree'" class="gt-selection">
          当前选中：<b>{{ selectedNode.name }}</b>
          <span :class="toneClass(selectedNode.pctChg)">{{ formatPct(selectedNode.pctChg) }}</span>
          <span v-if="selectedNode.heat != null">· 热度 {{ selectedNode.heat }}</span>
          <span v-if="selectedNode.limitUpCount != null">· 涨停 {{ selectedNode.limitUpCount }} 家</span>
        </div>
      </div>

      <div class="detail-table-wrap" v-else>
        <div class="detail-desc" style="line-height: 2">
          <p><b>{{ subject?.subjectName }}</b>（{{ subject?.sector || '—' }}）</p>
          <p>热度 {{ subject?.heat ?? '—' }} · 涨幅 {{ formatPct(subject?.changePct) }} · 涨停 {{ subject?.limitUpCount ?? '—' }} 家 · 最高 {{ subject?.limitUpHeight ?? '—' }} 板 · 持续 {{ subject?.sustainDays ?? '—' }} 日 · 领涨 {{ subject?.leadTimes ?? '—' }} 次 · 阶段 {{ subject?.stage || '—' }}</p>
          <p>同板块题材：{{ peers.map((s) => s.subjectName).join('、') || '—' }}</p>
          <p class="muted">题材介绍正文来自原始应用的加密接口（/app/subject/query、/app/subject/child-stock-tree），复刻版以结构化指标替代，不复制原始文案。</p>
        </div>
      </div>
    </div>

    <SubjectKlinePanel :subject="subject" :candles="detail.candles" :code="detail.code" />
  </div>
</template>
