<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import TitleBar from './components/TitleBar.vue'
import MarketHeader from './components/MarketHeader.vue'
import SubjectList from './components/SubjectList.vue'
import SubjectDetail from './components/SubjectDetail.vue'
import QuadrantChart from './components/QuadrantChart.vue'
import RotationHeatmap from './components/RotationHeatmap.vue'
import RankPanel from './components/RankPanel.vue'
import SubjectIntel from './components/SubjectIntel.vue'
import {
  loadSnapshot, connectStream, fetchDetail, emptySnapshot,
  isDesktop, desktopVersion, desktopServiceStatus
} from './data.js'

const snap = ref(emptySnapshot())
const selectedId = ref('')
const selectedCode = ref('')
const centerTab = ref('detail')
const version = ref('0.1.0')
const service = ref(null)
const clock = ref('')

let stopStream = null
let clockTimer = null
let statusTimer = null
let detailTimer = null

const subjects = computed(() => snap.value.subjects || [])
const subject = computed(() => subjects.value.find((s) => s.subjectId === selectedId.value) || subjects.value[0] || {})
const detail = ref({ ladder: { tiers: [], total: 0, highest: 0 }, stocks: [], candles: [], code: '' })
const nowTime = () => new Date().toLocaleTimeString('zh-CN', { hour12: false })

async function loadDetail() {
  if (!selectedId.value) {
    detail.value = { ladder: { tiers: [], total: 0, highest: 0 }, stocks: [], candles: [], code: '' }
    return
  }
  detail.value = await fetchDetail(snap.value, selectedId.value, selectedCode.value)
}

const SOURCE_TEXT = {
  lumi: 'Lumi 实时（同花顺问财）',
  none: '未连接行情源'
}
const SESSION_TEXT = {
  auction: '集合竞价',
  open: '盘中未收盘',
  lunch: '午间休市',
  closed: '非交易时段',
  unknown: '—'
}
const sourceText = computed(() => SOURCE_TEXT[snap.value.source] || snap.value.source || '—')
const sessionText = computed(() => SESSION_TEXT[snap.value.meta?.sessionState] || '—')
const footNote = computed(() => snap.value.source === 'lumi'
  ? '题材成分来自问财概念，行情为盘中实时值'
  : '未连接行情源，请启动本地服务并确认客户端已登录')

function selectSubject(id) {
  selectedId.value = id
  selectedCode.value = ''
}

function applySnapshot(data) {
  snap.value = data
  if (!selectedId.value && data.subjects?.length) selectedId.value = data.subjects[0].subjectId
}

onMounted(async () => {
  clock.value = nowTime()
  clockTimer = setInterval(() => { clock.value = nowTime() }, 1000)

  applySnapshot(await loadSnapshot())
  await loadDetail()
  const info = await desktopVersion()
  if (info?.version) version.value = info.version

  stopStream = connectStream(applySnapshot)

  statusTimer = setInterval(async () => { service.value = await desktopServiceStatus() }, 5000)
  detailTimer = setInterval(loadDetail, 6000)
})

watch(selectedId, () => { selectedCode.value = ''; loadDetail() })
watch(selectedCode, () => loadDetail())

onUnmounted(() => {
  stopStream?.()
  clearInterval(clockTimer)
  clearInterval(statusTimer)
  clearInterval(detailTimer)
})
</script>

<template>
  <div class="app-shell subject-shell">
    <TitleBar :source="snap.source" :version="version" />
    <MarketHeader :market="snap.market" :source="snap.source" :meta="snap.meta" />
    <main class="workspace subject-workspace">
      <SubjectList
        :subjects="subjects"
        :tree="snap.tree || []"
        :selected="selectedId"
        @select="selectSubject"
      />
      <div class="center-column">
        <div class="center-tabs">
          <button :class="{ active: centerTab === 'detail' }" @click="centerTab = 'detail'">题材详情</button>
          <button :class="{ active: centerTab === 'intel' }" @click="centerTab = 'intel'">题材情报</button>
        </div>
        <div class="center-body">
          <SubjectDetail
            v-show="centerTab === 'detail'"
            :subject="subject"
            :detail="detail"
            :market-ladder="snap.ladderAll"
            @select-stock="selectedCode = $event"
          />
          <SubjectIntel
            v-show="centerTab === 'intel'"
            :events="snap.events || []"
            :subject-id="selectedId"
            :subjects="subjects"
          />
        </div>
      </div>
      <aside class="panel right-column">
        <div class="panel-head">
          <span>题材生态</span>
          <span class="hint">象限 · 轮动 · 榜单</span>
        </div>
        <div class="panel-body right-body">
          <QuadrantChart :quadrants="snap.quadrants" :selected="selectedId" @select="selectSubject" />
          <RotationHeatmap :rotation="snap.rotation" :selected="selectedId" @select="selectSubject" />
          <RankPanel :rankings="snap.rankings" @select="selectSubject" />
        </div>
      </aside>
    </main>
    <footer class="statusbar">
      <span>数据源 <strong>{{ sourceText }}</strong></span>
      <span>取数时点 <strong class="num">{{ snap.meta?.asOf || '—' }}</strong></span>
      <span>状态 <strong>{{ sessionText }}</strong></span>
      <span>周期 <strong>第 {{ snap.day }} 日 · tick {{ snap.tick }}</strong></span>
      <span v-if="isDesktop()">主进程 <strong>{{ service?.ready ? '服务就绪' : '已连接' }}</strong></span>
      <span class="spacer"></span>
      <span>{{ footNote }}</span>
      <span class="num">{{ clock }}</span>
    </footer>
  </div>
</template>
