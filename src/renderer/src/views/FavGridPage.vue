<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '../stores.js'
import { formatPct, toneClass } from '../format.js'
import { loadSnapshot, connectStream, emptySnapshot } from '../data.js'

const router = useRouter()
const app = useAppStore()
const snap = ref(emptySnapshot())
let stopStream = null

const subjects = computed(() => snap.value.subjects || [])

function applySnapshot(data) {
  snap.value = data
  app.setSource(data.source || 'local')
}

onMounted(async () => {
  app.setActiveGroup(1)
  applySnapshot(await loadSnapshot())
  stopStream = connectStream(applySnapshot)
})
onUnmounted(() => stopStream?.())
</script>

<template>
  <div class="form-page" style="background: #fff">
    <div class="form-title" style="padding: 6px 2px">自选股 · 多股同列</div>
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px">
      <div v-for="n in 3" :key="n" style="border: 1px solid var(--border); border-radius: 6px; min-height: 260px; display: flex; flex-direction: column">
        <div style="padding: 6px 10px; border-bottom: 1px solid var(--border); font-size: 12px; color: var(--text-soft)">窗口 {{ n }}</div>
        <div style="flex: 1; display: flex; align-items: center; justify-content: center; color: var(--muted); font-size: 12px; text-align: center; padding: 14px">
          暂无自选股票<br />原始页面 /fav/grid 为客户端的“多股同列”分屏 K 线视图
        </div>
      </div>
    </div>
    <div class="form-hint">
      自选题材（本地）：{{ subjects.slice(0, 6).map((s) => s.subjectName).join('、') || '—' }}
      <span :class="toneClass(subjects[0]?.changePct)">{{ subjects.length ? formatPct(subjects[0].changePct) : '' }}</span>
    </div>
    <div class="form-hint">原始页面：/fav/grid（FavGridMain）按自选分组多股同列展示，支持分时/日K切换；复刻版保留布局，空态不伪造行情。</div>
    <button class="btn-plain" style="margin-top: 10px" @click="router.push('/fav')">返回自选股</button>
  </div>
</template>
