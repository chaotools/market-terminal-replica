<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import MarketHeader from '../components/MarketHeader.vue'
import SubjectList from '../components/SubjectList.vue'
import SubjectDetail from '../components/SubjectDetail.vue'
import QuadrantChart from '../components/QuadrantChart.vue'
import RotationHeatmap from '../components/RotationHeatmap.vue'
import RankPanel from '../components/RankPanel.vue'
import SubjectIntel from '../components/SubjectIntel.vue'
import { useAppStore } from '../stores.js'
import {
  loadSnapshot, connectStream, fetchDetail, emptySnapshot,
  isDesktop, desktopVersion
} from '../data.js'

const props = defineProps({
  focusSubject: { type: String, default: '' }
})

const app = useAppStore()
const snap = ref(emptySnapshot())
const selectedId = ref('')
const selectedCode = ref('')
const centerTab = ref('detail')
const version = ref('0.1.0')

let stopStream = null
let detailTimer = null

const subjects = computed(() => snap.value.subjects || [])
const subject = computed(() => subjects.value.find((s) => s.subjectId === selectedId.value) || subjects.value[0] || {})
const detail = ref({ ladder: { tiers: [], total: 0, highest: 0 }, stocks: [], candles: [], code: '' })

async function loadDetail() {
  if (!selectedId.value) {
    detail.value = { ladder: { tiers: [], total: 0, highest: 0 }, stocks: [], candles: [], code: '' }
    return
  }
  detail.value = await fetchDetail(snap.value, selectedId.value, selectedCode.value)
}

function selectSubject(id) {
  selectedId.value = id
  selectedCode.value = ''
}

function applySnapshot(data) {
  snap.value = data
  app.setSource(data.source || 'local')
  app.setMeta(data.meta || {})
  if (!selectedId.value && data.subjects?.length) selectedId.value = props.focusSubject || data.subjects[0].subjectId
}

onMounted(async () => {
  applySnapshot(await loadSnapshot())
  await loadDetail()
  const info = await desktopVersion()
  if (info?.version) version.value = info.version
  app.setSource(snap.value.source)
  stopStream = connectStream(applySnapshot)
  detailTimer = setInterval(loadDetail, 6000)
  if (props.focusSubject && subjects.value.some((s) => s.subjectId === props.focusSubject)) {
    selectedId.value = props.focusSubject
  }
})

watch(selectedId, () => { selectedCode.value = ''; loadDetail() })
watch(selectedCode, () => loadDetail())
watch(
  () => props.focusSubject,
  (value) => { if (value) selectedId.value = value }
)

onUnmounted(() => {
  stopStream?.()
  clearInterval(detailTimer)
})
</script>

<template>
  <div class="subject-page">
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
  </div>
</template>
