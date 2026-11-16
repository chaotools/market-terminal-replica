<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import SubjectKlinePanel from '../components/SubjectKlinePanel.vue'
import { useAppStore } from '../stores.js'
import { formatPct, formatAmount, toneClass } from '../format.js'
import { loadSnapshot, connectStream, fetchDetail, emptySnapshot } from '../data.js'

const app = useAppStore()
const snap = ref(emptySnapshot())
const selectedId = ref('')
const detail = ref({ stocks: [], candles: [], code: '' })
const rightTab = ref('异动')
let stopStream = null
let timer = null

const subjects = computed(() => snap.value.subjects || [])
const subject = computed(() => subjects.value.find((s) => s.subjectId === selectedId.value) || subjects.value[0] || {})
const indices = computed(() => snap.value.market?.indices || [])

async function loadDetail() {
  if (!selectedId.value) { detail.value = { stocks: [], candles: [], code: '' }; return }
  detail.value = await fetchDetail(snap.value, selectedId.value, '')
}

function applySnapshot(data) {
  snap.value = data
  app.setSource(data.source || 'local')
  app.setMeta(data.meta || {})
  if (!selectedId.value && data.subjects?.length) { selectedId.value = data.subjects[0].subjectId; loadDetail() }
}

function select(id) { if (id !== selectedId.value) { selectedId.value = id; loadDetail() } }

onMounted(async () => {
  app.setActiveGroup(3)
  applySnapshot(await loadSnapshot())
  await loadDetail()
  stopStream = connectStream(applySnapshot)
  timer = setInterval(loadDetail, 10000)
})
onUnmounted(() => { stopStream?.(); clearInterval(timer) })
</script>

<template>
  <div class="monitor-page">
    <div class="monitor-main" style="width: 360px; flex: none; border-right: 1px solid var(--border)">
      <div class="lead-toolbar">
        <span style="font-size: 14px; font-weight: 600">甄选盯盘</span>
        <span style="margin-left: auto; color: var(--muted); font-size: 12px">题材/个股异动</span>
      </div>
      <div style="padding: 6px 10px; border-bottom: 1px solid var(--border); font-size: 12px; color: var(--text-soft); display: flex; gap: 12px; flex-wrap: wrap">
        <span v-for="index in indices" :key="index.code">
          {{ index.name }} <b :class="toneClass(index.changePct)">{{ formatPct(index.changePct) }}</b>
        </span>
        <span v-if="!indices.length" class="muted">指数数据空态</span>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>题材</th><th class="num">涨幅</th><th class="num">涨停</th><th class="num">热度</th></tr></thead>
          <tbody>
            <tr v-for="item in subjects" :key="item.subjectId" :class="{ active: item.subjectId === selectedId }" @click="select(item.subjectId)" style="cursor: pointer">
              <td>{{ item.subjectName }}</td>
              <td class="num" :class="toneClass(item.changePct)">{{ formatPct(item.changePct) }}</td>
              <td class="num">{{ item.limitUpCount }}</td>
              <td class="num">{{ item.heat }}</td>
            </tr>
            <tr v-if="!subjects.length"><td colspan="4" class="table-empty">未连接行情源</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <SubjectKlinePanel :subject="subject" :candles="detail.candles" :code="detail.code" />

    <aside class="monitor-chart" style="width: 300px">
      <div class="chart-tabs">
        <button :class="{ active: rightTab === '异动' }" @click="rightTab = '异动'">盘中异动</button>
        <button :class="{ active: rightTab === '短线' }" @click="rightTab = '短线'">短线精灵</button>
      </div>
      <div style="padding: 10px; font-size: 12px; color: var(--muted); line-height: 1.8">
        <template v-if="rightTab === '异动'">
          原始页面：/app/subject/realtime 与实时推送驱动的盘中异动（封板/开板/涨速/大单）。
          本地契约未连接行情源时为空态；接入公开行情源/桥接数据后此处显示事件流。
        </template>
        <template v-else>
          短线精灵依赖 /app/stock/stock-pool-config 与 pick-rank 接口（加密响应），复刻版以本地事件引擎近似。
        </template>
      </div>
      <div class="table-wrap" style="border-top: 1px solid var(--border)">
        <table class="data-table">
          <thead><tr><th>名称</th><th class="num">涨幅</th><th class="num">成交额</th></tr></thead>
          <tbody>
            <tr v-for="item in subjects.slice(0, 12)" :key="item.subjectId">
              <td>{{ item.subjectName }}</td>
              <td class="num" :class="toneClass(item.changePct)">{{ formatPct(item.changePct) }}</td>
              <td class="num">{{ formatAmount(item.turnover) }}</td>
            </tr>
            <tr v-if="!subjects.length"><td colspan="3" class="table-empty">空态</td></tr>
          </tbody>
        </table>
      </div>
    </aside>
  </div>
</template>
