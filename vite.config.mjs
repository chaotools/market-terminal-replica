import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  root: 'src/renderer',
  base: './',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src/renderer/src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url))
    }
  },
  build: {
    outDir: '../../out/renderer',
    emptyOutDir: true,
    target: 'es2022',
    // 分包：把框架与体积大的依赖拆成独立 chunk，页面按路由动态 import 各自成块
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('vue-router') || id.includes('/pinia/')) return 'vendor-router'
          if (id.includes('pdfjs-dist')) return 'vendor-pdf'
          if (id.includes('/vue/') || id.includes('@vue/')) return 'vendor-vue'
          return 'vendor'
        }
      }
    },
    chunkSizeWarningLimit: 700
  },
  server: {
    host: '127.0.0.1',
    port: 5173
  }
})
