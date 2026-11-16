<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SubjectKlinePanel from '../components/SubjectKlinePanel.vue'
import HorizontalTree from '../components/HorizontalTree.vue'
import RelationGraph from '../components/RelationGraph.vue'
import { useAppStore } from '../stores.js'
import { formatPct, toneClass } from '../format.js'
import { loadSnapshot, connectStream, fetchDetail, fetchGraph, emptySnapshot, desktopVersion } from '../data.js'

const props = defineProps({ focusSubject: { type: String, default: '' } })
const router = useRouter()
const route = useRoute()
const app = useAppStore()
// 深链接：?tab=tree 直接打开题材图谱（也便于截图验证）
const initialTab = route.query.tab || route.query.bottomTab || ''

const snap = ref(emptySnapshot())
const selectedId = ref('')
const detail = ref({ ladder: { tiers: [], total: 0, highest: 0 }, stocks: [], candles: [], code: '' })
const rankTab = ref('dig')
const intelTab = ref('情报')
const bottomTab = ref(['tree', 'stocks', 'intro', 'rank'].includes(initialTab) ? initialTab : 'rank')
const filterSubject = ref('')
const filterKeyword = ref('')
const graph = ref([])
const graphView = ref('tree')

let stopStream = null
let detailTimer = null

const INTEL_TABS = ['情报', '盘前必读', '涨停复盘', '龙虎榜', '精选', '新题材', '新事件']
const RANK_TABS = [
  { key: 'dig', label: '挖掘榜' },
  { key: 'limitup', label: '涨停榜' },
  { key: 'pct', label: '涨幅榜' }
]
const RAIL = [
  { label: '题材掘金', path: '/subject/excavate' },
  { label: '题材轮动', path: '/subject/periodic' },
  { label: '全部题材', path: '/subject/all' }
]

const subjects = computed(() => snap.value.subjects || [])
const subject = computed(() => subjects.value.find((s) => s.subjectId === selectedId.value) || subjects.value[0] || {})
const tree = computed(() => snap.value.tree || [])
const events = computed(() => snap.value.events || [])

const sortedSubjects = computed(() => {
  const list = [...subjects.value]
  if (rankTab.value === 'limitup') return list.sort((a, b) => b.limitUpCount - a.limitUpCount || b.heat - a.heat)
  if (rankTab.value === 'pct') return list.sort((a, b) => b.changePct - a.changePct)
  return list.sort((a, b) => (b.heatDelta || 0) - (a.heatDelta || 0) || b.heat - a.heat)
})

const filteredEvents = computed(() => {
  let list = events.value
  if (intelTab.value === '涨停复盘') list = list.filter((e) => e.type === 'limitup' || e.type === 'ladder')
  else if (intelTab.value === '精选') list = list.filter((e) => e.type === 'rank')
  else if (intelTab.value === '新事件') list = list.filter((e) => e.type !== 'system')
  if (filterSubject.value) list = list.filter((e) => String(e.subjectId) === filterSubject.value)
  const keyword = filterKeyword.value.trim()
  if (keyword) {
    list = list.filter((e) => `${e.title || ''}${e.body || ''}${e.subjectName || ''}`.includes(keyword))
  }
  return [...list].reverse()
})

