<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const meta = computed(() => route.meta || {})
const title = computed(() => meta.value.title || route.name || route.path)
const stage = computed(() => meta.value.stage || 'P1')
const apis = computed(() => meta.value.apis || [])
const notes = computed(() => meta.value.notes || [])
const origin = computed(() => meta.value.origin || route.path)
</script>

<template>
  <div class="page-frame">
    <div class="page-head">
      <span class="page-title">{{ title }}</span>
      <span class="page-stage">{{ stage }} 阶段实现</span>
      <span class="page-sub">原始路由 <code>{{ origin }}</code></span>
    </div>
    <div class="page-card">
      <h3>复刻要点</h3>
      <ul>
        <li v-for="(note, i) in notes" :key="i">{{ note }}</li>
        <li v-if="!notes.length">该页面按原始应用的路由/契约证据逐项复刻，当前为 P0-1 骨架占位。</li>
      </ul>
      <div v-if="apis.length" class="page-api">
        <code v-for="path in apis" :key="path">{{ path }}</code>
      </div>
      <p class="page-placeholder-note">
        证据来源：渲染层 bundle 静态分析（路由表、API 调用点、IPC 通道）。
        页面结构会在对应阶段按原始布局补齐，数据一律来自本地 API 契约 server，不连接第三方服务。
      </p>
    </div>
  </div>
</template>
