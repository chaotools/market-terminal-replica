<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const status = ref('idle')
const errorText = ref('')

const file = computed(() => (typeof route.query.file === 'string' ? route.query.file : ''))
const fileUrl = computed(() => {
  if (!file.value) return ''
  const normalized = file.value.replace(/\\/g, '/')
  return 'file:///' + encodeURI(normalized).replace(/^\//, '')
})

function onLoadError() {
  status.value = 'error'
  errorText.value = '内置 PDFium 无法加载该文件（webview 插件可能被禁用）'
}

function onLoad() {
  status.value = 'ready'
}
</script>

<template>
  <div class="pad-page" style="display: flex; flex-direction: column">
    <div class="page-head">
      <span class="page-title">PDF 预览</span>
      <span class="page-stage">P1 · 本地文件</span>
      <span class="page-sub" v-if="file">{{ file.split(/[\\/]/).pop() }}</span>
      <button class="tool-btn" style="margin-left: auto" @click="router.push('/subject/excavate')">返回题材库</button>
    </div>
    <div class="page-card" style="flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 8px">
      <div v-if="!file">缺少 ?file= 参数（绝对路径）。主进程 `openPDF({file})` 会打开本页。</div>
      <div v-else-if="status === 'error'" style="color: #c0392b">{{ errorText }}</div>
      <webview
        v-if="file"
        :src="fileUrl"
        :key="file"
        plugins
        style="flex: 1; min-height: 0; width: 100%; border: 1px solid var(--border); border-radius: 4px"
        @did-finish-load="onLoad"
        @did-fail-load="onLoadError"
      ></webview>
      <p class="page-placeholder-note" style="margin-top: 6px">
        原始应用：`preview-pdf` chunk 使用 pdf.js 渲染，主进程 IPC `openPDF` 打开独立子窗。
        复刻版通过 `readLocalFile` 校验路径后，用 Electron 内置 PDFium（webview + plugins）渲染本地 PDF；
        也保留了 `pdfjs-dist` 依赖用于后续离线增强（当前 Chromium 版本下 worker 在 file:// 场景回退异常，故默认走 PDFium）。
      </p>
    </div>
  </div>
</template>
