<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const url = computed(() => (typeof route.query.url === 'string' ? route.query.url : ''))
</script>

<template>
  <div class="form-page">
    <div class="form-card" style="max-width: 860px">
      <div class="form-title">海报</div>
      <div v-if="url" style="margin: 10px 0">
        <p class="form-hint" style="margin: 0 0 8px 0">海报地址：<code>{{ url }}</code></p>
        <iframe v-if="/^https?:/i.test(url)" :src="url" style="width: 100%; height: 480px; border: 1px solid var(--border); border-radius: 6px"></iframe>
        <div v-else class="qr-placeholder" style="width: 100%; height: 320px">本地海报占位（复刻版不包含原始素材）</div>
      </div>
      <div v-else class="qr-placeholder" style="width: 100%; height: 320px">缺少 ?url= 参数；原始 /poster 使用 iframe 显示活动海报页</div>
      <div class="form-hint">原始应用：`/poster` 隐藏路由，iframe 加载 `?url=` 指定海报页（第三方 H5 素材）；复刻版不加载第三方页面与素材。</div>
      <button class="btn-plain" style="margin-top: 12px" @click="router.push('/subject/excavate')">返回题材库</button>
    </div>
  </div>
</template>
