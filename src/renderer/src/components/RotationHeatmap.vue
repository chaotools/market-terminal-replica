<script setup>
defineProps({
  rotation: { type: Object, default: () => ({ days: [], cells: [] }) },
  selected: { type: String, default: '' }
})
const emit = defineEmits(['select'])

const color = (v) => {
  const t = Math.min(1, Math.max(0, Number(v || 0) / 100))
  return t < 0.5
    ? `rgba(24,95,165,${(0.05 + t * 0.24).toFixed(3)})`
    : `rgba(214,48,49,${(0.10 + (t - 0.5) * 1.35).toFixed(3)})`
}
const short = (name) => String(name || '').replace('示例·', '')
</script>

<template>
  <div class="heatmap">
    <div class="block-title">
      <span>题材轮动日历</span>
      <span class="hint">{{ rotation.days.length }} 个交易日 · 热度矩阵</span>
    </div>
    <div
      class="hm-grid"
      :style="{ gridTemplateColumns: '78px repeat(' + rotation.days.length + ', ' + (rotation.days.length <= 8 ? '20px' : '1fr') + ')' }"
    >
      <span class="hm-label"></span>
      <span v-for="(d, i) in rotation.days" :key="'d' + i" class="hm-date">
        {{ i % 4 === 0 ? String(d).slice(5) : '' }}
      </span>
      <template v-for="cell in rotation.cells" :key="cell.subjectId">
        <span
          class="hm-label"
          :class="{ active: selected === cell.subjectId }"
          :title="cell.subjectName"
          @click="emit('select', cell.subjectId)"
        >{{ short(cell.subjectName) }}</span>
        <i
          v-for="(v, i) in cell.values"
          :key="i"
          class="hm-cell"
          :style="{ background: color(v) }"
          :title="`${cell.subjectName} ${rotation.days[i]} 热度 ${Number(v).toFixed(1)}`"
          @click="emit('select', cell.subjectId)"
        ></i>
      </template>
    </div>
    <div class="hm-legend"><span>低热度</span><i class="hm-scale"></i><span>高热度</span></div>
  </div>
</template>
