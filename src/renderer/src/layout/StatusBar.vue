<script setup>
import { computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '../stores.js'
import { api } from '../api/client.js'

const route = useRoute()
const router = useRouter()
const app = useAppStore()

const canSearch = computed(() => true)
let timer = null

async function refresh() {
  try {
    const list = await api.getIndexRealtime()
    app.setIndices(Array.isArray(list) ? list : (Array.isArray(list?.data) ? list.data : []))
  } catch { /* 未连接时保持空列表 */ }
  try {
    const amount = await api.getIndexAmount()
    app.setIndexAmount(amount || null)
  } catch { /* ignore */ }
}

function fmtPct(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return (n > 0 ? '+' : '') + n.toFixed(2) + '%'
}
function fmtClose(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n.toFixed(2) : '—'
}
function tone(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 'flat'
  return n > 0 ? 'up' : n < 0 ? 'down' : 'flat'
}

function onSearchKey(event) {
  const keyword = String(event.target.value || '').trim()
  if (!keyword) return
  router.push({ path: '/market-trend/main', query: { keyword } })
}

onMounted(() => {
  refresh()
  timer = setInterval(refresh, 5000)
})
onUnmounted(() => clearInterval(timer))
</script>

<template>
  <footer class="statusbar indexbar">
    <template v-if="app.indices.length">
      <span v-for="item in app.indices" :key="item.code" class="index-item">
        <span class="index-name">{{ item.name }}</span>
        <span class="index-pct" :class="tone(item.pctChg)">{{ fmtPct(item.pctChg) }}</span>
        <span class="index-close num">{{ fmtClose(item.close) }}</span>
      </span>
      <span class="index-item" v-if="app.indexAmount?.amount">
        <span class="index-name">今日成交额</span>
        <span class="index-close num">{{ (app.indexAmount.amount / 1e8).toFixed(0) }} 亿</span>
      </span>
    </template>
    <template v-else>
      <span class="index-item" v-for="name in ['上证指数', '深证成指', '创业板指', '科创50']" :key="name">
        <span class="index-name">{{ name }}</span>
        <span class="index-pct flat">—</span>
        <span class="index-close num">—</span>
      </span>
    </template>
    <span class="spacer"></span>
    <label class="global-search" v-if="canSearch">
      <span class="search-icon">⌕</span>
      <input placeholder="搜索" @keyup.enter="onSearchKey" />
    </label>
  </footer>
</template>
