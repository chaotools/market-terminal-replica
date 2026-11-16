<script setup>
import { onMounted, ref } from 'vue'
import { useAppStore } from '../stores.js'

const app = useAppStore()
const tab = ref('home')
const TABS = [
  { key: 'home', label: '讲师主页' },
  { key: 'article', label: '文章' },
  { key: 'course', label: '课程' },
  { key: 'live', label: '直播' },
  { key: 'subscribe', label: '订阅' }
]
const lecturers = ref([
  { id: 'local-1', name: '本地示例讲师', title: '题材研究方法论', intro: '复刻版占位讲师：原始应用通过 /app/lecturer/index/auth 与 /app/lecturer/subscribe 获取讲师与订阅信息（加密响应）。', subscribed: false }
])

function subscribe(item) {
  item.subscribed = !item.subscribed
}

onMounted(() => { app.setActiveGroup(4) })
</script>

<template>
  <div class="form-page">
    <div class="form-card" style="max-width: 1100px">
      <div class="form-title">投资圈</div>
      <div class="order-tabs">
        <button v-for="item in TABS" :key="item.key" :class="{ active: tab === item.key }" @click="tab = item.key">{{ item.label }}</button>
      </div>

      <template v-if="tab === 'home'">
        <div v-for="item in lecturers" :key="item.id" class="user-head" style="margin-bottom: 12px">
          <div class="avatar-big">{{ item.name[0] }}</div>
          <div style="flex: 1">
            <div class="user-name">{{ item.name }}</div>
            <div class="user-sub">{{ item.title }}</div>
            <div class="form-hint" style="margin: 6px 0 0 0">{{ item.intro }}</div>
          </div>
          <button class="btn-primary" @click="subscribe(item)">{{ item.subscribed ? '已订阅' : '订阅' }}</button>
        </div>
      </template>
      <div v-else class="table-empty">
        {{ TABS.find((t) => t.key === tab)?.label }}列表为空：原始接口 /app/lecturer/{article,course/list,his/*} 为加密响应，本地契约未提供内容；复刻版不抓取第三方讲师内容。
      </div>
      <div class="form-hint">
        原始页面：讲师主页/文章/课程/直播/订阅（含 /practical-train、/investment-train 复用讲师生组件 lecturer-id=3/10）；
        复刻版保留结构，不接入真实讲师内容与直播流。
      </div>
    </div>
  </div>
</template>
