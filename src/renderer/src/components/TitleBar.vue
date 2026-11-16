<script setup>
import { computed } from 'vue'
import { MENU_GROUPS } from '../menu.js'
import { useAppStore, useUserStore } from '../stores.js'
import { isDesktop, desktopInvoke } from '../data.js'

const app = useAppStore()
const user = useUserStore()
const desktop = isDesktop()
const act = (channel) => desktop && desktopInvoke(channel)

const sourceLabel = computed(() => ({
  local: '本地 API 契约',
  'public-sina': '公开行情源',
  'bridge-capture': '桥接快照',
  none: '未连接行情源'
}[app.source] || '未知来源'))
const initial = computed(() => (user.userInfo.nickName || '复')[0])

function selectGroup(group) { app.setActiveGroup(group.index) }
function openMessage() {
  if (desktop) desktopInvoke('openMessage')
  else location.hash = '#/message'
}
function cycleRole() {
  const order = ['none', 'vip', 'training', 'svip', 'ssvip']
  const idx = order.indexOf(app.role)
  app.setRole(order[(idx + 1) % order.length])
}
function logout() {
  user.logout()
  app.setRole('vip')
  location.hash = '#/login'
}
</script>

<template>
  <header class="titlebar">
    <div class="brand drag"><span class="mark"></span><span>久赢恒丰</span></div>
    <nav class="topmenu drag">
      <button
        v-for="group in MENU_GROUPS"
        :key="group.index"
        class="topmenu-item"
        :class="{ active: app.activeGroup === group.index }"
        @click="selectGroup(group)"
      >{{ group.label }}</button>
    </nav>
    <div class="spacer drag"></div>
    <div class="titlebar-user no-drag">
      <span class="conn" :title="sourceLabel"><span class="dot" :class="app.source === 'none' ? 'off' : 'live'"></span></span>
      <button class="user-btn" title="消息" @click="openMessage">消息<span v-if="app.hasNewMsg" class="red-dot"></span></button>
      <button class="user-btn" title="切换本地模拟角色" @click="cycleRole">角色</button>
      <span class="avatar">{{ initial }}</span>
      <span class="nick">{{ user.userInfo.nickName }}</span>
      <button class="user-btn" title="退出登录" @click="logout">退出</button>
    </div>
    <button class="win-btn no-drag" :disabled="!desktop" title="最小化" @click="act('minimize')">&#9472;</button>
    <button class="win-btn no-drag" :disabled="!desktop" title="最大化" @click="act('maximize')">&#9633;</button>
    <button class="win-btn close no-drag" :disabled="!desktop" title="关闭" @click="act('close')">&#215;</button>
  </header>
</template>
