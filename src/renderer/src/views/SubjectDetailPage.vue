<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SubjectKlinePanel from '../components/SubjectKlinePanel.vue'
import { useAppStore } from '../stores.js'
import { formatPct, formatAmount, toneClass } from '../format.js'
import { loadSnapshot, connectStream, fetchDetail, emptySnapshot } from '../data.js'

const route = useRoute()
const router = useRouter()
const app = useAppStore()
const snap = ref(emptySnapshot())
const detail = ref({ stocks: [], candles: [], code: '' })
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

async function load() {
  if (!subjectId.value) return
  detail.value = await fetchDetail(snap.value, subjectId.value, '')
}

function applySnapshot(data) {
  snap.value = data
  app.setSource(data.source || 'local')
  app.setMeta(data.meta || {})
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
  timer = setInterval(load, 10000)
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

      <div class="detail-table-wrap" v-else-if="tab === 'tree'">
        <div v-if="tree.length">
          <div v-for="group in tree" :key="group.groupId" class="tree-group">
            <div class="tree-group-name">{{ group.groupName }}（{{ group.childIds.length }} 个题材）</div>
            <div class="tree-children">
              <span v-for="childId in group.childIds" :key="childId" class="tree-chip" @click="selectSubject(childId)">
                {{ (snap.subjects || []).find((s) => s.subjectId === childId)?.subjectName || childId }}
              </span>
            </div>
          </div>
        </div>
        <div v-else class="table-empty">未连接行情源，暂无题材图谱</div>
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
