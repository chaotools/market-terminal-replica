<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '../stores.js'
import { api } from '../api/client.js'
import { desktopInvoke } from '../data.js'

const router = useRouter()
const app = useAppStore()

const versionInfo = ref(null)
const progress = ref(0)
const updating = ref(false)
const message = ref('')
let unsubscribe = null

async function check() {
  message.value = '正在检查更新…'
  try {
    const data = await api.getAppVersion()
    versionInfo.value = data
    message.value = data?.pcVersion > app.build ? '发现新版本' : '已是最新版本'
  } catch (err) {
    message.value = `检查失败：${err.message}`
  }
}

function startUpdate() {
  if (updating.value) return
  updating.value = true
  progress.value = 0
  message.value = '正在下载更新包…'
  desktopInvoke('downloadUpdate')
}

onMounted(async () => {
  app.setSource('local')
  await check()
  unsubscribe = window.electron?.on?.('progress-change', (payload) => {
    if (typeof payload?.percent === 'number') {
      progress.value = Math.max(0, Math.min(100, payload.percent))
      if (progress.value >= 100) {
        updating.value = false
        message.value = '下载完成，可重启安装'
      }
    }
  })
})

onUnmounted(() => { unsubscribe?.() })
</script>

<template>
  <div class="pad-page">
    <div class="page-head">
      <span class="page-title">版本更新</span>
      <span class="page-stage">P1 子窗</span>
    </div>
    <div class="page-card">
      <h3>当前版本</h3>
      <p>v{{ app.version || '0.1.0' }}（build {{ app.build || 100 }}）</p>
      <h3>更新检查</h3>
      <p>{{ message }}</p>
      <div class="progress-track"><i :style="{ width: progress + '%' }"></i></div>
      <p>进度 {{ progress }}%</p>
      <div class="login-actions">
        <button class="primary" :disabled="updating" @click="startUpdate">立即更新</button>
        <button @click="desktopInvoke('closeVersion')">关闭</button>
        <button @click="router.push('/')">返回首页</button>
      </div>
      <p class="page-placeholder-note">
        原始链路：`/app/config/app-version` → electron-updater NSIS 差分下载（%LOCALAPPDATA%\\jyhf-updater）→ progress-change → quitAndInstall + elevate.exe。
        本复刻使用本地接口与本地下载进度模拟。
      </p>
    </div>
  </div>
</template>
