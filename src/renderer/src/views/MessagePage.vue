<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api/client.js'
import { useAppStore } from '../stores.js'

const router = useRouter()
const app = useAppStore()
const types = ref([{ typeId: 0, typeName: '全部' }])
const tab = ref(0)
const messages = ref([])
const loading = ref(false)

const filtered = computed(() => tab.value === 0 ? messages.value : messages.value.filter((m) => Number(m.typeId) === Number(tab.value)))
const unreadCount = computed(() => messages.value.filter((m) => m.unread).length)

async function readStore() {
  try {
    const value = await window.electron?.invoke?.('getSetting', 'messages')
    return Array.isArray(value) ? value : []
  } catch { return [] }
}

async function saveStore(list) {
  try { await window.electron?.invoke?.('saveSetting', { key: 'messages', value: list }) } catch { /* ignore */ }
}

async function load() {
  loading.value = true
  try {
    const remoteTypes = await api.getPushMessageTypes()
    if (Array.isArray(remoteTypes) && remoteTypes.length) {
      types.value = [{ typeId: 0, typeName: '全部' }, ...remoteTypes.map((t) => ({ typeId: t.typeId, typeName: t.typeName }))]
    }
  } catch { /* 使用默认 */ }
  let remoteRows = []
  try {
    const data = await api.getPushMessages({ pageNum: 1, pageSize: 20 })
    remoteRows = Array.isArray(data?.rows) ? data.rows.map((row, index) => ({
      id: row.id || `remote-${index}`,
      typeId: row.typeId || 1,
      title: row.title || '通知',
      content: row.content || '',
      unread: Boolean(row.unread),
      createdAt: row.createTime || row.createdAt || ''
    })) : []
  } catch { remoteRows = [] }
  messages.value = [...(await readStore()), ...remoteRows]
  app.hasNewMsg = messages.value.some((m) => m.unread)
  loading.value = false
}

async function markAllRead() {
  messages.value = messages.value.map((m) => ({ ...m, unread: false }))
  app.hasNewMsg = false
  await saveStore(messages.value.filter((m) => !String(m.id).startsWith('remote-')))
}

async function openMessage(row) {
  const next = messages.value.map((m) => String(m.id) === String(row.id) ? { ...m, unread: false } : m)
  messages.value = next
  app.hasNewMsg = next.some((m) => m.unread)
  await saveStore(next.filter((m) => !String(m.id).startsWith('remote-')))
  try { await window.electron?.invoke?.('messageClick', { path: row.link || '/subject/excavate' }) } catch { /* ignore */ }
  if (row.link) router.push(row.link)
}

onMounted(() => { app.setActiveGroup(5); load() })
</script>

<template>
  <div class="pad-page">
    <div class="page-head">
      <span class="page-title">消息通知</span>
      <span class="page-stage">P1</span>
      <span class="page-sub">未读 {{ unreadCount }} 条</span>
      <button class="tool-btn" style="margin-left: auto" @click="markAllRead">全部已读</button>
    </div>
    <div class="page-card">
      <div class="order-tabs">
        <button v-for="t in types" :key="t.typeId" :class="{ active: Number(tab) === Number(t.typeId) }" @click="tab = t.typeId">{{ t.typeName }}</button>
      </div>
      <div v-if="loading">加载中…</div>
      <template v-else>
        <div v-for="row in filtered" :key="row.id" class="msg-row" :class="{ unread: row.unread }" @click="openMessage(row)">
          <div style="display: flex; justify-content: space-between; gap: 12px">
            <span>{{ row.title }}</span>
            <span style="color: var(--muted)">{{ row.createdAt || '' }}</span>
          </div>
          <div style="margin-top: 4px; color: var(--muted); font-weight: 400">{{ row.content }}</div>
        </div>
        <div v-if="!filtered.length" class="table-empty">暂无消息</div>
      </template>
      <p class="page-placeholder-note">
        原始应用：`message-pc` socket.io 事件推送红点与独立消息小窗（openMessage），点击回主窗跳转（messageClick）。
        复刻版以本地消息 store + 子窗路由实现同构交互；不连接第三方推送。
      </p>
    </div>
  </div>
</template>
