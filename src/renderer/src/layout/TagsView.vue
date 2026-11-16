<script setup>
import { useRoute, useRouter } from 'vue-router'
import { useTagsViewStore } from '../stores.js'

const route = useRoute()
const router = useRouter()
const tags = useTagsViewStore()

function open(tag) { router.push(tag.fullPath || tag.path) }

function close(tag, event) {
  event?.stopPropagation()
  const wasActive = tag.path === route.path
  tags.remove(tag.path)
  if (wasActive) {
    const last = tags.visitedViews[tags.visitedViews.length - 1]
    router.push(last ? (last.fullPath || last.path) : '/')
  }
}
</script>

<template>
  <div class="tagsbar">
    <template v-if="tags.visitedViews.length">
      <span
        v-for="tag in tags.visitedViews"
        :key="tag.path"
        class="tag-item"
        :class="{ active: tag.path === route.path }"
        @click="open(tag)"
      >
        {{ tag.title }}
        <button class="close" title="关闭" @click="close(tag, $event)">×</button>
      </span>
    </template>
    <span v-else class="empty-hint">访问的页面会显示在这里</span>
  </div>
</template>
