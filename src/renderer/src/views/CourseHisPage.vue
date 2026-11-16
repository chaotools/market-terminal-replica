<script setup>
import { computed, onMounted, ref } from 'vue'
import { useAppStore } from '../stores.js'

const app = useAppStore()
const tab = ref('replay')
const rows = ref([])
const loading = ref(false)

const TABS = [
  { key: 'replay', label: '直播回放' },
  { key: 'vod', label: '点播课程' }
]

async function load() {
  loading.value = true
  try {
    const data = await window.electron?.invoke?.('getSetting', 'courseHistory')
    rows.value = Array.isArray(data) ? data : []
  } catch { rows.value = [] } finally { loading.value = false }
}

onMounted(() => { app.setActiveGroup(4); load() })
</script>

<template>
  <div class="form-page">
    <div class="form-card" style="max-width: 1000px">
      <div class="form-title">历史课程</div>
      <div class="order-tabs">
        <button v-for="item in TABS" :key="item.key" :class="{ active: tab === item.key }" @click="tab = item.key">{{ item.label }}</button>
      </div>
      <div class="table-empty" style="padding: 40px 0">
        {{ loading ? '加载中…' : '暂无课程记录。原始页面 /course-his 复用 Live 播放器的课程历史 tab（/app/lecturer/his/* 加密响应）；复刻版不抓取第三方课程内容。' }}
      </div>
      <div class="form-hint">原始页面：/course-his → CourseHistoryTab，列出直播回放/点播课程并跳转 /live 播放。</div>
    </div>
  </div>
</template>
