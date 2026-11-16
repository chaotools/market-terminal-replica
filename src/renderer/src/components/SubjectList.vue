<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  subjects: { type: Array, default: () => [] },
  tree: { type: Array, default: () => [] },
  selected: { type: String, default: '' }
})
defineEmits(['select'])

const SORTS = [
  { key: 'heat', label: '热度' },
  { key: 'changePct', label: '涨幅' },
  { key: 'limitUpCount', label: '涨停' },
  { key: 'sustainDays', label: '持续' }
]
const sortKey = ref('heat')
const collapsed = ref({})

const groups = computed(() => {
  const list = props.tree && props.tree.length
    ? props.tree
    : [{ groupId: 'all', groupName: '全部题材', childCount: props.subjects.length, heat: 0, changePct: 0, limitUpCount: 0, children: props.subjects }]
  return list.map((g) => ({
    ...g,
    children: [...(g.children || [])].sort((a, b) => (b[sortKey.value] || 0) - (a[sortKey.value] || 0))
  }))
})

const pct = (v) => `${v > 0 ? '+' : ''}${Number(v || 0).toFixed(2)}`
const cls = (v) => (v > 0 ? 'up' : v < 0 ? 'down' : 'flat')
const toggle = (id) => { collapsed.value = { ...collapsed.value, [id]: !collapsed.value[id] } }
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <span>题材库</span>
      <span class="hint">{{ tree.length }} 个板块 · {{ subjects.length }} 个题材</span>
    </div>
    <div class="sort-tabs">
      <button
        v-for="s in SORTS"
        :key="s.key"
        :class="{ active: sortKey === s.key }"
        @click="sortKey = s.key"
      >{{ s.label }}</button>
    </div>
    <div class="panel-body">
      <div v-if="!groups.length" class="empty-hint">未连接行情源</div>
      <div v-for="g in groups" :key="g.groupId" class="subj-group">
        <div class="group-row" @click="toggle(g.groupId)">
          <span class="caret">{{ collapsed[g.groupId] ? '&#9656;' : '&#9662;' }}</span>
          <span class="group-name">{{ g.groupName }}</span>
          <span class="group-count">{{ g.childCount }}</span>
          <span class="group-metrics num">
            <b>{{ Number(g.heat || 0).toFixed(1) }}</b>
            <span :class="cls(g.changePct)">{{ pct(g.changePct) }}%</span>
            <span>涨停 {{ g.limitUpCount || 0 }}</span>
          </span>
        </div>
        <template v-if="!collapsed[g.groupId]">
          <div
            v-for="s in g.children"
            :key="s.subjectId"
            class="subj-row child"
            :class="{ active: s.subjectId === selected }"
            @click="$emit('select', s.subjectId)"
          >
            <div class="subj-top">
              <span class="subj-name">{{ s.subjectName }}</span>
              <span class="chip" :class="'stage-' + s.stage">{{ s.stage }}</span>
            </div>
            <div class="subj-metrics">
              <span class="num heat-val">热度 <b>{{ Number(s.heat).toFixed(1) }}</b></span>
              <span class="num" :class="cls(s.changePct)">{{ pct(s.changePct) }}%</span>
              <span class="num">涨停 <b>{{ s.limitUpCount }}</b></span>
              <span class="num">最高 <b>{{ s.limitUpHeight }}</b>板</span>
            </div>
            <div class="subj-bar"><i :style="{ width: Math.min(100, s.heat) + '%' }"></i></div>
            <div class="subj-foot">
              <span>持续 {{ s.sustainDays }} 日 · 成分 {{ s.memberCount }}</span>
              <span>龙头 {{ s.leadStock?.name || '—' }}</span>
            </div>
          </div>
        </template>
      </div>
    </div>
  </section>
</template>
