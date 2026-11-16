<script setup>
import { useRoute } from 'vue-router'
import SubjectWorkbench from './SubjectWorkbench.vue'

const route = useRoute()
</script>

<template>
  <SubjectWorkbench :focus-subject="String(route.params.subjectId || '')" />
</template>
