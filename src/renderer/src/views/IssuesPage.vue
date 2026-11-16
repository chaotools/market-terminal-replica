<script setup>
import { onMounted, ref } from 'vue'
import { api } from '../api/client.js'
import { useAppStore } from '../stores.js'

const app = useAppStore()
const tab = ref('latest')
const keyword = ref('')
const question = ref('')
const rows = ref([])
const loading = ref(false)
const message = ref('')

async function load() {
  loading.value = true
  const local = []
  try {
    const saved = await window.electron?.invoke?.('getSetting', 'questions')
    if (Array.isArray(saved)) local.push(...saved)
  } catch { /* ignore */ }
  let remote = []
  try {
    const data = await api.getIssues({ pageNum: 1, pageSize: 20, sort: tab.value })
    remote = Array.isArray(data?.rows) ? data.rows : []
  } catch { remote = [] }
  const all = [...local, ...remote]
  const kw = keyword.value.trim()
  rows.value = kw ? all.filter((row) => String(row.content || row.question || '').includes(kw)) : all
  loading.value = false
}

async function submit() {
  const text = question.value.trim()
  if (!text) { message.value = '请填写问题内容'; return }
  try {
    const saved = await window.electron?.invoke?.('getSetting', 'questions')
    const list = Array.isArray(saved) ? saved : []
    list.unshift({ id: 'Q-' + Date.now(), content: text, createdAt: new Date().toISOString(), status: '待回复', local: true })
    await window.electron?.invoke?.('saveSetting', { key: 'questions', value: list })
    question.value = ''
    message.value = '问题已保存到本地（复刻版不提交到第三方问答平台）'
    await load()
  } catch (error) {
    message.value = `提交失败：${error.message}`
  }
}

onMounted(() => { app.setActiveGroup(2); load() })
</script>

<template>
  <div class="form-page">
    <div class="form-card" style="max-width: 980px">
      <div class="form-title">问董秘</div>
      <div class="order-tabs">
        <button :class="{ active: tab === 'latest' }" @click="tab = 'latest'; load()">最新</button>
        <button :class="{ active: tab === 'hot' }" @click="tab = 'hot'; load()">热门</button>
      </div>
      <div class="lead-toolbar" style="padding: 6px 0">
        <input v-model="keyword" placeholder="搜索问题" style="height: 26px; border: 1px solid var(--border); border-radius: 3px; padding: 0 8px; font-size: 12px; width: 240px" @keyup.enter="load" />
        <button class="tool-btn" @click="load">搜索</button>
      </div>
      <div class="form-row" style="align-items: flex-start">
        <label>我的提问</label>
        <textarea v-model="question" placeholder="向上市公司提问（本地保存）" style="min-width: 520px"></textarea>
      </div>
      <div class="form-actions">
        <button class="btn-primary" @click="submit">提交问题</button>
      </div>
      <div class="form-hint">{{ message || '原始应用：/app/stock/qa、/app/stock/qa/v2、/app/stock/qa/rank（加密响应），问答内容为第三方平台数据；复刻版只保存本地问题，不抓取原文。' }}</div>
      <table class="data-table" v-if="rows.length" style="margin-top: 10px">
        <thead><tr><th style="width: 60%">问题</th><th>状态</th><th>时间</th></tr></thead>
        <tbody><tr v-for="row in rows" :key="row.id"><td>{{ row.content || row.question }}</td><td>{{ row.status || '—' }}</td><td>{{ row.createdAt || row.createTime || '—' }}</td></tr></tbody>
      </table>
      <div class="table-empty" v-else>{{ loading ? '加载中…' : '暂无问答（本地契约空态）' }}</div>
    </div>
  </div>
</template>
