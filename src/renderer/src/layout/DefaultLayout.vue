<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TitleBar from '../components/TitleBar.vue'
import GroupNav from './GroupNav.vue'
import TagsView from './TagsView.vue'
import StatusBar from './StatusBar.vue'
import { useAppStore, useUserStore, useTagsViewStore } from '../stores.js'
import { desktopInvoke } from '../data.js'

const route = useRoute()
const user = useUserStore()
const app = useAppStore()
const tags = useTagsViewStore()

const plain = computed(() => Boolean(route.meta?.plain))

let clockTimer = null
let statusTimer = null

watch(
  () => route.fullPath,
  () => { tags.add(route) },
  { immediate: true }
)

onMounted(async () => {
  user.restoreToken()
  const info = await desktopInvoke('getVersion')
  if (info) app.setVersion(info)
  const status = await desktopInvoke('getServiceStatus')
  if (status) app.setServiceReady(status.ready)
  statusTimer = setInterval(async () => {
    const next = await desktopInvoke('getServiceStatus')
    if (next) app.setServiceReady(next.ready)
  }, 5000)
  try {
    const messages = await desktopInvoke('getSetting', 'messages')
    app.hasNewMsg = Array.isArray(messages) && messages.some((m) => m && m.unread)
  } catch { /* ignore */ }
})

onUnmounted(() => {
  clearInterval(clockTimer)
  clearInterval(statusTimer)
})
</script>

<template>
  <div class="app-shell layout-shell">
    <TitleBar />
    <template v-if="!plain">
      <GroupNav />
      <TagsView />
    </template>
    <div class="route-host">
      <!-- 工程化：keep-alive 缓存主界面（对齐原版 Vue 工程实践）；plain 子窗页面不缓存 -->
      <router-view v-slot="{ Component, route: current }">
        <keep-alive :max="12">
          <component :is="Component" v-if="!current.meta.plain" :key="current.name" />
        </keep-alive>
        <component :is="Component" v-if="current.meta.plain" :key="current.name" />
      </router-view>
    </div>
    <StatusBar v-if="!plain" />
  </div>
</template>
