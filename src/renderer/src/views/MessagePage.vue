<script setup>
import { onMounted, ref } from 'vue'
import { api } from '../api/client.js'

const rows = ref([])
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    const data = await api.getPushMessages({ pageNum: 1, pageSize: 20 })
    rows.value = Array.isArray(data?.rows) ? data.rows : []
  } catch {
    rows.value = []
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="pad-page">
    <div class="page-head"><span class="page-title">消息通知</span><span class="page-stage">P1</span></div>
    <div class="page-card">
      <h3>系统消息</h3>
      <p v-if="loading">加载中…</p>
      <p v-else-if="!rows.length">本地暂无消息（原始应用经 socket.io message-pc 推送红点，并在独立消息小窗展示）。</p>
      <div v-for="(row, i) in rows" :key="i" class="msg-row" :class="{ unread: row.unread }">
        {{ row.title || row.content || '通知' }}
      </div>
      <p class="page-placeholder-note">子窗路由 /message；点击消息后回主窗跳转（原始 IPC messageClick）。</p>
    </div>
  </div>
</template>
