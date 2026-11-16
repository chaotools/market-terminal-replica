<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '../stores.js'
import { formatPct, toneClass } from '../format.js'
import { loadSnapshot, connectStream, emptySnapshot } from '../data.js'

const route = useRoute()
const router = useRouter()
const app = useAppStore()
const snap = ref(emptySnapshot())
const chartTab = ref('kline')
let stopStream = null
let timer = null

const KINDS = [
  { key: 'lead', label: '领涨' },
  { key: 'up', label: '晋级' },
  { key: 'line', label: '主线' },
  { key: 'continuous', label: '持续' }
]
const TITLES = { lead: '领涨题材', up: '晋级题材', line: '主线题材', continuous: '持续题材' }

const activeKind = computed(() => String(route.meta?.kind || 'lead'))
const subjects = computed(() => snap.value.subjects || [])

const list = computed(() => {
  const all = [...subjects.value]
  if (activeKind.value === 'up') return all.sort((a, b) => b.limitUpHeight - a.limitUpHeight || b.heat - a.heat)
  if (activeKind.value === 'line') return all.filter((s) => s.stage === '主线' || s.sustainDays >= 2).sort((a, b) => b.heat - a.heat)
  if (activeKind.value === 'continuous') return all.sort((a, b) => b.sustainDays - a.sustainDays || b.heat - a.heat)
  return all.sort((a, b) => b.changePct - a.changePct)
})

function switchKind(kind) {
  router.push('/svip-subject-main/monitoring/' + kind)
}

function applySnapshot(data) {
  snap.value = data
  app.setSource(data.source || 'local')
  app.setMeta(data.meta || {})
}

watch(() => route.fullPath, () => { chartTab.value = 'kline' })

onMounted(async () => {
  app.setActiveGroup(3)
  applySnapshot(await loadSnapshot())
  stopStream = connectStream(applySnapshot)
  timer = setInterval(async () => { applySnapshot(await loadSnapshot()) }, 15000)
})
onUnmounted(() => { stopStream?.(); clearInterval(timer) })
</script>

<template>
  <div class="monitor-page">
    <aside class="monitor-rail">
      <button
        v-for="kind in KINDS"
        :key="kind.key"
        class="rail-tab"
        :class="{ active: activeKind === kind.key }"
        style="white-space: pre-line; height: 92px; line-height: 1.7"
        @click="switchKind(kind.key)"
      >{{ kind.label }}</button>
    </aside>

    <div class="monitor-main">
      <div class="lead-toolbar">
        <span style="font-size: 14px; font-weight: 600; color: var(--text)">{{ TITLES[activeKind] }}</span>
        <div class="lead-daytabs">
          <button class="lead-tab">上一天</button>
          <button class="lead-tab">下一天</button>
        </div>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th class="num" style="width:48px">序号</th><th>名称</th><th class="num">涨幅</th><th class="num">领涨次数</th><th class="num">评级系统</th><th>个股信号</th></tr></thead>
          <tbody>
            <tr v-for="(item, index) in list" :key="item.subjectId">
              <td class="num muted">{{ index + 1 }}</td>
              <td>{{ item.subjectName }}</td>
              <td class="num" :class="toneClass(item.changePct)">{{ formatPct(item.changePct) }}</td>
              <td class="num">{{ item.leadTimes }}</td>
              <td class="num">{{ item.heat >= 60 ? 'A' : item.heat >= 45 ? 'B' : 'C' }}</td>
              <td>{{ item.leadStock?.name || '—' }}</td>
            </tr>
            <tr v-if="!list.length"><td colspan="6" class="table-empty">未连接行情源，暂无数据</td></tr>
          </tbody>
        </table>
      </div>
      <div class="lead-pager">
        <span style="color: var(--muted)">原始页面：领涨/晋级/主线/持续题材四态监控 + 上一天/下一天；评级系统与个股信号来自加密接口，复刻版以本地指标近似。</span>
      </div>
    </div>

    <aside class="monitor-chart">
      <div class="chart-tabs">
        <button :class="{ active: chartTab === 'kline' }" @click="chartTab = 'kline'">K线走势</button>
        <button :class="{ active: chartTab === 'cycle' }" @click="chartTab = 'cycle'">题材周期图</button>
      </div>
      <div class="monitor-chart-body">
        {{ chartTab === 'kline' ? '题材指数 K 线需要 /app/subject/daily/:id/:days（加密响应），本地契约空态' : '题材周期图需要 /app/subject/history-cycle（加密响应），本地契约空态' }}
      </div>
    </aside>
  </div>
</template>
