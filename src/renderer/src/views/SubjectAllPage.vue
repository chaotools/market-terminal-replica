<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import SubjectKlinePanel from '../components/SubjectKlinePanel.vue'
import { useAppStore } from '../stores.js'
import { formatPct, formatAmount, toneClass } from '../format.js'
import { loadSnapshot, connectStream, fetchDetail, emptySnapshot } from '../data.js'

const router = useRouter()
const app = useAppStore()
const snap = ref(emptySnapshot())
const selectedId = ref('')
const detail = ref({ stocks: [], candles: [], code: '' })
const centerTab = ref('rank')
let stopStream = null
let detailTimer = null

const RAIL = [
  { label: '题材掘金', path: '/subject/excavate' },
  { label: '题材轮动', path: '/subject/periodic' },
  { label: '全部题材', path: '/subject/all' }
]

const subjects = computed(() => snap.value.subjects || [])
const subject = computed(() => subjects.value.find((s) => s.subjectId === selectedId.value) || subjects.value[0] || {})
const tree = computed(() => snap.value.tree || [])

async function loadDetail() {
  if (!selectedId.value) return
  detail.value = await fetchDetail(snap.value, selectedId.value, '')
}

function applySnapshot(data) {
  snap.value = data
  app.setSource(data.source || 'local')
  app.setMeta(data.meta || {})
  if (!selectedId.value && data.subjects?.length) {
    selectedId.value = data.subjects[0].subjectId
    loadDetail()
  }
}

function selectSubject(id) {
  if (!id) return
  selectedId.value = id
  loadDetail()
}

onMounted(async () => {
  app.setActiveGroup(2)
  applySnapshot(await loadSnapshot())
  await loadDetail()
  stopStream = connectStream(applySnapshot)
  detailTimer = setInterval(loadDetail, 8000)
})

onUnmounted(() => {
  stopStream?.()
  clearInterval(detailTimer)
})
</script>

<template>
  <div class="all-page">
    <aside class="subject-rail">
      <button v-for="item in RAIL" :key="item.path" class="rail-tab" :class="{ active: item.path === '/subject/all' }" @click="router.push(item.path)">{{ item.label }}</button>
    </aside>

    <section class="all-list">
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr><th>名称</th><th class="num">涨幅</th><th class="num">涨停家数</th><th class="num">涨跌分布</th><th>领涨股</th><th class="num">成交量</th></tr>
          </thead>
          <tbody>
            <tr
              v-for="item in subjects"
              :key="item.subjectId"
              :class="{ active: item.subjectId === selectedId }"
              @click="selectSubject(item.subjectId)"
            >
              <td>{{ item.subjectName }}</td>
              <td class="num" :class="toneClass(item.changePct)">{{ formatPct(item.changePct) }}</td>
              <td class="num">{{ item.limitUpCount }}</td>
              <td class="num muted">--</td>
              <td>{{ item.leadStock?.name || '--' }}</td>
              <td class="num">{{ formatAmount(item.turnover) }}</td>
            </tr>
            <tr v-if="!subjects.length"><td colspan="6" class="table-empty">未连接行情源，暂无题材数据</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="all-center">
      <div class="tab-strip">
        <button class="tab" :class="{ active: centerTab === 'rank' }" @click="centerTab = 'rank'">题材排名</button>
        <button class="tab" :class="{ active: centerTab === 'tree' }" @click="centerTab = 'tree'">题材图谱</button>
        <button class="tab" :class="{ active: centerTab === 'intro' }" @click="centerTab = 'intro'">题材介绍</button>
      </div>
      <div class="subject-crumb" style="padding: 6px 10px">{{ subject?.sector || '—' }} <span v-if="subject?.subjectName">» {{ subject.subjectName }}</span></div>
      <div class="table-wrap">
        <table class="data-table" v-if="centerTab === 'rank'">
          <thead><tr><th class="num" style="width:44px">序号</th><th>名称</th><th>代码</th><th class="num">现价</th><th class="num">涨跌幅</th><th class="num">连板天数</th><th class="num">涨速</th><th class="num">涨跌</th></tr></thead>
          <tbody>
            <tr v-for="(stock, index) in detail.stocks" :key="stock.code">
              <td class="num muted">{{ index + 1 }}</td>
              <td>{{ stock.name }}</td>
              <td class="muted">{{ stock.code }}</td>
              <td class="num">{{ stock.price }}</td>
              <td class="num" :class="toneClass(stock.changePct)">{{ formatPct(stock.changePct) }}</td>
              <td class="num">{{ stock.limitUpStreak ? stock.limitUpStreak + '连板' : '--' }}</td>
              <td class="num muted">--</td>
              <td class="num muted">--</td>
            </tr>
            <tr v-if="!detail.stocks.length"><td colspan="8" class="table-empty">未连接行情源，暂无成分股</td></tr>
          </tbody>
        </table>

        <div v-else-if="centerTab === 'tree'" style="padding: 8px 10px">
          <div v-for="group in tree" :key="group.groupId" class="tree-group">
            <div class="tree-group-name">{{ group.groupName }}（{{ group.childIds.length }} 个题材）</div>
            <div class="tree-children">
              <span v-for="childId in group.childIds" :key="childId" class="tree-chip" @click="selectSubject(childId)">
                {{ subjects.find((s) => s.subjectId === childId)?.subjectName || childId }}
              </span>
            </div>
          </div>
          <div v-if="!tree.length" class="table-empty">未连接行情源，暂无题材图谱</div>
        </div>

        <div v-else style="padding: 10px; font-size: 12px; color: var(--text-soft); line-height: 1.9">
          <div><b>{{ subject?.subjectName }}</b>（{{ subject?.sector || '—' }}）</div>
          <div>热度 {{ subject?.heat ?? '—' }} · 涨幅 {{ formatPct(subject?.changePct) }} · 涨停 {{ subject?.limitUpCount ?? '—' }} 家 · 最高 {{ subject?.limitUpHeight ?? '—' }} 板</div>
          <div>龙头 {{ subject?.leadStock?.name || '—' }} · 持续 {{ subject?.sustainDays ?? '—' }} 日 · 领涨 {{ subject?.leadTimes ?? '—' }} 次 · 阶段 {{ subject?.stage || '—' }}</div>
          <div class="muted">题材介绍正文来自原始应用的题材介绍接口（加密响应），复刻版以结构化指标替代。</div>
        </div>
      </div>
    </section>

    <SubjectKlinePanel :subject="subject" :candles="detail.candles" :code="detail.code" />
  </div>
</template>
