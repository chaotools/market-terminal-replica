<script setup>
import { useRouter } from 'vue-router'
const router = useRouter()
</script>

<template>
  <div class="page-frame">
    <div class="page-card">
      <h3>404</h3>
      <p>页面不存在。</p>
      <button class="nav-item active" @click="router.push('/')">返回首页</button>
    </div>
  </div>
</template>
