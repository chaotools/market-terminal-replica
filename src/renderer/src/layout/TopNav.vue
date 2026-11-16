<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MENU_GROUPS, groupForPath, canAccess, ROLE_LABEL } from '../menu.js'
import { useAppStore, useUserStore } from '../stores.js'
import { desktopInvoke } from '../data.js'

const route = useRoute()
const router = useRouter()
const app = useAppStore()
const user = useUserStore()

const activeGroup = ref(groupForPath(route.path))
watch(() => route.path, (path) => { activeGroup.value = groupForPath(path) })

const items = computed(() => activeGroup.value?.items || [])
const roleLabel = computed(() => ROLE_LABEL[app.role] || app.role)

function selectGroup(group) {
  activeGroup.value = group
}

function selectItem(item) {
  if (item.action === 'privacy') { router.push('/privacy'); return }
  if (item.action === 'logout') { logout(); return }
  if (!item.path) return
  if (!canAccess(app.role, item.minAuth)) {
    router.push(item.minAuth === 'ssvip' || item.minAuth === 'svip' ? '/buy-svip' : '/buy-vip')
    return
  }
  router.push(item.path)
}

function isActive(item) {
  const target = String(item.path || '').split('?')[0]
  const current = String(route.path || '')
  if (!target) return false
  return current === target || (target !== '/' && current.startsWith(target + '/'))
}

function cycleRole() {
  const order = ['none', 'vip', 'training', 'svip', 'ssvip']
  const idx = order.indexOf(app.role)
  app.setRole(order[(idx + 1) % order.length])
}

function openMessage() {
  if (window.electron?.isDesktop) desktopInvoke('openMessage')
  else router.push('/message')
}

function logout() {
  user.logout()
  app.setRole('vip')
  router.push('/login')
}

const initial = computed(() => (user.userInfo.nickName || '复')[0])
</script>

<template>
  <nav class="topnav">
    <div class="topnav-row level1">
      <button
        v-for="group in MENU_GROUPS"
        :key="group.index"
        class="nav-group"
        :class="{ active: activeGroup?.index === group.index }"
        @click="selectGroup(group)"
      >{{ group.label }}</button>
      <div class="topnav-user">
        <button title="消息" @click="openMessage">消息<span v-if="app.hasNewMsg" class="red-dot"></span></button>
        <button title="切换本地模拟角色" @click="cycleRole">角色：{{ roleLabel }}</button>
        <span class="avatar">{{ initial }}</span>
        <span>{{ user.userInfo.nickName }}</span>
        <button title="退出登录" @click="logout">退出</button>
      </div>
    </div>
    <div class="topnav-row level2">
      <button
        v-for="item in items"
        :key="item.index || item.label"
        class="nav-item"
        :class="{ active: isActive(item), locked: !canAccess(app.role, item.minAuth) }"
        @click="selectItem(item)"
      >
        <span>{{ item.label }}</span>
        <span v-if="item.badge" class="nav-badge">{{ item.badge }}</span>
      </button>
    </div>
  </nav>
</template>
