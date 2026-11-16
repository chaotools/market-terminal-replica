<script setup>
import { computed } from 'vue'
import { useAppStore, useUserStore } from '../stores.js'
import { ROLE_LABEL } from '../menu.js'

const app = useAppStore()
const user = useUserStore()

const SOURCE_TEXT = { local: '本地 API 契约', lumi: 'Lumi 实时行情', none: '未连接行情源' }
const SESSION_TEXT = { auction: '集合竞价', open: '盘中未收盘', lunch: '午间休市', closed: '非交易时段', unknown: '—' }
const sourceText = computed(() => SOURCE_TEXT[app.source] || app.source)
const sessionText = computed(() => SESSION_TEXT[app.sessionState] || '—')
</script>

<template>
  <footer class="statusbar">
    <span>数据源 <strong>{{ sourceText }}</strong></span>
    <span>取数时点 <strong class="num">{{ app.asOf || '—' }}</strong></span>
    <span>状态 <strong>{{ sessionText }}</strong></span>
    <span>角色 <strong>{{ ROLE_LABEL[app.role] }}</strong></span>
    <span>主进程 <strong>{{ app.serviceReady ? '本地服务就绪' : '连接中' }}</strong></span>
    <span class="spacer"></span>
    <span>v{{ app.version || '0.1.0' }}</span>
    <span class="num">{{ app.clock }}</span>
  </footer>
</template>
