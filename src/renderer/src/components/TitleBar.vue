<script setup>
import { computed } from 'vue'
import { isDesktop, desktopInvoke } from '../data.js'

const props = defineProps({
  source: { type: String, default: 'mock' },
  version: { type: String, default: '0.1.0' }
})

const desktop = isDesktop()
const act = (channel) => desktop && desktopInvoke(channel)
const label = computed(() => ({
  lumi: 'Lumi 实时行情',
  mock: '内置模拟数据',
  browser: '浏览器内引擎'
}[props.source] || '未知来源'))
const dotClass = computed(() => (props.source === 'lumi' ? 'live' : 'mock'))
</script>

<template>
  <header class="titlebar">
    <div class="brand drag"><span class="mark"></span><span>Market Terminal Replica</span></div>
    <span class="tag drag">演示数据 · 非真实行情</span>
    <div class="spacer drag"></div>
    <div class="conn no-drag">
      <span class="dot" :class="dotClass"></span>
      <span>{{ label }}</span>
    </div>
    <span class="tag no-drag">v{{ version }}</span>
    <button class="win-btn no-drag" :disabled="!desktop" title="最小化" @click="act('minimize')">&#9472;</button>
    <button class="win-btn no-drag" :disabled="!desktop" title="最大化" @click="act('maximize')">&#9633;</button>
    <button class="win-btn close no-drag" :disabled="!desktop" title="关闭" @click="act('close')">&#215;</button>
  </header>
</template>
