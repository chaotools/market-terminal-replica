<script setup>
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useAppStore } from '../stores.js'
import { api } from '../api/client.js'

const app = useAppStore()
const tab = ref('intro')
const chatInput = ref('')
const chatList = ref([
  { role: 'system', text: '直播聊天室（本地模拟）：原始应用通过 socket.io broadcast-room 事件（ENTER/LEAVE/CHAT/START/END/STATUS）驱动。' }
])
const listRef = ref(null)
let source = null

function pushLive(message) {
  chatList.value.push({ role: 'live', text: '[' + (message.kind || 'LIVE') + '] ' + (message.text || '') + (message.room ? '（' + message.room + '）' : '') })
}

async function loadLiveEvents() {
  try {
    const data = await api.getLiveEvents()
    for (const message of data?.list || []) pushLive(message)
  } catch { /* 本地服务未启动时忽略 */ }
}

async function send() {
  const text = chatInput.value.trim()
  if (!text) return
  chatList.value.push({ role: 'me', text })
  chatInput.value = ''
  await nextTick()
  if (listRef.value) listRef.value.scrollTop = listRef.value.scrollHeight
}

onMounted(async () => {
  app.setActiveGroup(4)
  await loadLiveEvents()
  try {
    source = new EventSource('http://127.0.0.1:8080/push')
    source.addEventListener('live', (event) => {
      try { pushLive(JSON.parse(event.data)) } catch { /* ignore */ }
    })
  } catch { /* EventSource 不可用时仅本地聊天 */ }
})

onUnmounted(() => { source?.close() })
</script>

<template>
  <div class="form-page">
    <div class="form-card" style="max-width: 1180px">
      <div class="form-title">播放 · 直播/回放</div>
      <div style="display: flex; gap: 14px">
        <div style="flex: 1; min-width: 0">
          <div style="height: 360px; background: #0f1b33; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #8fa8c4; font-size: 13px; text-align: center; padding: 20px">
            视频播放器占位<br />
            原始应用：阿里云 Aliplayer（license + /app/lecturer/live-info/:id + /app/video/vod-play-info/:vid + watch-time 上报）<br />
            复刻版不接入第三方播放器与真实视频流
          </div>
          <div class="order-tabs" style="margin-top: 10px">
            <button :class="{ active: tab === 'intro' }" @click="tab = 'intro'">简介</button>
            <button :class="{ active: tab === 'qa' }" @click="tab = 'qa'">问答</button>
          </div>
          <div class="form-hint" style="margin: 6px 0 0 0">
            {{ tab === 'intro' ? '直播简介来自 /app/lecturer/ 系接口（加密响应），本地契约空态。' : '问答列表为空；复刻版不抓取第三方直播内容。' }}
          </div>
        </div>
        <div style="width: 320px; flex: none; border: 1px solid var(--border); border-radius: 6px; display: flex; flex-direction: column; height: 430px">
          <div style="padding: 8px 10px; border-bottom: 1px solid var(--border); font-size: 13px; font-weight: 600">聊天室（broadcast-room 本地模拟）</div>
          <div ref="listRef" style="flex: 1; overflow: auto; padding: 8px 10px; font-size: 12px; color: var(--text-soft); line-height: 1.7">
            <div v-for="(item, i) in chatList" :key="i" style="margin-bottom: 6px">
              <span :style="item.role === 'me' ? 'color: var(--accent)' : 'color: var(--muted)'">{{ item.role === 'me' ? '我' : '系统' }}：</span>{{ item.text }}
            </div>
          </div>
          <div style="display: flex; gap: 6px; padding: 8px; border-top: 1px solid var(--border)">
            <input v-model="chatInput" placeholder="说点什么…" style="flex: 1; height: 28px; border: 1px solid var(--border); border-radius: 3px; padding: 0 8px; font-size: 12px" @keyup.enter="send" />
            <button class="tool-btn" @click="send">发送</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
