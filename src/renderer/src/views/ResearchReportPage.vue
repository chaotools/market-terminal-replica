<script setup>
import { computed, onMounted, ref } from 'vue'
import { api } from '../api/client.js'
import { useAppStore } from '../stores.js'

const app = useAppStore()
const keyword = ref('')
const range = ref('30')
const rows = ref([])
const loading = ref(false)
const message = ref('')

const RANGES = [{ k: '7', l: '近 7 日' }, { k: '30', l: '近 30 日' }, { k: '90', l: '近 90 日' }, { k: 'all', l: '全部' }]

const filtered = computed(() => {
  const kw = keyword.value.trim()
  if (!kw) return rows.value
  return rows.value.filter((row) => `${row.title || ''}${row.source || ''}`.includes(kw))
})

async function load() {
  loading.value = true
  try {
    const data = await api.getResearchReports({ pageNum: 1, pageSize: 30, range: range.value })
    rows.value = Array.isArray(data?.rows) ? data.rows : []
  } catch { rows.value = [] } finally { loading.value = false }
}

async function openSamplePdf() {
  try {
    await window.electron?.invoke?.('openPDF', { file: 'C:\\Users\\0409\\WorkBuddy\\2026-11-15-16-34-04\\jyhf-replica\\out\\resources\\sample.pdf', title: '示例研报 PDF' })
    message.value = '已打开 PDF 预览子窗（本地示例文件）'
  } catch (error) {
    message.value = `打开失败：${error.message}`
  }
}

onMounted(() => { app.setActiveGroup(2); load() })
</script>

<template>
  <div class="form-page">
    <div class="form-card" style="max-width: 1100px">
      <div class="form-title">研究报告</div>
      <div class="lead-toolbar" style="padding: 0 0 10px">
        <div class="lead-tabs">
          <button v-for="item in RANGES" :key="item.k" class="lead-tab" :class="{ active: range === item.k }" @click="range = item.k; load()">{{ item.l }}</button>
        </div>
        <input v-model="keyword" placeholder="搜索标题/来源" style="height: 26px; border: 1px solid var(--border); border-radius: 3px; padding: 0 8px; font-size: 12px; width: 220px" />
        <button class="tool-btn" @click="load">搜索</button>
        <button class="tool-btn" style="margin-left: auto" @click="openSamplePdf">打开示例 PDF（子窗链路）</button>
      </div>
      <table class="data-table" v-if="filtered.length">
        <thead><tr><th style="width: 50%">标题</th><th>来源</th><th>日期</th><th class="num">操作</th></tr></thead>
        <tbody>
          <tr v-for="row in filtered" :key="row.id || row.title">
            <td>{{ row.title }}</td>
            <td>{{ row.source || '—' }}</td>
            <td>{{ row.date || row.createTime || '—' }}</td>
            <td class="num"><button class="tool-btn" :disabled="!row.pdfUrl" @click="openSamplePdf">PDF</button></td>
          </tr>
        </tbody>
      </table>
      <div class="table-empty" v-else>{{ loading ? '加载中…' : '暂无研报（原始接口 /app/stock-report/v2/list 为加密响应；本地契约空态）' }}</div>
      <div class="form-hint">{{ message || '原始应用：研报列表 + PDF 预览由 pdf.js 渲染；复刻版使用 Electron PDFium 子窗链路 + 本地示例文件验证。' }}</div>
    </div>
  </div>
</template>
