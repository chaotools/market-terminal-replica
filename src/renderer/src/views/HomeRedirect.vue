<script setup>
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '../stores.js'

const router = useRouter()
const app = useAppStore()

onMounted(() => {
  const svip = app.role === 'svip' || app.role === 'ssvip'
  router.replace(svip ? '/monitors-market' : '/subject/excavate')
})
</script>

<template>
  <div class="page-frame"><div class="page-card">正在进入…</div></div>
</template>
