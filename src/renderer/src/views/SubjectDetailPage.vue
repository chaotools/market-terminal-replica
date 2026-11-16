<script setup>
import { useRoute } from 'vue-router'
import SubjectExcavatePage from './SubjectExcavatePage.vue'

const route = useRoute()
</script>

<template>
  <SubjectExcavatePage :focus-subject="String(route.params.subjectId || '')" />
</template>
