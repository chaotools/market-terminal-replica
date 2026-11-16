<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  rankings: { type: Object, default: () => ({}) }
})
const emit = defineEmits(['select'])

const TABS = [
  { key: 'topDig', label: '异动挖掘', field: 'heatDelta', suffix: '' },
  { key: 'topLimitUp', label: '涨停家数', field: 'limitUpCount', suffix: '家' },
  { key: 'topPctChg', label: '涨幅', field: 'changePct', suffix: '%' },
  { key: 'sustain', label: '持续', field: 'sustainDays', suffix: '日' }
]
const tab = ref('topDig')
const list = computed(() => props.rankings[tab.value] || [])
const activeTab = computed(() => TABS.find((t) => t.key === tab.value) || TABS[0])
const value = (row) => {
  const v = Number(row[activeTab.value.field] || 0)
  return `${v > 0 && activeTab.value.key === 'topDig' ? '+' : ''}${v.toFixed(activeTab.value.key === 'topPctChg' ? 2 : activeTab.value.key === 'topDig' ? 1 : 0)}${activeTab.value.suffix}`
}
</script>

<template>
  <div class="rank-block">
    <div class="block-title"><span>题材榜单</span><span class="hint">由领域引擎派生</span></div>
    <div class="sort-tabs compact">
      <button v-for="t in TABS" :key="t.key" :class="{ active: tab === t.key }" @click="tab = t.key">{{ t.label }}</button>
    </div>
    <div class="rank-list">
      <div v-for="(row, i) in list" :key="row.subjectId" class="rank-row" @click="emit('select', row.subjectId)">
        <span class="rank-no num">{{ i + 1 }}</span>
        <span class="rank-name">{{ row.subjectName }}</span>
        <span class="chip mini" :class="'stage-' + row.stage">{{ row.stage }}</span>
        <span class="rank-val num" :class="Number(value(row).replace(/[^\d.+-]/g, '')) >= 0 ? 'up' : 'down'">{{ value(row) }}</span>
      </div>
      <div v-if="!list.length" class="rank-row"><span class="rank-name">暂无数据</span></div>
    </div>

  </div>
</template>
