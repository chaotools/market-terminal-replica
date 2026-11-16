<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const url = computed(() => (typeof route.query.url === 'string' ? route.query.url : ''))
</script>

<template>
  <div class="pad-page">
    <div class="page-head"><span class="page-title">PDF 预览</span><span class="page-stage">P1</span></div>
    <div class="page-card">
      <p v-if="url">文件：<code>{{ url }}</code></p>
      <p v-else>缺少 ?url= 参数。</p>
      <iframe v-if="url && /^https?:/i.test(url)" :src="url" style="width: 100%; height: 420px; border: 1px solid var(--border); border-radius: 6px"></iframe>
      <p v-else class="page-placeholder-note">
        原始应用使用 pdf.js（preview-pdf chunk，1.6MB）渲染多页 PDF，由主进程 IPC openPDF({title,url}) 打开独立子窗。
        本复刻在 P1 阶段接入本地 pdf.js 渲染。
      </p>
    </div>
  </div>
</template>
