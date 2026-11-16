<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MENU_GROUPS, canAccess } from '../menu.js'
import { useAppStore } from '../stores.js'

const route = useRoute()
const router = useRouter()
const app = useAppStore()

const group = computed(() => MENU_GROUPS.find((g) => g.index === app.activeGroup) || MENU_GROUPS[0])
const items = computed(() => group.value.items || [])

function selectItem(item) {
  if (item.action === 'privacy') { router.push('/privacy'); return }
  if (item.action === 'logout') { router.push('/login'); return }
  if (!item.path) return
  if (!canAccess(app.role, item.minAuth)) {
    router.push(item.minAuth === 'svip' || item.minAuth === 'ssvip' ? '/buy-svip' : '/buy-vip')
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

function goBack() {
  if (window.history.length > 1) router.back()
  else router.push('/subject/excavate')
}
</script>

<template>
  <div class="groupnav">
    <div class="groupnav-row level2">
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
    <button class="back-btn no-drag" title="返回" @click="goBack">返回</button>
  </div>
</template>
