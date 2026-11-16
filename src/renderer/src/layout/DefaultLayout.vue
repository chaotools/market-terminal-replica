<script setup>
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import TitleBar from '../components/TitleBar.vue'
import TopNav from './TopNav.vue'
import TagsView from './TagsView.vue'
import StatusBar from './StatusBar.vue'
import { useAppStore, useUserStore, useTagsViewStore } from '../stores.js'
import { desktopInvoke } from '../data.js'

const route = useRoute()
const app = useAppStore()
const user = useUserStore()
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

  const tick = () => app.setClock(new Date().toLocaleTimeString('zh-CN', { hour12: false }))
  tick()
  clockTimer = setInterval(tick, 1000)
  statusTimer = setInterval(async () => {
    const next = await desktopInvoke('getServiceStatus')
    if (next) app.setServiceReady(next.ready)
  }, 5000)
})

onUnmounted(() => {
  clearInterval(clockTimer)
  clearInterval(statusTimer)
})
</script>

<template>
  <div class="app-shell layout-shell">
    <TitleBar :source="app.source" :version="app.version || '0.1.0'" />
    <template v-if="!plain">
      <TopNav />
      <TagsView />
    </template>
    <div class="route-host">
      <router-view />
    </div>
    <StatusBar v-if="!plain" />
  </div>
</template>
