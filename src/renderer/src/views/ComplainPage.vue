<script setup>
import { onMounted, ref } from 'vue'
import { useAppStore, useUserStore } from '../stores.js'

const app = useAppStore()
const user = useUserStore()
const type = ref('行情数据')
const content = ref('')
const contact = ref('')
const message = ref('')
const TYPES = ['行情数据', '会员服务', '软件功能', '其他']

async function submit() {
  if (!content.value.trim()) { message.value = '请填写投诉内容'; return }
  try {
    const existing = await window.electron?.invoke?.('getSetting', 'complaints')
    const list = Array.isArray(existing) ? existing : []
    list.unshift({ id: 'C-' + Date.now(), type: type.value, content: content.value.trim(), contact: contact.value.trim(), createdAt: new Date().toISOString(), user: user.userInfo.userId })
    await window.electron?.invoke?.('saveSetting', { key: 'complaints', value: list })
    message.value = '投诉已保存到本地（复刻版不提交到任何第三方平台）'
    content.value = ''
  } catch (error) {
    message.value = `提交失败：${error.message}`
  }
}

onMounted(() => { app.setActiveGroup(6) })
</script>

<template>
  <div class="form-page">
    <div class="form-card" style="max-width: 760px">
      <div class="form-title">一键投诉</div>
      <div class="form-row">
        <label>投诉类型</label>
        <select v-model="type"><option v-for="item in TYPES" :key="item" :value="item">{{ item }}</option></select>
      </div>
      <div class="form-row"><label>投诉内容</label><textarea v-model="content" placeholder="请描述问题（不少于 10 字）" style="min-width: 420px"></textarea></div>
      <div class="form-row"><label>联系方式</label><input v-model="contact" placeholder="手机号/邮箱（选填）" /></div>
      <div class="form-actions">
        <button class="btn-primary" @click="submit">提交投诉</button>
      </div>
      <div class="form-hint">{{ message || '原始应用：/app/complaint-link/list + menu-click-log，并通过 webview 打开第三方投诉页面；复刻版仅本地保存，不提交到第三方。' }}</div>
    </div>
  </div>
</template>