// 题材图谱：按当前选中题材拉树；关系图节点/边由此派生
async function loadGraph() {
  if (!selectedId.value) { graph.value = []; return }
  graph.value = await fetchGraph(selectedId.value)
}
const graphNodes = computed(() => {
  if (!graph.value.length) return []
  const root = graph.value[0]
  const nodes = [{ id: root.subjectId, name: root.name, heat: root.heat, pctChg: root.pctChg, category: 'center' }]
  for (const c of root.children || []) nodes.push({ id: c.subjectId, name: c.name, heat: c.heat, pctChg: c.pctChg, category: 'related' })
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

const noteOnly = computed(() => ['盘前必读', '龙虎榜'].includes(intelTab.value))
const BOTTOM_TABS = computed(() => [
  { key: 'rank', label: '题材排名' },
  { key: 'tree', label: '题材图谱' },
  { key: 'stocks', label: `${subject.value?.subjectName || '题材'}成分股` },
  { key: 'intro', label: '题材介绍' }
])

async function loadDetail() {
  if (!selectedId.value) { detail.value = { ladder: { tiers: [], total: 0, highest: 0 }, stocks: [], candles: [], code: '' }; return }
  detail.value = await fetchDetail(snap.value, selectedId.value, '')
}

function applySnapshot(data) {
  snap.value = data
  app.setSource(data.source || 'local')
  app.setMeta(data.meta || {})
  if (!selectedId.value && data.subjects?.length) {
    const focus = props.focusSubject || data.subjects[0].subjectId
    selectedId.value = data.subjects.some((s) => s.subjectId === focus) ? focus : data.subjects[0].subjectId
  }
}

function selectSubject(id) {
  if (!id || id === selectedId.value) return
  selectedId.value = id
  loadDetail()
  if (bottomTab.value === 'tree') loadGraph()
}
function onGraphOpenSubject(id) {
  if (id && id !== selectedId.value) selectSubject(id)
}
function onGraphOpenStock(code) {
  if (code) router.push(`/market-trend/stock/quotation/${code}`)
}

onMounted(async () => {
  app.setActiveGroup(2)
  applySnapshot(await loadSnapshot())
  await loadDetail()
  if (bottomTab.value === 'tree') await loadGraph()
  const info = await desktopVersion()
  if (info?.version) app.setVersion(info)
  stopStream = connectStream(applySnapshot)
  detailTimer = setInterval(() => {
    loadDetail()
    // 图谱页数据若因数据源刚启动未就绪，持续补拉到位
    if (bottomTab.value === 'tree' && graph.value.length <= 1 && selectedId.value) loadGraph()
  }, 8000)
})

watch(() => props.focusSubject, (value) => { if (value) selectSubject(value) })
watch(bottomTab, (value) => { if (value === 'tree' && selectedId.value) loadGraph() })
watch(selectedId, (value) => { if (value && bottomTab.value === 'tree' && !graph.value.length) loadGraph() })

onUnmounted(() => {
  stopStream?.()
  clearInterval(detailTimer)
})
</script>

<template>
  <div class="subject-layout">
    <aside class="subject-rail">
      <button v-for="item in RAIL" :key="item.path" class="rail-tab" :class="{ active: item.path === '/subject/excavate' }" @click="router.push(item.path)">
        {{ item.label }}
      </button>
    </aside>

    <section class="rank-panel">
      <div class="rank-tabs">
        <button v-for="tab in RANK_TABS" :key="tab.key" :class="{ active: rankTab === tab.key }" @click="rankTab = tab.key">{{ tab.label }}</button>
      </div>
      <div class="rank-list">
        <div
          v-for="(item, index) in sortedSubjects.slice(0, 40)"
          :key="item.subjectId"
          class="rank-row"
          :class="{ active: item.subjectId === selectedId }"
          @click="selectSubject(item.subjectId)"
        >
          <span class="rank-badge" :class="'r' + (index + 1)">{{ index + 1 }}</span>
          <span class="rank-name">{{ item.subjectName }}</span>
          <span class="rank-times">{{ item.leadTimes || 0 }}次</span>
          <span class="rank-pct" :class="toneClass(item.changePct)">{{ formatPct(item.changePct) }}</span>
        </div>
        <div v-if="!sortedSubjects.length" class="intel-empty">未连接行情源，暂无题材榜单</div>
      </div>
    </section>

    <section class="intel-panel">
      <div class="tab-strip" style="padding-left: 10px">
        <button v-for="tab in INTEL_TABS" :key="tab" class="tab" :class="{ active: intelTab === tab }" @click="intelTab = tab">{{ tab }}</button>
      </div>
      <div class="intel-filter">
        <select v-model="filterSubject">
          <option value="">全部</option>
          <option v-for="item in subjects" :key="item.subjectId" :value="String(item.subjectId)">{{ item.subjectName }}</option>
        </select>
        <input v-model="filterKeyword" placeholder="请输入关键词搜索" />
        <button class="btn primary">搜索</button>
        <button class="btn">全部题材动态</button>
      </div>

      <div class="intel-empty" style="flex: 1" v-if="noteOnly">
        {{ intelTab === '盘前必读' ? '盘前必读' : '龙虎榜' }} 数据来自服务端资讯/榜单接口（原始响应为加密字符串）；复刻版后续以本地契约接入。
      </div>
      <template v-else>
        <div class="intel-date">今天 {{ new Date().toISOString().slice(0, 10) }} {{ ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][new Date().getDay()] }}</div>
        <div class="intel-list">
          <div v-for="event in filteredEvents" :key="event.id" class="intel-item">
            <div class="intel-line1">
              <span>{{ event.time || '' }}</span>
              <span class="intel-subject">{{ event.subjectName || '系统' }}</span>
              <span class="intel-pct" :class="toneClass(event.changePct)">{{ formatPct(event.changePct) }}</span>
              <span class="intel-tag" :class="{ gray: event.type === 'system' }">{{ event.type === 'system' ? '系统' : '全新事件' }}</span>
            </div>
            <div class="intel-title">{{ event.title }}</div>
            <div class="intel-body">{{ event.body }}</div>
            <div class="intel-source">（消息来源：{{ event.source || '本地事件引擎' }}）</div>
          </div>
          <div v-if="!filteredEvents.length" class="intel-empty">
            {{ subjects.length ? '当前筛选条件下暂无事件' : '未连接行情源，暂无题材事件' }}
          </div>
        </div>
      </template>

      <div class="subject-bottom">
        <div class="subject-bottom-tabs">
          <button v-for="tab in BOTTOM_TABS" :key="tab.key" :class="{ active: bottomTab === tab.key }" @click="bottomTab = tab.key">{{ tab.label }}</button>
        </div>
        <div class="subject-bottom-body">
          <div class="subject-crumb">{{ subject?.sector || '—' }} <span v-if="subject?.subjectName">» {{ subject.subjectName }}</span></div>

          <table class="data-table" v-if="bottomTab === 'rank'">
            <thead><tr><th class="num" style="width:44px">序号</th><th>题材名称</th><th class="num">热度</th><th class="num">涨幅</th><th class="num">涨停家数</th><th class="num">最高板</th><th class="num">持续天数</th></tr></thead>
            <tbody>
              <tr v-for="(item, index) in subjects.slice(0, 30)" :key="item.subjectId">
                <td class="num muted">{{ index + 1 }}</td>
                <td>{{ item.subjectName }}</td>
                <td class="num">{{ item.heat }}</td>
                <td class="num" :class="toneClass(item.changePct)">{{ formatPct(item.changePct) }}</td>
                <td class="num">{{ item.limitUpCount }}</td>
                <td class="num">{{ item.limitUpHeight }}板</td>
                <td class="num">{{ item.sustainDays }}日</td>
              </tr>
              <tr v-if="!subjects.length"><td colspan="7" class="table-empty">未连接行情源</td></tr>
            </tbody>
          </table>

          <div v-else-if="bottomTab === 'tree'" class="graph-host">
            <div class="graph-views">
              <button v-for="v in [{k:'tree',l:'横向树'},{k:'network',l:'关系网络'}]"
                      :key="v.k" class="tab" :class="{ active: graphView === v.k }" @click="graphView = v.k">{{ v.l }}</button>
              <span class="graph-view-tip">{{ subject?.subjectName || '题材' }} · {{ graphNodes.length }} 个关联题材 · {{ graphLinks.length }} 条关联边</span>
            </div>
            <HorizontalTree
              v-if="graphView === 'tree'"
              :tree="graph"
              @open-subject="onGraphOpenSubject"
              @open-stock="onGraphOpenStock"
            />
            <RelationGraph
              v-else
              :nodes="graphNodes" :links="graphLinks" :height="360"
              @select="(n) => onGraphOpenSubject(n.id)"
            />
          </div>

          <table class="data-table" v-else-if="bottomTab === 'stocks'">
            <thead><tr><th>代码 / 名称</th><th class="num">现价</th><th class="num">涨跌幅</th><th class="num">连板</th><th class="num">首封</th><th class="num">成交额</th></tr></thead>
            <tbody>
              <tr v-for="stock in detail.stocks" :key="stock.code">
                <td>{{ stock.name }} <span class="muted">{{ stock.code }}</span></td>
                <td class="num">{{ stock.price }}</td>
                <td class="num" :class="toneClass(stock.changePct)">{{ formatPct(stock.changePct) }}</td>
                <td class="num">{{ stock.limitUpStreak || '--' }}</td>
                <td class="num">{{ stock.firstSealAt ? stock.firstSealAt + '板' : '--' }}</td>
                <td class="num">{{ stock.turnover ? (stock.turnover / 1e8).toFixed(1) + '亿' : '--' }}</td>
              </tr>
              <tr v-if="!detail.stocks.length"><td colspan="6" class="table-empty">未连接行情源，暂无成分股</td></tr>
            </tbody>
          </table>

          <div v-else class="subject-crumb" style="line-height: 1.9">
            <div><b>{{ subject?.subjectName }}</b>（{{ subject?.sector || '—' }}）</div>
            <div>热度 {{ subject?.heat ?? '—' }} · 涨幅 {{ formatPct(subject?.changePct) }} · 涨停 {{ subject?.limitUpCount ?? '—' }} 家 · 最高 {{ subject?.limitUpHeight ?? '—' }} 板</div>
            <div>龙头 {{ subject?.leadStock?.name || '—' }} · 持续 {{ subject?.sustainDays ?? '—' }} 日 · 领涨 {{ subject?.leadTimes ?? '—' }} 次 · 阶段 {{ subject?.stage || '—' }}</div>
            <div class="muted">题材介绍正文来自原始应用的题材介绍接口（加密响应），复刻版以结构化指标替代。</div>
          </div>
        </div>
      </div>
    </section>

    <SubjectKlinePanel :subject="subject" :candles="detail.candles" :code="detail.code" />
  </div>
</template>
